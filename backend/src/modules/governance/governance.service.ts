import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { OrderIncidentEntity } from '../orders/order-incident.entity';

@Injectable()
export class GovernanceService {
  constructor(
    @InjectRepository(OrderIncidentEntity)
    private readonly incidentsRepo: Repository<OrderIncidentEntity>,
  ) {}

  async getRetentionSnapshot() {
    const retentionDays = Number(
      process.env.GOVERNANCE_INCIDENT_RETENTION_DAYS || 180,
    );
    const threshold = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
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
}
