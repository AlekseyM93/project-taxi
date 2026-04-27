import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity';
import { OrderEventEntity } from './order-event.entity';
import { OrderIncidentEntity } from './order-incident.entity';
import { AdminPanelFilterEntity } from './admin-panel-filter.entity';
import { AdminActionExecutionEntity } from './admin-action-execution.entity';
import { OrderMobileCommandEntity } from './order-mobile-command.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DriversModule } from '../drivers/drivers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { OutboxModule } from '../outbox/outbox.module';
import { AntifraudModule } from '../antifraud/antifraud.module';
import { PricingModule } from '../pricing/pricing.module';
import { GeoModule } from '../geo/geo.module';
import { OrderRecoveryService } from './order-recovery.service';
import { OrderCommandIdempotencyService } from './order-command-idempotency.service';
import { OrderObservabilityService } from './order-observability.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderEventEntity,
      OrderIncidentEntity,
      AdminPanelFilterEntity,
      AdminActionExecutionEntity,
      OrderMobileCommandEntity,
    ]),
    forwardRef(() => RealtimeModule),
    forwardRef(() => DispatchModule),
    DriversModule,
    NotificationsModule,
    PaymentsModule,
    OutboxModule,
    AntifraudModule,
    PricingModule,
    GeoModule,
  ],
  providers: [
    OrdersService,
    OrderRecoveryService,
    OrderCommandIdempotencyService,
    OrderObservabilityService,
  ],
  controllers: [OrdersController],
  exports: [
    OrdersService,
    OrderCommandIdempotencyService,
    OrderObservabilityService,
  ],
})
export class OrdersModule {}
