import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { OutboxEventEntity } from './outbox-event.entity';

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepo: Repository<OutboxEventEntity>,
  ) {}

  async enqueue(params: {
    topic: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }) {
    const event = this.outboxRepo.create({
      topic: params.topic,
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      payload: params.payload,
      status: 'PENDING',
    });
    return this.outboxRepo.save(event);
  }

  async reserveBatch(limit: number) {
    const now = new Date();
    const rows = await this.outboxRepo.find({
      where: [
        {
          status: 'PENDING',
        },
        {
          status: 'FAILED',
          nextAttemptAt: LessThanOrEqual(now),
        },
        {
          status: 'FAILED',
          nextAttemptAt: IsNull(),
        },
      ],
      order: { createdAt: 'ASC' },
      take: limit,
    });

    for (const row of rows) {
      row.status = 'PROCESSING';
      row.attemptCount += 1;
      row.lastAttemptAt = now;
      row.lastError = null;
      await this.outboxRepo.save(row);
    }

    return rows;
  }

  async markProcessed(eventId: string) {
    await this.outboxRepo.update(eventId, {
      status: 'PROCESSED',
      lastError: null,
      nextAttemptAt: null,
    });
  }

  async markFailed(eventId: string, error: string, retryDelaySeconds: number) {
    const nextAttemptAt = new Date(Date.now() + retryDelaySeconds * 1000);
    await this.outboxRepo.update(eventId, {
      status: 'FAILED',
      lastError: error.slice(0, 512),
      nextAttemptAt,
    });
  }
}
