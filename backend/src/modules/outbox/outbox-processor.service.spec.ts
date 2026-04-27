import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxService } from './outbox.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxEventEntity } from './outbox-event.entity';

describe('OutboxProcessorService', () => {
  const outboxMock = {
    reserveBatch: jest.fn(),
    markProcessed: jest.fn(),
    markFailed: jest.fn(),
  } as unknown as jest.Mocked<OutboxService>;

  const configMock = {
    get: jest.fn((key: string, fallback: string | number) => fallback),
  } as unknown as jest.Mocked<ConfigService>;

  const notificationsMock = {
    publish: jest.fn(),
  } as unknown as jest.Mocked<NotificationsService>;

  const service = new OutboxProcessorService(
    outboxMock,
    configMock,
    notificationsMock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeEvent(partial?: Partial<OutboxEventEntity>): OutboxEventEntity {
    return {
      id: 'evt-1',
      topic: 'order.lifecycle',
      eventType: 'ORDER_FINISHED',
      aggregateType: 'ORDER',
      aggregateId: 'order-1',
      payload: {
        orderId: 'order-1',
        actorId: 'driver-1',
        actorType: 'DRIVER',
      },
      status: 'PROCESSING',
      attemptCount: 1,
      lastAttemptAt: new Date(),
      nextAttemptAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...partial,
    };
  }

  it('processes known order lifecycle event and marks it as processed', async () => {
    outboxMock.reserveBatch.mockResolvedValue([makeEvent()]);
    notificationsMock.publish.mockResolvedValue({
      id: 'n-1',
    } as any);
    outboxMock.markProcessed.mockResolvedValue(undefined as never);

    await service.processOutboxBatch();

    expect(notificationsMock.publish).toHaveBeenCalledWith(
      'driver-1',
      'DRIVER_ORDER_STATUS_CHANGED',
      expect.objectContaining({
        orderId: 'order-1',
        eventType: 'ORDER_FINISHED',
      }),
    );
    expect(outboxMock.markProcessed).toHaveBeenCalledWith('evt-1');
    expect(outboxMock.markFailed).not.toHaveBeenCalled();
  });

  it('marks event as failed when handler is missing', async () => {
    outboxMock.reserveBatch.mockResolvedValue([
      makeEvent({
        topic: 'payments.reconcile',
        eventType: 'PAYMENT_CAPTURED',
      }),
    ]);
    outboxMock.markFailed.mockResolvedValue(undefined as never);

    await service.processOutboxBatch();

    expect(outboxMock.markProcessed).not.toHaveBeenCalled();
    expect(outboxMock.markFailed).toHaveBeenCalledWith(
      'evt-1',
      expect.stringContaining('OUTBOX_HANDLER_NOT_FOUND'),
      15,
    );
  });

  it('marks event as failed when handler throws', async () => {
    outboxMock.reserveBatch.mockResolvedValue([makeEvent()]);
    notificationsMock.publish.mockRejectedValue(new Error('redis down'));
    outboxMock.markFailed.mockResolvedValue(undefined as never);

    await service.processOutboxBatch();

    expect(outboxMock.markProcessed).not.toHaveBeenCalled();
    expect(outboxMock.markFailed).toHaveBeenCalledWith('evt-1', 'redis down', 15);
  });
});
