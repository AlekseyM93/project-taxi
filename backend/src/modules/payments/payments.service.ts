import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEntity } from './payment.entity';
import { PaymentWebhookEntity } from './payment-webhook.entity';
import { PaymentWebhookDto } from './dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(PaymentWebhookEntity)
    private readonly webhookRepo: Repository<PaymentWebhookEntity>,
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
      provider: 'INTERNAL_SIMULATOR',
      status: 'AUTHORIZED',
      providerPaymentId: `pay_${Date.now().toString(36)}_${params.orderId.slice(0, 8)}`,
      authorizedAt: new Date(),
      metadata: params.metadata ?? null,
    });
    return this.paymentRepo.save(payment);
  }

  async captureOrderPayment(orderId: string) {
    const payment = await this.paymentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    if (!payment) {
      return null;
    }

    if (payment.status === 'CAPTURED') {
      return payment;
    }

    if (!['AUTHORIZED', 'INITIATED'].includes(payment.status)) {
      return payment;
    }

    payment.status = 'CAPTURED';
    payment.capturedAt = new Date();
    return this.paymentRepo.save(payment);
  }

  async voidOrderPayment(orderId: string, reason: string) {
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

    payment.status = 'VOIDED';
    payment.voidedAt = new Date();
    payment.failureReason = reason;
    return this.paymentRepo.save(payment);
  }

  async getOrderPayment(orderId: string) {
    return this.paymentRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async processWebhook(dto: PaymentWebhookDto) {
    const existing = await this.webhookRepo.findOne({
      where: {
        provider: dto.provider,
        providerEventId: dto.providerEventId,
      },
    });
    if (existing) {
      return {
        ok: true,
        replayed: true,
        webhookId: existing.id,
      };
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
    return {
      ok: true,
      replayed: false,
      webhookId: saved.id,
      processedAt: saved.processedAt?.toISOString() ?? null,
    };
  }
}
