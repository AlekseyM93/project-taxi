import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './payment.entity';
import { PaymentWebhookEntity } from './payment-webhook.entity';
import { PaymentOperationEntity } from './payment-operation.entity';
import { PaymentWebhookReplayEntity } from './payment-webhook-replay.entity';
import { PaymentSecurityEventEntity } from './payment-security-event.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MockPspProvider } from './providers/mock-psp.provider';
import { YooKassaPspProvider } from './providers/yookassa-psp.provider';
import { PspProviderFactory } from './psp-provider.factory';
import { PaymentWebhookReplayCleanupService } from './payment-webhook-replay-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      PaymentWebhookEntity,
      PaymentOperationEntity,
      PaymentWebhookReplayEntity,
      PaymentSecurityEventEntity,
    ]),
  ],
  controllers: [PaymentsController],
  providers: [
    MockPspProvider,
    YooKassaPspProvider,
    PspProviderFactory,
    PaymentsService,
    PaymentWebhookReplayCleanupService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
