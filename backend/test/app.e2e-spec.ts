import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PricingController } from '../src/modules/pricing/pricing.controller';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { PaymentsController } from '../src/modules/payments/payments.controller';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { OpsController } from '../src/modules/ops/ops.controller';
import { OpsService } from '../src/modules/ops/ops.service';
import { JwtAuthGuard } from '../src/common/auth/jwt.guard';
import { RolesGuard } from '../src/common/auth/roles.guard';

describe('PricingController (e2e)', () => {
  let app: INestApplication;
  const pricingServiceMock = {
    listTariffs: jest.fn(),
    upsertTariff: jest.fn(),
    listCityTiers: jest.fn(),
    upsertCityTier: jest.fn(),
    listAuditLogs: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PricingController],
      providers: [
        {
          provide: PricingService,
          useValue: pricingServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /pricing/tariffs', () => {
    pricingServiceMock.listTariffs.mockResolvedValue([
      { id: 'tariff-1', cityId: 'MOSCOW', serviceLevel: 'ECONOMY' },
    ]);
    return request(app.getHttpServer())
      .get('/pricing/tariffs?cityId=MOSCOW')
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(1);
        expect(body.items[0].cityId).toBe('MOSCOW');
      });
  });

  it('POST /pricing/tariffs', () => {
    pricingServiceMock.upsertTariff.mockResolvedValue({
      id: 'tariff-2',
      cityId: 'MOSCOW',
      serviceLevel: 'COMFORT',
    });
    return request(app.getHttpServer())
      .post('/pricing/tariffs')
      .send({
        cityId: 'MOSCOW',
        cityTier: 'CITY_TIER_A',
        serviceLevel: 'COMFORT',
        fareBaseRub: 199,
        farePerKmRub: 16,
        farePerMinuteRub: 14,
        minFareRub: 229,
        includedKm: 1,
        includedMinutes: 3,
        freeWaitingSeconds: 180,
        waitingPerMinuteRub: 14,
        cancelFeeRub: 99,
        noShowFeeRub: 149,
        outOfCityPerKmRub: 24,
        airportSurchargeRub: 200,
        childSeatRub: 150,
        petRub: 120,
        extraStopRub: 100,
        maxSurgeMultiplier: 2.2,
        commissionPercent: 15,
        minimumPlatformFeeRub: 55,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.item.serviceLevel).toBe('COMFORT');
      });
  });

  it('POST /pricing/tariffs rejects invalid enum payload', () => {
    return request(app.getHttpServer())
      .post('/pricing/tariffs')
      .send({
        cityId: 'MOSCOW',
        cityTier: 'CITY_TIER_X',
        serviceLevel: 'INVALID_LEVEL',
        fareBaseRub: 199,
        farePerKmRub: 16,
        farePerMinuteRub: 14,
        minFareRub: 229,
        includedKm: 1,
        includedMinutes: 3,
        freeWaitingSeconds: 180,
        waitingPerMinuteRub: 14,
        cancelFeeRub: 99,
        noShowFeeRub: 149,
        outOfCityPerKmRub: 24,
        airportSurchargeRub: 200,
        childSeatRub: 150,
        petRub: 120,
        extraStopRub: 100,
        maxSurgeMultiplier: 2.2,
        commissionPercent: 15,
        minimumPlatformFeeRub: 55,
      })
      .expect(400);
  });
});

