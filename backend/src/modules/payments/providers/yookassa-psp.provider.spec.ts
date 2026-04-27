import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { YooKassaPspProvider } from './yookassa-psp.provider';
import { PaymentEntity } from '../payment.entity';

describe('YooKassaPspProvider', () => {
  const configService = {
    get: jest.fn((key: string, fallback?: string) => {
      const map: Record<string, string> = {
        PAYMENT_YOOKASSA_API_BASE_URL: 'https://api.yookassa.ru/v3',
        PAYMENT_YOOKASSA_SHOP_ID: 'shop-id',
        PAYMENT_YOOKASSA_SECRET_KEY: 'secret-key',
        PAYMENT_YOOKASSA_WEBHOOK_SECRET: 'webhook-secret',
        PAYMENT_YOOKASSA_RETURN_URL: 'https://example.com/return',
        PAYMENT_YOOKASSA_CAPTURE: 'manual',
        PAYMENT_YOOKASSA_DESCRIPTION_TEMPLATE: 'Taxi order ${orderId}',
      };
      return map[key] ?? fallback;
    }),
  } as unknown as ConfigService;

  const provider = new YooKassaPspProvider(configService);
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps pending authorization to requires_action', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'pay_123',
        status: 'pending',
        confirmation: {
          type: 'redirect',
          confirmation_url: 'https://pay.yookassa.ru/confirm',
        },
      }),
    })) as unknown as typeof fetch;

    const payment = {
      orderId: 'order-123',
      passengerId: 'passenger-1',
      amount: '1000.00',
      currency: 'RUB',
    } as PaymentEntity;

    const transition = await provider.authorize({ payment });

    expect(transition.status).toBe('REQUIRES_ACTION');
    expect(transition.providerPaymentId).toBe('pay_123');
    expect((transition.metadata ?? {}).nextActionUrl).toBe(
      'https://pay.yookassa.ru/confirm',
    );
  });

  it('extracts provider payment id from yookassa webhook object', () => {
    const providerPaymentId = provider.extractProviderPaymentId({
      event: 'payment.succeeded',
      object: { id: 'pay_777' },
    });
    expect(providerPaymentId).toBe('pay_777');
  });

  it('verifies webhook signature using raw body', () => {
    const rawBody = JSON.stringify({
      event: 'payment.succeeded',
      object: { id: 'pay_777' },
    });
    const signature = createHmac('sha256', 'webhook-secret')
      .update(rawBody)
      .digest('hex');
    const isValid = provider.verifyWebhookSignature({
      providerEventId: 'evt-1',
      eventType: 'payment.succeeded',
      payload: { object: { id: 'pay_777' } },
      signature,
      rawBody,
      headers: {},
    });
    expect(isValid).toBe(true);
  });
});
