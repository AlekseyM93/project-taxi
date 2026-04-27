import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';

import { PresenceService } from './presence.service';
import { OrdersService } from '../orders/orders.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { OrderStatus } from '../orders/order.entity';
import { PassengerGateway } from './passenger.gateway';
import { DriversService } from '../drivers/drivers.service';
import { OrderCommandIdempotencyService } from '../orders/order-command-idempotency.service';
import { AuthService } from '../auth/auth.service';

function resolveWsOrigins() {
  const raw =
    process.env.WS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '';
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : ['http://localhost:5173'];
}

@WebSocketGateway({
  namespace: '/driver',
  cors: { origin: resolveWsOrigins() },
})
export class DriverGateway {
  @WebSocketServer()
  server!: Server;
  private readonly contractVersion = 'ws.v1';
  private readonly lastAcceptedLocationSeq = new Map<string, number>();

  constructor(
    private readonly authService: AuthService,
    private readonly presenceService: PresenceService,
    private readonly ordersService: OrdersService,
    private readonly dispatchService: DispatchService,
    private readonly passengerGateway: PassengerGateway,
    private readonly driversService: DriversService,
    private readonly idempotency: OrderCommandIdempotencyService,
  ) {}

  private buildMeta(event: string, traceId: string) {
    return {
      contractVersion: this.contractVersion,
      event,
      traceId,
      serverTs: new Date().toISOString(),
    };
  }

  private parseLocationUpdateBody(body: {
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    clientTs?: string;
    sequence?: number;
    accuracy?: number;
    isMock?: boolean;
    offlineBuffered?: boolean;
  }) {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const sequence =
      typeof body?.sequence === 'number' && Number.isFinite(body.sequence)
        ? body.sequence
        : undefined;
    const clientTs =
      typeof body?.clientTs === 'string' && body.clientTs.trim().length > 0
        ? body.clientTs
        : undefined;

    return {
      lat,
      lng,
      heading: typeof body?.heading === 'number' ? body.heading : undefined,
      speed: typeof body?.speed === 'number' ? body.speed : undefined,
      accuracy: typeof body?.accuracy === 'number' ? body.accuracy : undefined,
      isMock: body?.isMock === true,
      offlineBuffered: body?.offlineBuffered === true,
      sequence,
      clientTs,
    };
  }

  private logLocationAckEvent(params: {
    traceId: string;
    driverId?: string;
    ack: Record<string, unknown>;
  }) {
    const ackMeta =
      params.ack && typeof params.ack._meta === 'object'
        ? (params.ack._meta as Record<string, unknown>)
        : {};
    const ok = params.ack.ok === true;
    const reason =
      typeof params.ack.reason === 'string' ? params.ack.reason : null;

    void this.ordersService
      .trackDriverLocationAckMetric({ ok, reason })
      .catch((metricError: unknown) => {
        console.log('[driver.location.update][metrics] ERROR', {
          traceId: params.traceId,
          message:
            metricError && typeof metricError === 'object'
              ? String((metricError as { message?: unknown }).message ?? metricError)
              : String(metricError),
        });
      });

    console.log('[driver.location.update][ack]', {
      ok,
      reason,
      code: params.ack.code ?? null,
      tracking: params.ack.tracking ?? null,
      orderId: params.ack.orderId ?? null,
      driverId: params.driverId ?? null,
      traceId: params.traceId,
      contractVersion:
        ackMeta.contractVersion ?? this.contractVersion ?? 'unknown',
      serverTs: ackMeta.serverTs ?? new Date().toISOString(),
    });
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const headerAuth = client.handshake.headers?.authorization;
    if (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')) {
      return headerAuth.slice('Bearer '.length);
    }

    return null;
  }