describe('PaymentsController (e2e)', () => {
  let app: INestApplication;
  const paymentsServiceMock = {
    processWebhook: jest.fn(),
    captureOrderPayment: jest.fn(),
    voidOrderPayment: jest.fn(),
    refundOrderPayment: jest.fn(),
    confirmThreeDs: jest.fn(),
    getReconciliationSnapshot: jest.fn(),
    getReconciliationExportCsv: jest.fn(),
    getWebhookSecuritySnapshot: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        {
          provide: PaymentsService,
          useValue: paymentsServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /payments/webhooks', () => {
    paymentsServiceMock.processWebhook.mockResolvedValue({
      ok: true,
      replayed: false,
      webhookId: 'wh-1',
    });
    return request(app.getHttpServer())
      .post('/payments/webhooks')
      .send({
        provider: 'MOCK_PSP',
        providerEventId: 'evt-1',
        eventType: 'payment.captured',
        signature: 'sig',
        payload: { providerPaymentId: 'pp-1' },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
        expect(body.webhookId).toBe('wh-1');
      });
  });

  it('POST /payments/orders/:orderId/refund', () => {
    paymentsServiceMock.refundOrderPayment.mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      status: 'REFUNDED',
    });
    return request(app.getHttpServer())
      .post('/payments/orders/order-1/refund')
      .send({
        reason: 'ADMIN_REFUND_TEST',
        idempotencyKey: 'idem-1',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('REFUNDED');
      });
  });

  it('GET /payments/reconcile/snapshot', () => {
    paymentsServiceMock.getReconciliationSnapshot.mockResolvedValue({
      provider: 'MOCK_PSP',
      checkedPayments: 1,
      checkedWebhooks: 1,
      mismatches: [],
    });
    return request(app.getHttpServer())
      .get('/payments/reconcile/snapshot?limit=50')
      .expect(200)
      .expect(({ body }) => {
        expect(body.provider).toBe('MOCK_PSP');
        expect(body.mismatches).toEqual([]);
      });
  });

  it('POST /payments/orders/:orderId/refund rejects missing dto fields', () => {
    return request(app.getHttpServer())
      .post('/payments/orders/order-1/refund')
      .send({
        reason: 'ADMIN_REFUND_TEST',
      })
      .expect(400);
  });

  it('POST /payments/webhooks rejects non-object payload', () => {
    return request(app.getHttpServer())
      .post('/payments/webhooks')
      .send({
        provider: 'MOCK_PSP',
        providerEventId: 'evt-bad',
        eventType: 'payment.captured',
        signature: 'sig',
        payload: 'not-an-object',
      })
      .expect(400);
  });
});

describe('OpsController (e2e)', () => {
  let app: INestApplication;
  const opsServiceMock = {
    getLiveness: jest.fn(),
    getReadiness: jest.fn(),
    getDependenciesStatus: jest.fn(),
    getSloSnapshot: jest.fn(),
    getAlertSnapshot: jest.fn(),
    getDashboardSummary: jest.fn(),
    getRealtimeAckSnapshot: jest.fn(),
    getPaymentWebhookSecuritySnapshot: jest.fn(),
    getPaymentWebhookSecurityRunbook: jest.fn(),
    listPaymentWebhookSecurityPolicies: jest.fn(),
    upsertPaymentWebhookSecurityPolicy: jest.fn(),
    listPaymentWebhookSecurityPolicyAudit: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OpsController],
      providers: [
        {
          provide: OpsService,
          useValue: opsServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /ops/health/live', () => {
    opsServiceMock.getLiveness.mockReturnValue({
      status: 'ok',
      service: 'taxi-platform-backend',
    });
    return request(app.getHttpServer())
      .get('/ops/health/live')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      });
  });

  it('GET /ops/dashboard/summary', () => {
    opsServiceMock.getDashboardSummary.mockResolvedValue({
      alerts: { openCount: 0 },
      realtimeAck: { total: 3, ok: 3, fail: 0 },
    });
    return request(app.getHttpServer())
      .get('/ops/dashboard/summary?windowMinutes=60')
      .expect(200)
      .expect(({ body }) => {
        expect(body.alerts.openCount).toBe(0);
        expect(body.realtimeAck.ok).toBe(3);
      });
  });

  it('GET /ops/dashboard/payments-security', () => {
    opsServiceMock.getPaymentWebhookSecuritySnapshot.mockResolvedValue({
      total: 2,
      rejected: 0,
      byReason: { PROCESSED: 2 },
    });
    return request(app.getHttpServer())
      .get('/ops/dashboard/payments-security?windowMinutes=60')
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(2);
        expect(body.byReason.PROCESSED).toBe(2);
      });
  });
});
