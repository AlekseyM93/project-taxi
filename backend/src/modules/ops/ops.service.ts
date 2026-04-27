import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { OrderObservabilityService } from '../orders/order-observability.service';
import { PaymentsService } from '../payments/payments.service';
import { UpsertPaymentWebhookSecurityPolicyDto } from './dto';
import { PaymentWebhookSecurityPolicyEntity } from './payment-webhook-security-policy.entity';
import { PaymentWebhookSecurityPolicyAuditEntity } from './payment-webhook-security-policy-audit.entity';

@Injectable()
export class OpsService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;

  constructor(
    private readonly dataSource: DataSource,
    private readonly observability: OrderObservabilityService,
    private readonly payments: PaymentsService,
    @InjectRepository(PaymentWebhookSecurityPolicyEntity)
    private readonly webhookPolicyRepo: Repository<PaymentWebhookSecurityPolicyEntity>,
    @InjectRepository(PaymentWebhookSecurityPolicyAuditEntity)
    private readonly webhookPolicyAuditRepo: Repository<PaymentWebhookSecurityPolicyAuditEntity>,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
    await this.seedPaymentWebhookPoliciesIfEmpty();
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
    const [snapshot, paymentSecurity] = await Promise.all([
      this.getSloSnapshot(windowMinutes),
      this.payments.getWebhookSecuritySnapshot(windowMinutes),
    ]);
    const { slos, thresholds } = snapshot;
    const maxPaymentWebhookRejectRatePct = Number(
      process.env.PAYMENT_WEBHOOK_MAX_REJECT_RATE_PCT || '5',
    );

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

    alerts.push({
      id: 'payment-webhook-reject-rate',
      severity: 'CRITICAL',
      status:
        paymentSecurity.rejectRatePct > maxPaymentWebhookRejectRatePct
          ? 'OPEN'
          : 'OK',
      message: 'Payment webhook reject rate above threshold',
      currentValuePct: paymentSecurity.rejectRatePct,
      thresholdPct: maxPaymentWebhookRejectRatePct,
    });

    const openCount = alerts.filter((alert) => alert.status === 'OPEN').length;

    return {
      windowMinutes,
      openCount,
      alerts,
      timestamp: new Date().toISOString(),
    };
  }

  async getRealtimeAckSnapshot(windowMinutes = 60) {
    const metricsSnapshot =
      await this.observability.getMetricsSnapshot(windowMinutes);
    const metrics = metricsSnapshot.metrics;

    const ackOk = metrics.driver_location_ack_ok || 0;
    const ackFail = metrics.driver_location_ack_fail || 0;
    const total = ackOk + ackFail;
    const successRatePct = this.toPercent(ackOk, total);
    const failRatePct = this.toPercent(ackFail, total);

    const byReason = {
      INVALID_COORDINATES: metrics.driver_location_ack_invalid_coordinates || 0,
      DUPLICATE_OR_LATE_UPDATE:
        metrics.driver_location_ack_duplicate_or_late || 0,
      DRIVER_PROFILE_NOT_FOUND:
        metrics.driver_location_ack_driver_profile_not_found || 0,
      UNAUTHORIZED: metrics.driver_location_ack_unauthorized || 0,
      INTERNAL_ERROR: metrics.driver_location_ack_internal_error || 0,
    };

    return {
      windowMinutes,
      total,
      ok: ackOk,
      fail: ackFail,
      successRatePct,
      failRatePct,
      byReason,
      timestamp: new Date().toISOString(),
    };
  }

  async getDashboardSummary(windowMinutes = 60) {
    const [
      readiness,
      slo,
      alerts,
      paymentSecurity,
      paymentSecurityRunbook,
      realtimeAck,
    ] =
      await Promise.all([
        this.getReadiness(),
        this.getSloSnapshot(windowMinutes),
        this.getAlertSnapshot(windowMinutes),
        this.payments.getWebhookSecuritySnapshot(windowMinutes),
        this.getPaymentWebhookSecurityRunbook(windowMinutes),
        this.getRealtimeAckSnapshot(windowMinutes),
      ]);

    return {
      service: this.getLiveness().service,
      readiness,
      slo,
      alerts,
      paymentSecurity,
      paymentSecurityRunbook,
      realtimeAck,
      timestamp: new Date().toISOString(),
    };
  }

  async getPaymentWebhookSecuritySnapshot(windowMinutes = 60) {
    return this.payments.getWebhookSecuritySnapshot(windowMinutes);
  }

  async getPaymentWebhookSecurityRunbook(windowMinutes = 60) {
    const snapshot =
      await this.payments.getWebhookSecuritySnapshot(windowMinutes);
    const policies = await this.listPaymentWebhookSecurityPolicies();
    const items: Array<{
      id: string;
      status: 'OPEN' | 'OK';
      severity: 'WARN' | 'CRITICAL';
      reasonCode: string;
      currentValue: number;
      threshold: number;
      message: string;
      suggestedActions: string[];
    }> = [];

    for (const policy of policies.filter((item) => item.isEnabled)) {
      const threshold = Number(policy.threshold);
      const currentValue =
        policy.reasonCode === 'REJECT_RATE'
          ? snapshot.rejectRatePct
          : (snapshot.byReason?.[policy.reasonCode] ?? 0);
      const status = this.comparePolicy(
        policy.comparator,
        currentValue,
        threshold,
      )
        ? 'OPEN'
        : 'OK';
      items.push({
        id: policy.ruleCode,
        status,
        severity: policy.severity,
        reasonCode: policy.reasonCode,
        currentValue,
        threshold,
        message: policy.message,
        suggestedActions: policy.suggestedActions ?? [],
      });
    }

    const openCount = items.filter((item) => item.status === 'OPEN').length;
    return {
      windowMinutes,
      openCount,
      items,
      timestamp: new Date().toISOString(),
    };
  }

  async listPaymentWebhookSecurityPolicies() {
    return this.webhookPolicyRepo.find({
      order: {
        severity: 'DESC',
        ruleCode: 'ASC',
      },
    });
  }

  async upsertPaymentWebhookSecurityPolicy(
    dto: UpsertPaymentWebhookSecurityPolicyDto,
    actorId?: string | null,
  ) {
    const existing = await this.webhookPolicyRepo.findOne({
      where: {
        ruleCode: dto.ruleCode,
      },
    });
    const row =
      existing ?? this.webhookPolicyRepo.create({ ruleCode: dto.ruleCode });
    row.reasonCode = dto.reasonCode;
    row.severity = dto.severity;
    row.comparator = dto.comparator;
    row.threshold = dto.threshold.toFixed(2);
    row.message = dto.message;
    row.suggestedActions = dto.suggestedActions ?? [];
    row.isEnabled = dto.isEnabled ?? true;
    row.updatedBy = actorId ?? null;
    const saved = await this.webhookPolicyRepo.save(row);
    await this.writePolicyAudit({
      actorId: actorId ?? null,
      actionType: 'UPSERT_POLICY',
      ruleCode: saved.ruleCode,
      reasonCode: saved.reasonCode,
      payload: {
        before: existing
          ? {
              reasonCode: existing.reasonCode,
              severity: existing.severity,
              comparator: existing.comparator,
              threshold: existing.threshold,
              message: existing.message,
              suggestedActions: existing.suggestedActions,
              isEnabled: existing.isEnabled,
            }
          : null,
        after: {
          reasonCode: saved.reasonCode,
          severity: saved.severity,
          comparator: saved.comparator,
          threshold: saved.threshold,
          message: saved.message,
          suggestedActions: saved.suggestedActions,
          isEnabled: saved.isEnabled,
          updatedBy: saved.updatedBy,
        },
      },
    });
    return saved;
  }

  async listPaymentWebhookSecurityPolicyAudit(limit = 50) {
    return this.webhookPolicyAuditRepo.find({
      order: {
        createdAt: 'DESC',
      },
      take: Math.min(Math.max(limit, 1), 300),
    });
  }

  private async writePolicyAudit(params: {
    actorId: string | null;
    actionType: 'UPSERT_POLICY';
    ruleCode: string;
    reasonCode: string;
    payload: Record<string, unknown>;
  }) {
    await this.webhookPolicyAuditRepo.save(
      this.webhookPolicyAuditRepo.create({
        actorId: params.actorId,
        actionType: params.actionType,
        ruleCode: params.ruleCode,
        reasonCode: params.reasonCode,
        payload: params.payload,
      }),
    );
  }

  private comparePolicy(
    comparator: 'GT' | 'GTE',
    currentValue: number,
    threshold: number,
  ) {
    if (comparator === 'GT') {
      return currentValue > threshold;
    }
    return currentValue >= threshold;
  }

  private async seedPaymentWebhookPoliciesIfEmpty() {
    const count = await this.webhookPolicyRepo.count();
    if (count > 0) {
      return;
    }
    const defaults: Array<UpsertPaymentWebhookSecurityPolicyDto> = [
      {
        ruleCode: 'REJECT_RATE',
        reasonCode: 'REJECT_RATE',
        severity: 'CRITICAL',
        comparator: 'GT',
        threshold: Number(
          process.env.PAYMENT_WEBHOOK_MAX_REJECT_RATE_PCT || '5',
        ),
        message: 'Payment webhook reject rate is above the allowed threshold',
        suggestedActions: [
          'Check PSP and gateway availability for the current provider.',
          'Inspect last 20 rejected security events and group by reason code.',
          'If spike is sustained, switch traffic to backup PSP profile.',
        ],
      },
      {
        ruleCode: 'INVALID_SIGNATURE',
        reasonCode: 'INVALID_SIGNATURE',
        severity: 'CRITICAL',
        comparator: 'GTE',
        threshold: Number(
          process.env.PAYMENT_WEBHOOK_INVALID_SIGNATURE_WARN_COUNT || '5',
        ),
        message: 'Webhook signatures are failing verification',
        suggestedActions: [
          'Verify webhook secret parity between PSP dashboard and backend env.',
          'Confirm raw-body capture middleware is enabled and unchanged.',
          'Check for proxy/body transformations that can break HMAC validation.',
        ],
      },
      {
        ruleCode: 'WEBHOOK_REPLAY_DETECTED',
        reasonCode: 'WEBHOOK_REPLAY_DETECTED',
        severity: 'CRITICAL',
        comparator: 'GTE',
        threshold: Number(process.env.PAYMENT_WEBHOOK_REPLAY_WARN_COUNT || '3'),
        message: 'Webhook replay attempts detected',
        suggestedActions: [
          'Check upstream for duplicate delivery behavior and retry storms.',
          'Inspect nonce uniqueness and retention configuration.',
          'Temporarily increase monitoring and block suspicious source IP ranges.',
        ],
      },
      {
        ruleCode: 'WEBHOOK_TIMESTAMP_OUT_OF_WINDOW',
        reasonCode: 'WEBHOOK_TIMESTAMP_OUT_OF_WINDOW',
        severity: 'WARN',
        comparator: 'GTE',
        threshold: Number(
          process.env.PAYMENT_WEBHOOK_TIMESTAMP_WARN_COUNT || '3',
        ),
        message: 'Webhook timestamps are outside the allowed replay window',
        suggestedActions: [
          'Validate NTP clock sync on backend nodes and PSP timestamp source.',
          'Check proxy queue latency that can delay webhook delivery.',
          'Review replay max age configuration against real network latency.',
        ],
      },
      {
        ruleCode: 'WEBHOOK_NONCE_REQUIRED',
        reasonCode: 'WEBHOOK_NONCE_REQUIRED',
        severity: 'WARN',
        comparator: 'GTE',
        threshold: Number(process.env.PAYMENT_WEBHOOK_NONCE_WARN_COUNT || '3'),
        message: 'Webhooks are missing required nonce identifiers',
        suggestedActions: [
          'Confirm nonce/request-id headers are forwarded by edge and proxy.',
          'Check PSP webhook schema and header contract changes.',
          'If needed, negotiate provider-specific nonce fallback strategy.',
        ],
      },
    ];
    await this.webhookPolicyRepo.save(
      defaults.map((item) =>
        this.webhookPolicyRepo.create({
          ruleCode: item.ruleCode,
          reasonCode: item.reasonCode,
          severity: item.severity,
          comparator: item.comparator,
          threshold: item.threshold.toFixed(2),
          message: item.message,
          suggestedActions: item.suggestedActions ?? [],
          isEnabled: true,
          updatedBy: null,
        }),
      ),
    );
  }
}
