import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { OrderEventEntity } from './order-event.entity';
import { OrderIncidentEntity } from './order-incident.entity';

type MetricName =
  | 'orders_created'
  | 'orders_assigned'
  | 'orders_started'
  | 'orders_finished'
  | 'orders_cancelled'
  | 'orders_no_drivers'
  | 'recoveries_assigned'
  | 'recoveries_in_progress'
  | 'driver_location_ack_ok'
  | 'driver_location_ack_fail'
  | 'driver_location_ack_invalid_coordinates'
  | 'driver_location_ack_duplicate_or_late'
  | 'driver_location_ack_internal_error'
  | 'driver_location_ack_driver_profile_not_found'
  | 'driver_location_ack_unauthorized';

type AdminAuditFeedItem =
  | {
      kind: 'EVENT';
      id: string;
      orderId: string;
      eventType: string;
      actorType: string | null;
      actorId: string | null;
      reason: string | null;
      traceId: string | null;
      createdAt: string;
    }
  | {
      kind: 'INCIDENT';
      id: string;
      orderId: string;
      incidentType: string;
      severity: 'INFO' | 'WARN' | 'ERROR';
      message: string;
      traceId: string | null;
      createdAt: string;
    };

type AdminActionHistoryItem =
  | {
      kind: 'EVENT';
      id: string;
      orderId: string;
      actionType: string;
      adminUserId: string | null;
      reason: string | null;
      traceId: string | null;
      createdAt: string;
    }
  | {
      kind: 'INCIDENT';
      id: string;
      orderId: string;
      actionType: string;
      adminUserId: string | null;
      reason: string | null;
      severity: 'INFO' | 'WARN' | 'ERROR';
      traceId: string | null;
      createdAt: string;
    };

