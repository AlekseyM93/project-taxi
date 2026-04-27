import { createHmac, timingSafeEqual } from 'crypto';

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

function normalizeForSignature(value: unknown): JsonLike {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as JsonLike;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForSignature(item));
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
    return keys.reduce<{ [key: string]: JsonLike }>((acc, key) => {
      acc[key] = normalizeForSignature(source[key]);
      return acc;
    }, {});
  }

  return String(value);
}

export function buildWebhookSignature(params: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  secret: string;
}): string {
  const canonicalPayload = JSON.stringify(
    normalizeForSignature(params.payload),
  );
  const body = [
    params.provider,
    params.providerEventId,
    params.eventType,
    canonicalPayload,
  ].join('.');

  return createHmac('sha256', params.secret).update(body).digest('hex');
}

export function verifyWebhookSignature(params: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  secret: string;
  signature: string;
}): boolean {
  const expected = buildWebhookSignature({
    provider: params.provider,
    providerEventId: params.providerEventId,
    eventType: params.eventType,
    payload: params.payload,
    secret: params.secret,
  });

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(params.signature.trim(), 'utf8');
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
