import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, UnauthorizedException, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OrdersService } from '../orders/orders.service';
import { PresenceService } from './presence.service';
import { OrderEntity, OrderStatus } from '../orders/order.entity';

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
  namespace: '/passenger',
  cors: {
    origin: resolveWsOrigins(),
  },
})
export class PassengerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;
  private readonly contractVersion = 'ws.v1';
  private readonly eventSequence = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly presenceService: PresenceService,
  ) {}

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

  private normalizeStatus(status: OrderStatus): string {
    return status === OrderStatus.NEW ? 'SEARCHING' : status;
  }

  private nextSequence(orderId: string, event: string): number {
    const key = `${orderId}:${event}`;
    const next = (this.eventSequence.get(key) ?? 0) + 1;
    this.eventSequence.set(key, next);
    return next;
  }

  private withMeta(
    orderId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    return {
      ...payload,
      _meta: {
        contractVersion: this.contractVersion,
        event,
        orderId,
        sequence: this.nextSequence(orderId, event),
        emittedAt: new Date().toISOString(),
      },
    };
  }

  getOrderRoom(orderId: string): string {
    return `order:${orderId}`;
  }

  private async buildOrderSnapshot(order: OrderEntity) {
    const shouldIncludeLocation =
      !!order.driverId &&
      [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(order.status);

    const location = shouldIncludeLocation
      ? await this.presenceService.getDriverLocation(order.driverId!)
      : null;

    return {
      orderId: order.id,
      status: this.normalizeStatus(order.status),
      driverId: order.driverId,
      location,
    };
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token);
      const passengerId = String(payload.sub || payload.userId || payload.id);
      const role = payload.role;

      if (role !== 'PASSENGER') {
        client.disconnect();
        return;
      }

      client.data.passengerId = passengerId;
      client.join(`passenger:${passengerId}`);

      console.log('Passenger connected:', passengerId);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const passengerId = client.data?.passengerId;
    if (passengerId) {
      console.log('Passenger disconnected:', passengerId);
    }
  }

  @SubscribeMessage('passenger.join')
  async handleJoin(@ConnectedSocket() client: Socket) {
    const passengerId = client.data?.passengerId;
    if (!passengerId) {
      return { ok: false };
    }

    client.join(`passenger:${passengerId}`);
    return { ok: true, passengerId };
  }

  @SubscribeMessage('passenger.order.subscribe')
  async handleOrderSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId?: string },
  ) {
    const passengerId = client.data?.passengerId;
    if (!passengerId) {
      throw new UnauthorizedException();
    }

    if (!body?.orderId) {
      return { ok: false, reason: 'ORDER_ID_REQUIRED' as const };
    }

    const order = await this.ordersService.findOrderById(body.orderId);
    if (!order) {
      return { ok: false, reason: 'ORDER_NOT_FOUND' as const };
    }

    if (order.passengerId !== passengerId) {
      return { ok: false, reason: 'FORBIDDEN' as const };
    }

    await client.join(this.getOrderRoom(order.id));

    const snapshot = await this.buildOrderSnapshot(order);
    client.emit(
      'order.driver.snapshot',
      this.withMeta(order.id, 'order.driver.snapshot', snapshot),
    );

    return {
      ok: true,
      orderId: order.id,
      room: this.getOrderRoom(order.id),
      snapshot,
    };
  }

  emitToPassenger(passengerId: string, event: string, payload: any) {
    if (!this.server) {
      return;
    }
    if (
      payload &&
      typeof payload === 'object' &&
      typeof payload.orderId === 'string'
    ) {
      this.server
        .to(`passenger:${passengerId}`)
        .emit(event, this.withMeta(payload.orderId, event, payload));
      return;
    }
    this.server.to(`passenger:${passengerId}`).emit(event, payload);
  }

  emitToOrder(orderId: string, event: string, payload: any) {
    if (!this.server) {
      return;
    }
    const wrapped =
      payload && typeof payload === 'object'
        ? this.withMeta(orderId, event, payload)
        : payload;
    this.server.to(this.getOrderRoom(orderId)).emit(event, wrapped);
  }

  emitDriverLocation(orderId: string, payload: any) {
    this.emitToOrder(orderId, 'order.driver.location', payload);
  }

  async emitDriverSnapshot(order: OrderEntity) {
    const snapshot = await this.buildOrderSnapshot(order);
    this.emitToOrder(order.id, 'order.driver.snapshot', snapshot);
    return snapshot;
  }
}
