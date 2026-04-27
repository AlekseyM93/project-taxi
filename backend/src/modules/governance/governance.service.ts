import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { OrderIncidentEntity } from '../orders/order-incident.entity';

@Injectable()
export class GovernanceService {
  private static readonly DEFAULT_RETENTION_DAYS = 180;
  private static readonly MIN_RETENTION_DAYS = 7;
  private static readonly MAX_RETENTION_DAYS = 3650;
  private static readonly DEFAULT_EXECUTION_LIMIT = 500;
  private static readonly MAX_EXECUTION_LIMIT = 5000;

  constructor(
    @InjectRepository(OrderIncidentEntity)
    private readonly incidentsRepo: Repository<OrderIncidentEntity>,
  ) {}

  private resolveRetentionDays() {
    const raw = Number(
      process.env.GOVERNANCE_INCIDENT_RETENTION_DAYS ??
        GovernanceService.DEFAULT_RETENTION_DAYS,
    );
    if (Number.isNaN(raw)) {
      return GovernanceService.DEFAULT_RETENTION_DAYS;
    }
    return Math.min(
      Math.max(raw, GovernanceService.MIN_RETENTION_DAYS),
      GovernanceService.MAX_RETENTION_DAYS,
    );
  }

  private resolveExecutionLimit(limit?: number) {
    if (!limit) {
      return GovernanceService.DEFAULT_EXECUTION_LIMIT;
    }
    return Math.min(Math.max(limit, 1), GovernanceService.MAX_EXECUTION_LIMIT);
  }

  private buildThreshold(retentionDays: number) {
    return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  }

  async getRetentionSnapshot() {
    const retentionDays = this.resolveRetentionDays();
    const threshold = this.buildThreshold(retentionDays);
    const staleCount = await this.incidentsRepo.count({
      where: {
        createdAt: LessThan(threshold),
      },
    });

    return {
      retentionDays,
      staleIncidentCount: staleCount,
      thresholdTs: threshold.toISOString(),
    };
  }

  async executeRetention(params?: { dryRun?: boolean; limit?: number }) {
    const retentionDays = this.resolveRetentionDays();
    const threshold = this.buildThreshold(retentionDays);
    const executionLimit = this.resolveExecutionLimit(params?.limit);
    const dryRun = params?.dryRun !== false;

    const staleCount = await this.incidentsRepo.count({
      where: {
        createdAt: LessThan(threshold),
      },
    });

    const candidates = await this.incidentsRepo.find({
      where: {
        createdAt: LessThan(threshold),
      },
      order: { createdAt: 'ASC' },
      take: executionLimit,
    });
    const candidateIds = candidates.map((item) => item.id);

    if (dryRun || candidateIds.length === 0) {
      return {
        mode: 'DRY_RUN' as const,
        strategy: 'BOUNDED_PURGE' as const,
        retentionDays,
        thresholdTs: threshold.toISOString(),
        staleIncidentCount: staleCount,
        executionLimit,
        candidateCount: candidateIds.length,
        purgedCount: 0,
        remainingEstimate: staleCount,
        archive: {
          mode: 'NONE' as const,
          reason: 'ARCHIVE_STORE_NOT_CONFIGURED',
        },
      };
    }

    const deleted = await this.incidentsRepo.delete(candidateIds);
    const purgedCount = deleted.affected ?? candidateIds.length;

    return {
      mode: 'EXECUTE' as const,
      strategy: 'BOUNDED_PURGE' as const,
      retentionDays,
      thresholdTs: threshold.toISOString(),
      staleIncidentCount: staleCount,
      executionLimit,
      candidateCount: candidateIds.length,
      purgedCount,
      remainingEstimate: Math.max(0, staleCount - purgedCount),
      archive: {
        mode: 'NONE' as const,
        reason: 'ARCHIVE_STORE_NOT_CONFIGURED',
      },
    };
  }
}
