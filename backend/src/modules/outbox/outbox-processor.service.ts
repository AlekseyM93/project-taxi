import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly batchSize: number;
  private readonly retryDelaySeconds: number;
  private readonly enabled: boolean;

  constructor(
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {
    this.batchSize = Number(this.config.get('OUTBOX_BATCH_SIZE', 50));
    this.retryDelaySeconds = Number(
      this.config.get('OUTBOX_RETRY_DELAY_SECONDS', 15),
    );
    this.enabled =
      this.config.get<string>('OUTBOX_PROCESSOR_ENABLED', 'true') === 'true';
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
        // Placeholder for integration handlers (payments webhooks, push notifications, etc.).
        // Stage-1 goal is durable event buffering with retry semantics.
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