  private async ensureDriverId(client: Socket): Promise<string> {
    if (client.data?.driverId) {
      return client.data.driverId;
    }

    let userId = client.data?.userId;
    if (!userId) {
      // Some clients can emit events immediately after socket connect.
      // Fallback to token validation avoids auth race between connection and first event.
      const token = this.extractToken(client);
      if (token) {
        const payload = await this.authService.validateAccessToken(token);
        if (payload.role === 'DRIVER') {
          userId = String(payload.sub);
          client.data.userId = userId;
        }
      }
    }

    if (!userId) {
      throw new UnauthorizedException();
    }

    const driverProfile =
      await this.driversService.getDriverProfileByUserId(userId);

    client.data.driverId = driverProfile.id;
    return driverProfile.id;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object') {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return String(message[0] ?? '');
        }
        if (typeof message === 'string') {
          return message;
        }
      }
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message?: unknown }).message ?? '');
    }

    return '';
  }

  private mapErrorToAck(error: unknown, traceId: string) {
    const message = this.getErrorMessage(error);

    if (error instanceof UnauthorizedException) {
      return {
        ok: false,
        code: 'UNAUTHORIZED' as const,
        reason: 'UNAUTHORIZED' as const,
        traceId,
      };
    }

    if (message === 'DRIVER_PROFILE_NOT_FOUND') {
      return {
        ok: false,
        code: 'DRIVER_PROFILE_NOT_FOUND' as const,
        reason: 'DRIVER_PROFILE_NOT_FOUND' as const,
        traceId,
      };
    }

    if (error instanceof NotFoundException || message === 'ORDER_NOT_FOUND') {
      return {
        ok: false,
        code: 'ORDER_NOT_FOUND' as const,
        reason: 'ORDER_NOT_FOUND' as const,
        traceId,
      };
    }

    if (
      error instanceof ForbiddenException ||
      message === 'NOT_ASSIGNED_TO_THIS_DRIVER'
    ) {
      return {
        ok: false,
        code: 'NOT_ASSIGNED_TO_THIS_DRIVER' as const,
        reason: 'NOT_ASSIGNED_TO_THIS_DRIVER' as const,
        traceId,
      };
    }

    if (message.startsWith('INVALID_STATUS:')) {
      const [, status] = message.split(':');
      return {
        ok: false,
        code: 'INVALID_STATUS' as const,
        reason: 'INVALID_STATUS' as const,
        status: status || 'UNKNOWN',
        traceId,
      };
    }

    if (
      error instanceof BadRequestException &&
      message === 'ORDER_ID_REQUIRED'
    ) {
      return {
        ok: false,
        code: 'ORDER_ID_REQUIRED' as const,
        reason: 'ORDER_ID_REQUIRED' as const,
        traceId,
      };
    }

    return {
      ok: false,
      code: 'INTERNAL_ERROR' as const,
      reason: 'INTERNAL_ERROR' as const,
      traceId,
    };
  }

  private async executeOrderAction(
    client: Socket,
    event: string,
    body: { orderId?: string; commandId?: string },
    action: (driverId: string, orderId: string) => Promise<unknown>,
  ) {
    const traceId = randomUUID();

    try {
      if (!body?.orderId || typeof body.orderId !== 'string') {
        throw new BadRequestException('ORDER_ID_REQUIRED');
      }

      const driverId = await this.ensureDriverId(client);

      const runAction = async () => {
        const result = await action(driverId, body.orderId!);
        if (
          result &&
          typeof result === 'object' &&
          'ok' in (result as Record<string, unknown>)
        ) {
          const ack = result as Record<string, unknown> & { ok: boolean };
          return {
            ...ack,
            traceId,
            _meta: this.buildMeta(event, traceId),
          };
        }

        return {
          ok: true,
          traceId,
          _meta: this.buildMeta(event, traceId),
        };
      };

      if (body.commandId && typeof body.commandId === 'string') {
        const idempotentResult = await this.idempotency.execute({
          driverId,
          event,
          orderId: body.orderId,
          commandId: body.commandId,
          traceId,
          handler: runAction,
        });
        return idempotentResult;
      }

      const result = await runAction();

      if (
        result &&
        typeof result === 'object' &&
        'ok' in (result as Record<string, unknown>)
      ) {
        return result;
      }

      return {
        ok: true,
        traceId,
        _meta: this.buildMeta(event, traceId),
      };
    } catch (error) {
      const mapped = this.mapErrorToAck(error, traceId);
      return {
        ...mapped,
        _meta: this.buildMeta(event, traceId),
      };
    }
  }

  private isLocationUpdateLateOrDuplicate(params: {
    driverId: string;
    sequence?: number;
    clientTs?: string;
    latestStoredLocationTs?: string | null;
  }) {
    if (
      typeof params.sequence === 'number' &&
      Number.isFinite(params.sequence)
    ) {
      const prev = this.lastAcceptedLocationSeq.get(params.driverId) ?? 0;
      if (params.sequence <= prev) {
        return true;
      }
    }

    if (
      params.clientTs &&
      params.latestStoredLocationTs &&
      !Number.isNaN(Date.parse(params.clientTs)) &&
      !Number.isNaN(Date.parse(params.latestStoredLocationTs))
    ) {
      const incomingTs = Date.parse(params.clientTs);
      const latestTs = Date.parse(params.latestStoredLocationTs);
      if (incomingTs <= latestTs) {
        return true;
      }
    }

    return false;
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new UnauthorizedException();
      }

      const payload = await this.authService.validateAccessToken(token);
      if (payload.role !== 'DRIVER') {
        throw new UnauthorizedException('Invalid role');
      }
      const userId = String(payload.sub);

      client.data.userId = userId;

      const driverProfile =
        await this.driversService.getDriverProfileByUserId(userId);

      const hasActiveVehicle =
        driverProfile.vehicles?.some((v) => v.isActive) ?? false;

      const canWork = driverProfile.status === 'ACTIVE' && hasActiveVehicle;

      console.log('Driver check:', {
        userId,
        driverProfileId: driverProfile.id,
        status: driverProfile.status,
        hasActiveVehicle,
        canWork,
      });

      if (!canWork) {
        console.log(
          'Driver rejected (not active or no vehicle):',
          driverProfile.id,
        );
        client.disconnect();
        return;
      }

      client.data.driverId = driverProfile.id;

      this.presenceService.addDriverSocket(driverProfile.id, client.id);
      await this.ordersService.reconcileDriverAvailability(driverProfile.id);

      const readyDrivers = await this.presenceService.getReadyDrivers();
      console.log('Driver connected:', driverProfile.id);
      console.log(
        '[DRIVER_GATEWAY] ready drivers after connect:',
        readyDrivers,
      );
    } catch (error: any) {
      console.log('Driver connection failed:', error?.message ?? error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const driverId = client.data?.driverId;
    if (!driverId) {
      return;
    }

    this.presenceService.removeDriverSocket(driverId, client.id);

    const stillConnected =
      this.presenceService.getDriverSockets(driverId).length > 0;

    if (!stillConnected) {
      await this.presenceService.setDriverOffline(driverId);
      this.lastAcceptedLocationSeq.delete(driverId);
    }
  }

  emitToDriver(driverId: string, event: string, payload: any) {
    if (!this.server) {
      return;
    }
    const socketIds = this.presenceService.getDriverSockets(driverId);
    const wrapped =
      payload && typeof payload === 'object'
        ? {
            ...payload,
            _meta: {
              contractVersion: this.contractVersion,
              event,
              emittedAt: new Date().toISOString(),
              driverId,
            },
          }
        : payload;

    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, wrapped);
    }
  }

  @SubscribeMessage('driver.location.update')
  async updateLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      lat: number;
      lng: number;
      heading?: number;
      speed?: number;
      clientTs?: string;
      sequence?: number;
      accuracy?: number;
      isMock?: boolean;
      offlineBuffered?: boolean;
    },
  ) {
    const event = 'driver.location.update';
    const traceId = randomUUID();
    try {
      const driverId = await this.ensureDriverId(client);
      const parsed = this.parseLocationUpdateBody(body);

      if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) {
        const ack = {
          ok: false,
          reason: 'INVALID_COORDINATES' as const,
          _meta: this.buildMeta(event, traceId),
        };
        this.logLocationAckEvent({ traceId, driverId, ack });
        return ack;
      }

      const existingLocation =
        await this.presenceService.getDriverLocation(driverId);
      const isLateOrDuplicate = this.isLocationUpdateLateOrDuplicate({
        driverId,
        sequence: parsed.sequence,
        clientTs: parsed.clientTs,
        latestStoredLocationTs:
          existingLocation?.clientTs ?? existingLocation?.updatedAt ?? null,
      });
      if (isLateOrDuplicate) {
        const ack = {
          ok: false,
          reason: 'DUPLICATE_OR_LATE_UPDATE' as const,
          _meta: this.buildMeta(event, traceId),
        };
        this.logLocationAckEvent({ traceId, driverId, ack });
        return ack;
      }

      await this.presenceService.updateDriverLocation(driverId, {
        lat: parsed.lat,
        lng: parsed.lng,
        heading: parsed.heading,
        speed: parsed.speed,
        accuracy: parsed.accuracy,
        isMock: parsed.isMock,
        offlineBuffered: parsed.offlineBuffered,
        sequence: parsed.sequence,
        clientTs: parsed.clientTs,
        source: 'WS',
      });

      if (typeof parsed.sequence === 'number') {
        this.lastAcceptedLocationSeq.set(driverId, parsed.sequence);
      }

      await this.ordersService.reconcileDriverAvailability(driverId);

      let activeOrder = null;

      try {
        activeOrder =
          await this.ordersService.findActiveOrderByDriver(driverId);
      } catch (e: any) {
        console.log('findActiveOrder error:', e?.message ?? e);
      }

      if (
        !activeOrder ||
        ![OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(
          activeOrder.status,
        )
      ) {
        const ack = {
          ok: true,
          tracking: false,
          _meta: this.buildMeta(event, traceId),
        };
        this.logLocationAckEvent({ traceId, driverId, ack });
        return ack;
      }

      const location = await this.presenceService.getDriverLocation(driverId);

      if (location) {
        this.passengerGateway.emitDriverLocation(activeOrder.id, {
          orderId: activeOrder.id,
          driverId,
          ...location,
        });
      }

      const ack = {
        ok: true,
        tracking: true,
        orderId: activeOrder.id,
        _meta: this.buildMeta(event, traceId),
      };
      this.logLocationAckEvent({ traceId, driverId, ack });
      return ack;
    } catch (e: any) {
      console.log('[driver.location.update] ERROR', {
        traceId,
        message: e?.message ?? String(e),
      });
      const mapped = this.mapErrorToAck(e, traceId);
      const ack = {
        ...mapped,
        _meta: this.buildMeta(event, traceId),
      };
      this.logLocationAckEvent({
        traceId,
        driverId: client.data?.driverId,
        ack,
      });
      return ack;
    }
  }

  @SubscribeMessage('order.accept')
  async accept(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; commandId?: string },
  ) {
    return this.executeOrderAction(
      client,
      'order.accept',
      body,
      (driverId, orderId) =>
        this.dispatchService.acceptBroadcastOffer(orderId, driverId),
    );
  }

  @SubscribeMessage('order.decline')
  async decline(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; commandId?: string },
  ) {
    return this.executeOrderAction(
      client,
      'order.decline',
      body,
      (driverId, orderId) => this.ordersService.declineOrder(driverId, orderId),
    );
  }

  @SubscribeMessage('order.start')
  async start(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; commandId?: string },
  ) {
    return this.executeOrderAction(
      client,
      'order.start',
      body,
      (driverId, orderId) => this.ordersService.startOrder(driverId, orderId),
    );
  }

  @SubscribeMessage('order.finish')
  async finish(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; commandId?: string },
  ) {
    return this.executeOrderAction(
      client,
      'order.finish',
      body,
      (driverId, orderId) => this.ordersService.finishOrder(driverId, orderId),
    );
  }

  @SubscribeMessage('order.cancel')
  async cancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; commandId?: string },
  ) {
    return this.executeOrderAction(
      client,
      'order.cancel',
      body,
      (driverId, orderId) => this.ordersService.cancelOrder(driverId, orderId),
    );
  }
}
