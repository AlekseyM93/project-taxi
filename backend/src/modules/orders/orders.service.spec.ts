import { Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { OrderEntity, OrderStatus } from './order.entity';

function createRepoMock<T extends object>() {
  return {
    findOne: jest.fn<Promise<T | null>, [unknown]>(),
    save: jest.fn<Promise<T>, [T]>(),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeOrder(partial?: Partial<OrderEntity>): OrderEntity {
  return {
    id: 'order-1',
    passengerId: 'passenger-1',
    driverId: 'driver-1',
    cityCode: 'MOSCOW',
    serviceLevel: 'ECONOMY',
    status: OrderStatus.ASSIGNED,
    price: '500.00',
    pricingBreakdown: null,
    fromLocation: { type: 'Point', coordinates: [37.62, 55.75] },
    toLocation: { type: 'Point', coordinates: [37.63, 55.76] },
    acceptedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...partial,
  };
}

function setup() {
  const repo = createRepoMock<OrderEntity>();
  const adminFilterRepo = {} as Repository<any>;
  const adminActionExecutionRepo = {} as Repository<any>;
  const mobileCommandRepo = {} as Repository<any>;
  const presence = {} as any;
  const gateway = { emitToDriver: jest.fn() };
  const passengerGateway = {} as any;
  const dispatchService = { clearDispatchState: jest.fn(async () => undefined) };
  const driversService = { recordTripEarning: jest.fn(async () => undefined) };
  const observability = {} as any;
  const notifications = { publish: jest.fn(async () => undefined) };
  const payments = {
    captureOrderPayment: jest.fn(async () => undefined),
    voidOrderPayment: jest.fn(async () => undefined),
  };
  const outbox = {} as any;
  const antifraud = {} as any;
  const pricing = {} as any;
  const geo = {} as any;

  const service = new OrdersService(
    repo,
    adminFilterRepo,
    adminActionExecutionRepo,
    mobileCommandRepo,
    presence,
    gateway as any,
    passengerGateway,
    dispatchService as any,
    driversService as any,
    observability,
    notifications as any,
    payments as any,
    outbox,
    antifraud,
    pricing,
    geo,
  );

  jest
    .spyOn(service as any, 'reconcileDriverAvailability')
    .mockResolvedValue(undefined);
  jest.spyOn(service as any, 'emitPassengerStatus').mockImplementation(() => {});
  jest
    .spyOn(service as any, 'emitOrderSnapshotIfTrackingActive')
    .mockResolvedValue(undefined);
  jest.spyOn(service as any, 'emitDriverSnapshot').mockImplementation(() => {});
  jest.spyOn(service as any, 'trackStatusChange').mockResolvedValue(undefined);
  jest
    .spyOn(service as any, 'enqueueLifecycleOutbox')
    .mockResolvedValue(undefined);

  return {
    service,
    repo,
    gateway,
    dispatchService,
    driversService,
    notifications,
    payments,
  };
}

describe('OrdersService transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts assigned order and stores acceptedAt', async () => {
    const { service, repo } = setup();
    const order = makeOrder({ status: OrderStatus.ASSIGNED, acceptedAt: null });
    repo.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce(null);
    repo.save.mockResolvedValue(order);

    const result = await service.acceptOrder('driver-1', 'order-1');

    expect(result.ok).toBe(true);
    expect(order.acceptedAt).toBeInstanceOf(Date);
    expect(repo.save).toHaveBeenCalledWith(order);
  });

  it('returns ORDER_NOT_FOUND when accepting missing order', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValueOnce(null);

    const result = await service.acceptOrder('driver-1', 'missing-order');

    expect(result).toEqual({ ok: false, reason: 'ORDER_NOT_FOUND' });
  });

  it('returns NOT_ASSIGNED_TO_THIS_DRIVER when accepting foreign order', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValueOnce(makeOrder({ driverId: 'driver-2' }));

    const result = await service.acceptOrder('driver-1', 'order-1');

    expect(result).toEqual({ ok: false, reason: 'NOT_ASSIGNED_TO_THIS_DRIVER' });
  });

  it('returns INVALID_STATUS when accepting from wrong status', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValueOnce(
      makeOrder({ status: OrderStatus.IN_PROGRESS, acceptedAt: new Date() }),
    );

    const result = await service.acceptOrder('driver-1', 'order-1');

    expect(result).toEqual({
      ok: false,
      reason: 'INVALID_STATUS',
      status: OrderStatus.IN_PROGRESS,
    });
  });

  it('rejects accept when driver already has active order', async () => {
    const { service, repo } = setup();
    const order = makeOrder({ status: OrderStatus.ASSIGNED });
    const anotherOrder = makeOrder({
      id: 'order-2',
      status: OrderStatus.IN_PROGRESS,
      driverId: 'driver-1',
    });
    repo.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce(anotherOrder);

    const result = await service.acceptOrder('driver-1', 'order-1');

    expect(result).toEqual({
      ok: false,
      reason: 'DRIVER_ALREADY_HAS_ACTIVE_ORDER',
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws ORDER_NOT_FOUND on start when order is missing', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    await expect(service.startOrder('driver-1', 'order-1')).rejects.toThrow(
      'ORDER_NOT_FOUND',
    );
  });

  it('throws NOT_ASSIGNED_TO_THIS_DRIVER on start by foreign driver', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeOrder({ driverId: 'driver-2' }));

    await expect(service.startOrder('driver-1', 'order-1')).rejects.toThrow(
      'NOT_ASSIGNED_TO_THIS_DRIVER',
    );
  });

  it('throws on start when transition is invalid', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.NEW }));

    await expect(service.startOrder('driver-1', 'order-1')).rejects.toThrow(
      'INVALID_STATUS:NEW',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('starts assigned order and sends passenger trip-start notification', async () => {
    const { service, repo, notifications } = setup();
    const order = makeOrder({ status: OrderStatus.ASSIGNED });
    const started = { ...order, status: OrderStatus.IN_PROGRESS };
    repo.findOne.mockResolvedValue(order);
    repo.save.mockResolvedValue(started);

    const result = await service.startOrder('driver-1', 'order-1');

    expect(result.ok).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.IN_PROGRESS }),
    );
    expect(notifications.publish).toHaveBeenCalledWith(
      'passenger-1',
      'PASSENGER_ORDER_STATUS_CHANGED',
      expect.objectContaining({
        orderId: 'order-1',
        status: 'IN_PROGRESS',
        stage: 'TRIP_STARTED',
      }),
    );
  });

  it('throws ORDER_NOT_FOUND on finish when order is missing', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    await expect(service.finishOrder('driver-1', 'order-1')).rejects.toThrow(
      'ORDER_NOT_FOUND',
    );
  });

  it('throws NOT_ASSIGNED_TO_THIS_DRIVER on finish by foreign driver', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeOrder({ driverId: 'driver-2' }));

    await expect(service.finishOrder('driver-1', 'order-1')).rejects.toThrow(
      'NOT_ASSIGNED_TO_THIS_DRIVER',
    );
  });

  it('throws INVALID_STATUS on finish from non-in-progress order', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.ASSIGNED }));

    await expect(service.finishOrder('driver-1', 'order-1')).rejects.toThrow(
      'INVALID_STATUS:ASSIGNED',
    );
  });

  it('finishes in-progress order and triggers payment capture', async () => {
    const { service, repo, dispatchService, driversService, payments } = setup();
    const order = makeOrder({ status: OrderStatus.IN_PROGRESS, price: '777.50' });
    repo.findOne.mockResolvedValue(order);
    repo.save.mockResolvedValue({ ...order, status: OrderStatus.DONE });

    const result = await service.finishOrder('driver-1', 'order-1');

    expect(result.ok).toBe(true);
    expect(dispatchService.clearDispatchState).toHaveBeenCalledWith('order-1');
    expect(driversService.recordTripEarning).toHaveBeenCalledWith(
      expect.objectContaining({ amountRub: 777.5 }),
    );
    expect(payments.captureOrderPayment).toHaveBeenCalledWith('order-1');
  });

  it('returns ORDER_NOT_FOUND when cancelling missing order', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);

    const result = await service.cancelOrder('driver-1', 'missing-order');

    expect(result).toEqual({ ok: false, reason: 'ORDER_NOT_FOUND' });
  });

  it('returns NOT_ASSIGNED_TO_THIS_DRIVER when cancelling foreign order', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeOrder({ driverId: 'driver-2' }));

    const result = await service.cancelOrder('driver-1', 'order-1');

    expect(result).toEqual({ ok: false, reason: 'NOT_ASSIGNED_TO_THIS_DRIVER' });
  });

  it('rejects cancel when transition is invalid', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DONE }));

    const result = await service.cancelOrder('driver-1', 'order-1');

    expect(result).toEqual({
      ok: false,
      reason: 'INVALID_STATUS',
      status: OrderStatus.DONE,
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cancels assigned order and triggers void workflow', async () => {
    const { service, repo, gateway, dispatchService, notifications, payments } =
      setup();
    const order = makeOrder({ status: OrderStatus.ASSIGNED });
    const cancelled = { ...order, status: OrderStatus.CANCELLED };
    repo.findOne.mockResolvedValue(order);
    repo.save.mockResolvedValue(cancelled);

    const result = await service.cancelOrder('driver-1', 'order-1');

    expect(result.ok).toBe(true);
    expect(dispatchService.clearDispatchState).toHaveBeenCalledWith('order-1');
    expect(gateway.emitToDriver).toHaveBeenCalledWith('driver-1', 'order.cancelled', {
      orderId: 'order-1',
    });
    expect(notifications.publish).toHaveBeenCalled();
    expect(payments.voidOrderPayment).toHaveBeenCalledWith(
      'order-1',
      'CANCELLED_BY_DRIVER',
    );
  });
});
