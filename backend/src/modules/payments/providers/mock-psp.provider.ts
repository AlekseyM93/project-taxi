import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentEntity } from '../payment.entity';
import { PspProvider, PspTransition } from '../psp-provider';
import { verifyWebhookSignature } from '../webhook-signature';

@Injectable()
export class MockPspProvider implements PspProvider {
  readonly providerCode: string = 'MOCK_PSP';

  constructor(private readonly configService: ConfigService) {}

  private buildProviderPaymentId(orderId: string) {
    return `${this.providerCode.toLowerCase()}_${Date.now().toString(
      36,
    )}_${orderId.slice(0, 8)}`;
  }

  private shouldRequire3ds(
    payment: PaymentEntity,
    metadata?: Record<string, unknown>,
  ) {
    if (metadata?.force3ds === true) {
      return true;
    }
    const threshold = Number(
      this.configService.get<string>('PAYMENT_REQUIRE_3DS_THRESHOLD_RUB', '0'),
    );
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return false;
    }
    const amount = Number(payment.amount);
    return Number.isFinite(amount) && amount >= threshold;
  }

  async authorize(params: {
    payment: PaymentEntity;
    metadata?: Record<string, unknown>;
  }): Promise<PspTransition> {
    const now = new Date();
    if (this.shouldRequire3ds(params.payment, params.metadata)) {
      return {
        status: 'REQUIRES_ACTION',
        providerPaymentId: this.buildProviderPaymentId(params.payment.orderId),
        timestamps: { requiresActionAt: now },
        metadata: {
          actionType: '3DS',
          nextActionUrl: `https://mock-psp.local/3ds/${params.payment.orderId}`,
        },
      };
    }
    return {
      status: 'AUTHORIZED',
      providerPaymentId: this.buildProviderPaymentId(params.payment.orderId),
      timestamps: { authorizedAt: now },
    };
  }

  async capture(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition> {
    return {
      status: 'CAPTURED',
      timestamps: { capturedAt: new Date() },
      metadata: {
        reason: params.reason ?? null,
      },
    };
  }

  async void(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition> {
    return {
      status: 'VOIDED',
      timestamps: { voidedAt: new Date() },
      failureReason: params.reason ?? null,
    };
  }

  async refund(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition> {
    return {
      status: 'REFUNDED',
      timestamps: { voidedAt: new Date() },
      failureReason: params.reason ?? null,
    };
  }

  async confirm3ds(params: {
    payment: PaymentEntity;
    reason?: string;
    confirmationToken: string;
  }): Promise<PspTransition> {
    return {
      status: 'AUTHORIZED',
      timestamps: { authorizedAt: new Date() },
      metadata: {
        nextActionUrl: null,
        actionType: '3DS',
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
    if (event === 'payment.requires_action') {
      return {
        status: 'REQUIRES_ACTION',
        timestamps: { requiresActionAt: new Date() },
        metadata: {
          nextActionUrl:
            typeof params.payload.nextActionUrl === 'string'
              ? params.payload.nextActionUrl
              : null,
          actionType:
            typeof params.payload.actionType === 'string'
              ? params.payload.actionType
              : '3DS',
        },
      };
    }
    if (event === 'payment.authorized') {
      return { status: 'AUTHORIZED', timestamps: { authorizedAt: new Date() } };
    }
    if (event === 'payment.captured') {
      return { status: 'CAPTURED', timestamps: { capturedAt: new Date() } };
    }
    if (event === 'payment.settled') {
      return { status: 'SETTLED', timestamps: { settledAt: new Date() } };
    }
    if (event === 'payment.refunded') {
      return { status: 'REFUNDED', timestamps: { voidedAt: new Date() } };
    }
    if (event === 'payment.failed') {
      return { status: 'FAILED', failureReason: 'PAYMENT_FAILED_WEBHOOK' };
    }
    return null;
  }

  extractProviderPaymentId(payload: Record<string, unknown>): string | null {
    return typeof payload.providerPaymentId === 'string'
      ? payload.providerPaymentId
      : null;
  }

  verifyWebhookSignature(params: {
    providerEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    signature: string;
    rawBody: string;
    headers: Record<string, string>;
  }): boolean {
    const secret = this.configService.get<string>('PAYMENT_WEBHOOK_SECRET', '');
    if (!secret) {
      return false;
    }
    return verifyWebhookSignature({
      provider: this.providerCode,
      providerEventId: params.providerEventId,
      eventType: params.eventType,
      payload: params.payload,
      secret,
      signature: params.signature,
    });
  }

  extractWebhookReplayContext(params: {
    providerEventId: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
  }) {
    const timestampRaw =
      params.headers['x-payment-timestamp'] ??
      (typeof params.payload.timestamp === 'string'
        ? params.payload.timestamp
        : null);
    const timestampMs = timestampRaw ? Date.parse(timestampRaw) : NaN;
    const nonce =
      params.headers['x-payment-nonce'] ??
      (typeof params.payload.nonce === 'string'
        ? params.payload.nonce
        : null) ??
      params.providerEventId;
    return {
      timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
      nonce,
    };
  }
}
