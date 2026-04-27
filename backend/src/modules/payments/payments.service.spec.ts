import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PaymentEntity } from './payment.entity';
import { PaymentWebhookEntity } from './payment-webhook.entity';
import { PaymentOperationEntity } from './payment-operation.entity';
import { PaymentWebhookReplayEntity } from './payment-webhook-replay.entity';
import { PaymentSecurityEventEntity } from './payment-security-event.entity';
import { PaymentsService } from './payments.service';
import { PspProviderFactory } from './psp-provider.factory';

function createRepoMock<T extends object>() {
  return {
    findOne: jest.fn<Promise<T | null>, [unknown]>(),
    find: jest.fn<Promise<T[]>, [unknown]>(),
    create: jest.fn((payload: Partial<T>) => payload as T),
    save: jest.fn<Promise<T | T[]>, [T | T[]]>(),
  } as unknown as jest.Mocked<Repository<T>>;
}

describe('PaymentsService', () => {
  const paymentRepo = createRepoMock<PaymentEntity>();
  const webhookRepo = createRepoMock<PaymentWebhookEntity>();
  const operationRepo = createRepoMock<PaymentOperationEntity>();
  const replayRepo = createRepoMock<PaymentWebhookReplayEntity>();
  const securityRepo = createRepoMock<PaymentSecurityEventEntity>();
  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'PAYMENT_PROVIDER') {
        return 'MOCK_PSP';
      }
      if (key === 'PAYMENT_WEBHOOK_SECRET') {
        return 'secret';
      }
      return fallback;
    }),
  } as unknown as ConfigService;
  const pspProviderMock = {
    providerCode: 'MOCK_PSP',
    authorize: jest.fn(async () => ({
      status: 'AUTHORIZED',
      providerPaymentId: 'mock_provider_id',
      timestamps: { authorizedAt: new Date() },
    })),
    capture: jest.fn(async () => ({
      status: 'CAPTURED',
      timestamps: { capturedAt: new Date() },
    })),
    void: jest.fn(async () => ({
      status: 'VOIDED',
      timestamps: { voidedAt: new Date() },
    })),
    refund: jest.fn(async () => ({
      status: 'REFUNDED',
      timestamps: { voidedAt: new Date() },
    })),
    confirm3ds: jest.fn(async () => ({
      status: 'AUTHORIZED',
      timestamps: { authorizedAt: new Date() },
    })),
    mapWebhookEvent: jest.fn(() => null),
    verifyWebhookSignature: jest.fn(() => true),
    extractProviderPaymentId: jest.fn((payload: Record<string, unknown>) =>
      typeof payload.providerPaymentId === 'string'
        ? payload.providerPaymentId
        : null,
    ),
    extractWebhookReplayContext: jest.fn(() => ({
      timestampMs: Date.now(),
      nonce: 'nonce-1',
    })),
  };
  const pspFactory = {
    getDefaultProvider: jest.fn(() => pspProviderMock),
    getProvider: jest.fn(() => pspProviderMock),
  } as unknown as PspProviderFactory;

  const service = new PaymentsService(
    configService,
    pspFactory,
    paymentRepo,
    webhookRepo,
    operationRepo,
    replayRepo,
    securityRepo,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns previous payment on duplicated refund idempotency key', async () => {
    const payment = {
      id: 'payment-1',
      orderId: 'order-1',
      status: 'REFUNDED',
    } as unknown as PaymentEntity;
    operationRepo.findOne.mockResolvedValue({
      id: 'op-1',
      orderId: 'order-1',
      paymentId: 'payment-1',
      operationType: 'REFUND',
      idempotencyKey: 'idem-1',
    } as unknown as PaymentOperationEntity);
    paymentRepo.findOne.mockResolvedValue(payment);

    const result = await service.refundOrderPayment(
      'order-1',
      'ADMIN_REFUND',
      'idem-1',
    );

    expect(result?.id).toBe('payment-1');
    expect(operationRepo.save).not.toHaveBeenCalled();
  });

  it('includes status mismatches in reconciliation snapshot', async () => {
    pspProviderMock.mapWebhookEvent.mockReturnValueOnce({
      status: 'CAPTURED',
    });
    paymentRepo.find.mockResolvedValue([
      {
        id: 'payment-2',
        orderId: 'order-2',
        providerPaymentId: 'pp-2',
        status: 'AUTHORIZED',
      } as unknown as PaymentEntity,
    ]);
    webhookRepo.find.mockResolvedValue([
      {
        id: 'wh-2',
        eventType: 'payment.captured',
        payload: { providerPaymentId: 'pp-2' },
      } as unknown as PaymentWebhookEntity,
    ]);

    const snapshot = await service.getReconciliationSnapshot(100);
    const mismatchKinds = snapshot.mismatches.map((item) => item.kind);

    expect(mismatchKinds).toContain('PAYMENT_STATUS_MISMATCH');
  });

  it('confirms 3ds payment to authorized with idempotency', async () => {
    operationRepo.findOne.mockResolvedValue(null);
    paymentRepo.findOne.mockResolvedValue({
      id: 'payment-3ds',
      orderId: 'order-3ds',
      status: 'REQUIRES_ACTION',
      metadata: { nextActionUrl: 'https://psp/3ds' },
    } as unknown as PaymentEntity);
    paymentRepo.save.mockResolvedValue({
      id: 'payment-3ds',
      orderId: 'order-3ds',
      status: 'AUTHORIZED',
      metadata: { nextActionUrl: null },
    } as unknown as PaymentEntity);

    const result = await service.confirmThreeDs('order-3ds', {
      confirmationToken: 'token-123',
      reason: 'ADMIN_3DS_CONFIRM',
      idempotencyKey: 'idem-3ds',
    });

    expect(result?.status).toBe('AUTHORIZED');
    expect(operationRepo.save).toHaveBeenCalled();
  });

  it('exports reconciliation mismatches to csv', async () => {
    paymentRepo.find.mockResolvedValue([
      {
        id: 'payment-4',
        orderId: 'order-4',
        providerPaymentId: 'pp-4',
        status: 'CAPTURED',
      } as unknown as PaymentEntity,
    ]);
    webhookRepo.find.mockResolvedValue([]);

    const csv = await service.getReconciliationExportCsv(10);

    expect(csv).toContain('kind,providerPaymentId,orderId');
    expect(csv).toContain('"WEBHOOK_NOT_FOUND"');
    expect(csv).toContain('"order-4"');
  });

  it('rejects webhook replay on duplicate nonce', async () => {
    pspProviderMock.verifyWebhookSignature.mockReturnValueOnce(true);
    webhookRepo.findOne.mockResolvedValue(null);
    replayRepo.save.mockRejectedValue({
      driverError: { code: '23505' },
    });

    await expect(
      service.processWebhook(
        {
          provider: 'MOCK_PSP',
          providerEventId: 'evt-1',
          eventType: 'payment.authorized',
          signature: 'sig',
          payload: { providerPaymentId: 'pp-1' },
        },
        {
          rawBody: '{}',
          headers: {},
          signature: 'sig',
        },
      ),
    ).rejects.toThrow('WEBHOOK_REPLAY_DETECTED');
    expect(securityRepo.save).toHaveBeenCalled();
  });

  it('rejects invalid webhook signature and stores security event', async () => {
    pspProviderMock.verifyWebhookSignature.mockReturnValueOnce(false);

    await expect(
      service.processWebhook(
        {
          provider: 'MOCK_PSP',
          providerEventId: 'evt-invalid-signature',
          eventType: 'payment.authorized',
          signature: 'bad-sig',
          payload: { providerPaymentId: 'pp-bad' },
        },
        {
          rawBody: '{}',
          headers: {},
          signature: 'bad-sig',
        },
      ),
    ).rejects.toThrow('Invalid webhook signature');
    expect(securityRepo.save).toHaveBeenCalled();
  });

  it('returns webhook security snapshot aggregated by reason', async () => {
    securityRepo.find.mockResolvedValue([
      {
        id: 'sec-1',
        provider: 'MOCK_PSP',
        outcome: 'REJECTED',
        reasonCode: 'INVALID_SIGNATURE',
        createdAt: new Date(),
      },
      {
        id: 'sec-2',
        provider: 'MOCK_PSP',
        outcome: 'ACCEPTED',
        reasonCode: 'PROCESSED',
        createdAt: new Date(),
      },
      {
        id: 'sec-3',
        provider: 'YOOKASSA',
        outcome: 'REJECTED',
        reasonCode: 'WEBHOOK_REPLAY_DETECTED',
        createdAt: new Date(),
      },
    ] as unknown as PaymentSecurityEventEntity[]);

    const snapshot = await service.getWebhookSecuritySnapshot(60);

    expect(snapshot.total).toBe(3);
    expect(snapshot.rejected).toBe(2);
    expect(snapshot.byReason.INVALID_SIGNATURE).toBe(1);
    expect(snapshot.byReason.PROCESSED).toBe(1);
    expect(snapshot.byProvider.MOCK_PSP).toBe(2);
  });

  it('returns replayed webhook result for duplicate providerEventId', async () => {
    pspProviderMock.verifyWebhookSignature.mockReturnValueOnce(true);
    webhookRepo.findOne.mockResolvedValueOnce({
      id: 'existing-webhook',
      provider: 'MOCK_PSP',
      providerEventId: 'evt-dup',
      eventType: 'payment.authorized',
    } as unknown as PaymentWebhookEntity);

    const result = await service.processWebhook(
      {
        provider: 'MOCK_PSP',
        providerEventId: 'evt-dup',
        eventType: 'payment.authorized',
        signature: 'sig',
        payload: { providerPaymentId: 'pp-dup' },
      },
      {
        rawBody: '{}',
        headers: {},
        signature: 'sig',
      },
    );

    expect(result).toEqual({
      ok: true,
      replayed: true,
      webhookId: 'existing-webhook',
    });
    expect(securityRepo.save).toHaveBeenCalled();
  });

  it('rejects webhook when timestamp is required but missing', async () => {
    pspProviderMock.verifyWebhookSignature.mockReturnValueOnce(true);
    webhookRepo.findOne.mockResolvedValueOnce(null);
    pspProviderMock.extractWebhookReplayContext.mockReturnValueOnce({
      timestampMs: null,
      nonce: 'nonce-no-ts',
    });

    await expect(
      service.processWebhook(
        {
          provider: 'MOCK_PSP',
          providerEventId: 'evt-no-ts',
          eventType: 'payment.authorized',
          signature: 'sig',
          payload: { providerPaymentId: 'pp-no-ts' },
        },
        {
          rawBody: '{}',
          headers: {},
          signature: 'sig',
        },
      ),
    ).rejects.toThrow('WEBHOOK_TIMESTAMP_REQUIRED');
    expect(securityRepo.save).toHaveBeenCalled();
  });

  it('adds PAYMENT_NOT_FOUND mismatch from webhook/provider id', async () => {
    paymentRepo.find.mockResolvedValue([]);
    webhookRepo.find.mockResolvedValue([
      {
        id: 'wh-404',
        provider: 'MOCK_PSP',
        eventType: 'payment.captured',
        payload: { providerPaymentId: 'pp-404' },
      } as unknown as PaymentWebhookEntity,
    ]);

    const snapshot = await service.getReconciliationSnapshot(100);

    expect(snapshot.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'PAYMENT_NOT_FOUND',
          providerPaymentId: 'pp-404',
        }),
      ]),
    );
  });

  it('returns clamped empty webhook security snapshot', async () => {
    securityRepo.find.mockResolvedValue([]);

    const snapshot = await service.getWebhookSecuritySnapshot(99999);

    expect(snapshot.windowMinutes).toBe(1440);
    expect(snapshot.total).toBe(0);
    expect(snapshot.rejected).toBe(0);
    expect(snapshot.rejectRatePct).toBe(0);
    expect(snapshot.latest).toEqual([]);
  });

  it('logs FAILED admin refund operation when payment is missing', async () => {
    operationRepo.findOne.mockResolvedValueOnce(null);
    paymentRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.refundOrderPayment(
      'order-missing',
      'ADMIN_REFUND',
      'idem-missing',
    );

    expect(result).toBeNull();
    expect(operationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-missing',
        operationType: 'REFUND',
        idempotencyKey: 'idem-missing',
        resultStatus: 'FAILED',
      }),
    );
  });

  it('logs SKIPPED admin refund operation for non-refundable status', async () => {
    operationRepo.findOne.mockResolvedValueOnce(null);
    paymentRepo.findOne.mockResolvedValueOnce({
      id: 'payment-auth',
      orderId: 'order-auth',
      status: 'AUTHORIZED',
      provider: 'MOCK_PSP',
      metadata: {},
    } as unknown as PaymentEntity);
    paymentRepo.save.mockResolvedValue({
      id: 'payment-auth',
      orderId: 'order-auth',
      status: 'AUTHORIZED',
      provider: 'MOCK_PSP',
      metadata: {},
    } as unknown as PaymentEntity);

    const result = await service.refundOrderPayment(
      'order-auth',
      'ADMIN_REFUND',
      'idem-skip',
    );

    expect(result?.status).toBe('AUTHORIZED');
    expect(pspProviderMock.refund).not.toHaveBeenCalled();
    expect(operationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-auth',
        operationType: 'REFUND',
        idempotencyKey: 'idem-skip',
        resultStatus: 'SKIPPED',
      }),
    );
  });

  it('logs SUCCESS admin refund operation for captured payment', async () => {
    operationRepo.findOne.mockResolvedValueOnce(null);
    paymentRepo.findOne.mockResolvedValueOnce({
      id: 'payment-cap',
      orderId: 'order-cap',
      status: 'CAPTURED',
      provider: 'MOCK_PSP',
      metadata: {},
    } as unknown as PaymentEntity);
    paymentRepo.save.mockResolvedValue({
      id: 'payment-cap',
      orderId: 'order-cap',
      status: 'REFUNDED',
      provider: 'MOCK_PSP',
      metadata: {},
    } as unknown as PaymentEntity);

    const result = await service.refundOrderPayment(
      'order-cap',
      'ADMIN_REFUND',
      'idem-success',
    );

    expect(result?.status).toBe('REFUNDED');
    expect(pspProviderMock.refund).toHaveBeenCalled();
    expect(operationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-cap',
        operationType: 'REFUND',
        idempotencyKey: 'idem-success',
        resultStatus: 'SUCCESS',
      }),
    );
  });

  it('clamps reconciliation snapshot limit to max bound', async () => {
    paymentRepo.find.mockResolvedValue([]);
    webhookRepo.find.mockResolvedValue([]);

    await service.getReconciliationSnapshot(5000);

    expect(paymentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1000,
      }),
    );
    expect(webhookRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1000,
      }),
    );
  });
});
