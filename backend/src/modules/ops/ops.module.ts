import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentWebhookSecurityPolicyEntity } from './payment-webhook-security-policy.entity';
import { PaymentWebhookSecurityPolicyAuditEntity } from './payment-webhook-security-policy-audit.entity';

@Module({
  imports: [
    OrdersModule,
    PaymentsModule,
    TypeOrmModule.forFeature([
      PaymentWebhookSecurityPolicyEntity,
      PaymentWebhookSecurityPolicyAuditEntity,
    ]),
  ],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
