import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrdersModule } from '../orders/orders.module';
import { DispatchService } from './dispatch.service';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RealtimeModule),
    forwardRef(() => OrdersModule),
    DriversModule, // 🔥 ВАЖНО: добавили
  ],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
