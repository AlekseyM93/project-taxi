import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

type DriverLocation = {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  isMock?: boolean;
  offlineBuffered?: boolean;
  sequence?: number;
  clientTs?: string;
  source?: 'WS' | 'BATCH';
  updatedAt: string;
};

type DriverPresenceSnapshot = {
  isOnline: boolean;
  state: DriverAvailabilityState | null;
  location: DriverLocation | null;
};

export type DriverAvailabilityState = 'READY' | 'BUSY';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private pub!: Redis;
  private sub!: Redis;

  private readonly driverSockets = new Map<string, Set<string>>();
  private readonly passengerSockets = new Map<string, Set<string>>();

  private readonly driversSetKey = 'drivers:online';

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    this.pub = new Redis(redisUrl);
    this.sub = new Redis(redisUrl);

    this.pub.on('error', (err) => {
      console.log('[PRESENCE][pub] redis error:', err?.message ?? err);
    });

    this.sub.on('error', (err) => {
      console.log('[PRESENCE][sub] redis error:', err?.message ?? err);
    });
  }

  async onModuleDestroy() {
    await this.pub?.quit();
    await this.sub?.quit();
  }

  private driverLiveKey(driverId: string) {
    return `driver:live:${driverId}`;
  }

  private driverLocationKey(driverId: string) {
    return `driver:location:${driverId}`;
  }

  private driverStateKey(driverId: string) {
    return `driver:state:${driverId}`;
  }

  addDriverSocket(driverId: string, socketId: string) {
    if (!this.driverSockets.has(driverId)) {
      this.driverSockets.set(driverId, new Set<string>());
    }

    this.driverSockets.get(driverId)!.add(socketId);
  }

  removeDriverSocket(driverId: string, socketId: string) {
    const sockets = this.driverSockets.get(driverId);
    if (!sockets) {
      return;
    }

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.driverSockets.delete(driverId);
    }
  }

  getDriverSockets(driverId: string): string[] {
    return Array.from(this.driverSockets.get(driverId) ?? []);
  }

  addPassengerSocket(passengerId: string, socketId: string) {
    if (!this.passengerSockets.has(passengerId)) {
      this.passengerSockets.set(passengerId, new Set<string>());
    }

    this.passengerSockets.get(passengerId)!.add(socketId);
  }

  removePassengerSocket(passengerId: string, socketId: string) {
    const sockets = this.passengerSockets.get(passengerId);
    if (!sockets) {
      return;
    }

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.passengerSockets.delete(passengerId);
    }
  }

  getPassengerSockets(passengerId: string): string[] {
    return Array.from(this.passengerSockets.get(passengerId) ?? []);
  }

  async setDriverOnline(
    driverId: string,
    state: DriverAvailabilityState = 'READY',
  ) {
    await this.pub
      .multi()
      .set(this.driverLiveKey(driverId), '1', 'EX', 30)
      .sadd(this.driversSetKey, driverId)
      .set(this.driverStateKey(driverId), state, 'EX', 30)
      .exec();

    console.log('[PRESENCE] setDriverOnline:', {
      driverId,
      state,
    });
  }

  async refreshDriverOnline(driverId: string) {
    const currentState =
      ((await this.pub.get(
        this.driverStateKey(driverId),
      )) as DriverAvailabilityState | null) ?? 'READY';

    await this.pub
      .multi()
      .set(this.driverLiveKey(driverId), '1', 'EX', 30)
      .sadd(this.driversSetKey, driverId)
      .set(this.driverStateKey(driverId), currentState, 'EX', 30)
      .exec();
  }

  async setDriverReady(driverId: string) {
    await this.setDriverOnline(driverId, 'READY');
  }

  async setDriverBusy(driverId: string) {
    await this.setDriverOnline(driverId, 'BUSY');
  }

  async getDriverState(
    driverId: string,
  ): Promise<DriverAvailabilityState | null> {
    const raw = await this.pub.get(this.driverStateKey(driverId));
    if (raw === 'READY' || raw === 'BUSY') {
      return raw;
    }
    return null;
  }

  async setDriverOffline(driverId: string) {
    await this.pub
      .multi()
      .del(this.driverLiveKey(driverId))
      .del(this.driverLocationKey(driverId))
      .del(this.driverStateKey(driverId))
      .srem(this.driversSetKey, driverId)
      .exec();

    console.log('[PRESENCE] setDriverOffline:', { driverId });
  }

  async getOnlineDrivers(): Promise<string[]> {
    const drivers = await this.pub.smembers(this.driversSetKey);
    if (!drivers.length) {
      return [];
    }

    const result: string[] = [];

    for (const driverId of drivers) {
      const exists = await this.pub.get(this.driverLiveKey(driverId));
      if (exists) {
        result.push(driverId);
      } else {
        await this.pub
          .multi()
          .srem(this.driversSetKey, driverId)
          .del(this.driverStateKey(driverId))
          .exec();
      }
    }

    return result;
  }

  async getReadyDrivers(): Promise<string[]> {
    const online = await this.getOnlineDrivers();
    if (!online.length) {
      console.log('[PRESENCE] getReadyDrivers: no online drivers');
      return [];
    }

    const ready: string[] = [];

    for (const driverId of online) {
      const state = await this.getDriverState(driverId);
      if (state === 'READY') {
        ready.push(driverId);
      }
    }

    console.log('[PRESENCE] getReadyDrivers:', ready);

    return ready;
  }

  async updateDriverLocation(
    driverId: string,
    location: {
      lat: number;
      lng: number;
      heading?: number;
      speed?: number;
      accuracy?: number;
      isMock?: boolean;
      offlineBuffered?: boolean;
      sequence?: number;
      clientTs?: string;
      source?: 'WS' | 'BATCH';
    },
  ) {
    const payload: DriverLocation = {
      lat: location.lat,
      lng: location.lng,
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      isMock: location.isMock,
      offlineBuffered: location.offlineBuffered,
      sequence: location.sequence,
      clientTs: location.clientTs,
      source: location.source,
      updatedAt: new Date().toISOString(),
    };

    const currentState =
      ((await this.pub.get(
        this.driverStateKey(driverId),
      )) as DriverAvailabilityState | null) ?? 'READY';

    await this.pub
      .multi()
      .set(this.driverLocationKey(driverId), JSON.stringify(payload), 'EX', 30)
      .set(this.driverLiveKey(driverId), '1', 'EX', 30)
      .sadd(this.driversSetKey, driverId)
      .set(this.driverStateKey(driverId), currentState, 'EX', 30)
      .exec();
  }

  async getDriverLocation(driverId: string): Promise<DriverLocation | null> {
    const raw = await this.pub.get(this.driverLocationKey(driverId));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as DriverLocation;
    } catch {
      return null;
    }
  }

  async getDriverPresenceSnapshot(
    driverIds: string[],
  ): Promise<Record<string, DriverPresenceSnapshot>> {
    if (driverIds.length === 0) {
      return {};
    }

    const pipeline = this.pub.pipeline();
    for (const driverId of driverIds) {
      pipeline.get(this.driverLiveKey(driverId));
      pipeline.get(this.driverStateKey(driverId));
      pipeline.get(this.driverLocationKey(driverId));
    }

    const results = await pipeline.exec();
    const snapshots: Record<string, DriverPresenceSnapshot> = {};

    for (let i = 0; i < driverIds.length; i += 1) {
      const driverId = driverIds[i];
      const base = i * 3;

      const liveRaw = results?.[base]?.[1];
      const stateRaw = results?.[base + 1]?.[1];
      const locationRaw = results?.[base + 2]?.[1];

      let location: DriverLocation | null = null;
      if (typeof locationRaw === 'string' && locationRaw.length > 0) {
        try {
          location = JSON.parse(locationRaw) as DriverLocation;
        } catch {
          location = null;
        }
      }

      snapshots[driverId] = {
        isOnline: liveRaw === '1',
        state: stateRaw === 'READY' || stateRaw === 'BUSY' ? stateRaw : null,
        location,
      };
    }

    return snapshots;
  }
}