@Injectable()
export class OrderObservabilityService
  implements OnModuleInit, OnModuleDestroy
{
  private redis!: Redis;
  private readonly metricNames: MetricName[] = [
    'orders_created',
    'orders_assigned',
    'orders_started',
    'orders_finished',
    'orders_cancelled',
    'orders_no_drivers',
    'recoveries_assigned',
    'recoveries_in_progress',
    'driver_location_ack_ok',
    'driver_location_ack_fail',
    'driver_location_ack_invalid_coordinates',
    'driver_location_ack_duplicate_or_late',
    'driver_location_ack_internal_error',
    'driver_location_ack_driver_profile_not_found',
    'driver_location_ack_unauthorized',
  ];

  constructor(
    @InjectRepository(OrderEventEntity)
    private readonly eventsRepo: Repository<OrderEventEntity>,
    @InjectRepository(OrderIncidentEntity)
    private readonly incidentsRepo: Repository<OrderIncidentEntity>,
  ) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  private minuteBucket(date = new Date()): string {
    const iso = date.toISOString();
    return iso.slice(0, 16).replace(/[-:T]/g, '');
  }

  private metricKey(name: MetricName, bucket: string) {
    return `metrics:orders:${name}:${bucket}`;
  }

  async trackMetric(name: MetricName, value = 1) {
    const bucket = this.minuteBucket();
    const key = this.metricKey(name, bucket);
    await this.redis
      .multi()
      .incrby(key, value)
      .expire(key, 60 * 60 * 6)
      .exec();
  }

  async trackEvent(params: {
    orderId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorType?: string | null;
    actorId?: string | null;
    reason?: string | null;
    traceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const traceId = params.traceId ?? randomUUID();
    await this.eventsRepo.save(
      this.eventsRepo.create({
        orderId: params.orderId,
        eventType: params.eventType,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus ?? null,
        actorType: params.actorType ?? null,
        actorId: params.actorId ?? null,
        reason: params.reason ?? null,
        traceId,
        metadata: params.metadata ?? null,
      }),
    );
    return traceId;
  }

  async trackIncident(params: {
    orderId: string;
    incidentType: string;
    severity?: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    traceId?: string | null;
    context?: Record<string, unknown> | null;
  }) {
    const traceId = params.traceId ?? randomUUID();
    await this.incidentsRepo.save(
      this.incidentsRepo.create({
        orderId: params.orderId,
        incidentType: params.incidentType,
        severity: params.severity ?? 'WARN',
        message: params.message,
        traceId,
        context: params.context ?? null,
      }),
    );
    return traceId;
  }

  async getTimeline(orderId: string) {
    return this.eventsRepo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  async getIncidents(orderId: string) {
    return this.incidentsRepo.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async getMetricsSnapshot(windowMinutes = 60) {
    const now = new Date();
    const buckets: string[] = [];
    for (let i = 0; i < windowMinutes; i += 1) {
      const date = new Date(now.getTime() - i * 60_000);
      buckets.push(this.minuteBucket(date));
    }

    const result: Record<string, number> = {};
    for (const metric of this.metricNames) {
      let total = 0;
      for (const bucket of buckets) {
        const key = this.metricKey(metric, bucket);
        const value = await this.redis.get(key);
        total += Number.parseInt(value || '0', 10);
      }
      result[metric] = total;
    }

    return {
      windowMinutes,
      metrics: result,
    };
  }

  async getLatestSignalsForOrders(orderIds: string[]) {
    if (orderIds.length === 0) {
      return {};
    }

    const latestEventsRaw = await this.eventsRepo.query(
      `SELECT DISTINCT ON ("orderId")
         "orderId",
         "eventType",
         "createdAt"
       FROM order_events
       WHERE "orderId" = ANY($1::uuid[])
       ORDER BY "orderId", "createdAt" DESC`,
      [orderIds],
    );

    const latestIncidentsRaw = await this.incidentsRepo.query(
      `SELECT DISTINCT ON ("orderId")
         "orderId",
         "incidentType",
         severity,
         "createdAt"
       FROM order_incidents
       WHERE "orderId" = ANY($1::uuid[])
       ORDER BY "orderId", "createdAt" DESC`,
      [orderIds],
    );

    const result: Record<
      string,
      {
        latestEvent: { eventType: string; createdAt: string } | null;
        latestIncident: {
          incidentType: string;
          severity: 'INFO' | 'WARN' | 'ERROR';
          createdAt: string;
        } | null;
      }
    > = {};

    for (const orderId of orderIds) {
      result[orderId] = {
        latestEvent: null,
        latestIncident: null,
      };
    }

    for (const event of latestEventsRaw as Array<{
      orderId: string;
      eventType: string;
      createdAt: string;
    }>) {
      if (!result[event.orderId]) {
        continue;
      }
      result[event.orderId].latestEvent = {
        eventType: event.eventType,
        createdAt: new Date(event.createdAt).toISOString(),
      };
    }

    for (const incident of latestIncidentsRaw as Array<{
      orderId: string;
      incidentType: string;
      severity: 'INFO' | 'WARN' | 'ERROR';
      createdAt: string;
    }>) {
      if (!result[incident.orderId]) {
        continue;
      }
      result[incident.orderId].latestIncident = {
        incidentType: incident.incidentType,
        severity: incident.severity,
        createdAt: new Date(incident.createdAt).toISOString(),
      };
    }

    return result;
  }

  async getAdminAuditFeed(params?: {
    limit?: number;
    cursorCreatedAt?: string;
    kind?: 'ALL' | 'EVENT' | 'INCIDENT';
    orderId?: string;
  }) {
    const limit = params?.limit ?? 20;
    const cursorDate = params?.cursorCreatedAt
      ? new Date(params.cursorCreatedAt)
      : null;
    const kind = params?.kind ?? 'ALL';
    const orderId = params?.orderId;

    const eventQuery = this.eventsRepo
      .createQueryBuilder('event')
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(limit);

    const incidentQuery = this.incidentsRepo
      .createQueryBuilder('incident')
      .orderBy('incident.createdAt', 'DESC')
      .addOrderBy('incident.id', 'DESC')
      .take(limit);

    if (cursorDate) {
      eventQuery.andWhere('event.createdAt < :cursor', { cursor: cursorDate });
      incidentQuery.andWhere('incident.createdAt < :cursor', {
        cursor: cursorDate,
      });
    }

    if (orderId) {
      eventQuery.andWhere('event.orderId = :orderId', { orderId });
      incidentQuery.andWhere('incident.orderId = :orderId', { orderId });
    }

    const [events, incidents] = await Promise.all([
      kind === 'INCIDENT' ? Promise.resolve([]) : eventQuery.getMany(),
      kind === 'EVENT' ? Promise.resolve([]) : incidentQuery.getMany(),
    ]);

    const items: AdminAuditFeedItem[] = [
      ...events.map((event) => ({
        kind: 'EVENT' as const,
        id: event.id,
        orderId: event.orderId,
        eventType: event.eventType,
        actorType: event.actorType,
        actorId: event.actorId,
        reason: event.reason,
        traceId: event.traceId,
        createdAt: event.createdAt.toISOString(),
      })),
      ...incidents.map((incident) => ({
        kind: 'INCIDENT' as const,
        id: incident.id,
        orderId: incident.orderId,
        incidentType: incident.incidentType,
        severity: incident.severity,
        message: incident.message,
        traceId: incident.traceId,
        createdAt: incident.createdAt.toISOString(),
      })),
    ];

    items.sort((a, b) => {
      const diff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (diff !== 0) {
        return diff;
      }
      return b.id.localeCompare(a.id);
    });

    const paged = items.slice(0, limit);
    const last = paged[paged.length - 1];

    return {
      items: paged,
      limit,
      nextCursorCreatedAt: last ? last.createdAt : null,
    };
  }

  async getAdminActionsHistory(params?: {
    limit?: number;
    cursorCreatedAt?: string;
    orderId?: string;
    adminUserId?: string;
  }) {
    const limit = params?.limit ?? 20;
    const cursorDate = params?.cursorCreatedAt
      ? new Date(params.cursorCreatedAt)
      : null;
    const orderId = params?.orderId;
    const adminUserId = params?.adminUserId;

    const eventQuery = this.eventsRepo
      .createQueryBuilder('event')
      .where('event.actorType = :actorType', { actorType: 'ADMIN_RUNBOOK' })
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(limit);

    const incidentQuery = this.incidentsRepo
      .createQueryBuilder('incident')
      .where(`incident.incidentType LIKE 'ADMIN_%'`)
      .orderBy('incident.createdAt', 'DESC')
      .addOrderBy('incident.id', 'DESC')
      .take(limit);

    if (cursorDate) {
      eventQuery.andWhere('event.createdAt < :cursor', { cursor: cursorDate });
      incidentQuery.andWhere('incident.createdAt < :cursor', {
        cursor: cursorDate,
      });
    }

    if (orderId) {
      eventQuery.andWhere('event.orderId = :orderId', { orderId });
      incidentQuery.andWhere('incident.orderId = :orderId', { orderId });
    }

    if (adminUserId) {
      eventQuery.andWhere('event.actorId = :adminUserId', { adminUserId });
      incidentQuery.andWhere(
        `incident.context->>'adminUserId' = :adminUserId`,
        {
          adminUserId,
        },
      );
    }

    const [events, incidents] = await Promise.all([
      eventQuery.getMany(),
      incidentQuery.getMany(),
    ]);

    const items: AdminActionHistoryItem[] = [
      ...events.map((event) => ({
        kind: 'EVENT' as const,
        id: event.id,
        orderId: event.orderId,
        actionType: event.eventType,
        adminUserId: event.actorId,
        reason: event.reason,
        traceId: event.traceId,
        createdAt: event.createdAt.toISOString(),
      })),
      ...incidents.map((incident) => ({
        kind: 'INCIDENT' as const,
        id: incident.id,
        orderId: incident.orderId,
        actionType: incident.incidentType,
        adminUserId:
          typeof incident.context?.adminUserId === 'string'
            ? incident.context.adminUserId
            : null,
        reason:
          typeof incident.context?.reason === 'string'
            ? incident.context.reason
            : null,
        severity: incident.severity,
        traceId: incident.traceId,
        createdAt: incident.createdAt.toISOString(),
      })),
    ];

    items.sort((a, b) => {
      const diff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (diff !== 0) {
        return diff;
      }
      return b.id.localeCompare(a.id);
    });

    const paged = items.slice(0, limit);
    const last = paged[paged.length - 1];

    return {
      items: paged,
      limit,
      nextCursorCreatedAt: last ? last.createdAt : null,
    };
  }

  async getOrderSignalFeedForOrders(params: {
    orderIds: string[];
    cursorCreatedAt?: string;
    limit?: number;
  }) {
    if (params.orderIds.length === 0) {
      return {
        events: [] as Array<{
          id: string;
          orderId: string;
          eventType: string;
          fromStatus: string | null;
          toStatus: string | null;
          actorType: string | null;
          actorId: string | null;
          reason: string | null;
          traceId: string | null;
          metadata: Record<string, unknown> | null;
          createdAt: string;
        }>,
        incidents: [] as Array<{
          id: string;
          orderId: string;
          incidentType: string;
          severity: 'INFO' | 'WARN' | 'ERROR';
          message: string;
          traceId: string | null;
          context: Record<string, unknown> | null;
          createdAt: string;
        }>,
      };
    }

    const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);
    const cursorDate = params.cursorCreatedAt
      ? new Date(params.cursorCreatedAt)
      : null;
    const events = await this.eventsRepo.find({
      where: cursorDate
        ? {
            orderId: In(params.orderIds),
            createdAt: MoreThan(cursorDate),
          }
        : { orderId: In(params.orderIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
    });
    const incidents = await this.incidentsRepo.find({
      where: cursorDate
        ? {
            orderId: In(params.orderIds),
            createdAt: MoreThan(cursorDate),
          }
        : { orderId: In(params.orderIds) },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: limit,
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        orderId: event.orderId,
        eventType: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorType: event.actorType,
        actorId: event.actorId,
        reason: event.reason,
        traceId: event.traceId,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      })),
      incidents: incidents.map((incident) => ({
        id: incident.id,
        orderId: incident.orderId,
        incidentType: incident.incidentType,
        severity: incident.severity,
        message: incident.message,
        traceId: incident.traceId,
        context: incident.context,
        createdAt: incident.createdAt.toISOString(),
      })),
    };
  }
}
