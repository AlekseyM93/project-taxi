import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { OpsModule } from './modules/ops/ops.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { AntifraudModule } from './modules/antifraud/antifraud.module';
import { MarketModule } from './modules/market/market.module';
import { SupportModule } from './modules/support/support.module';
import { GovernanceModule } from './modules/governance/governance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const tsRuntime = __filename.endsWith('.ts');
        const useSsl = cfg.get<string>('DB_SSL', 'false') === 'true';
        const rejectUnauthorized =
          cfg.get<string>('DB_SSL_REJECT_UNAUTHORIZED', 'true') === 'true';

        return {
          type: 'postgres',

          host: cfg.get<string>('DB_HOST', 'localhost'),
          port: Number(cfg.get<string>('DB_PORT', '5433')),
          username: cfg.get<string>('DB_USER', 'taxi'),
          password: cfg.get<string>('DB_PASSWORD', 'taxi'),
          database: cfg.get<string>('DB_NAME', 'taxi'),

          autoLoadEntities: true,
          synchronize: cfg.get<string>('DB_SYNC', 'false') === 'true',
          ssl: useSsl ? { rejectUnauthorized } : false,
          migrationsRun:
            cfg.get<string>('DB_MIGRATIONS_RUN', 'true') === 'true',
          migrations: tsRuntime
            ? [join(process.cwd(), 'src', 'migrations', '*.ts')]
            : [join(process.cwd(), 'dist', 'migrations', '*.{js,cjs}')],
          logging: false,
        };
      },
    }),

    UsersModule,
    AuthModule,
    RealtimeModule,
    OrdersModule,
    DispatchModule,
    DriversModule,
    OpsModule,
    NotificationsModule,
    PaymentsModule,
    OutboxModule,
    AntifraudModule,
    MarketModule,
    SupportModule,
    GovernanceModule,
  ],
})
export class AppModule {}
