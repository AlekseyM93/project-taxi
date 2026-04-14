import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { OrderObservabilityService } from '../orders/order-observability.service';

@Injectable()
export class OpsService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;

  constructor(
    private readonly dataSource: DataSource,
    private readonly observability: OrderObservabilityService,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  getLiveness() {
    return {
      status: 'ok',
      service: 'taxi-platform-backend',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase() {
    const db = { ok: false, detail: '' };
    try {
      await this.dataSource.query('SELECT 1');
      db.ok = true;
      db.detail = 'SELECT 1 succeeded';
    } catch (error: any) {
      db.detail = error?.message || 'db check failed';
    }
    return db;
  }

  private async checkRedis() {
    const redis = { ok: false, detail: '' };
    try {
      const pong = await this.redis.ping();
      redis.ok = pong === 'PONG';
      redis.detail = `PING => ${pong}`;
    } catch (error: any) {
      redis.detail = error?.message || 'redis ping failed';
    }
    return redis;
  }

  async getDependenciesStatus() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const checks = {
      database,
      redis,
      websocket: {
        ok: true,
        detail: 'Gateway lifecycle managed by NestJS process',
      },
    };
    const healthy =
      checks.database.ok && checks.redis.ok && checks.websocket.ok;

    return {
      status: healthy ? 'healthy' : 'degraded',
      healthy,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const dependencies = await this.getDependenciesStatus();
    const ready = dependencies.healthy;
    const degradedReasons: string[] = [];

    if (!dependencies.checks.database.ok) {
      degradedReasons.push('DATABASE_UNAVAILABLE');
    }
    if (!dependencies.checks.redis.ok) {
      degradedReasons.push('REDIS_UNAVAILABLE');
    }

    return {
      status: ready ? 'ready' : 'degraded',
      ready,
      readinessCode: ready ? 'READY' : 'DEGRADED_DEPENDENCIES',
      checks: {
        database: dependencies.checks.database,
        redis: dependencies.checks.redis,
      },
      degradedReasons,
      timestamp: new Date().toISOString(),
    };
  }

  private toPercent(part: number, total: number) {
    if (total <= 0) {
      return 100;
    }
    return Math.round((part / total) * 10000) / 100;
  }

  private getThresholds() {
    return {
      minAssignmentRatePct: Number(
        process.env.SLO_MIN_ASSIGNMENT_RATE_PCT || '85',
      ),
      minCompletionRatePct: Number(
        process.env.SLO_MIN_COMPLETION_RATE_PCT || '60',
      ),
      maxCancellationRatePct: Number(
        process.env.SLO_MAX_CANCELLATION_RATE_PCT || '30',
      ),
      maxRecoveryRatePct: Number(process.env.SLO_MAX_RECOVERY_RATE_PCT || '10'),
    };
  }

  async getSloSnapshot(windowMinutes = 60) {
    const metricsSnapshot =
      await this.observability.getMetricsSnapshot(windowMinutes);
    const metrics = metricsSnapshot.metrics;

    const created = metrics.orders_created || 0;
    const assigned = metrics.orders_assigned || 0;
    const finished = metrics.orders_finished || 0;
    const cancelled = metrics.orders_cancelled || 0;
    const recoveries =
      (metrics.recoveries_assigned || 0) +
      (metrics.recoveries_in_progress || 0);

    const assignmentRatePct = this.toPercent(assigned, created);
    const completionRatePct = this.toPercent(finished, created);
    const cancellationRatePct = this.toPercent(cancelled, created);
    const recoveryRatePct = this.toPercent(recoveries, created);

    const thresholds = this.getThresholds();

    return {
      windowMinutes,
      metrics,
      slos: {
        assignmentRatePct,
        completionRatePct,
        cancellationRatePct,
        recoveryRatePct,
      },
      thresholds,
      timestamp: new Date().toISOString(),
    };
  }

  async getAlertSnapshot(windowMinutes = 60) {
    const snapshot = await this.getSloSnapshot(windowMinutes);
    const { slos, thresholds } = snapshot;

    const alerts: Array<{
      id: string;
      severity: 'WARN' | 'CRITICAL';
      status: 'OPEN' | 'OK';
      message: string;
      currentValuePct: number;
      thresholdPct: number;
    }> = [];

    alerts.push({
      id: 'assignment-rate',
      severity: 'CRITICAL',
      status:
        slos.assignmentRatePct < thresholds.minAssignmentRatePct
          ? 'OPEN'
          : 'OK',
      message: 'Assignment rate below SLO threshold',
      currentValuePct: slos.assignmentRatePct,
      thresholdPct: thresholds.minAssignmentRatePct,
    });

    alerts.push({
      id: 'completion-rate',
      severity: 'WARN',
      status:
        slos.completionRatePct < thresholds.minCompletionRatePct
          ? 'OPEN'
          : 'OK',
      message: 'Completion rate below SLO threshold',
      currentValuePct: slos.completionRatePct,
      thresholdPct: thresholds.minCompletionRatePct,
    });

    alerts.push({
      id: 'cancellation-rate',
      severity: 'WARN',
      status:
        slos.cancellationRatePct > thresholds.maxCancellationRatePct
          ? 'OPEN'
          : 'OK',
      message: 'Cancellation rate above SLO threshold',
      currentValuePct: slos.cancellationRatePct,
      thresholdPct: thresholds.maxCancellationRatePct,
    });

    alerts.push({
      id: 'recovery-rate',
      severity: 'CRITICAL',
      status:
        slos.recoveryRatePct > thresholds.maxRecoveryRatePct ? 'OPEN' : 'OK',
      message: 'Recovery rate above SLO threshold',
      currentValuePct: slos.recoveryRatePct,
      thresholdPct: thresholds.maxRecoveryRatePct,
    });

    const openCount = alerts.filter((alert) => alert.status === 'OPEN').length;

    return {
      windowMinutes,
      openCount,
      alerts,
      timestamp: new Date().toISOString(),
    };
  }

  async getDashboardSummary(windowMinutes = 60) {
    const [readiness, slo, alerts] = await Promise.all([
      this.getReadiness(),
      this.getSloSnapshot(windowMinutes),
      this.getAlertSnapshot(windowMinutes),
    ]);

    return {
      service: this.getLiveness().service,
      readiness,
      slo,
      alerts,
      timestamp: new Date().toISOString(),
    };
  }
}
