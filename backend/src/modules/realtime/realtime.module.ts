import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PresenceService } from './presence.service';
import { DriverGateway } from './driver.gateway';
import { PassengerGateway } from './passenger.gateway';
import { OrdersModule } from '../orders/orders.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DriversModule } from '../drivers/drivers.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: cfg.get<string>('JWT_EXPIRES_IN'),
        },
      }),
    }),
    forwardRef(() => OrdersModule),
    forwardRef(() => DispatchModule),
    DriversModule,
    AuthModule,
  ],
  providers: [PresenceService, DriverGateway, PassengerGateway],
  exports: [PresenceService, DriverGateway, PassengerGateway],
})
export class RealtimeModule {}
