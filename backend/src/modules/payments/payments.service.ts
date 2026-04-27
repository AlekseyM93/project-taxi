import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, QueryFailedError, Repository } from 'typeorm';
import { PaymentEntity } from './payment.entity';
import { PaymentWebhookEntity } from './payment-webhook.entity';
import { PaymentWebhookReplayEntity } from './payment-webhook-replay.entity';
import { PaymentSecurityEventEntity } from './payment-security-event.entity';
import { PaymentWebhookDto } from './dto';
import { PaymentOperationEntity } from './payment-operation.entity';
import { PspProviderFactory } from './psp-provider.factory';
import { PspTransition } from './psp-provider';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly pspProviderFactory: PspProviderFactory,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(PaymentWebhookEntity)
    private readonly webhookRepo: Repository<PaymentWebhookEntity>,
    @InjectRepository(PaymentOperationEntity)
    private readonly operationRepo: Repository<PaymentOperationEntity>,
    @InjectRepository(PaymentWebhookReplayEntity)
    private readonly replayRepo: Repository<PaymentWebhookReplayEntity>,
    @InjectRepository(PaymentSecurityEventEntity)
    private readonly securityRepo: Repository<PaymentSecurityEventEntity>,
  ) {}

  async authorizeOrderPayment(params: {
    orderId: string;
    passengerId: string;
    amountRub: string;
    metadata?: Record<string, unknown>;
  }) {
    const existing = await this.paymentRepo.findOne({
      where: { orderId: params.orderId },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      return existing;
    }

    const payment = this.paymentRepo.create({
      orderId: params.orderId,
      passengerId: params.passengerId,
      amount: params.amountRub,
      currency: 'RUB',
      provider: this.pspProviderFactory.getDefaultProvider().providerCode,
      status: 'INITIATED',
      providerPaymentId: null,
      metadata: params.metadata ?? {},
    });
    const saved = await this.paymentRepo.save(payment);
    const transition = await this.pspProviderFactory
      .getProvider(saved.provider)
      .authorize({
        payment: saved,
        metadata: params.metadata ?? {},
      });
    this.applyTransition(saved, transition, 'authorize');
    return this.paymentRepo.save(saved);
  }

  async captureOrderPayment(
    orderId: string,
    params?: { reason?: string; idempotencyKey?: string },
  ) {
    if (params?.idempotencyKey) {
      return this.executeAdminOperation({
        orderId,
        operationType: 'CAPTURE',
        reason: params.reason ?? 'MANUAL_CAPTURE',
        idempotencyKey: params.idempotencyKey,
      });
    }

    const payment = await this.paymentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      return null;
    }

    if (['CAPTURED', 'SETTLED'].includes(payment.status)) {
      return payment;
    }

    if (!['AUTHORIZED', 'INITIATED'].includes(payment.status)) {
      return payment;
    }

    const transition = await this.pspProviderFactory
      .getProvider(payment.provider)
      .capture({
        payment,
        reason: params?.reason,
      });
    this.applyTransition(payment, transition, 'capture', {
      reason: params?.reason ?? null,
    });
    return this.paymentRepo.save(payment);
  }

  async voidOrderPayment(
    orderId: string,
    reason: string,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      return this.executeAdminOperation({
        orderId,
        operationType: 'VOID',
        reason,
        idempotencyKey,
      });
    }

    const payment = await this.paymentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      return null;
    }

    if (payment.status === 'VOIDED') {
      return payment;
    }

    if (!['AUTHORIZED', 'INITIATED'].includes(payment.status)) {
      return payment;
    }

    const transition = await this.pspProviderFactory
      .getProvider(payment.provider)
      .void({
        payment,
        reason,
      });
    this.applyTransition(payment, transition, 'void', { reason });
    return this.paymentRepo.save(payment);
  }

  async refundOrderPayment(
    orderId: string,
    reason: string,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      return this.executeAdminOperation({
        orderId,
        operationType: 'REFUND',
        reason,
        idempotencyKey,
      });
    }

    const payment = await this.paymentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      return null;
    }
    if (payment.status === 'REFUNDED') {
      return payment;
    }
    if (!['CAPTURED', 'SETTLED'].includes(payment.status)) {
      return payment;
    }

    const transition = await this.pspProviderFactory
      .getProvider(payment.provider)
      .refund({
        payment,
        reason,
      });
    this.applyTransition(payment, transition, 'refund', { reason });
    return this.paymentRepo.save(payment);
  }

  async getOrderPayment(orderId: string) {
    return this.paymentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async confirmThreeDs(
    orderId: string,
    params: {
      confirmationToken: string;
      reason: string;
      idempotencyKey: string;
    },
  ) {
    return this.executeAdminOperation({
      orderId,
      operationType: 'CONFIRM_3DS',
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      metadata: {
        confirmationToken: params.confirmationToken,
      },
    });
  }

  async processWebhook(
    dto: PaymentWebhookDto,
    context?: {
      rawBody?: string;
      headers?: Record<string, string>;
      signature?: string;
      ipAddress?: string;
    },
  ) {
    const provider = this.pspProviderFactory.getProvider(dto.provider);
    const signatureIsValid = provider.verifyWebhookSignature({
      providerEventId: dto.providerEventId,
      eventType: dto.eventType,
      payload: dto.payload,
      signature: context?.signature || dto.signature || '',
      rawBody: context?.rawBody || '',
      headers: context?.headers ?? {},
    });
    if (!signatureIsValid) {
      await this.logSecurityEvent({
        outcome: 'REJECTED',
        reasonCode: 'INVALID_SIGNATURE',
        dto,
        ipAddress: context?.ipAddress ?? null,
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const existing = await this.webhookRepo.findOne({
      where: {
        provider: dto.provider,
        providerEventId: dto.providerEventId,
      },
    });
    if (existing) {
      await this.logSecurityEvent({
        outcome: 'ACCEPTED',
        reasonCode: 'DUPLICATE_EVENT',
        dto,
        ipAddress: context?.ipAddress ?? null,
      });
      return {
        ok: true,
        replayed: true,
        webhookId: existing.id,
      };
    }

    try {
      await this.assertWebhookReplaySafe(dto, {
        headers: context?.headers ?? {},
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.logSecurityEvent({
          outcome: 'REJECTED',
          reasonCode:
            typeof error.message === 'string' && error.message.length > 0
              ? error.message
              : 'REPLAY_GUARD_FAILED',
          dto,
          ipAddress: context?.ipAddress ?? null,
        });
      }
      throw error;
    }

    const webhook = this.webhookRepo.create({
      provider: dto.provider,
      providerEventId: dto.providerEventId,
      eventType: dto.eventType,
      payload: dto.payload,
      status: 'PROCESSED',
      processedAt: new Date(),
    });
    const saved = await this.webhookRepo.save(webhook);
    await this.applyWebhookToPayment(dto);
    await this.logSecurityEvent({
      outcome: 'ACCEPTED',
      reasonCode: 'PROCESSED',
      dto,
      ipAddress: context?.ipAddress ?? null,
    });
    return {
      ok: true,
      replayed: false,
      webhookId: saved.id,
      processedAt: saved.processedAt?.toISOString() ?? null,
    };
  }

  async getWebhookSecuritySnapshot(windowMinutes = 60) {
    const boundedWindow = Math.min(Math.max(windowMinutes, 1), 24 * 60);
    const cutoff = new Date(Date.now() - boundedWindow * 60 * 1000);
    const rows = await this.securityRepo.find({
      where: {
        createdAt: MoreThan(cutoff),
      },
      order: { createdAt: 'DESC' },
      take: 5000,
    });

    const byOutcome = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
      return acc;
    }, {});
    const byReason = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.reasonCode] = (acc[row.reasonCode] ?? 0) + 1;
      return acc;
    }, {});
    const byProvider = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.provider] = (acc[row.provider] ?? 0) + 1;
      return acc;
    }, {});

    const total = rows.length;
    const rejected = byOutcome.REJECTED ?? 0;
    const rejectRatePct =
      total > 0 ? Number(((rejected / total) * 100).toFixed(2)) : 0;

    return {
      windowMinutes: boundedWindow,
      total,
      accepted: byOutcome.ACCEPTED ?? 0,
      rejected,
      rejectRatePct,
      byReason,
      byProvider,
      latest: rows.slice(0, 50).map((row) => ({
        id: row.id,
        provider: row.provider,
        providerEventId: row.providerEventId,
        eventType: row.eventType,
        outcome: row.outcome,
        reasonCode: row.reasonCode,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
      })),
      timestamp: new Date().toISOString(),
    };
  }

  private async assertWebhookReplaySafe(
    dto: PaymentWebhookDto,
    context: { headers: Record<string, string> },
  ) {
    const provider = this.pspProviderFactory.getProvider(dto.provider);
    const replayContext = provider.extractWebhookReplayContext({
      providerEventId: dto.providerEventId,
      payload: dto.payload ?? {},
      headers: context.headers,
    });

    const maxAgeSeconds = Number(
      this.configService.get<string>(
        'PAYMENT_WEBHOOK_REPLAY_MAX_AGE_SECONDS',
        '300',
      ),
    );
    const requireTimestamp =
      this.configService.get<string>(
        'PAYMENT_WEBHOOK_REPLAY_REQUIRE_TIMESTAMP',
        'true',
      ) !== 'false';
    const requireNonce =
      this.configService.get<string>(
        'PAYMENT_WEBHOOK_REPLAY_REQUIRE_NONCE',
        'true',
      ) !== 'false';

    if (requireTimestamp && !replayContext.timestampMs) {
      throw new UnauthorizedException('WEBHOOK_TIMESTAMP_REQUIRED');
    }

    if (replayContext.timestampMs) {
      const ageMs = Math.abs(Date.now() - replayContext.timestampMs);
      const maxAgeMs = Math.max(30, maxAgeSeconds) * 1000;
      if (ageMs > maxAgeMs) {
        throw new UnauthorizedException('WEBHOOK_TIMESTAMP_OUT_OF_WINDOW');
      }
    }

    if (requireNonce && !replayContext.nonce) {
      throw new UnauthorizedException('WEBHOOK_NONCE_REQUIRED');
    }

    if (replayContext.nonce) {
      try {
        await this.replayRepo.save(
          this.replayRepo.create({
            provider: dto.provider,
            nonce: replayContext.nonce,
            receivedAt: new Date(),
            sourceTimestamp: replayContext.timestampMs
              ? new Date(replayContext.timestampMs)
              : null,
          }),
        );
      } catch (error) {
        const code = (
          error as QueryFailedError & { driverError?: { code?: string } }
        )?.driverError?.code;
        if (code === '23505') {
          throw new UnauthorizedException('WEBHOOK_REPLAY_DETECTED');
        }
        throw error;
      }
    }
  }

  private async logSecurityEvent(params: {
    outcome: 'ACCEPTED' | 'REJECTED';
    reasonCode: string;
    dto: PaymentWebhookDto;
    ipAddress: string | null;
  }) {
    try {
      await this.securityRepo.save(
        this.securityRepo.create({
          provider: params.dto.provider,
          providerEventId: params.dto.providerEventId ?? null,
          eventType: params.dto.eventType ?? null,
          outcome: params.outcome,
          reasonCode: params.reasonCode,
          ipAddress: params.ipAddress,
          metadata: {
            payloadKeys: Object.keys(params.dto.payload ?? {}),
          },
        }),
      );
    } catch {
      // Security observability must not break webhook processing.
    }
  }

  async getReconciliationSnapshot(limit = 100) {
    const boundedLimit = Math.min(Math.max(limit, 10), 1000);
    const recentPayments = await this.paymentRepo.find({
      order: { createdAt: 'DESC' },
      take: boundedLimit,
    });
    const recentWebhooks = await this.webhookRepo.find({
      order: { createdAt: 'DESC' },
      take: boundedLimit,
    });

    const paymentsByProviderId = recentPayments.reduce<
      Record<string, PaymentEntity>
    >((acc, payment) => {
      if (payment.providerPaymentId) {
        acc[payment.providerPaymentId] = payment;
      }
      return acc;
    }, {});

    const mismatches: Array<Record<string, unknown>> = [];
    const webhookPaymentIds = new Set<string>();
    for (const webhook of recentWebhooks) {
      const providerPaymentId = this.pspProviderFactory
        .getProvider(webhook.provider)
        .extractProviderPaymentId(webhook.payload ?? {});
      if (!providerPaymentId) {
        continue;
      }
      webhookPaymentIds.add(providerPaymentId);

      const payment = paymentsByProviderId[providerPaymentId];
      if (!payment) {
        mismatches.push({
          kind: 'PAYMENT_NOT_FOUND',
          webhookId: webhook.id,
          providerPaymentId,
          eventType: webhook.eventType,
        });
        continue;
      }

      const expectedStatus = this.pspProviderFactory
        .getProvider(webhook.provider)
        .mapWebhookEvent({
          eventType: webhook.eventType,
          payload: webhook.payload ?? {},
        })?.status;
      if (expectedStatus && payment.status !== expectedStatus) {
        mismatches.push({
          kind: 'PAYMENT_STATUS_MISMATCH',
          webhookId: webhook.id,
          providerPaymentId,
          eventType: webhook.eventType,
          paymentStatus: payment.status,
          expectedStatus,
        });
      }
    }

    for (const payment of recentPayments) {
      if (!payment.providerPaymentId) {
        continue;
      }
      if (webhookPaymentIds.has(payment.providerPaymentId)) {
        continue;
      }
      mismatches.push({
        kind: 'WEBHOOK_NOT_FOUND',
        paymentId: payment.id,
        orderId: payment.orderId,
        providerPaymentId: payment.providerPaymentId,
        paymentStatus: payment.status,
      });
    }

    return {
      provider: this.pspProviderFactory.getDefaultProvider().providerCode,
      checkedPayments: recentPayments.length,
      checkedWebhooks: recentWebhooks.length,
      mismatches,
    };
  }

  private async applyWebhookToPayment(dto: PaymentWebhookDto) {
    const providerPaymentId = this.pspProviderFactory
      .getProvider(dto.provider)
      .extractProviderPaymentId(dto.payload ?? {});
    if (!providerPaymentId) {
      return;
    }

    const payment = await this.paymentRepo.findOne({
      where: { providerPaymentId },
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      return;
    }

    const transition = this.pspProviderFactory
      .getProvider(dto.provider)
      .mapWebhookEvent({
        eventType: dto.eventType,
        payload: dto.payload ?? {},
      });
    if (transition) {
      this.applyTransition(payment, transition, 'webhook', {
        webhookEventType: dto.eventType,
      });
    }
    payment.metadata = {
      ...(payment.metadata ?? {}),
      lastWebhookEventType: dto.eventType,
      lastWebhookEventId: dto.providerEventId,
      lastWebhookAt: new Date().toISOString(),
    };
    await this.paymentRepo.save(payment);
  }

  private applyTransition(
    payment: PaymentEntity,
    transition: PspTransition,
    operation:
      | 'authorize'
      | 'capture'
      | 'void'
      | 'refund'
      | 'confirm_3ds'
      | 'webhook',
    meta?: Record<string, unknown>,
  ) {
    const operationTs = new Date();
    payment.status = transition.status;
    if (transition.providerPaymentId !== undefined) {
      payment.providerPaymentId = transition.providerPaymentId;
    }
    if (transition.failureReason !== undefined) {
      payment.failureReason = transition.failureReason;
    }
    if (transition.timestamps?.requiresActionAt) {
      payment.requiresActionAt = transition.timestamps.requiresActionAt;
    }
    if (transition.timestamps?.authorizedAt) {
      payment.authorizedAt = transition.timestamps.authorizedAt;
    }
    if (transition.timestamps?.capturedAt) {
      payment.capturedAt = transition.timestamps.capturedAt;
    }
    if (transition.timestamps?.settledAt) {
      payment.settledAt = transition.timestamps.settledAt;
    }
    if (transition.timestamps?.voidedAt) {
      payment.voidedAt = transition.timestamps.voidedAt;
    }

    payment.metadata = {
      ...(payment.metadata ?? {}),
      provider: payment.provider,
      providerOperation: operation,
      providerOperationAt: operationTs.toISOString(),
      ...(transition.metadata ?? {}),
      ...(meta ?? {}),
    };
  }

  private async executeAdminOperation(params: {
    orderId: string;
    operationType: 'CAPTURE' | 'VOID' | 'REFUND' | 'CONFIRM_3DS';
    reason: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }) {
    const existing = await this.operationRepo.findOne({
      where: {
        orderId: params.orderId,
        operationType: params.operationType,
        idempotencyKey: params.idempotencyKey,
      },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      if (existing.paymentId) {
        const payment = await this.paymentRepo.findOne({
          where: { id: existing.paymentId },
        });
        if (payment) {
          return payment;
        }
      }
      return this.getOrderPayment(params.orderId);
    }

    const payment = await this.getOrderPayment(params.orderId);
    if (!payment) {
      await this.logOperation({
        ...params,
        paymentId: null,
        resultStatus: 'FAILED',
        metadata: { error: 'PAYMENT_NOT_FOUND' },
      });
      return null;
    }

    const beforeStatus = payment.status;
    let resultStatus: 'SUCCESS' | 'SKIPPED' | 'FAILED' = 'SKIPPED';
    if (params.operationType === 'CAPTURE') {
      if (['AUTHORIZED', 'INITIATED'].includes(payment.status)) {
        const transition = await this.pspProviderFactory
          .getProvider(payment.provider)
          .capture({
            payment,
            reason: params.reason,
          });
        this.applyTransition(payment, transition, 'capture', {
          reason: params.reason,
        });
        resultStatus = 'SUCCESS';
      }
    } else if (params.operationType === 'VOID') {
      if (['AUTHORIZED', 'INITIATED'].includes(payment.status)) {
        const transition = await this.pspProviderFactory
          .getProvider(payment.provider)
          .void({
            payment,
            reason: params.reason,
          });
        this.applyTransition(payment, transition, 'void', {
          reason: params.reason,
        });
        resultStatus = 'SUCCESS';
      }
    } else if (params.operationType === 'REFUND') {
      if (['CAPTURED', 'SETTLED'].includes(payment.status)) {
        const transition = await this.pspProviderFactory
          .getProvider(payment.provider)
          .refund({
            payment,
            reason: params.reason,
          });
        this.applyTransition(payment, transition, 'refund', {
          reason: params.reason,
        });
        resultStatus = 'SUCCESS';
      }
    } else if (params.operationType === 'CONFIRM_3DS') {
      if (payment.status === 'REQUIRES_ACTION') {
        const transition = await this.pspProviderFactory
          .getProvider(payment.provider)
          .confirm3ds({
            payment,
            reason: params.reason,
            confirmationToken:
              typeof params.metadata?.confirmationToken === 'string'
                ? params.metadata.confirmationToken
                : '',
          });
        this.applyTransition(payment, transition, 'confirm_3ds', {
          reason: params.reason,
          ...(params.metadata ?? {}),
        });
        resultStatus = 'SUCCESS';
      }
    }

    await this.paymentRepo.save(payment);
    await this.logOperation({
      ...params,
      paymentId: payment.id,
      resultStatus,
      metadata: {
        beforeStatus,
        afterStatus: payment.status,
        ...(params.metadata ?? {}),
      },
    });
    return payment;
  }

  private async logOperation(params: {
    orderId: string;
    paymentId: string | null;
    operationType: 'CAPTURE' | 'VOID' | 'REFUND' | 'CONFIRM_3DS';
    idempotencyKey: string;
    reason: string;
    resultStatus: 'SUCCESS' | 'SKIPPED' | 'FAILED';
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.operationRepo.save(
        this.operationRepo.create({
          orderId: params.orderId,
          paymentId: params.paymentId,
          operationType: params.operationType,
          idempotencyKey: params.idempotencyKey,
          reason: params.reason,
          resultStatus: params.resultStatus,
          metadata: params.metadata ?? null,
        }),
      );
    } catch (error) {
      const code = (
        error as QueryFailedError & { driverError?: { code?: string } }
      )?.driverError?.code;
      if (code === '23505') {
        return;
      }
      throw error;
    }
  }

  async getReconciliationExportCsv(limit = 100) {
    const snapshot = await this.getReconciliationSnapshot(limit);
    const rows = snapshot.mismatches;

    const header =
      'kind,providerPaymentId,orderId,paymentId,webhookId,eventType,paymentStatus,expectedStatus';
    const lines = rows.map((row) =>
      [
        row.kind ?? '',
        row.providerPaymentId ?? '',
        row.orderId ?? '',
        row.paymentId ?? '',
        row.webhookId ?? '',
        row.eventType ?? '',
        row.paymentStatus ?? '',
        row.expectedStatus ?? '',
      ]
        .map((value) => {
          const raw = String(value);
          return `"${raw.replace(/"/g, '""')}"`;
        })
        .join(','),
    );

    return [header, ...lines].join('\n');
  }
}
