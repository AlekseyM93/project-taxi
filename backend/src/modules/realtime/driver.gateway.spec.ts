import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverGateway } from './driver.gateway';
import { OrderStatus } from '../orders/order.entity';

describe('DriverGateway realtime flow', () => {
  const makeGateway = () => {
    const authService = {
      validateAccessToken: jest.fn(),
    } as any;

    const presenceService = {
      getDriverLocation: jest.fn().mockResolvedValue(null),
      updateDriverLocation: jest.fn().mockResolvedValue(undefined),
      addDriverSocket: jest.fn(),
      removeDriverSocket: jest.fn(),
      getDriverSockets: jest.fn().mockReturnValue([]),
      setDriverOffline: jest.fn(),
    } as any;

    const ordersService = {
      reconcileDriverAvailability: jest.fn().mockResolvedValue(undefined),
      findActiveOrderByDriver: jest.fn().mockResolvedValue(null),
      startOrder: jest.fn().mockResolvedValue({ ok: true }),
      finishOrder: jest.fn().mockResolvedValue({ ok: true }),
      cancelOrder: jest.fn().mockResolvedValue({ ok: true }),
      trackDriverLocationAckMetric: jest.fn().mockResolvedValue(undefined),
    } as any;

    const dispatchService = {
      acceptBroadcastOffer: jest.fn().mockResolvedValue({ ok: true }),
    } as any;

    const passengerGateway = {
      emitDriverLocation: jest.fn(),
    } as any;

    const driversService = {
      getDriverProfileByUserId: jest
        .fn()
        .mockResolvedValue({ id: 'driver-profile-id' }),
    } as any;

    const idempotency = {
      execute: jest.fn(),
    } as any;

    const gateway = new DriverGateway(
      authService,
      presenceService,
      ordersService,
      dispatchService,
      passengerGateway,
      driversService,
      idempotency,
    );

    return {
      gateway,
      presenceService,
      ordersService,
      dispatchService,
      passengerGateway,
      driversService,
    };
  };

  it('returns INVALID_COORDINATES with traceId for malformed payload', async () => {
    const { gateway } = makeGateway();
    const client = { data: { driverId: 'driver-profile-id' } } as any;

    const ack = (await gateway.updateLocation(client, {
      lat: Number.NaN,
      lng: 37.618423,
    })) as any;

    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('INVALID_COORDINATES');
    expect(ack._meta?.event).toBe('driver.location.update');
    expect(typeof ack._meta?.traceId).toBe('string');
    expect(ack._meta?.traceId?.length).toBeGreaterThan(0);
  });

  it('maps driver profile lookup failure to DRIVER_PROFILE_NOT_FOUND', async () => {
    const { gateway, driversService } = makeGateway();
    driversService.getDriverProfileByUserId.mockRejectedValue(
      new NotFoundException('DRIVER_PROFILE_NOT_FOUND'),
    );
    const client = { data: { userId: 'user-id-without-profile' } } as any;

    const ack = (await gateway.updateLocation(client, {
      lat: 55.751244,
      lng: 37.618423,
      sequence: 1,
    })) as any;

    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('DRIVER_PROFILE_NOT_FOUND');
    expect(ack.code).toBe('DRIVER_PROFILE_NOT_FOUND');
    expect(typeof ack.traceId).toBe('string');
    expect(ack.traceId).toBe(ack._meta?.traceId);
  });

  it('returns INTERNAL_ERROR with traceId when presence update throws', async () => {
    const { gateway, presenceService, ordersService } = makeGateway();
    presenceService.updateDriverLocation.mockRejectedValue(
      new Error('redis unavailable'),
    );
    ordersService.reconcileDriverAvailability.mockResolvedValue(undefined);
    const client = { data: { driverId: 'driver-profile-id' } } as any;

    const ack = (await gateway.updateLocation(client, {
      lat: 55.751244,
      lng: 37.618423,
      sequence: 7,
      clientTs: new Date().toISOString(),
    })) as any;

    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('INTERNAL_ERROR');
    expect(ack.code).toBe('INTERNAL_ERROR');
    expect(typeof ack.traceId).toBe('string');
    expect(ack.traceId).toBe(ack._meta?.traceId);
  });

  it('returns tracking=true and emits passenger driver-location for active order', async () => {
    const { gateway, presenceService, ordersService, passengerGateway } =
      makeGateway();
    const client = { data: { driverId: 'driver-profile-id' } } as any;

    ordersService.findActiveOrderByDriver.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.ASSIGNED,
    });
    presenceService.getDriverLocation
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        lat: 55.751244,
        lng: 37.618423,
        updatedAt: new Date().toISOString(),
      });

    const ack = (await gateway.updateLocation(client, {
      lat: 55.751244,
      lng: 37.618423,
      sequence: 10,
      clientTs: new Date().toISOString(),
    })) as any;

    expect(ack.ok).toBe(true);
    expect(ack.tracking).toBe(true);
    expect(ack.orderId).toBe('order-1');
    expect(passengerGateway.emitDriverLocation).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({
        orderId: 'order-1',
        driverId: 'driver-profile-id',
        lat: 55.751244,
        lng: 37.618423,
      }),
    );
  });

  it('rejects duplicate update by non-incremental sequence', async () => {
    const { gateway, presenceService } = makeGateway();
    const client = { data: { driverId: 'driver-profile-id' } } as any;

    const firstAck = (await gateway.updateLocation(client, {
      lat: 55.751244,
      lng: 37.618423,
      sequence: 15,
      clientTs: '2026-01-01T00:00:20.000Z',
    })) as any;
    const duplicateAck = (await gateway.updateLocation(client, {
      lat: 55.751244,
      lng: 37.618423,
      sequence: 15,
      clientTs: '2026-01-01T00:00:21.000Z',
    })) as any;

    expect(firstAck.ok).toBe(true);
    expect(duplicateAck.ok).toBe(false);
    expect(duplicateAck.reason).toBe('DUPLICATE_OR_LATE_UPDATE');
    expect(duplicateAck._meta?.event).toBe('driver.location.update');
    expect(presenceService.updateDriverLocation).toHaveBeenCalledTimes(1);
  });

  it('rejects late update by client timestamp ordering', async () => {
    const { gateway, presenceService } = makeGateway();
    const client = { data: { driverId: 'driver-profile-id' } } as any;

    presenceService.getDriverLocation.mockResolvedValue({
      lat: 55.751244,
      lng: 37.618423,
      clientTs: '2026-01-01T00:00:30.000Z',
      updatedAt: '2026-01-01T00:00:30.500Z',
    });

    const lateAck = (await gateway.updateLocation(client, {
      lat: 55.75125,
      lng: 37.61842,
      sequence: 31,
      clientTs: '2026-01-01T00:00:29.000Z',
    })) as any;

    expect(lateAck.ok).toBe(false);
    expect(lateAck.reason).toBe('DUPLICATE_OR_LATE_UPDATE');
    expect(lateAck._meta?.event).toBe('driver.location.update');
    expect(presenceService.updateDriverLocation).not.toHaveBeenCalled();
  });

  it('keeps accept/start/finish websocket transitions consistent', async () => {
    const { gateway, dispatchService, ordersService } = makeGateway();
    const client = { data: { driverId: 'driver-profile-id' } } as any;
    const orderId = 'order-2';

    const acceptAck = (await gateway.accept(client, { orderId })) as any;
    const startAck = (await gateway.start(client, { orderId })) as any;
    const finishAck = (await gateway.finish(client, { orderId })) as any;

    expect(acceptAck.ok).toBe(true);
    expect(startAck.ok).toBe(true);
    expect(finishAck.ok).toBe(true);
    expect(acceptAck._meta?.event).toBe('order.accept');
    expect(startAck._meta?.event).toBe('order.start');
    expect(finishAck._meta?.event).toBe('order.finish');

    expect(dispatchService.acceptBroadcastOffer).toHaveBeenCalledWith(
      orderId,
      'driver-profile-id',
    );
    expect(ordersService.startOrder).toHaveBeenCalledWith(
      'driver-profile-id',
      orderId,
    );
    expect(ordersService.finishOrder).toHaveBeenCalledWith(
      'driver-profile-id',
      orderId,
    );
  });

  it('maps invalid state transition errors for order.start', async () => {
    const { gateway, ordersService } = makeGateway();
    const client = { data: { driverId: 'driver-profile-id' } } as any;
    const orderId = 'order-3';
    ordersService.startOrder.mockRejectedValue(
      new BadRequestException('INVALID_STATUS:NEW'),
    );

    const ack = (await gateway.start(client, { orderId })) as any;

    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe('INVALID_STATUS');
    expect(ack.code).toBe('INVALID_STATUS');
    expect(ack.status).toBe('NEW');
    expect(ack._meta?.event).toBe('order.start');
  });
});
