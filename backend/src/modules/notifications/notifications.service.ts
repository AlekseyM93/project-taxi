import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

type NotificationTemplate =
  | 'PASSENGER_ORDER_STATUS_CHANGED'
  | 'PASSENGER_RECEIPT_READY'
  | 'PASSENGER_DISPUTE_OPENED'
  | 'DRIVER_ORDER_STATUS_CHANGED';

type NotificationEntry = {
  id: string;
  userId: string;
  template: NotificationTemplate;
  payload: Record<string, unknown>;
  createdAt: string;
};

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  private feedKey(userId: string) {
    return `notifications:feed:${userId}`;
  }

  async publish(
    userId: string,
    template: NotificationTemplate,
    payload: Record<string, unknown>,
  ) {
    const entry: NotificationEntry = {
      id: randomUUID(),
      userId,
      template,
      payload,
      createdAt: new Date().toISOString(),
    };

    await this.redis
      .multi()
      .lpush(this.feedKey(userId), JSON.stringify(entry))
      .ltrim(this.feedKey(userId), 0, 199)
      .expire(this.feedKey(userId), 60 * 60 * 24 * 7)
      .exec();

    return entry;
  }

  async getUserFeed(userId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.redis.lrange(this.feedKey(userId), 0, take - 1);
    return rows
      .map((row) => {
        try {
          return JSON.parse(row) as NotificationEntry;
        } catch {
          return null;
        }
      })
      .filter((row): row is NotificationEntry => row !== null);
  }
}
