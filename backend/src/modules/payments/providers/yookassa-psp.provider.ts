import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PaymentEntity } from '../payment.entity';
import { PspProvider, PspTransition } from '../psp-provider';

type YooKassaPaymentResponse = {
  id?: string;
  status?: string;
  confirmation?: { type?: string; confirmation_url?: string };
  cancellation_details?: { reason?: string };
  paid?: boolean;
  refunded_amount?: { value?: string; currency?: string };
};

@Injectable()
export class YooKassaPspProvider implements PspProvider {
  readonly providerCode = 'YOOKASSA';

  constructor(private readonly configService: ConfigService) {}

  private getApiBaseUrl() {
    return this.configService.get<string>(
      'PAYMENT_YOOKASSA_API_BASE_URL',
      'https://api.yookassa.ru/v3',
    );
  }

  private getShopId() {
    return this.configService
      .get<string>('PAYMENT_YOOKASSA_SHOP_ID', '')
      .trim();
  }

  private getSecretKey() {
    return this.configService
      .get<string>('PAYMENT_YOOKASSA_SECRET_KEY', '')
      .trim();
  }

  private getReturnUrl() {
    return this.configService.get<string>(
      'PAYMENT_YOOKASSA_RETURN_URL',
      'https://example.com/payments/return',
    );
  }

  private getDescriptionTemplate() {
    return this.configService.get<string>(
      'PAYMENT_YOOKASSA_DESCRIPTION_TEMPLATE',
      'Taxi order ${orderId}',
    );
  }

  private getCaptureMode() {
    return this.configService.get<string>('PAYMENT_YOOKASSA_CAPTURE', 'manual');
  }

  private assertConfig() {
    if (!this.getShopId() || !this.getSecretKey()) {
      throw new InternalServerErrorException(
        'YooKassa credentials are not configured',
      );
    }
  }

  private buildAuthHeader() {
    const token = Buffer.from(
      `${this.getShopId()}:${this.getSecretKey()}`,
      'utf8',
    ).toString('base64');
    return `Basic ${token}`;
  }

