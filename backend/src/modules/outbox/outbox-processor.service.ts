import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from './outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxEventEntity } from './outbox-event.entity';

type OutboxHandler = (row: OutboxEventEntity) => Promise<void>;

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly batchSize: number;
  private readonly retryDelaySeconds: number;
  private readonly enabled: boolean;
  private readonly handlers = new Map<string, OutboxHandler>();

  constructor(
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {
    this.batchSize = Number(this.config.get('OUTBOX_BATCH_SIZE', 50));
    this.retryDelaySeconds = Number(
      this.config.get('OUTBOX_RETRY_DELAY_SECONDS', 15),
    );
    this.enabled =
      this.config.get<string>('OUTBOX_PROCESSOR_ENABLED', 'true') === 'true';
    this.registerHandlers();
  }

  private registerHandlers() {
    this.handlers.set('order.lifecycle:*', async (row) =>
      this.handleOrderLifecycleEvent(row),
    );
  }

  private resolveHandler(row: OutboxEventEntity): OutboxHandler | null {
    const exactKey = `${row.topic}:${row.eventType}`;
    const topicWildcardKey = `${row.topic}:*`;
    return this.handlers.get(exactKey) ?? this.handlers.get(topicWildcardKey) ?? null;
  }

  private async handleOrderLifecycleEvent(row: OutboxEventEntity) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const actorId =
      typeof payload.actorId === 'string' && payload.actorId.length > 0
        ? payload.actorId
        : null;
    const actorType =
      typeof payload.actorType === 'string' ? payload.actorType : null;
    const orderId =
      typeof payload.orderId === 'string' && payload.orderId.length > 0
        ? payload.orderId
        : row.aggregateId;

    if (!actorId) {
      return;
    }

    if (actorType === 'DRIVER') {
      await this.notifications.publish(actorId, 'DRIVER_ORDER_STATUS_CHANGED', {
        orderId,
        eventType: row.eventType,
        source: 'OUTBOX',
      });
      return;
    }

    if (actorType === 'PASSENGER') {
      await this.notifications.publish(actorId, 'PASSENGER_ORDER_STATUS_CHANGED', {
        orderId,
        eventType: row.eventType,
        source: 'OUTBOX',
      });
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutboxBatch() {
    if (!this.enabled) {
      return;
    }

    const rows = await this.outbox.reserveBatch(this.batchSize);
    if (rows.length === 0) {
      return;
    }

    for (const row of rows) {
      try {
        const handler = this.resolveHandler(row);
        if (!handler) {
          throw new Error(`OUTBOX_HANDLER_NOT_FOUND:${row.topic}:${row.eventType}`);
        }
        await handler(row);
        await this.outbox.markProcessed(row.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'UNKNOWN_OUTBOX_PROCESSING_ERROR';
        await this.outbox.markFailed(row.id, message, this.retryDelaySeconds);
        this.logger.warn(
          `Failed to process outbox event ${row.id} (${row.eventType}): ${message}`,
        );
      }
    }
  }
}
