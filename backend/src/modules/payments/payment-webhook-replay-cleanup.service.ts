import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { PaymentWebhookReplayEntity } from './payment-webhook-replay.entity';

@Injectable()
export class PaymentWebhookReplayCleanupService {
  private readonly logger = new Logger(PaymentWebhookReplayCleanupService.name);
  private readonly enabled: boolean;
  private readonly retentionHours: number;
  private readonly batchSize: number;

  constructor(
    @InjectRepository(PaymentWebhookReplayEntity)
    private readonly replayRepo: Repository<PaymentWebhookReplayEntity>,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      this.config.get<string>(
        'PAYMENT_WEBHOOK_REPLAY_CLEANUP_ENABLED',
        'true',
      ) === 'true';
    this.retentionHours = Math.max(
      1,
      Number(
        this.config.get<string>(
          'PAYMENT_WEBHOOK_REPLAY_RETENTION_HOURS',
          '168',
        ),
      ),
    );
    this.batchSize = Math.max(
      100,
      Number(
        this.config.get<string>('PAYMENT_WEBHOOK_REPLAY_CLEANUP_BATCH', '5000'),
      ),
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async cleanupExpiredReplays() {
    if (!this.enabled) {
      return;
    }

    const cutoff = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);
    const staleRows = await this.replayRepo.find({
      where: { createdAt: LessThan(cutoff) },
      order: { createdAt: 'ASC' },
      take: this.batchSize,
    });
    if (staleRows.length === 0) {
      return;
    }

    const staleIds = staleRows.map((row) => row.id);
    const result = await this.replayRepo.delete(staleIds);
    const deletedCount = result.affected ?? staleRows.length;
    this.logger.log(
      `Deleted ${deletedCount} stale webhook replay rows (cutoff=${cutoff.toISOString()})`,
    );
  }
}