  private async callApi<T>(params: {
    path: string;
    method: 'GET' | 'POST';
    idempotencyKey?: string;
    body?: Record<string, unknown>;
  }): Promise<T> {
    this.assertConfig();
    const headers: Record<string, string> = {
      Authorization: this.buildAuthHeader(),
      'Content-Type': 'application/json',
    };
    if (params.idempotencyKey) {
      headers['Idempotence-Key'] = params.idempotencyKey;
    }

    const response = await fetch(`${this.getApiBaseUrl()}${params.path}`, {
      method: params.method,
      headers,
      body: params.body ? JSON.stringify(params.body) : undefined,
    });

    const payload = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) {
      throw new InternalServerErrorException('YooKassa API request failed');
    }
    return payload;
  }

  private mapPaymentResponseToTransition(
    response: YooKassaPaymentResponse,
  ): PspTransition {
    const status = response.status?.trim().toLowerCase() || '';
    if (status === 'pending' && response.confirmation?.confirmation_url) {
      return {
        status: 'REQUIRES_ACTION',
        providerPaymentId: response.id ?? null,
        timestamps: { requiresActionAt: new Date() },
        metadata: {
          actionType: response.confirmation?.type ?? '3DS',
          nextActionUrl: response.confirmation.confirmation_url,
        },
      };
    }
    if (status === 'waiting_for_capture') {
      return {
        status: 'AUTHORIZED',
        providerPaymentId: response.id ?? null,
        timestamps: { authorizedAt: new Date() },
      };
    }
    if (status === 'succeeded') {
      return {
        status: 'CAPTURED',
        providerPaymentId: response.id ?? null,
        timestamps: { capturedAt: new Date() },
      };
    }
    if (status === 'canceled') {
      return {
        status: 'FAILED',
        providerPaymentId: response.id ?? null,
        failureReason:
          response.cancellation_details?.reason ?? 'YOOKASSA_CANCELED',
      };
    }
    return {
      status: 'FAILED',
      providerPaymentId: response.id ?? null,
      failureReason: 'YOOKASSA_UNKNOWN_STATUS',
    };
  }

  async authorize(params: {
    payment: PaymentEntity;
    metadata?: Record<string, unknown>;
  }): Promise<PspTransition> {
    const capture = this.getCaptureMode().trim().toLowerCase() === 'auto';
    const description = this.getDescriptionTemplate().replace(
      '${orderId}',
      params.payment.orderId,
    );
    const response = await this.callApi<YooKassaPaymentResponse>({
      path: '/payments',
      method: 'POST',
      idempotencyKey: randomUUID(),
      body: {
        amount: {
          value: params.payment.amount,
          currency: params.payment.currency,
        },
        capture,
        confirmation: {
          type: 'redirect',
          return_url: this.getReturnUrl(),
        },
        description,
        metadata: {
          orderId: params.payment.orderId,
          passengerId: params.payment.passengerId,
          ...(params.metadata ?? {}),
        },
      },
    });
    return this.mapPaymentResponseToTransition(response);
  }

  async capture(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition> {
    const providerPaymentId = params.payment.providerPaymentId;
    if (!providerPaymentId) {
      return {
        status: 'FAILED',
        failureReason: 'MISSING_PROVIDER_PAYMENT_ID',
      };
    }
    const response = await this.callApi<YooKassaPaymentResponse>({
      path: `/payments/${providerPaymentId}/capture`,
      method: 'POST',
      idempotencyKey: randomUUID(),
      body: {
        amount: {
          value: params.payment.amount,
          currency: params.payment.currency,
        },
      },
    });
    const transition = this.mapPaymentResponseToTransition(response);
    return {
      ...transition,
      metadata: {
        ...(transition.metadata ?? {}),
        reason: params.reason ?? null,
      },
    };
  }

  async void(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition> {
    const providerPaymentId = params.payment.providerPaymentId;
    if (!providerPaymentId) {
      return {
        status: 'FAILED',
        failureReason: 'MISSING_PROVIDER_PAYMENT_ID',
      };
    }
    const response = await this.callApi<YooKassaPaymentResponse>({
      path: `/payments/${providerPaymentId}/cancel`,
      method: 'POST',
      idempotencyKey: randomUUID(),
      body: {},
    });
    if (response.status?.trim().toLowerCase() === 'canceled') {
      return {
        status: 'VOIDED',
        timestamps: { voidedAt: new Date() },
        failureReason:
          params.reason ?? response.cancellation_details?.reason ?? null,
      };
    }
    return {
      status: 'FAILED',
      failureReason: 'YOOKASSA_CANCEL_FAILED',
    };
  }

  async refund(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition> {
    const providerPaymentId = params.payment.providerPaymentId;
    if (!providerPaymentId) {
      return {
        status: 'FAILED',
        failureReason: 'MISSING_PROVIDER_PAYMENT_ID',
      };
    }
    const response = await this.callApi<YooKassaPaymentResponse>({
      path: '/refunds',
      method: 'POST',
      idempotencyKey: randomUUID(),
      body: {
        payment_id: providerPaymentId,
        amount: {
          value: params.payment.amount,
          currency: params.payment.currency,
        },
      },
    });
    const status = response.status?.trim().toLowerCase();
    if (status === 'succeeded' || status === 'pending') {
      return {
        status: 'REFUNDED',
        timestamps: { voidedAt: new Date() },
        failureReason: params.reason ?? null,
      };
    }
    return {
      status: 'FAILED',
      failureReason: 'YOOKASSA_REFUND_FAILED',
    };
  }

  async confirm3ds(params: {
    payment: PaymentEntity;
    reason?: string;
    confirmationToken: string;
  }): Promise<PspTransition> {
    const providerPaymentId = params.payment.providerPaymentId;
    if (!providerPaymentId) {
      return {
        status: 'FAILED',
        failureReason: 'MISSING_PROVIDER_PAYMENT_ID',
      };
    }
    const response = await this.callApi<YooKassaPaymentResponse>({
      path: `/payments/${providerPaymentId}`,
      method: 'GET',
    });
    const transition = this.mapPaymentResponseToTransition(response);
    return {
      ...transition,
      metadata: {
        ...(transition.metadata ?? {}),
        confirmationTokenHash: params.confirmationToken.slice(0, 8),
        reason: params.reason ?? null,
      },
    };
  }

  mapWebhookEvent(params: {
    eventType: string;
    payload: Record<string, unknown>;
  }): PspTransition | null {
    const event = params.eventType.trim().toLowerCase();
    const objectPayload =
      typeof params.payload.object === 'object' &&
      params.payload.object !== null
        ? (params.payload.object as Record<string, unknown>)
        : params.payload;
    if (event === 'payment.waiting_for_capture') {
      return { status: 'AUTHORIZED', timestamps: { authorizedAt: new Date() } };
    }
    if (event === 'payment.succeeded') {
      return { status: 'SETTLED', timestamps: { settledAt: new Date() } };
    }
    if (event === 'payment.canceled') {
      return {
        status: 'FAILED',
        failureReason:
          typeof objectPayload.cancellation_details === 'object' &&
          objectPayload.cancellation_details !== null &&
          typeof (objectPayload.cancellation_details as Record<string, unknown>)
            .reason === 'string'
            ? ((objectPayload.cancellation_details as Record<string, unknown>)
                .reason as string)
            : 'YOOKASSA_CANCELED',
      };
    }
    if (event === 'refund.succeeded') {
      return { status: 'REFUNDED', timestamps: { voidedAt: new Date() } };
    }
    if (event === 'payment.requires_action' || event === 'payment.pending') {
      return {
        status: 'REQUIRES_ACTION',
        timestamps: { requiresActionAt: new Date() },
        metadata: {
          actionType: '3DS',
          nextActionUrl:
            typeof objectPayload.confirmation === 'object' &&
            objectPayload.confirmation !== null &&
            typeof (objectPayload.confirmation as Record<string, unknown>)
              .confirmation_url === 'string'
              ? ((objectPayload.confirmation as Record<string, unknown>)
                  .confirmation_url as string)
              : null,
        },
      };
    }
    return null;
  }

  extractProviderPaymentId(payload: Record<string, unknown>): string | null {
    if (typeof payload.providerPaymentId === 'string') {
      return payload.providerPaymentId;
    }
    const objectPayload =
      typeof payload.object === 'object' && payload.object !== null
        ? (payload.object as Record<string, unknown>)
        : null;
    if (objectPayload && typeof objectPayload.id === 'string') {
      return objectPayload.id;
    }
    return null;
  }

  verifyWebhookSignature(params: {
    providerEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    signature: string;
    rawBody: string;
    headers: Record<string, string>;
  }): boolean {
    const secret = this.configService.get<string>(
      'PAYMENT_YOOKASSA_WEBHOOK_SECRET',
      this.getSecretKey(),
    );
    if (!secret || !params.signature) {
      return false;
    }

    const expected = createHmac('sha256', secret)
      .update(params.rawBody || '')
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(params.signature.trim(), 'utf8');
    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, signatureBuffer);
  }

  extractWebhookReplayContext(params: {
    providerEventId: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
  }) {
    const objectPayload =
      typeof params.payload.object === 'object' &&
      params.payload.object !== null
        ? (params.payload.object as Record<string, unknown>)
        : null;
    const timestampRaw =
      params.headers['x-yookassa-timestamp'] ??
      params.headers['x-payment-timestamp'] ??
      (objectPayload && typeof objectPayload.created_at === 'string'
        ? objectPayload.created_at
        : null);
    const timestampMs = timestampRaw ? Date.parse(timestampRaw) : NaN;
    const nonce =
      params.headers['x-yookassa-request-id'] ??
      params.headers['x-request-id'] ??
      params.headers['x-payment-nonce'] ??
      params.providerEventId;
    return {
      timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
      nonce,
    };
  }
}
