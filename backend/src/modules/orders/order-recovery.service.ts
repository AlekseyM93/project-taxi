import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrderObservabilityService } from './order-observability.service';

@Injectable()
export class OrderRecoveryService {
  private readonly logger = new Logger(OrderRecoveryService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly observability: OrderObservabilityService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverStaleAssignedOrders() {
    const enabled =
      this.cfg.get<string>('ORDER_RECOVERY_ENABLED', 'true') === 'true';
    if (!enabled) {
      return;
    }

    const timeoutSeconds = Number(
      this.cfg.get<string>('ORDER_ASSIGNED_TIMEOUT_SECONDS', '180'),
    );
    const batchSize = Number(
      this.cfg.get<string>('ORDER_RECOVERY_BATCH_SIZE', '100'),
    );

    const recovered = await this.ordersService.recoverStaleAssignedOrders({
      timeoutSeconds: Number.isFinite(timeoutSeconds) ? timeoutSeconds : 180,
      batchSize: Number.isFinite(batchSize) ? batchSize : 100,
    });

    if (recovered.count > 0) {
      this.logger.warn(
        `Recovered ${recovered.count} stale ASSIGNED orders: ${recovered.orderIds.join(', ')}`,
      );

      const threshold = Number(
        this.cfg.get<string>('ORDER_RECOVERY_ALERT_THRESHOLD', '10'),
      );
      if (Number.isFinite(threshold) && recovered.count >= threshold) {
        for (const orderId of recovered.orderIds) {
          await this.observability.trackIncident({
            orderId,
            incidentType: 'RECOVERY_ALERT_ASSIGNED_SPIKE',
            severity: 'ERROR',
            message: `Assigned recovery threshold exceeded: ${recovered.count}`,
            context: { threshold, recoveredCount: recovered.count },
          });
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async recoverStaleInProgressOrders() {
    const enabled =
      this.cfg.get<string>('ORDER_IN_PROGRESS_RECOVERY_ENABLED', 'false') ===
      'true';
    if (!enabled) {
      return;
    }

    const timeoutSeconds = Number(
      this.cfg.get<string>('ORDER_IN_PROGRESS_TIMEOUT_SECONDS', '7200'),
    );
    const batchSize = Number(
      this.cfg.get<string>('ORDER_RECOVERY_BATCH_SIZE', '100'),
    );

    const recovered = await this.ordersService.recoverStaleInProgressOrders({
      timeoutSeconds: Number.isFinite(timeoutSeconds) ? timeoutSeconds : 7200,
      batchSize: Number.isFinite(batchSize) ? batchSize : 100,
    });

    if (recovered.count > 0) {
      this.logger.warn(
        `Recovered ${recovered.count} stale IN_PROGRESS orders: ${recovered.orderIds.join(', ')}`,
      );

      const threshold = Number(
        this.cfg.get<string>('ORDER_RECOVERY_ALERT_THRESHOLD', '10'),
      );
      if (Number.isFinite(threshold) && recovered.count >= threshold) {
        for (const orderId of recovered.orderIds) {
          await this.observability.trackIncident({
            orderId,
            incidentType: 'RECOVERY_ALERT_IN_PROGRESS_SPIKE',
            severity: 'ERROR',
            message: `In-progress recovery threshold exceeded: ${recovered.count}`,
            context: { threshold, recoveredCount: recovered.count },
          });
        }
      }
    }
  }
}
