import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { DriverGateway } from '../realtime/driver.gateway';
import { OrdersService } from '../orders/orders.service';
import { DriversService } from '../drivers/drivers.service';
import { OrderStatus } from '../orders/order.entity';

const WAVE_SIZE = 3;
const WAVE_TIMEOUT = 10000;
const MAX_CANDIDATES = 10;
const DISPATCH_RECOVERY_SCAN_LIMIT = 200;

type DispatchActiveState = {
  mode: 'wave';
  wave: number;
  currentDrivers: string[];
  acceptedBy: string | null;
  createdAt: number;
};

type DriverLocationSnapshot = {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt?: string;
};

@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;
  private readonly waveTimers = new Map<string, NodeJS.Timeout>();
  private readonly instanceId = randomUUID();
  private readonly leaseSeconds: number;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: ConfigService,
    @Inject(forwardRef(() => DriverGateway))
    private readonly gateway: DriverGateway,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    private readonly driversService: DriversService,
  ) {
    const configuredLeaseSeconds = Number(
      this.cfg.get<string>('DISPATCH_LEASE_SECONDS', '20'),
    );
    this.leaseSeconds =
      Number.isFinite(configuredLeaseSeconds) && configuredLeaseSeconds >= 5
        ? Math.floor(configuredLeaseSeconds)
        : 20;
  }

  async onModuleInit() {
    const redisUrl = this.cfg.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }

    this.redis = new Redis(redisUrl);
    await this.recoverDispatchTimers();
    this.recoveryTimer = setInterval(() => {
      void this.recoverDispatchTimers();
    }, WAVE_TIMEOUT);
  }

  onModuleDestroy() {
    for (const timer of this.waveTimers.values()) {
      clearTimeout(timer);
    }
    this.waveTimers.clear();
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.redis?.disconnect();
  }

  private queueKey(orderId: string) {
    return `dispatch:queue:${orderId}`;
  }

  private activeKey(orderId: string) {
    return `dispatch:active:${orderId}`;
  }

  private acceptLockKey(orderId: string) {
    return `dispatch:accept-lock:${orderId}`;
  }

  private waveKey(orderId: string) {
    return `dispatch:wave:${orderId}`;
  }

  private leaseKey(orderId: string) {
    return `dispatch:lease:${orderId}`;
  }

  private driverLocationKey(driverId: string) {
    return `driver:location:${driverId}`;
  }

  private clearWaveTimer(orderId: string) {
    const existing = this.waveTimers.get(orderId);
    if (existing) {
      clearTimeout(existing);
      this.waveTimers.delete(orderId);
    }
  }

  private extractOrderCoords(order: {
    fromLocation: { coordinates?: number[] } | null;
    toLocation: { coordinates?: number[] } | null;
  }) {
    const fromCoordinates = order.fromLocation?.coordinates ?? [];
    const toCoordinates = order.toLocation?.coordinates ?? [];
    if (fromCoordinates.length < 2 || toCoordinates.length < 2) {
      return null;
    }
    const [fromLng, fromLat] = fromCoordinates;
    const [toLng, toLat] = toCoordinates;
    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      return null;
    }
    return {
      fromLat,
      fromLng,
      toLat,
      toLng,
    };
  }

  private async ensureDispatchLease(orderId: string): Promise<boolean> {
    const leaseKey = this.leaseKey(orderId);
    const owner = await this.redis.get(leaseKey);
    if (owner === this.instanceId) {
      await this.redis.expire(leaseKey, this.leaseSeconds);
      return true;
    }
    const lock = await this.redis.set(
      leaseKey,
      this.instanceId,
      'EX',
      this.leaseSeconds,
      'NX',
    );
    return lock === 'OK';
  }

  private async recoverDispatchTimers() {
    let cursor = '0';
    let inspected = 0;
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'dispatch:active:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      for (const activeKey of keys) {
        inspected += 1;
        if (inspected > DISPATCH_RECOVERY_SCAN_LIMIT) {
          return;
        }
        const orderId = activeKey.replace('dispatch:active:', '');
        if (!orderId || this.waveTimers.has(orderId)) {
          continue;
        }
        const order = await this.orders.findOrderById(orderId);
        if (!order) {
          await this.clearDispatchState(orderId);
          continue;
        }
        if (!(await this.isOrderDispatchable(orderId))) {
          await this.clearDispatchState(orderId);
          continue;
        }
        const coords = this.extractOrderCoords(order);
        if (!coords) {
          await this.clearDispatchState(orderId);
          continue;
        }
        this.scheduleNextWave(
          {
            orderId,
            fromLat: coords.fromLat,
            fromLng: coords.fromLng,
            toLat: coords.toLat,
            toLng: coords.toLng,
            price: order.price,
          },
          250,
        );
      }
    } while (cursor !== '0');
  }

  private scheduleNextWave(
    params: {
      orderId: string;
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
      price: string;
    },
    timeoutMs = WAVE_TIMEOUT,
  ) {
    this.clearWaveTimer(params.orderId);

    const timer = setTimeout(() => {
      void this.nextWave(params);
    }, timeoutMs);

    this.waveTimers.set(params.orderId, timer);
  }

  async clearDispatchState(orderId: string) {
    this.clearWaveTimer(orderId);

    await this.redis.del(
      this.queueKey(orderId),
      this.activeKey(orderId),
      this.acceptLockKey(orderId),
      this.waveKey(orderId),
      this.leaseKey(orderId),
    );
  }

  private async isOrderDispatchable(orderId: string): Promise<boolean> {
    const order = await this.orders.findOrderById(orderId);
    if (!order) {
      return false;
    }

    return ![
      OrderStatus.CANCELLED,
      OrderStatus.DONE,
      OrderStatus.ASSIGNED,
      OrderStatus.IN_PROGRESS,
      OrderStatus.NO_DRIVERS_FOUND,
    ].includes(order.status);
  }

  private async getDriverLocation(
    driverId: string,
  ): Promise<DriverLocationSnapshot | null> {
    const raw = await this.redis.get(this.driverLocationKey(driverId));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as DriverLocationSnapshot;

      if (
        typeof parsed?.lat !== 'number' ||
        typeof parsed?.lng !== 'number' ||
        !Number.isFinite(parsed.lat) ||
        !Number.isFinite(parsed.lng)
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private calculateDistanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const earthRadiusMeters = 6371000;

    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
  }

  private async getReadyDriverIdsSortedByDistance(
    fromLat: number,
    fromLng: number,
  ): Promise<string[]> {
    const driverIds = await this.orders.getReadyDriverIdsForDispatch();

    console.log('[DISPATCH] redis drivers:', driverIds);

    const validDrivers: Array<{
      driverId: string;
      distanceMeters: number;
      hasLocation: boolean;
    }> = [];

    for (const driverId of driverIds) {
      try {
        const driver = await this.driversService.getDriverProfileById(driverId);

        const hasActiveVehicle =
          driver.vehicles?.some((v) => v.isActive) ?? false;

        const canWork = driver.status === 'ACTIVE' && hasActiveVehicle;

        if (!canWork) {
          console.log('[DISPATCH] filtered driver:', driverId, {
            status: driver.status,
            hasActiveVehicle,
          });
          continue;
        }

        const location = await this.getDriverLocation(driverId);

        if (!location) {
          validDrivers.push({
            driverId,
            distanceMeters: Number.MAX_SAFE_INTEGER,
            hasLocation: false,
          });
          continue;
        }

        const distanceMeters = this.calculateDistanceMeters(
          fromLat,
          fromLng,
          location.lat,
          location.lng,
        );

        validDrivers.push({
          driverId,
          distanceMeters,
          hasLocation: true,
        });
      } catch {
        console.log('[DISPATCH] driver fetch error:', driverId);
      }
    }

    validDrivers.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const sortedDriverIds = validDrivers
      .slice(0, MAX_CANDIDATES)
      .map((item) => item.driverId);

    console.log(
      '[DISPATCH] valid drivers:',
      validDrivers.map((item) => ({
        driverId: item.driverId,
        distanceMeters:
          item.distanceMeters === Number.MAX_SAFE_INTEGER
            ? null
            : Math.round(item.distanceMeters),
        hasLocation: item.hasLocation,
      })),
    );

    return sortedDriverIds;
  }

  async createQueueAndDispatch(params: {
    orderId: string;
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    price: string;
  }) {
    await this.clearDispatchState(params.orderId);

    const available = await this.getReadyDriverIdsSortedByDistance(
      params.fromLat,
      params.fromLng,
    );

    console.log('[DISPATCH] available drivers:', available);

    if (!available.length) {
      await this.orders.markNoDriversFound(params.orderId);
      return { ok: false, reason: 'NO_DRIVERS' as const };
    }

    await this.redis.rpush(this.queueKey(params.orderId), ...available);
    await this.redis.set(this.waveKey(params.orderId), '0');

    await this.startWave(params);

    return {
      ok: true,
      assigned: false,
      dispatchMode: 'wave' as const,
      candidates: available,
    };
  }

  async getQueue(orderId: string) {
    const queue = await this.redis.lrange(this.queueKey(orderId), 0, -1);
    const activeRaw = await this.redis.get(this.activeKey(orderId));

    return {
      queue,
      active: activeRaw ? (JSON.parse(activeRaw) as DispatchActiveState) : null,
    };
  }

  private async startWave(params: {
    orderId: string;
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    price: string;
  }) {
    const { orderId } = params;
    const hasLease = await this.ensureDispatchLease(orderId);
    if (!hasLease) {
      return;
    }

    if (!(await this.isOrderDispatchable(orderId))) {
      console.log(
        `[DISPATCH] stop wave for ${orderId}, order is not dispatchable`,
      );
      await this.clearDispatchState(orderId);
      return;
    }

    const accepted = await this.redis.get(this.acceptLockKey(orderId));
    if (accepted) {
      await this.clearDispatchState(orderId);
      return;
    }

    const wave = parseInt(
      (await this.redis.get(this.waveKey(orderId))) || '0',
      10,
    );

    const start = wave * WAVE_SIZE;
    const end = start + WAVE_SIZE - 1;

    const drivers = await this.redis.lrange(this.queueKey(orderId), start, end);

    if (!drivers.length) {
      await this.orders.markNoDriversFound(orderId);
      await this.clearDispatchState(orderId);
      return;
    }

    const activeState: DispatchActiveState = {
      mode: 'wave',
      wave,
      currentDrivers: drivers,
      acceptedBy: null,
      createdAt: Date.now(),
    };

    await this.redis.set(
      this.activeKey(orderId),
      JSON.stringify(activeState),
      'EX',
      300,
    );

    console.log(`[DISPATCH] WAVE ${wave}`, drivers);

    for (let i = 0; i < drivers.length; i++) {
      if (!(await this.isOrderDispatchable(orderId))) {
        console.log(
          `[DISPATCH] stop emitting offers for ${orderId}, order changed state`,
        );
        await this.clearDispatchState(orderId);
        return;
      }

      const driverId = drivers[i];

      this.gateway.emitToDriver(driverId, 'order.offer', {
        orderId,
        price: params.price,
        from: { lat: params.fromLat, lng: params.fromLng },
        to: { lat: params.toLat, lng: params.toLng },
        queuePosition: start + i + 1,
        dispatchMode: 'wave',
        wave,
      });
    }

    this.scheduleNextWave(params);
  }

  private async nextWave(params: {
    orderId: string;
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    price: string;
  }) {
    const { orderId } = params;
    const hasLease = await this.ensureDispatchLease(orderId);
    if (!hasLease) {
      return;
    }

    if (!(await this.isOrderDispatchable(orderId))) {
      console.log(
        `[DISPATCH] stop nextWave for ${orderId}, order is not dispatchable`,
      );
      await this.clearDispatchState(orderId);
      return;
    }

    const accepted = await this.redis.get(this.acceptLockKey(orderId));
    if (accepted) {
      await this.clearDispatchState(orderId);
      return;
    }

    let wave = parseInt(
      (await this.redis.get(this.waveKey(orderId))) || '0',
      10,
    );
    wave += 1;

    await this.redis.set(this.waveKey(orderId), String(wave));

    await this.startWave(params);
  }

  async acceptBroadcastOffer(orderId: string, driverId: string) {
    if (!(await this.isOrderDispatchable(orderId))) {
      return { ok: false, reason: 'ORDER_NOT_AVAILABLE' as const };
    }

    const lock = await this.redis.set(
      this.acceptLockKey(orderId),
      driverId,
      'EX',
      30,
      'NX',
    );

    if (lock !== 'OK') {
      return { ok: false, reason: 'ORDER_ALREADY_ACCEPTED' as const };
    }

    const allDrivers = await this.redis.lrange(this.queueKey(orderId), 0, -1);

    const assignedOrder = await this.orders.assignDriverToOrder(
      orderId,
      driverId,
    );

    if (!assignedOrder) {
      await this.redis.del(this.acceptLockKey(orderId));
      return { ok: false, reason: 'ORDER_NOT_FOUND_OR_NOT_AVAILABLE' as const };
    }

    const activeRaw = await this.redis.get(this.activeKey(orderId));
    if (activeRaw) {
      const active = JSON.parse(activeRaw) as DispatchActiveState;
      active.acceptedBy = driverId;

      await this.redis.set(
        this.activeKey(orderId),
        JSON.stringify(active),
        'EX',
        300,
      );
    }

    await this.clearDispatchState(orderId);

    for (const d of allDrivers) {
      if (d !== driverId) {
        this.gateway.emitToDriver(d, 'order.offer.closed', {
          orderId,
          reason: 'ACCEPTED_BY_OTHER_DRIVER',
          acceptedBy: driverId,
        });
      }
    }

    return {
      ok: true,
      passengerId: assignedOrder.passengerId,
      acceptedBy: driverId,
    };
  }
}
