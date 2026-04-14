import { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';

type Counter = {
  count: number;
  resetAt: number;
};

const fallbackCounters = new Map<string, Counter>();
let redisClient: Redis | null = null;
let redisInitAttempted = false;

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim().length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function shouldRateLimitPath(req: Request) {
  if (req.method !== 'POST') {
    return false;
  }
  const defaultPaths = [
    '/auth/login',
    '/auth/register',
    '/orders/sync/push',
    '/orders/me/passenger/confirm',
    '/orders/admin/panel/action-center/execute',
    '/payments/webhooks',
  ];
  const configuredPaths = (process.env.SECURITY_RATE_LIMIT_ROUTES || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const protectedPaths =
    configuredPaths.length > 0 ? configuredPaths : defaultPaths;
  return protectedPaths.includes(req.path);
}

function readConfig() {
  const limit = Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '30');
  const windowSeconds = Number(
    process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS || '60',
  );

  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0
        ? Math.floor(windowSeconds)
        : 60,
    prefix: process.env.AUTH_RATE_LIMIT_PREFIX || 'ratelimit:auth',
  };
}

function getOrInitRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }
  if (redisInitAttempted) {
    return null;
  }

  redisInitAttempted = true;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redisClient.on('error', () => {
    // Fallback to in-memory limiter if Redis is degraded.
  });
  redisClient.connect().catch(() => {
    redisClient = null;
  });

  return redisClient;
}

function respondRateLimited(
  req: Request,
  res: Response,
  retryAfterSec: number,
) {
  res.setHeader('retry-after', String(retryAfterSec));
  return res.status(429).json({
    ok: false,
    error: {
      code: 'RATE_LIMITED',
      reason: 'RATE_LIMITED',
      statusCode: 429,
      traceId: req.headers['x-request-id'] || null,
      path: req.originalUrl || req.url,
      details: {
        retryAfterSec,
      },
    },
  });
}

function applyFallbackRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
  config: ReturnType<typeof readConfig>,
) {
  const normalizedWindowMs = config.windowSeconds * 1000;
  const key = `${req.path}:${getClientIp(req)}`;
  const now = Date.now();
  const current = fallbackCounters.get(key);

  if (!current || current.resetAt <= now) {
    fallbackCounters.set(key, {
      count: 1,
      resetAt: now + normalizedWindowMs,
    });
    res.setHeader('x-ratelimit-limit', String(config.limit));
    res.setHeader('x-ratelimit-remaining', String(config.limit - 1));
    return next();
  }

  current.count += 1;
  fallbackCounters.set(key, current);
  const remaining = Math.max(config.limit - current.count, 0);
  res.setHeader('x-ratelimit-limit', String(config.limit));
  res.setHeader('x-ratelimit-remaining', String(remaining));

  if (current.count > config.limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((current.resetAt - now) / 1000),
    );
    return respondRateLimited(req, res, retryAfterSec);
  }

  return next();
}

export async function authRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!shouldRateLimitPath(req)) {
    return next();
  }

  const config = readConfig();
  const redis = getOrInitRedisClient();
  if (!redis || redis.status !== 'ready') {
    return applyFallbackRateLimit(req, res, next, config);
  }

  const key = `${config.prefix}:${req.path}:${getClientIp(req)}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, config.windowSeconds);
    }
    const ttl = await redis.ttl(key);
    const retryAfterSec = ttl > 0 ? ttl : config.windowSeconds;

    const remaining = Math.max(config.limit - count, 0);
    res.setHeader('x-ratelimit-limit', String(config.limit));
    res.setHeader('x-ratelimit-remaining', String(remaining));

    if (count > config.limit) {
      return respondRateLimited(req, res, retryAfterSec);
    }

    return next();
  } catch {
    return applyFallbackRateLimit(req, res, next, config);
  }
}
