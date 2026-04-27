import { PaymentEntity, PaymentStatus } from './payment.entity';

export type PspTransition = {
  status: PaymentStatus;
  providerPaymentId?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  timestamps?: {
    requiresActionAt?: Date;
    authorizedAt?: Date;
    capturedAt?: Date;
    settledAt?: Date;
    voidedAt?: Date;
  };
};

export interface PspProvider {
  readonly providerCode: string;
  authorize(params: {
    payment: PaymentEntity;
    metadata?: Record<string, unknown>;
  }): Promise<PspTransition>;
  capture(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition>;
  void(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition>;
  refund(params: {
    payment: PaymentEntity;
    reason?: string;
  }): Promise<PspTransition>;
  confirm3ds(params: {
    payment: PaymentEntity;
    reason?: string;
    confirmationToken: string;
  }): Promise<PspTransition>;
  mapWebhookEvent(params: {
    eventType: string;
    payload: Record<string, unknown>;
  }): PspTransition | null;
  extractProviderPaymentId(payload: Record<string, unknown>): string | null;
  verifyWebhookSignature(params: {
    providerEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    signature: string;
    rawBody: string;
    headers: Record<string, string>;
  }): boolean;
  extractWebhookReplayContext(params: {
    providerEventId: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
  }): {
    timestampMs: number | null;
    nonce: string | null;
  };
}
