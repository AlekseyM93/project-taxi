import {
  buildWebhookSignature,
  verifyWebhookSignature,
} from './webhook-signature';

describe('webhook signature verification', () => {
  it('accepts a valid signature', () => {
    const payload = {
      amount: 1250,
      nested: {
        b: 'value-b',
        a: 'value-a',
      },
      items: [{ x: 1 }, { x: 2 }],
    };
    const signature = buildWebhookSignature({
      provider: 'yookassa',
      providerEventId: 'evt_123',
      eventType: 'payment.captured',
      payload,
      secret: 'test-secret',
    });

    const isValid = verifyWebhookSignature({
      provider: 'yookassa',
      providerEventId: 'evt_123',
      eventType: 'payment.captured',
      payload,
      secret: 'test-secret',
      signature,
    });

    expect(isValid).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const isValid = verifyWebhookSignature({
      provider: 'yookassa',
      providerEventId: 'evt_123',
      eventType: 'payment.captured',
      payload: { amount: 1000 },
      secret: 'test-secret',
      signature: 'invalid-signature',
    });

    expect(isValid).toBe(false);
  });

  it('keeps signature stable for different object key order', () => {
    const secret = 'test-secret';
    const signatureA = buildWebhookSignature({
      provider: 'yookassa',
      providerEventId: 'evt_abc',
      eventType: 'payment.captured',
      payload: { z: 3, a: 1, nested: { b: 2, a: 1 } },
      secret,
    });
    const signatureB = buildWebhookSignature({
      provider: 'yookassa',
      providerEventId: 'evt_abc',
      eventType: 'payment.captured',
      payload: { nested: { a: 1, b: 2 }, a: 1, z: 3 },
      secret,
    });

    expect(signatureA).toBe(signatureB);
  });
});
