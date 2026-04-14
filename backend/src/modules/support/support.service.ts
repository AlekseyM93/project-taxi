import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportCaseEntity } from './support-case.entity';
import { OpenSupportCaseDto, ResolveSupportCaseDto } from './dto';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportCaseEntity)
    private readonly supportCaseRepo: Repository<SupportCaseEntity>,
  ) {}

  async openCase(passengerId: string, dto: OpenSupportCaseDto) {
    const item = this.supportCaseRepo.create({
      orderId: dto.orderId,
      passengerId,
      reasonCode: dto.reasonCode,
      message: dto.message,
      status: 'OPEN',
      priority: dto.reasonCode === 'PAYMENT_ISSUE' ? 'HIGH' : 'MEDIUM',
      metadata: {
        source: 'PASSENGER',
      },
    });
    return this.supportCaseRepo.save(item);
  }

  async listCases(limit = 50) {
    const rows = await this.supportCaseRepo.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        passengerId: row.passengerId,
        status: row.status,
        priority: row.priority,
        reasonCode: row.reasonCode,
        message: row.message,
        assignedToUserId: row.assignedToUserId,
        resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async resolveCase(
    caseId: string,
    resolverUserId: string,
    dto: ResolveSupportCaseDto,
  ) {
    const item = await this.supportCaseRepo.findOne({
      where: { id: caseId },
    });
    if (!item) {
      throw new NotFoundException('SUPPORT_CASE_NOT_FOUND');
    }

    item.status = dto.status;
    item.assignedToUserId = resolverUserId;
    item.metadata = {
      ...(item.metadata ?? {}),
      lastResolutionNote: dto.note ?? null,
    };
    item.resolvedAt = dto.status === 'RESOLVED' ? new Date() : null;

    return this.supportCaseRepo.save(item);
  }
}
