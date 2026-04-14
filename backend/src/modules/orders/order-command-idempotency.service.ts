import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

type IdempotentResponse = Record<string, unknown> & {
  ok: boolean;
  traceId: string;
};

@Injectable()
export class OrderCommandIdempotencyService
  implements OnModuleInit, OnModuleDestroy
{
  private redis!: Redis;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  private cacheKey(
    driverId: string,
    event: string,
    orderId: string,
    commandId: string,
  ) {
    return `idempotency:driver:${driverId}:${event}:${orderId}:${commandId}`;
  }

  private lockKey(
    driverId: string,
    event: string,
    orderId: string,
    commandId: string,
  ) {
    return `idempotency:driver:lock:${driverId}:${event}:${orderId}:${commandId}`;
  }

  async execute(params: {
    driverId: string;
    event: string;
    orderId: string;
    commandId: string;
    traceId: string;
    ttlSeconds?: number;
    handler: () => Promise<IdempotentResponse>;
  }): Promise<IdempotentResponse> {
    const ttlSeconds = params.ttlSeconds ?? 300;
    const cacheKey = this.cacheKey(
      params.driverId,
      params.event,
      params.orderId,
      params.commandId,
    );
    const lockKey = this.lockKey(
      params.driverId,
      params.event,
      params.orderId,
      params.commandId,
    );

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as IdempotentResponse;
      return {
        ...parsed,
        idempotentReplay: true,
      };
    }

    const lock = await this.redis.set(lockKey, params.traceId, 'EX', 30, 'NX');
    if (lock !== 'OK') {
      const lateCached = await this.redis.get(cacheKey);
      if (lateCached) {
        const parsed = JSON.parse(lateCached) as IdempotentResponse;
        return {
          ...parsed,
          idempotentReplay: true,
        };
      }

      return {
        ok: false,
        code: 'COMMAND_IN_PROGRESS',
        reason: 'COMMAND_IN_PROGRESS',
        traceId: params.traceId,
      };
    }

    try {
      const response = await params.handler();
      await this.redis.set(
        cacheKey,
        JSON.stringify(response),
        'EX',
        ttlSeconds,
      );
      return response;
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
