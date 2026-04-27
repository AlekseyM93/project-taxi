import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsWhere,
  In,
  LessThan,
  MoreThan,
  Not,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { DriverGateway } from '../realtime/driver.gateway';
import { PassengerGateway } from '../realtime/passenger.gateway';
import { PresenceService } from '../realtime/presence.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { DriversService } from '../drivers/drivers.service';
import { DriverProfileStatus } from '../drivers/driver-profile.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { OutboxService } from '../outbox/outbox.service';
import { AntifraudService } from '../antifraud/antifraud.service';
import { GeoService } from '../geo/geo.service';
import { PricingService } from '../pricing/pricing.service';
import { AdminPanelFilterEntity } from './admin-panel-filter.entity';
import { AdminActionExecutionEntity } from './admin-action-execution.entity';
import { OrderMobileCommandEntity } from './order-mobile-command.entity';
import { OrderEntity, OrderStatus } from './order.entity';
import { canRunOrderTransition } from './order-state-machine';
import { OrderObservabilityService } from './order-observability.service';
import {
  AdminActionExecutionsQueryDto,
  AdminActionType,
  AdminActionsHistoryQueryDto,
  AdminAuditFeedQueryDto,
  AdminDispatchControlTowerQueryDto,
  AdminDriverOpsQueryDto,
  AdminOrdersPanelQueryDto,
  AdminSavedFilterQueryDto,
  ConfirmPassengerOrderDto,
  CreateOrderDto,
  CreatePassengerDisputeDto,
  DriverOrderTimelineQueryDto,
  ExecuteAdminActionDto,
  ListMyOrdersQueryDto,
  MobileSyncPullQueryDto,
  MobileSyncPushDto,
  MobileSyncPushOperationDto,
  ORDER_HISTORY_DEFAULT_LIMIT,
  ORDER_HISTORY_MAX_LIMIT,
  OrderFilterStatus,
  PassengerFareEstimateDto,
  PASSENGER_SERVICE_LEVELS,
  PassengerOrderTimelineQueryDto,
  UpsertAdminSavedFilterDto,
} from './dto';

const ACTIVE_ORDER_STATUSES = [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS];

type OrderReadModel = {
  id: string;
  passengerId: string;
  driverId: string | null;
  cityCode: string;
  serviceLevel: string;
  status: string;
  price: string;
  from: { lat: number | null; lng: number | null };
  to: { lat: number | null; lng: number | null };
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrderHistoryResponse = {
  items: OrderReadModel[];
  limit: number;
  nextCursorCreatedAt: string | null;
};

type RequestUser = {
  sub: string;
  role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
};

type MobileOperationExecutionResult = {
  orderId: string | null;
  result: Record<string, unknown>;
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
    @InjectRepository(AdminPanelFilterEntity)
    private readonly adminFilterRepo: Repository<AdminPanelFilterEntity>,
    @InjectRepository(AdminActionExecutionEntity)
    private readonly adminActionExecutionRepo: Repository<AdminActionExecutionEntity>,
    @InjectRepository(OrderMobileCommandEntity)
    private readonly mobileCommandRepo: Repository<OrderMobileCommandEntity>,
    private readonly presence: PresenceService,
    @Inject(forwardRef(() => DriverGateway))
    private readonly gateway: DriverGateway,
    @Inject(forwardRef(() => PassengerGateway))
    private readonly passengerGateway: PassengerGateway,
    @Inject(forwardRef(() => DispatchService))
    private readonly dispatchService: DispatchService,
    private readonly driversService: DriversService,
    private readonly observability: OrderObservabilityService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly outbox: OutboxService,
    private readonly antifraud: AntifraudService,
    private readonly pricing: PricingService,
    private readonly geo: GeoService,
  ) {}

  private normalizeStatus(status: OrderStatus): string {
    return status === OrderStatus.NEW ? 'SEARCHING' : status;
  }

  private extractLatLng(point: { coordinates?: number[] } | null | undefined) {
    if (!point?.coordinates || point.coordinates.length < 2) {
      return { lat: null, lng: null };
    }

    const [lng, lat] = point.coordinates;
    return {
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
    };
  }

  private hasValidLatLng(point: {
    lat: number | null;
    lng: number | null;
  }): point is { lat: number; lng: number } {
    return typeof point.lat === 'number' && typeof point.lng === 'number';
  }

  async trackDriverLocationAckMetric(params: {
    ok: boolean;
    reason?: string | null;
  }) {
    if (params.ok) {
      await this.observability.trackMetric('driver_location_ack_ok');
      return;
    }

    await this.observability.trackMetric('driver_location_ack_fail');
    const reason = String(params.reason ?? '')
      .trim()
      .toUpperCase();

    if (reason === 'INVALID_COORDINATES') {
      await this.observability.trackMetric('driver_location_ack_invalid_coordinates');
      return;
    }
    if (reason === 'DUPLICATE_OR_LATE_UPDATE') {
      await this.observability.trackMetric('driver_location_ack_duplicate_or_late');
      return;
    }
    if (reason === 'DRIVER_PROFILE_NOT_FOUND') {
      await this.observability.trackMetric(
        'driver_location_ack_driver_profile_not_found',
      );
      return;
    }
    if (reason === 'UNAUTHORIZED') {
      await this.observability.trackMetric('driver_location_ack_unauthorized');
      return;
    }

    await this.observability.trackMetric('driver_location_ack_internal_error');
  }

  private async calculatePassengerFareEstimate(dto: PassengerFareEstimateDto) {
    const routeEstimate = this.geo.estimateRoute({
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
    });
    const roundedDistanceKm = routeEstimate.distanceKm;
    const estimatedDurationMin = routeEstimate.estimatedDurationMin;

    const serviceLevel = dto.serviceLevel ?? 'ECONOMY';
    const breakdown = await this.pricing.calculatePrice({
      cityCode: dto.cityCode,
      serviceLevel,
      routeKm: roundedDistanceKm,
      routeMinutes: estimatedDurationMin,
      waitingSeconds: dto.waitingSeconds,
      isAirportRoute: dto.isAirportRoute,
      withChildSeat: dto.withChildSeat,
      withPet: dto.withPet,
      extraStopsCount: dto.extraStopsCount,
      outOfCityKm: dto.outOfCityKm,
      requestedSurgeMultiplier: dto.requestedSurgeMultiplier,
    });

    return {
      serviceLevel,
      distanceKm: roundedDistanceKm,
      estimatedDurationMin,
      pricing: breakdown,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      estimateId: `fare_${Date.now().toString(36)}`,
      cityCode: breakdown.cityId,
      routeProvider: routeEstimate.provider,
    };
  }

  private toOrderReadModel(order: OrderEntity): OrderReadModel {
    return {
      id: order.id,
      passengerId: order.passengerId,
      driverId: order.driverId,
      cityCode: order.cityCode,
      serviceLevel: order.serviceLevel,
      status: this.normalizeStatus(order.status),
      price: order.price,
      from: this.extractLatLng(order.fromLocation),
      to: this.extractLatLng(order.toLocation),
      acceptedAt: order.acceptedAt ? order.acceptedAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private async trackStatusChange(params: {
    orderId: string;
    eventType: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus | null;
    actorType?: string | null;
    actorId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
    metric?: Parameters<OrderObservabilityService['trackMetric']>[0];
  }) {
    await this.observability.trackEvent({
      orderId: params.orderId,
      eventType: params.eventType,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      actorType: params.actorType ?? null,
      actorId: params.actorId ?? null,
      reason: params.reason ?? null,
      metadata: params.metadata ?? null,
    });

    if (params.metric) {
      await this.observability.trackMetric(params.metric);
    }
  }

  private async enqueueLifecycleOutbox(params: {
    orderId: string;
    eventType: string;
    actorId: string | null;
    actorType: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.outbox.enqueue({
      topic: 'order.lifecycle',
      eventType: params.eventType,
      aggregateType: 'ORDER',
      aggregateId: params.orderId,
      payload: {
        orderId: params.orderId,
        actorId: params.actorId,
        actorType: params.actorType,
        metadata: params.metadata ?? {},
        emittedAt: new Date().toISOString(),
      },
    });
  }

  private resolveLimit(limit?: number): number {
    if (!limit) {
      return ORDER_HISTORY_DEFAULT_LIMIT;
    }
    return Math.min(Math.max(limit, 1), ORDER_HISTORY_MAX_LIMIT);
  }

  private mapFilterStatus(status: OrderFilterStatus): OrderStatus {
    if (status === 'SEARCHING' || status === 'NEW') {
      return OrderStatus.NEW;
    }
    return status as OrderStatus;
  }

  private toOrderStatusFilter(statuses?: OrderFilterStatus[]): OrderStatus[] {
    if (!statuses || statuses.length === 0) {
      return [];
    }

    return Array.from(
      new Set(statuses.map((status) => this.mapFilterStatus(status))),
    );
  }

  private buildHistoryWhere(params: {
    scope: 'passenger' | 'driver';
    id: string;
    statuses?: OrderFilterStatus[];
    cursorCreatedAt?: string;
  }): FindOptionsWhere<OrderEntity> {
    const where: FindOptionsWhere<OrderEntity> = {};
    where[params.scope === 'passenger' ? 'passengerId' : 'driverId'] =
      params.id;

    const statuses = this.toOrderStatusFilter(params.statuses);
    if (statuses.length > 0) {
      where.status = In(statuses);
    }

    if (params.cursorCreatedAt) {
      where.createdAt = LessThan(new Date(params.cursorCreatedAt));
    }

    return where;
  }

  private emitPassengerStatus(order: OrderEntity) {
    this.passengerGateway.emitToPassenger(order.passengerId, 'order.status', {
      orderId: order.id,
      status: this.normalizeStatus(order.status),
      driverId: order.driverId,
    });
  }

  private emitDriverSnapshot(
    order: OrderEntity,
    options?: {
      driverId?: string | null;
      location?: unknown;
    },
  ) {
    const driverId =
      options?.driverId !== undefined ? options.driverId : order.driverId;
    const location = options?.location !== undefined ? options.location : null;

    this.passengerGateway.emitToOrder(order.id, 'order.driver.snapshot', {
      orderId: order.id,
      status: this.normalizeStatus(order.status),
      driverId,
      location,
    });
  }

  private async emitOrderSnapshotIfTrackingActive(order: OrderEntity) {
    if (
      order.driverId &&
      [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(order.status)
    ) {
      await this.passengerGateway.emitDriverSnapshot(order);
      return;
    }

    this.emitDriverSnapshot(order, {
      driverId: order.driverId ?? null,
      location: null,
    });
  }

  private parseSyncExecutionError(error: unknown) {
    const message =
      error instanceof Error ? error.message : 'SYNC_OPERATION_FAILED';
    const invalidStatusMatch = message.match(/INVALID_STATUS:([A-Z_]+)/);
    if (invalidStatusMatch) {
      return {
        errorCode: 'STATE_CONFLICT',
        errorMessage: message,
        conflict: {
          type: 'ORDER_STATE',
          serverStatus: invalidStatusMatch[1],
          policy: 'STATE_MACHINE_SERVER_PRIORITY',
        },
      };
    }
    if (message.includes('ORDER_NOT_FOUND')) {
      return {
        errorCode: 'ORDER_NOT_FOUND',
        errorMessage: message,
        conflict: null,
      };
    }
    if (message.includes('NOT_ASSIGNED_TO_THIS_DRIVER')) {
      return {
        errorCode: 'DRIVER_ASSIGNMENT_CONFLICT',
        errorMessage: message,
        conflict: {
          type: 'DRIVER_ASSIGNMENT',
          policy: 'STATE_MACHINE_SERVER_PRIORITY',
        },
      };
    }
    if (message.includes('DRIVER_ALREADY_HAS_ACTIVE_ORDER')) {
      return {
        errorCode: 'DRIVER_ACTIVE_ORDER_CONFLICT',
        errorMessage: message,
        conflict: {
          type: 'DRIVER_ACTIVE_ORDER',
          policy: 'STATE_MACHINE_SERVER_PRIORITY',
        },
      };
    }
    if (message.includes('FORBIDDEN')) {
      return {
        errorCode: 'FORBIDDEN',
        errorMessage: message,
        conflict: null,
      };
    }
    return {
      errorCode: 'SYNC_OPERATION_FAILED',
      errorMessage: message,
      conflict: null,
    };
  }

  private isUniqueMobileCommandConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const code =
      typeof (error as { driverError?: { code?: unknown } }).driverError
        ?.code === 'string'
        ? (error as { driverError?: { code?: string } }).driverError?.code
        : null;
    return code === '23505';
  }

  private isLocationPointLateOrDuplicate(params: {
    incomingSequence?: number;
    incomingClientTs?: string;
    latestSequence?: number;
    latestClientTs?: string;
  }) {
    if (
      typeof params.incomingSequence === 'number' &&
      Number.isFinite(params.incomingSequence) &&
      typeof params.latestSequence === 'number' &&
      Number.isFinite(params.latestSequence) &&
      params.incomingSequence <= params.latestSequence
    ) {
      return true;
    }
    if (
      params.incomingClientTs &&
      params.latestClientTs &&
      !Number.isNaN(Date.parse(params.incomingClientTs)) &&
      !Number.isNaN(Date.parse(params.latestClientTs))
    ) {
      return (
        Date.parse(params.incomingClientTs) <= Date.parse(params.latestClientTs)
      );
    }
    return false;
  }

  private async executeMobileOperation(params: {
    user: RequestUser;
    operation: MobileSyncPushOperationDto;
    driverIdCache: { value: string | null };
  }): Promise<MobileOperationExecutionResult> {
    const { user, operation, driverIdCache } = params;
    const payload = operation.payload ?? {};
    const operationType = operation.operationType;

    if (operationType === 'PASSENGER_CREATE_ORDER') {
      if (user.role !== 'PASSENGER') {
        throw new ForbiddenException('FORBIDDEN');
      }
      const createDto: CreateOrderDto = {
        fromLat: Number(payload.fromLat),
        fromLng: Number(payload.fromLng),
        toLat: Number(payload.toLat),
        toLng: Number(payload.toLng),
        waitingSeconds:
          typeof payload.waitingSeconds === 'number'
            ? payload.waitingSeconds
            : undefined,
        isAirportRoute: payload.isAirportRoute === true,
        withChildSeat: payload.withChildSeat === true,
        withPet: payload.withPet === true,
        extraStopsCount:
          typeof payload.extraStopsCount === 'number'
            ? payload.extraStopsCount
            : undefined,
        outOfCityKm:
          typeof payload.outOfCityKm === 'number'
            ? payload.outOfCityKm
            : undefined,
        requestedSurgeMultiplier:
          typeof payload.requestedSurgeMultiplier === 'number'
            ? payload.requestedSurgeMultiplier
            : undefined,
        serviceLevel:
          typeof payload.serviceLevel === 'string' &&
          PASSENGER_SERVICE_LEVELS.includes(
            payload.serviceLevel.trim().toUpperCase() as
              | 'ECONOMY'
              | 'COMFORT'
              | 'BUSINESS',
          )
            ? (payload.serviceLevel.trim().toUpperCase() as
                | 'ECONOMY'
                | 'COMFORT'
                | 'BUSINESS')
            : undefined,
        cityCode:
          typeof payload.cityCode === 'string' &&
          payload.cityCode.trim().length > 0
            ? payload.cityCode.trim().toUpperCase()
            : undefined,
      };
      if (
        !Number.isFinite(createDto.fromLat) ||
        !Number.isFinite(createDto.fromLng) ||
        !Number.isFinite(createDto.toLat) ||
        !Number.isFinite(createDto.toLng)
      ) {
        throw new BadRequestException('INVALID_CREATE_ORDER_PAYLOAD');
      }

      const created = await this.createOrder(user.sub, createDto);
      const dispatch = await this.dispatchService.createQueueAndDispatch({
        orderId: created.orderId,
        fromLat: createDto.fromLat,
        fromLng: createDto.fromLng,
        toLat: createDto.toLat,
        toLng: createDto.toLng,
        price: String(created.price),
      });
      return {
        orderId: created.orderId,
        result: {
          orderId: created.orderId,
          status: created.status,
          dispatch,
        },
      };
    }

    if (operationType === 'PASSENGER_CANCEL_ORDER') {
      if (user.role !== 'PASSENGER') {
        throw new ForbiddenException('FORBIDDEN');
      }
      const orderId = String(payload.orderId || '');
      if (!orderId) {
        throw new BadRequestException('ORDER_ID_REQUIRED');
      }
      const result = await this.cancelOrderByPassenger(user.sub, orderId);
      return {
        orderId,
        result: result as Record<string, unknown>,
      };
    }

    if (user.role !== 'DRIVER') {
      throw new ForbiddenException('FORBIDDEN');
    }
    if (!driverIdCache.value) {
      driverIdCache.value = await this.getDriverProfileIdOrThrow(user.sub);
    }
    const driverId = driverIdCache.value;
    if (operationType === 'DRIVER_LOCATION_BATCH') {
      const points = Array.isArray(payload.points)
        ? (payload.points as Array<Record<string, unknown>>)
        : [];
      if (points.length === 0) {
        throw new BadRequestException('LOCATION_BATCH_EMPTY');
      }
      const accepted: Array<{
        sequence: number | null;
        clientTs: string | null;
      }> = [];
      const rejected: Array<{
        sequence: number | null;
        clientTs: string | null;
        reason: string;
      }> = [];
      let latestLocation = await this.presence.getDriverLocation(driverId);

      for (const point of points) {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        const sequence =
          typeof point.sequence === 'number' && Number.isFinite(point.sequence)
            ? point.sequence
            : null;
        const clientTs =
          typeof point.clientTs === 'string' && point.clientTs.trim().length > 0
            ? point.clientTs
            : null;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          rejected.push({
            sequence,
            clientTs,
            reason: 'INVALID_COORDINATES',
          });
          continue;
        }

        const lateOrDuplicate = this.isLocationPointLateOrDuplicate({
          incomingSequence: sequence ?? undefined,
          incomingClientTs: clientTs ?? undefined,
          latestSequence:
            typeof latestLocation?.sequence === 'number'
              ? latestLocation.sequence
              : undefined,
          latestClientTs: latestLocation?.clientTs ?? latestLocation?.updatedAt,
        });
        if (lateOrDuplicate) {
          rejected.push({
            sequence,
            clientTs,
            reason: 'DUPLICATE_OR_LATE_UPDATE',
          });
          continue;
        }

        await this.presence.updateDriverLocation(driverId, {
          lat,
          lng,
          heading:
            typeof point.heading === 'number' && Number.isFinite(point.heading)
              ? point.heading
              : undefined,
          speed:
            typeof point.speed === 'number' && Number.isFinite(point.speed)
              ? point.speed
              : undefined,
          accuracy:
            typeof point.accuracy === 'number' &&
            Number.isFinite(point.accuracy)
              ? point.accuracy
              : undefined,
          isMock: point.isMock === true,
          offlineBuffered: point.offlineBuffered === true,
          sequence: sequence ?? undefined,
          clientTs: clientTs ?? undefined,
          source: 'BATCH',
        });
        latestLocation = await this.presence.getDriverLocation(driverId);

        const activeOrder = await this.findActiveOrderByDriver(driverId);
        if (
          activeOrder &&
          [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(
            activeOrder.status,
          )
        ) {
          const location = await this.presence.getDriverLocation(driverId);
          if (location) {
            this.passengerGateway.emitDriverLocation(activeOrder.id, {
              orderId: activeOrder.id,
              driverId,
              ...location,
            });
          }
        }

        accepted.push({
          sequence,
          clientTs,
        });
      }

      await this.reconcileDriverAvailability(driverId);

      return {
        orderId: null,
        result: {
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
          accepted,
          rejected,
        },
      };
    }

    const orderId = String(payload.orderId || '');
    if (!orderId) {
      throw new BadRequestException('ORDER_ID_REQUIRED');
    }

    if (operationType === 'DRIVER_ACCEPT_ORDER') {
      const ack = await this.dispatchService.acceptBroadcastOffer(
        orderId,
        driverId,
      );
      if (!ack.ok) {
        throw new BadRequestException(ack.reason);
      }
      return {
        orderId,
        result: ack as Record<string, unknown>,
      };
    }
    if (operationType === 'DRIVER_START_ORDER') {
      const ack = await this.startOrder(driverId, orderId);
      return {
        orderId,
        result: ack as Record<string, unknown>,
      };
    }
    if (operationType === 'DRIVER_FINISH_ORDER') {
      const ack = await this.finishOrder(driverId, orderId);
      return {
        orderId,
        result: ack as Record<string, unknown>,
      };
    }
    if (operationType === 'DRIVER_CANCEL_ORDER') {
      const ack = await this.cancelOrder(driverId, orderId);
      if (!ack.ok) {
        throw new BadRequestException(ack.reason);
      }
      return {
        orderId,
        result: ack as Record<string, unknown>,
      };
    }

    throw new BadRequestException('SYNC_OPERATION_NOT_SUPPORTED');
  }

  async getReadyDriverIdsForDispatch(): Promise<string[]> {
    return this.presence.getReadyDrivers();
  }

  private getRunbookHints(params: {
    isOnline: boolean;
    state: 'OFFLINE' | 'READY' | 'BUSY';
    hasActiveOrder: boolean;
    hasRisk: boolean;
    riskCodes: string[];
    driverId: string;
  }) {
    const hints: Array<{ action: string; reason: string }> = [];

    if (params.riskCodes.includes('BUSY_WITHOUT_ACTIVE_ORDER')) {
      hints.push({
        action: `POST /orders/admin/actions/driver/${params.driverId}/reconcile`,
        reason: 'Driver is BUSY but has no active order',
      });
    }

    if (params.riskCodes.includes('READY_WITH_ACTIVE_ORDER')) {
      hints.push({
        action: `POST /orders/admin/actions/driver/${params.driverId}/reconcile`,
        reason: 'Driver is READY but has active order',
      });
    }

    if (params.riskCodes.includes('LOCATION_STALE')) {
      hints.push({
        action: 'Ask driver app to refresh location heartbeat',
        reason: 'Driver location update is stale',
      });
    }

    if (!params.isOnline && params.hasActiveOrder) {
      hints.push({
        action: `POST /orders/admin/actions/driver/${params.driverId}/reconcile`,
        reason: 'Driver is offline while active order exists',
      });
    }

    if (!params.hasRisk && params.state === 'OFFLINE') {
      hints.push({
        action: 'No action required',
        reason: 'Driver is offline without active order',
      });
    }

    return hints;
  }

  private async findActiveOrdersByDriverIds(driverIds: string[]) {
    if (driverIds.length === 0) {
      return {} as Record<string, OrderEntity>;
    }

    const rows = await this.repo.find({
      where: [
        {
          driverId: In(driverIds),
          status: OrderStatus.ASSIGNED,
        },
        {
          driverId: In(driverIds),
          status: OrderStatus.IN_PROGRESS,
        },
      ],
      order: { createdAt: 'DESC' },
    });

    const map: Record<string, OrderEntity> = {};
    for (const row of rows) {
      if (!row.driverId) {
        continue;
      }
      if (!map[row.driverId]) {
        map[row.driverId] = row;
      }
    }
    return map;
  }

  async createOrder(passengerId: string, dto: CreateOrderDto) {
    const estimate = await this.calculatePassengerFareEstimate(dto);
    const finalPrice = estimate.pricing.totalPriceRub;

    const risk = this.antifraud.evaluateCreateOrderRisk({
      passengerId,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
      price: finalPrice,
    });
    if (risk.decision === 'REJECT') {
      throw new BadRequestException(`RISK_REJECTED:${risk.reasons.join(',')}`);
    }

    const order = this.repo.create({
      passengerId,
      driverId: null,
      status: OrderStatus.NEW,
      cityCode: estimate.cityCode,
      serviceLevel: estimate.serviceLevel,
      price: finalPrice.toFixed(2),
      pricingBreakdown: estimate.pricing,
      fromLocation: {
        type: 'Point',
        coordinates: [dto.fromLng, dto.fromLat],
      },
      toLocation: {
        type: 'Point',
        coordinates: [dto.toLng, dto.toLat],
      },
      acceptedAt: null,
    });

    const saved = await this.repo.save(order);
    const payment = await this.payments.authorizeOrderPayment({
      orderId: saved.id,
      passengerId,
      amountRub: saved.price,
      metadata: {
        source: 'ORDER_CREATE',
      },
    });

    this.emitPassengerStatus(saved);
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_CREATED',
      fromStatus: null,
      toStatus: saved.status,
      actorType: 'PASSENGER',
      actorId: passengerId,
      metric: 'orders_created',
    });
    await this.notifications.publish(
      passengerId,
      'PASSENGER_ORDER_STATUS_CHANGED',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        stage: 'SEARCHING',
      },
    );
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_CREATED',
      actorId: passengerId,
      actorType: 'PASSENGER',
      metadata: {
        paymentId: payment.id,
        paymentStatus: payment.status,
        riskTraceId: risk.traceId,
      },
    });

    return {
      orderId: saved.id,
      assigned: false,
      status: this.normalizeStatus(saved.status),
      cityCode: saved.cityCode,
      serviceLevel: saved.serviceLevel,
      price: saved.price,
      fare: estimate.pricing,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
    };
  }

  async getPassengerFareEstimate(
    passengerId: string,
    dto: PassengerFareEstimateDto,
  ) {
    const estimate = await this.calculatePassengerFareEstimate(dto);
    await this.observability.trackEvent({
      orderId: '00000000-0000-0000-0000-000000000000',
      eventType: 'PASSENGER_FARE_ESTIMATE_REQUESTED',
      actorType: 'PASSENGER',
      actorId: passengerId,
      metadata: {
        fromLat: dto.fromLat,
        fromLng: dto.fromLng,
        toLat: dto.toLat,
        toLng: dto.toLng,
        serviceLevel: estimate.serviceLevel,
        estimateId: estimate.estimateId,
      },
    });
    return estimate;
  }

  async confirmPassengerOrder(
    passengerId: string,
    dto: ConfirmPassengerOrderDto,
  ) {
    const created = await this.createOrder(passengerId, {
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
      serviceLevel: dto.serviceLevel,
      cityCode: dto.cityCode,
      waitingSeconds: dto.waitingSeconds,
      isAirportRoute: dto.isAirportRoute,
      withChildSeat: dto.withChildSeat,
      withPet: dto.withPet,
      extraStopsCount: dto.extraStopsCount,
      outOfCityKm: dto.outOfCityKm,
      requestedSurgeMultiplier: dto.requestedSurgeMultiplier,
    });

    const dispatchResult = await this.dispatchService.createQueueAndDispatch({
      orderId: created.orderId,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
      price: String(created.price),
    });

    return {
      orderId: created.orderId,
      status: created.status,
      stage: 'CONFIRMED',
      fare: created.fare,
      route: {
        distanceKm:
          (created.fare as Record<string, unknown>)?.meta &&
          typeof (created.fare as Record<string, unknown>).meta === 'object'
            ? Number(
                (
                  (created.fare as Record<string, unknown>).meta as Record<
                    string,
                    unknown
                  >
                ).routeKm ?? 0,
              )
            : null,
        estimatedDurationMin:
          (created.fare as Record<string, unknown>)?.meta &&
          typeof (created.fare as Record<string, unknown>).meta === 'object'
            ? Number(
                (
                  (created.fare as Record<string, unknown>).meta as Record<
                    string,
                    unknown
                  >
                ).routeMinutes ?? 0,
              )
            : null,
      },
      dispatch: dispatchResult,
    };
  }

  async assignDriverToOrder(orderId: string, driverId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      return null;
    }

    if (!canRunOrderTransition('SYSTEM_ASSIGN_DRIVER', order.status)) {
      return null;
    }

    const driverProfile =
      await this.driversService.getDriverProfileById(driverId);
    const orderCityCode = order.cityCode ?? 'DEFAULT';
    const driverCityCode = driverProfile.cityCode ?? 'DEFAULT';
    if (orderCityCode !== driverCityCode) {
      return null;
    }

    if (order.driverId) {
      return null;
    }

    const anotherActive = await this.repo.findOne({
      where: {
        driverId,
        id: Not(orderId),
      },
      order: { createdAt: 'DESC' },
    });

    if (
      anotherActive &&
      [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(
        anotherActive.status,
      )
    ) {
      return null;
    }

    const previousStatus = order.status;
    order.driverId = driverId;
    order.status = OrderStatus.ASSIGNED;
    order.acceptedAt = new Date();

    const saved = await this.repo.save(order);

    await this.reconcileDriverAvailability(driverId);

    this.emitPassengerStatus(saved);
    await this.emitOrderSnapshotIfTrackingActive(saved);
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_ASSIGNED',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'SYSTEM_DISPATCH',
      actorId: driverId,
      metric: 'orders_assigned',
    });
    await this.notifications.publish(
      saved.passengerId,
      'PASSENGER_ORDER_STATUS_CHANGED',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        driverId: saved.driverId,
        stage: 'ASSIGNED',
      },
    );
    if (saved.driverId) {
      await this.notifications.publish(
        saved.driverId,
        'DRIVER_ORDER_STATUS_CHANGED',
        {
          orderId: saved.id,
          status: this.normalizeStatus(saved.status),
          stage: 'ASSIGNED',
        },
      );
    }
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_ASSIGNED',
      actorId: driverId,
      actorType: 'SYSTEM_DISPATCH',
    });

    return saved;
  }

  async markNoDriversFound(orderId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      return null;
    }

    if (order.driverId) {
      return order;
    }

    if (!canRunOrderTransition('SYSTEM_NO_DRIVERS_FOUND', order.status)) {
      return order;
    }

    const previousStatus = order.status;
    order.status = OrderStatus.NO_DRIVERS_FOUND;
    const saved = await this.repo.save(order);

    await this.dispatchService.clearDispatchState(orderId);

    this.emitPassengerStatus(saved);
    this.emitDriverSnapshot(saved, {
      driverId: null,
      location: null,
    });
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_NO_DRIVERS_FOUND',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'SYSTEM_DISPATCH',
      reason: 'NO_AVAILABLE_DRIVERS',
      metric: 'orders_no_drivers',
    });
    await this.notifications.publish(
      saved.passengerId,
      'PASSENGER_ORDER_STATUS_CHANGED',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        stage: 'NO_DRIVERS_FOUND',
      },
    );
    await this.payments.voidOrderPayment(saved.id, 'NO_DRIVERS_FOUND');
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_NO_DRIVERS_FOUND',
      actorId: null,
      actorType: 'SYSTEM_DISPATCH',
    });

    return saved;
  }

  async acceptOrder(driverId: string, orderId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      return { ok: false, reason: 'ORDER_NOT_FOUND' as const };
    }

    if (order.driverId !== driverId) {
      return { ok: false, reason: 'NOT_ASSIGNED_TO_THIS_DRIVER' as const };
    }

    if (!canRunOrderTransition('DRIVER_DECLINE', order.status)) {
      return {
        ok: false,
        reason: 'INVALID_STATUS' as const,
        status: order.status,
      };
    }

    const anotherActive = await this.repo.findOne({
      where: {
        driverId,
        id: Not(orderId),
      },
      order: { createdAt: 'DESC' },
    });

    if (
      anotherActive &&
      [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(
        anotherActive.status,
      )
    ) {
      return { ok: false, reason: 'DRIVER_ALREADY_HAS_ACTIVE_ORDER' as const };
    }

    if (!order.acceptedAt) {
      order.acceptedAt = new Date();
      await this.repo.save(order);
    }

    await this.reconcileDriverAvailability(driverId);

    this.emitPassengerStatus(order);
    await this.emitOrderSnapshotIfTrackingActive(order);

    return { ok: true, passengerId: order.passengerId };
  }

  async declineOrder(driverId: string, orderId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      return { ok: false, reason: 'ORDER_NOT_FOUND' as const };
    }

    if (order.driverId !== driverId) {
      return { ok: false, reason: 'NOT_ASSIGNED_TO_THIS_DRIVER' as const };
    }

    if (order.status !== OrderStatus.ASSIGNED) {
      return {
        ok: false,
        reason: 'INVALID_STATUS' as const,
        status: order.status,
      };
    }

    const previousStatus = order.status;
    order.status = OrderStatus.NEW;
    order.driverId = null;
    order.acceptedAt = null;

    const saved = await this.repo.save(order);

    await this.reconcileDriverAvailability(driverId);

    this.emitPassengerStatus(saved);
    this.emitDriverSnapshot(saved, {
      driverId: null,
      location: null,
    });
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_DECLINED_BY_DRIVER',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'DRIVER',
      actorId: driverId,
    });
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_DECLINED_BY_DRIVER',
      actorId: driverId,
      actorType: 'DRIVER',
    });

    return { ok: true, passengerId: saved.passengerId };
  }

  async startOrder(driverId: string, orderId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }

    if (order.driverId !== driverId) {
      throw new ForbiddenException('NOT_ASSIGNED_TO_THIS_DRIVER');
    }

    if (!canRunOrderTransition('DRIVER_START', order.status)) {
      throw new BadRequestException(`INVALID_STATUS:${order.status}`);
    }

    const previousStatus = order.status;
    order.status = OrderStatus.IN_PROGRESS;
    const saved = await this.repo.save(order);

    await this.reconcileDriverAvailability(driverId);

    this.emitPassengerStatus(saved);
    await this.emitOrderSnapshotIfTrackingActive(saved);
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_STARTED',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'DRIVER',
      actorId: driverId,
      metric: 'orders_started',
    });
    await this.notifications.publish(
      saved.passengerId,
      'PASSENGER_ORDER_STATUS_CHANGED',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        stage: 'TRIP_STARTED',
      },
    );
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_STARTED',
      actorId: driverId,
      actorType: 'DRIVER',
    });

    return { ok: true, passengerId: saved.passengerId };
  }

  async finishOrder(driverId: string, orderId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }

    if (order.driverId !== driverId) {
      throw new ForbiddenException('NOT_ASSIGNED_TO_THIS_DRIVER');
    }

    if (!canRunOrderTransition('DRIVER_FINISH', order.status)) {
      throw new BadRequestException(`INVALID_STATUS:${order.status}`);
    }

    const previousStatus = order.status;
    order.status = OrderStatus.DONE;
    const saved = await this.repo.save(order);

    await this.dispatchService.clearDispatchState(orderId);
    await this.reconcileDriverAvailability(driverId);
    await this.driversService.recordTripEarning({
      driverId,
      orderId: saved.id,
      amountRub: Number(saved.price),
      metadata: {
        source: 'ORDER_FINISH',
      },
    });

    this.emitPassengerStatus(saved);
    this.emitDriverSnapshot(saved, {
      driverId: saved.driverId,
      location: null,
    });
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_FINISHED',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'DRIVER',
      actorId: driverId,
      metric: 'orders_finished',
    });
    await this.notifications.publish(
      saved.passengerId,
      'PASSENGER_ORDER_STATUS_CHANGED',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        stage: 'RECEIPT_READY',
      },
    );
    await this.notifications.publish(
      saved.passengerId,
      'PASSENGER_RECEIPT_READY',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        amount: saved.price,
      },
    );
    await this.payments.captureOrderPayment(saved.id);
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_FINISHED',
      actorId: driverId,
      actorType: 'DRIVER',
      metadata: {
        amountRub: saved.price,
      },
    });

    return { ok: true, passengerId: saved.passengerId };
  }

  async cancelOrder(driverId: string, orderId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      return { ok: false, reason: 'ORDER_NOT_FOUND' as const };
    }

    if (order.driverId !== driverId) {
      return { ok: false, reason: 'NOT_ASSIGNED_TO_THIS_DRIVER' as const };
    }

    if (!canRunOrderTransition('DRIVER_CANCEL', order.status)) {
      return {
        ok: false,
        reason: 'INVALID_STATUS' as const,
        status: order.status,
      };
    }

    const previousStatus = order.status;
    order.status = OrderStatus.CANCELLED;
    const saved = await this.repo.save(order);

    await this.dispatchService.clearDispatchState(orderId);
    await this.reconcileDriverAvailability(driverId);

    this.emitPassengerStatus(saved);
    this.emitDriverSnapshot(saved, {
      driverId: saved.driverId,
      location: null,
    });

    this.gateway.emitToDriver(driverId, 'order.cancelled', {
      orderId: saved.id,
    });
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_CANCELLED_BY_DRIVER',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'DRIVER',
      actorId: driverId,
      metric: 'orders_cancelled',
    });
    await this.notifications.publish(
      saved.passengerId,
      'PASSENGER_ORDER_STATUS_CHANGED',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        stage: 'CANCELLED_BY_DRIVER',
      },
    );
    await this.payments.voidOrderPayment(saved.id, 'CANCELLED_BY_DRIVER');
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_CANCELLED_BY_DRIVER',
      actorId: driverId,
      actorType: 'DRIVER',
    });

    return { ok: true, passengerId: saved.passengerId };
  }

  async cancelOrderByPassenger(passengerId: string, orderId: string) {
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }

    if (order.passengerId !== passengerId) {
      throw new ForbiddenException('FORBIDDEN');
    }

    if ([OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException('ORDER_ALREADY_FINALIZED');
    }

    if (!canRunOrderTransition('PASSENGER_CANCEL', order.status)) {
      throw new BadRequestException(`INVALID_STATUS:${order.status}`);
    }

    const previousStatus = order.status;
    order.status = OrderStatus.CANCELLED;
    order.acceptedAt = null;

    const saved = await this.repo.save(order);

    await this.dispatchService.clearDispatchState(orderId);

    if (saved.driverId) {
      await this.reconcileDriverAvailability(saved.driverId);
    }

    this.emitPassengerStatus(saved);
    this.emitDriverSnapshot(saved, {
      driverId: saved.driverId,
      location: null,
    });

    if (saved.driverId) {
      this.gateway.emitToDriver(saved.driverId, 'order.cancelled', {
        orderId: saved.id,
      });
    }
    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_CANCELLED_BY_PASSENGER',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'PASSENGER',
      actorId: passengerId,
      metric: 'orders_cancelled',
    });
    await this.notifications.publish(
      saved.passengerId,
      'PASSENGER_ORDER_STATUS_CHANGED',
      {
        orderId: saved.id,
        status: this.normalizeStatus(saved.status),
        stage: 'CANCELLED_BY_PASSENGER',
      },
    );
    await this.payments.voidOrderPayment(saved.id, 'CANCELLED_BY_PASSENGER');
    await this.enqueueLifecycleOutbox({
      orderId: saved.id,
      eventType: 'ORDER_CANCELLED_BY_PASSENGER',
      actorId: passengerId,
      actorType: 'PASSENGER',
    });

    return {
      ok: true,
      orderId: saved.id,
      status: this.normalizeStatus(saved.status),
    };
  }

  private async getDriverProfileIdOrThrow(userId: string): Promise<string> {
    const profile = await this.driversService.getDriverProfileByUserId(userId);
    return profile.id;
  }

  async pullMobileSyncChanges(
    user: RequestUser,
    query: MobileSyncPullQueryDto,
  ) {
    if (!['PASSENGER', 'DRIVER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const cursorDate = query.cursorUpdatedAt
      ? new Date(query.cursorUpdatedAt)
      : null;
    const driverId =
      user.role === 'DRIVER'
        ? await this.getDriverProfileIdOrThrow(user.sub)
        : null;

    const where: FindOptionsWhere<OrderEntity> =
      user.role === 'PASSENGER'
        ? { passengerId: user.sub }
        : { driverId: driverId! };
    if (cursorDate) {
      where.updatedAt = MoreThan(cursorDate);
    }

    const rows = await this.repo.find({
      where,
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;
    const items = visibleRows.map((order) => this.toOrderReadModel(order));
    const last = visibleRows[visibleRows.length - 1];
    const orderIds = visibleRows.map((order) => order.id);
    const signals = await this.observability.getOrderSignalFeedForOrders({
      orderIds,
      cursorCreatedAt: query.cursorUpdatedAt,
      limit: 2000,
    });

    return {
      scope: user.role,
      cursorUpdatedAt: query.cursorUpdatedAt ?? null,
      nextCursorUpdatedAt: last ? last.updatedAt.toISOString() : null,
      limit,
      hasMore,
      items,
      signals,
      conflictPolicy: {
        orderLifecycle: 'STATE_MACHINE_SERVER_PRIORITY',
        transport: 'COMMAND_LEDGER_IDEMPOTENT_REPLAY',
      },
      serverTs: new Date().toISOString(),
    };
  }

  async pushMobileSyncCommands(user: RequestUser, dto: MobileSyncPushDto) {
    if (!['PASSENGER', 'DRIVER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const results: Array<Record<string, unknown>> = [];
    const driverIdCache: { value: string | null } = { value: null };

    for (const operation of dto.operations) {
      const existing = await this.mobileCommandRepo.findOne({
        where: {
          actorUserId: user.sub,
          deviceId: operation.deviceId,
          commandId: operation.commandId,
        },
      });

      if (existing) {
        results.push({
          commandId: existing.commandId,
          operationType: existing.operationType,
          status: existing.status,
          replayed: true,
          orderId: existing.orderId,
          errorCode: existing.errorCode,
          errorMessage: existing.errorMessage,
          result: existing.result,
          createdAt: existing.createdAt.toISOString(),
        });
        continue;
      }

      try {
        const executed = await this.executeMobileOperation({
          user,
          operation,
          driverIdCache,
        });
        const commandRow = this.mobileCommandRepo.create({
          actorUserId: user.sub,
          deviceId: operation.deviceId,
          commandId: operation.commandId,
          operationType: operation.operationType,
          status: 'APPLIED',
          orderId: executed.orderId,
          errorCode: null,
          errorMessage: null,
          payload: operation.payload,
          result: executed.result,
          clientTs: operation.clientTs ? new Date(operation.clientTs) : null,
        });
        const saved = await this.mobileCommandRepo.save(commandRow);
        results.push({
          commandId: operation.commandId,
          operationType: operation.operationType,
          status: 'APPLIED',
          replayed: false,
          orderId: executed.orderId,
          result: executed.result,
          createdAt: saved.createdAt.toISOString(),
        });
      } catch (error) {
        if (this.isUniqueMobileCommandConflict(error)) {
          const raced = await this.mobileCommandRepo.findOne({
            where: {
              actorUserId: user.sub,
              deviceId: operation.deviceId,
              commandId: operation.commandId,
            },
          });
          if (raced) {
            results.push({
              commandId: raced.commandId,
              operationType: raced.operationType,
              status: raced.status,
              replayed: true,
              orderId: raced.orderId,
              errorCode: raced.errorCode,
              errorMessage: raced.errorMessage,
              result: raced.result,
              createdAt: raced.createdAt.toISOString(),
            });
            continue;
          }
        }

        const parsed = this.parseSyncExecutionError(error);
        const commandRow = this.mobileCommandRepo.create({
          actorUserId: user.sub,
          deviceId: operation.deviceId,
          commandId: operation.commandId,
          operationType: operation.operationType,
          status: 'REJECTED',
          orderId:
            operation.payload &&
            typeof operation.payload.orderId === 'string' &&
            operation.payload.orderId.trim().length > 0
              ? operation.payload.orderId
              : null,
          errorCode: parsed.errorCode,
          errorMessage: parsed.errorMessage,
          payload: operation.payload,
          result: parsed.conflict ? { conflict: parsed.conflict } : null,
          clientTs: operation.clientTs ? new Date(operation.clientTs) : null,
        });
        const saved = await this.mobileCommandRepo.save(commandRow);
        results.push({
          commandId: operation.commandId,
          operationType: operation.operationType,
          status: 'REJECTED',
          replayed: false,
          orderId: commandRow.orderId,
          errorCode: parsed.errorCode,
          errorMessage: parsed.errorMessage,
          conflict: parsed.conflict,
          createdAt: saved.createdAt.toISOString(),
        });
      }
    }

    return {
      accepted: results.length,
      results,
      serverTs: new Date().toISOString(),
      conflictPolicy: {
        orderLifecycle: 'STATE_MACHINE_SERVER_PRIORITY',
        duplicateCommand: 'RETURN_STORED_RESULT',
      },
    };
  }

  async listPassengerOrderHistory(
    passengerId: string,
    query: ListMyOrdersQueryDto,
  ): Promise<OrderHistoryResponse> {
    const limit = this.resolveLimit(query.limit);
    const where = this.buildHistoryWhere({
      scope: 'passenger',
      id: passengerId,
      statuses: query.statuses,
      cursorCreatedAt: query.cursorCreatedAt,
    });

    const rows = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((order) =>
      this.toOrderReadModel(order),
    );
    const last = items[items.length - 1];

    return {
      items,
      limit,
      nextCursorCreatedAt: hasMore && last ? last.createdAt : null,
    };
  }

  async getPassengerActiveOrder(passengerId: string) {
    const active = await this.repo.findOne({
      where: [
        { passengerId, status: OrderStatus.NEW },
        { passengerId, status: OrderStatus.ASSIGNED },
        { passengerId, status: OrderStatus.IN_PROGRESS },
      ],
      order: { createdAt: 'DESC' },
    });

    return {
      activeOrder: active ? this.toOrderReadModel(active) : null,
    };
  }

  async getPassengerOrderDetails(passengerId: string, orderId: string) {
    const user: RequestUser = { sub: passengerId, role: 'PASSENGER' };
    const order = await this.ensureOrderReadAccess(orderId, user);

    const isActive = [
      OrderStatus.NEW,
      OrderStatus.ASSIGNED,
      OrderStatus.IN_PROGRESS,
    ].includes(order.status);
    const isFinal = [OrderStatus.DONE, OrderStatus.CANCELLED].includes(
      order.status,
    );

    let driver: {
      driverId: string;
      firstName: string | null;
      lastName: string | null;
      rating: string | null;
      vehicle: {
        id: string;
        brand: string;
        model: string;
        color: string;
        plateNumber: string;
      } | null;
      location: {
        lat: number;
        lng: number;
        heading: number | null;
        speed: number | null;
        updatedAt: string;
      } | null;
      availabilityState: 'READY' | 'BUSY' | null;
      isOnline: boolean;
    } | null = null;

    if (order.driverId) {
      let firstName: string | null = null;
      let lastName: string | null = null;
      let rating: string | null = null;
      let vehicle: {
        id: string;
        brand: string;
        model: string;
        color: string;
        plateNumber: string;
      } | null = null;

      try {
        const driverProfile = await this.driversService.getDriverProfileById(
          order.driverId,
        );
        firstName = driverProfile.firstName;
        lastName = driverProfile.lastName;
        rating = driverProfile.rating;
        const activeVehicle =
          driverProfile.vehicles?.find((item) => item.isActive) ?? null;
        if (activeVehicle) {
          vehicle = {
            id: activeVehicle.id,
            brand: activeVehicle.brand,
            model: activeVehicle.model,
            color: activeVehicle.color,
            plateNumber: activeVehicle.plateNumber,
          };
        }
      } catch {
        // Keep passenger response stable even if driver profile was removed.
      }

      const presenceSnapshot = await this.presence.getDriverPresenceSnapshot([
        order.driverId,
      ]);
      const presence = presenceSnapshot[order.driverId] ?? {
        isOnline: false,
        state: null,
        location: null,
      };

      driver = {
        driverId: order.driverId,
        firstName,
        lastName,
        rating,
        vehicle,
        location: presence.location
          ? {
              lat: presence.location.lat,
              lng: presence.location.lng,
              heading: presence.location.heading ?? null,
              speed: presence.location.speed ?? null,
              updatedAt: presence.location.updatedAt,
            }
          : null,
        availabilityState: presence.state,
        isOnline: presence.isOnline,
      };
    }

    return {
      order: this.toOrderReadModel(order),
      lifecycle: {
        isActive,
        isFinal,
        canCancelByPassenger: !isFinal,
        canTrackDriver:
          !!order.driverId &&
          [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(
            order.status,
          ),
      },
      driver,
    };
  }

  async getPassengerOrderTimeline(
    passengerId: string,
    orderId: string,
    query: PassengerOrderTimelineQueryDto,
  ) {
    const user: RequestUser = { sub: passengerId, role: 'PASSENGER' };
    const order = await this.ensureOrderReadAccess(orderId, user);

    const events = await this.observability.getTimeline(orderId);
    const incidents = query.includeIncidents
      ? await this.observability.getIncidents(orderId)
      : [];

    const timeline = [
      ...events.map((event) => ({
        kind: 'EVENT' as const,
        key: event.eventType,
        occurredAt: event.createdAt.toISOString(),
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorType: event.actorType,
        actorId: event.actorId,
        reason: event.reason,
        traceId: event.traceId,
        metadata: event.metadata,
      })),
      ...incidents.map((incident) => ({
        kind: 'INCIDENT' as const,
        key: incident.incidentType,
        occurredAt: incident.createdAt.toISOString(),
        fromStatus: null,
        toStatus: null,
        actorType: 'SYSTEM' as const,
        actorId: null,
        reason: incident.message,
        traceId: incident.traceId,
        metadata: {
          severity: incident.severity,
          context: incident.context,
        },
      })),
    ];

    timeline.sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const limitedTimeline =
      timeline.length > limit
        ? timeline.slice(timeline.length - limit)
        : timeline;

    return {
      orderId: order.id,
      currentStatus: this.normalizeStatus(order.status),
      items: limitedTimeline,
      pagination: {
        limit,
        total: timeline.length,
      },
      includesIncidents: !!query.includeIncidents,
    };
  }

  async getPassengerOrderReceipt(passengerId: string, orderId: string) {
    const user: RequestUser = { sub: passengerId, role: 'PASSENGER' };
    const order = await this.ensureOrderReadAccess(orderId, user);

    if (![OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException('RECEIPT_NOT_AVAILABLE');
    }

    const from = this.extractLatLng(order.fromLocation);
    const to = this.extractLatLng(order.toLocation);
    const routeEstimate =
      this.hasValidLatLng(from) && this.hasValidLatLng(to)
        ? this.geo.estimateRoute({
            fromLat: from.lat,
            fromLng: from.lng,
            toLat: to.lat,
            toLng: to.lng,
          })
        : null;
    const distanceKm = routeEstimate?.distanceKm ?? null;
    const durationMin = order.acceptedAt
      ? Math.max(
          1,
          Math.round(
            (Math.max(
              order.updatedAt.getTime() - order.acceptedAt.getTime(),
              0,
            ) || 0) / 60000,
          ),
        )
      : null;

    const breakdown = (order.pricingBreakdown ?? {}) as Record<string, unknown>;
    const total = Number(order.price);
    const payment = await this.payments.getOrderPayment(order.id);
    const paymentStatus =
      payment?.status ??
      (order.status === OrderStatus.DONE ? 'CAPTURED' : 'VOIDED');

    return {
      orderId: order.id,
      status: this.normalizeStatus(order.status),
      payment: {
        currency: 'RUB',
        total: Number(total.toFixed(2)),
        pricingBreakdown: breakdown,
        paymentStatus,
        paymentId: payment?.id ?? null,
        provider: payment?.provider ?? null,
      },
      trip: {
        distanceKm,
        durationMin,
        routeProvider: routeEstimate?.provider ?? null,
        acceptedAt: order.acceptedAt ? order.acceptedAt.toISOString() : null,
        finishedAt:
          order.status === OrderStatus.DONE
            ? order.updatedAt.toISOString()
            : null,
      },
      receiptIssuedAt: new Date().toISOString(),
    };
  }

  async listPassengerOrderDisputes(passengerId: string, orderId: string) {
    const user: RequestUser = { sub: passengerId, role: 'PASSENGER' };
    await this.ensureOrderReadAccess(orderId, user);

    const incidents = await this.observability.getIncidents(orderId);
    const disputes = incidents
      .filter((incident) =>
        incident.incidentType.startsWith('PASSENGER_DISPUTE_'),
      )
      .map((incident) => ({
        id: incident.id,
        disputeType: incident.incidentType,
        severity: incident.severity,
        message: incident.message,
        context: incident.context,
        traceId: incident.traceId,
        createdAt: incident.createdAt.toISOString(),
      }));

    return {
      orderId,
      items: disputes,
    };
  }

  async createPassengerOrderDispute(
    passengerId: string,
    orderId: string,
    dto: CreatePassengerDisputeDto,
  ) {
    const user: RequestUser = { sub: passengerId, role: 'PASSENGER' };
    const order = await this.ensureOrderReadAccess(orderId, user);

    if (![OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException('DISPUTE_NOT_ALLOWED_FOR_ACTIVE_ORDER');
    }

    const traceId = await this.observability.trackIncident({
      orderId,
      incidentType: 'PASSENGER_DISPUTE_OPENED',
      severity: 'WARN',
      message: dto.message,
      context: {
        reasonCode: dto.reasonCode,
        passengerId,
        orderStatus: this.normalizeStatus(order.status),
      },
    });

    await this.notifications.publish(passengerId, 'PASSENGER_DISPUTE_OPENED', {
      orderId,
      reasonCode: dto.reasonCode,
      traceId,
    });

    return {
      ok: true,
      orderId,
      reasonCode: dto.reasonCode,
      traceId,
      openedAt: new Date().toISOString(),
    };
  }

  async listDriverOrderHistory(
    userId: string,
    query: ListMyOrdersQueryDto,
  ): Promise<OrderHistoryResponse> {
    const driverId = await this.getDriverProfileIdOrThrow(userId);
    const limit = this.resolveLimit(query.limit);
    const where = this.buildHistoryWhere({
      scope: 'driver',
      id: driverId,
      statuses: query.statuses,
      cursorCreatedAt: query.cursorCreatedAt,
    });

    const rows = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((order) =>
      this.toOrderReadModel(order),
    );
    const last = items[items.length - 1];

    return {
      items,
      limit,
      nextCursorCreatedAt: hasMore && last ? last.createdAt : null,
    };
  }

  async getDriverActiveOrderByUserId(userId: string) {
    const driverId = await this.getDriverProfileIdOrThrow(userId);
    const active = await this.findActiveOrderByDriver(driverId);

    return {
      activeOrder: active ? this.toOrderReadModel(active) : null,
    };
  }

  private getDriverNextAllowedActions(status: OrderStatus): string[] {
    if (status === OrderStatus.ASSIGNED) {
      return ['START', 'CANCEL'];
    }
    if (status === OrderStatus.IN_PROGRESS) {
      return ['FINISH', 'CANCEL'];
    }
    return [];
  }

  async getDriverActiveOrderCard(userId: string) {
    const driverProfile =
      await this.driversService.getDriverProfileByUserId(userId);
    const activeVehicle =
      await this.driversService.getActiveVehicleByUserId(userId);
    const activeOrder = await this.findActiveOrderByDriver(driverProfile.id);

    return {
      driver: {
        driverId: driverProfile.id,
        firstName: driverProfile.firstName,
        lastName: driverProfile.lastName,
        rating: driverProfile.rating,
        profileStatus: driverProfile.status,
        vehicle: activeVehicle
          ? {
              id: activeVehicle.id,
              brand: activeVehicle.brand,
              model: activeVehicle.model,
              color: activeVehicle.color,
              plateNumber: activeVehicle.plateNumber,
              year: activeVehicle.year,
            }
          : null,
      },
      activeOrder: activeOrder
        ? {
            ...this.toOrderReadModel(activeOrder),
            nextAllowedActions: this.getDriverNextAllowedActions(
              activeOrder.status,
            ),
          }
        : null,
    };
  }

  async getDriverOrderDetails(userId: string, orderId: string) {
    const user: RequestUser = { sub: userId, role: 'DRIVER' };
    const order = await this.ensureOrderReadAccess(orderId, user);
    const driverProfile =
      await this.driversService.getDriverProfileByUserId(userId);
    const activeVehicle =
      await this.driversService.getActiveVehicleByUserId(userId);

    return {
      order: this.toOrderReadModel(order),
      trip: {
        canTrackPassenger: [
          OrderStatus.ASSIGNED,
          OrderStatus.IN_PROGRESS,
        ].includes(order.status),
        canStart: order.status === OrderStatus.ASSIGNED,
        canFinish: order.status === OrderStatus.IN_PROGRESS,
        canCancel: [OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(
          order.status,
        ),
        nextAllowedActions: this.getDriverNextAllowedActions(order.status),
      },
      driver: {
        driverId: driverProfile.id,
        firstName: driverProfile.firstName,
        lastName: driverProfile.lastName,
        rating: driverProfile.rating,
        profileStatus: driverProfile.status,
        vehicle: activeVehicle
          ? {
              id: activeVehicle.id,
              brand: activeVehicle.brand,
              model: activeVehicle.model,
              color: activeVehicle.color,
              plateNumber: activeVehicle.plateNumber,
              year: activeVehicle.year,
            }
          : null,
      },
      passenger: {
        passengerId: order.passengerId,
      },
    };
  }

  async getDriverOrderTimeline(
    userId: string,
    orderId: string,
    query: DriverOrderTimelineQueryDto,
  ) {
    const user: RequestUser = { sub: userId, role: 'DRIVER' };
    const order = await this.ensureOrderReadAccess(orderId, user);

    const events = await this.observability.getTimeline(orderId);
    const incidents = query.includeIncidents
      ? await this.observability.getIncidents(orderId)
      : [];

    const timeline = [
      ...events.map((event) => ({
        kind: 'EVENT' as const,
        key: event.eventType,
        occurredAt: event.createdAt.toISOString(),
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorType: event.actorType,
        actorId: event.actorId,
        reason: event.reason,
        traceId: event.traceId,
        metadata: event.metadata,
      })),
      ...incidents.map((incident) => ({
        kind: 'INCIDENT' as const,
        key: incident.incidentType,
        occurredAt: incident.createdAt.toISOString(),
        fromStatus: null,
        toStatus: null,
        actorType: 'SYSTEM' as const,
        actorId: null,
        reason: incident.message,
        traceId: incident.traceId,
        metadata: {
          severity: incident.severity,
          context: incident.context,
        },
      })),
    ];

    timeline.sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const limitedTimeline =
      timeline.length > limit
        ? timeline.slice(timeline.length - limit)
        : timeline;

    return {
      orderId: order.id,
      currentStatus: this.normalizeStatus(order.status),
      items: limitedTimeline,
      pagination: {
        limit,
        total: timeline.length,
      },
      includesIncidents: !!query.includeIncidents,
    };
  }

  private async ensureOrderReadAccess(orderId: string, user: RequestUser) {
    const order = await this.findOrderById(orderId);
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }

    if (user.role === 'ADMIN' || user.role === 'DISPATCHER') {
      return order;
    }

    if (user.role === 'PASSENGER') {
      if (order.passengerId !== user.sub) {
        throw new ForbiddenException('FORBIDDEN');
      }
      return order;
    }

    if (user.role === 'DRIVER') {
      const driverId = await this.getDriverProfileIdOrThrow(user.sub);
      if (order.driverId !== driverId) {
        throw new ForbiddenException('FORBIDDEN');
      }
      return order;
    }

    throw new ForbiddenException('FORBIDDEN');
  }

  async getOrderTimelineForUser(orderId: string, user: RequestUser) {
    await this.ensureOrderReadAccess(orderId, user);
    const events = await this.observability.getTimeline(orderId);

    return {
      orderId,
      events: events.map((event) => ({
        id: event.id,
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
    };
  }

  async getOrderIncidentsForUser(orderId: string, user: RequestUser) {
    await this.ensureOrderReadAccess(orderId, user);
    const incidents = await this.observability.getIncidents(orderId);

    return {
      orderId,
      incidents: incidents.map((incident) => ({
        id: incident.id,
        incidentType: incident.incidentType,
        severity: incident.severity,
        message: incident.message,
        traceId: incident.traceId,
        context: incident.context,
        createdAt: incident.createdAt.toISOString(),
      })),
    };
  }

  async getOrderForUser(orderId: string, user: RequestUser) {
    const order = await this.ensureOrderReadAccess(orderId, user);
    return this.toOrderReadModel(order);
  }

  async getAdminMetrics(user: RequestUser, windowMinutes?: number) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }
    return this.observability.getMetricsSnapshot(windowMinutes ?? 60);
  }

  async listAdminPanelOrders(
    user: RequestUser,
    query: AdminOrdersPanelQueryDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const limit = this.resolveLimit(query.limit);
    const qb = this.repo
      .createQueryBuilder('order')
      .orderBy('order.createdAt', 'DESC')
      .addOrderBy('order.id', 'DESC')
      .take(limit + 1);

    const statuses = this.toOrderStatusFilter(query.statuses);
    if (statuses.length > 0) {
      qb.andWhere('order.status IN (:...statuses)', { statuses });
    }

    if (query.passengerId) {
      qb.andWhere('order.passengerId = :passengerId', {
        passengerId: query.passengerId,
      });
    }

    if (query.driverId) {
      qb.andWhere('order.driverId = :driverId', {
        driverId: query.driverId,
      });
    }

    if (query.cityCode) {
      qb.andWhere('order.cityCode = :cityCode', {
        cityCode: query.cityCode,
      });
    }

    if (query.cursorCreatedAt) {
      qb.andWhere('order.createdAt < :cursorCreatedAt', {
        cursorCreatedAt: new Date(query.cursorCreatedAt),
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;
    const orderIds = visibleRows.map((order) => order.id);
    const latestSignals =
      await this.observability.getLatestSignalsForOrders(orderIds);

    const items = visibleRows.map((order) => {
      const orderReadModel = this.toOrderReadModel(order);
      const signal = latestSignals[order.id] ?? {
        latestEvent: null,
        latestIncident: null,
      };

      return {
        ...orderReadModel,
        audit: {
          latestEvent: signal.latestEvent,
          latestIncident: signal.latestIncident,
        },
      };
    });
    const last = items[items.length - 1];

    return {
      items,
      limit,
      nextCursorCreatedAt: hasMore && last ? last.createdAt : null,
    };
  }

  async getAdminAuditFeed(user: RequestUser, query: AdminAuditFeedQueryDto) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const limit = this.resolveLimit(query.limit);
    return this.observability.getAdminAuditFeed({
      limit,
      cursorCreatedAt: query.cursorCreatedAt,
      kind: query.kind ?? 'ALL',
      orderId: query.orderId,
    });
  }

  async getAdminActionsHistory(
    user: RequestUser,
    query: AdminActionsHistoryQueryDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const limit = this.resolveLimit(query.limit);
    return this.observability.getAdminActionsHistory({
      limit,
      cursorCreatedAt: query.cursorCreatedAt,
      orderId: query.orderId,
      adminUserId: query.adminUserId,
    });
  }

  async listAdminSavedFilters(
    user: RequestUser,
    query: AdminSavedFilterQueryDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const where: FindOptionsWhere<AdminPanelFilterEntity> = {
      ownerUserId: user.sub,
    };
    if (query.scope) {
      where.scope = query.scope;
    }

    const rows = await this.adminFilterRepo.find({
      where,
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      take: 50,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        scope: row.scope,
        payload: row.payload,
        isPinned: row.isPinned,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async listAdminDriverOperations(
    user: RequestUser,
    query: AdminDriverOpsQueryDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const profiles = await this.driversService.listDriverProfilesForOps({
      limit,
      cursorCreatedAt: query.cursorCreatedAt,
    });

    const hasMore = profiles.length > limit;
    const visibleRows = hasMore ? profiles.slice(0, limit) : profiles;
    const driverIds = visibleRows.map((profile) => profile.id);

    const [presenceByDriverId, activeOrdersByDriverId] = await Promise.all([
      this.presence.getDriverPresenceSnapshot(driverIds),
      this.findActiveOrdersByDriverIds(driverIds),
    ]);

    const staleLocationSeconds = Number(
      process.env.DRIVER_LOCATION_STALE_SECONDS || '45',
    );
    const staleLocationMs =
      (Number.isFinite(staleLocationSeconds) ? staleLocationSeconds : 45) *
      1000;

    const items = visibleRows.map((profile) => {
      const presence = presenceByDriverId[profile.id] ?? {
        isOnline: false,
        state: null,
        location: null,
      };
      const activeOrder = activeOrdersByDriverId[profile.id] ?? null;
      const activeVehicle =
        profile.vehicles?.find((vehicle) => vehicle.isActive) ?? null;
      const hasActiveOrder = !!activeOrder;
      const locationUpdatedAt =
        presence.location?.updatedAt &&
        !Number.isNaN(Date.parse(presence.location.updatedAt))
          ? new Date(presence.location.updatedAt)
          : null;
      const locationAgeMs = locationUpdatedAt
        ? Date.now() - locationUpdatedAt.getTime()
        : null;

      const operationalState = !presence.isOnline
        ? 'OFFLINE'
        : presence.state === 'BUSY'
          ? 'BUSY'
          : 'READY';

      const riskCodes: string[] = [];

      if (presence.isOnline && operationalState === 'BUSY' && !hasActiveOrder) {
        riskCodes.push('BUSY_WITHOUT_ACTIVE_ORDER');
      }
      if (presence.isOnline && operationalState === 'READY' && hasActiveOrder) {
        riskCodes.push('READY_WITH_ACTIVE_ORDER');
      }
      if (
        presence.isOnline &&
        locationAgeMs !== null &&
        locationAgeMs > staleLocationMs
      ) {
        riskCodes.push('LOCATION_STALE');
      }
      if (profile.status !== DriverProfileStatus.ACTIVE) {
        riskCodes.push('PROFILE_NOT_ACTIVE');
      }
      if (!activeVehicle) {
        riskCodes.push('NO_ACTIVE_VEHICLE');
      }

      const hasRisk = riskCodes.length > 0;

      return {
        driverId: profile.id,
        userId: profile.userId,
        phone: profile.user?.phone ?? null,
        fullName: profile.user?.fullName ?? null,
        profileStatus: profile.status,
        isOnlineEnabled: profile.isOnlineEnabled,
        city: profile.city,
        rating: profile.rating,
        operationalState,
        isOnline: presence.isOnline,
        availabilityState: presence.state,
        location: presence.location
          ? {
              lat: presence.location.lat,
              lng: presence.location.lng,
              heading: presence.location.heading ?? null,
              speed: presence.location.speed ?? null,
              updatedAt: presence.location.updatedAt,
            }
          : null,
        locationAgeSec:
          locationAgeMs === null ? null : Math.floor(locationAgeMs / 1000),
        activeVehicle: activeVehicle
          ? {
              id: activeVehicle.id,
              plateNumber: activeVehicle.plateNumber,
              brand: activeVehicle.brand,
              model: activeVehicle.model,
              color: activeVehicle.color,
              year: activeVehicle.year,
            }
          : null,
        activeOrder: activeOrder
          ? {
              id: activeOrder.id,
              status: this.normalizeStatus(activeOrder.status),
              createdAt: activeOrder.createdAt.toISOString(),
            }
          : null,
        risk: {
          hasRisk,
          riskCodes,
          runbookHints: this.getRunbookHints({
            isOnline: presence.isOnline,
            state: operationalState,
            hasActiveOrder,
            hasRisk,
            riskCodes,
            driverId: profile.id,
          }),
        },
        createdAt: profile.createdAt.toISOString(),
      };
    });

    const filteredByState =
      query.state && query.state !== 'ALL'
        ? items.filter((item) => item.operationalState === query.state)
        : items;

    const filtered = query.riskOnly
      ? filteredByState.filter((item) => item.risk.hasRisk)
      : filteredByState;

    const last = filtered[filtered.length - 1];
    return {
      items: filtered,
      limit,
      nextCursorCreatedAt: hasMore && last ? last.createdAt : null,
      summary: {
        total: filtered.length,
        riskCount: filtered.filter((item) => item.risk.hasRisk).length,
        onlineCount: filtered.filter((item) => item.isOnline).length,
        busyCount: filtered.filter((item) => item.operationalState === 'BUSY')
          .length,
      },
    };
  }

  async listAdminDispatchControlTower(
    user: RequestUser,
    query: AdminDispatchControlTowerQueryDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const slaSeconds = Math.min(Math.max(query.slaSeconds ?? 120, 30), 1800);

    const where: FindOptionsWhere<OrderEntity> = {
      status: OrderStatus.NEW,
    };
    if (query.cursorCreatedAt) {
      where.createdAt = LessThan(new Date(query.cursorCreatedAt));
    }

    const rows = await this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;

    const items = await Promise.all(
      visibleRows.map(async (order) => {
        const dispatchState = await this.dispatchService.getQueue(order.id);
        const queueLength = dispatchState.queue.length;
        const active = dispatchState.active;
        const activeWaveAgeSec =
          active && typeof active.createdAt === 'number'
            ? Math.floor((Date.now() - active.createdAt) / 1000)
            : null;
        const waitSec = Math.floor(
          (Date.now() - order.createdAt.getTime()) / 1000,
        );

        const riskCodes: string[] = [];
        if (waitSec > slaSeconds) {
          riskCodes.push('DISPATCH_SLA_BREACH');
        }
        if (queueLength === 0 && !(active?.currentDrivers?.length ?? 0)) {
          riskCodes.push('EMPTY_DISPATCH_QUEUE');
        }
        if (activeWaveAgeSec !== null && activeWaveAgeSec > 20) {
          riskCodes.push('ACTIVE_WAVE_STALE');
        }
        if (queueLength > 0 && !active) {
          riskCodes.push('WAVE_NOT_RUNNING');
        }

        const runbookHints: Array<{ action: string; reason: string }> = [];
        if (riskCodes.includes('EMPTY_DISPATCH_QUEUE')) {
          runbookHints.push({
            action: `POST /orders/admin/panel/dispatch/${order.id}/redrive`,
            reason: 'Queue is empty for searching order',
          });
        }
        if (riskCodes.includes('WAVE_NOT_RUNNING')) {
          runbookHints.push({
            action: `POST /orders/admin/panel/dispatch/${order.id}/redrive`,
            reason: 'Queue exists but active wave is not running',
          });
        }
        if (riskCodes.includes('DISPATCH_SLA_BREACH')) {
          runbookHints.push({
            action: 'Review driver pool and optionally force-cancel order',
            reason: 'Search time exceeded SLA',
          });
        }

        return {
          orderId: order.id,
          status: this.normalizeStatus(order.status),
          passengerId: order.passengerId,
          createdAt: order.createdAt.toISOString(),
          waitSec,
          slaSeconds,
          isSlaBreached: waitSec > slaSeconds,
          dispatch: {
            queueLength,
            queuePreview: dispatchState.queue.slice(0, 5),
            activeWave: active
              ? {
                  wave: active.wave,
                  currentDrivers: active.currentDrivers,
                  createdAt: new Date(active.createdAt).toISOString(),
                  ageSec: activeWaveAgeSec,
                  acceptedBy: active.acceptedBy,
                }
              : null,
          },
          risk: {
            hasRisk: riskCodes.length > 0,
            riskCodes,
            runbookHints,
          },
        };
      }),
    );

    const filtered = query.riskOnly
      ? items.filter((item) => item.risk.hasRisk)
      : items;
    const last = filtered[filtered.length - 1];

    return {
      items: filtered,
      limit,
      nextCursorCreatedAt: hasMore && last ? last.createdAt : null,
      summary: {
        searchingCount: filtered.length,
        riskCount: filtered.filter((item) => item.risk.hasRisk).length,
        slaBreachedCount: filtered.filter((item) => item.isSlaBreached).length,
        withActiveWaveCount: filtered.filter((item) => item.dispatch.activeWave)
          .length,
      },
    };
  }

  async redriveDispatchByAdmin(params: {
    orderId: string;
    adminUserId: string;
    reason?: string;
  }) {
    const order = await this.findOrderById(params.orderId);
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }
    if (order.status !== OrderStatus.NEW) {
      throw new BadRequestException(`INVALID_STATUS:${order.status}`);
    }

    const from = this.extractLatLng(order.fromLocation);
    const to = this.extractLatLng(order.toLocation);
    if (!this.hasValidLatLng(from) || !this.hasValidLatLng(to)) {
      throw new BadRequestException('ORDER_COORDINATES_INVALID');
    }

    await this.dispatchService.clearDispatchState(order.id);
    const dispatchResult = await this.dispatchService.createQueueAndDispatch({
      orderId: order.id,
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: to.lat,
      toLng: to.lng,
      price: order.price,
    });

    const refreshed = await this.findOrderById(order.id);
    const toStatus = refreshed?.status ?? order.status;

    await this.trackStatusChange({
      orderId: order.id,
      eventType: 'ORDER_DISPATCH_REDRIVE_BY_ADMIN',
      fromStatus: order.status,
      toStatus,
      actorType: 'ADMIN_RUNBOOK',
      actorId: params.adminUserId,
      reason: params.reason ?? 'MANUAL_DISPATCH_REDRIVE',
      metadata: {
        dispatchResult,
      },
    });

    await this.observability.trackIncident({
      orderId: order.id,
      incidentType: 'ADMIN_DISPATCH_REDRIVE',
      severity: 'INFO',
      message: 'Dispatch flow manually re-driven by admin runbook action',
      context: {
        adminUserId: params.adminUserId,
        reason: params.reason ?? 'MANUAL_DISPATCH_REDRIVE',
        dispatchResult,
      },
    });

    return {
      ok: true,
      orderId: order.id,
      status: this.normalizeStatus(toStatus),
      dispatch: dispatchResult,
    };
  }

  async createAdminSavedFilter(
    user: RequestUser,
    dto: UpsertAdminSavedFilterDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const entity = this.adminFilterRepo.create({
      ownerUserId: user.sub,
      name: dto.name,
      scope: dto.scope,
      payload: dto.payload,
      isPinned: dto.isPinned ?? false,
    });
    const saved = await this.adminFilterRepo.save(entity);

    return {
      id: saved.id,
      name: saved.name,
      scope: saved.scope,
      payload: saved.payload,
      isPinned: saved.isPinned,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async updateAdminSavedFilter(
    user: RequestUser,
    filterId: string,
    dto: UpsertAdminSavedFilterDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const existing = await this.adminFilterRepo.findOne({
      where: { id: filterId, ownerUserId: user.sub },
    });
    if (!existing) {
      throw new NotFoundException('FILTER_NOT_FOUND');
    }

    existing.name = dto.name;
    existing.scope = dto.scope;
    existing.payload = dto.payload;
    existing.isPinned = dto.isPinned ?? existing.isPinned;
    const saved = await this.adminFilterRepo.save(existing);

    return {
      id: saved.id,
      name: saved.name,
      scope: saved.scope,
      payload: saved.payload,
      isPinned: saved.isPinned,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async deleteAdminSavedFilter(user: RequestUser, filterId: string) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const result = await this.adminFilterRepo.delete({
      id: filterId,
      ownerUserId: user.sub,
    });
    if ((result.affected ?? 0) === 0) {
      throw new NotFoundException('FILTER_NOT_FOUND');
    }

    return { ok: true, filterId };
  }

  async getAdminActionCenterTemplates(user: RequestUser) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    return {
      templates: [
        {
          actionType: 'FORCE_CANCEL_ORDER' as const,
          targetType: 'ORDER' as const,
          description: 'Force cancel order in active/searching states',
          requiresReason: true,
          supportsDryRun: true,
          allowedStatuses: [
            'SEARCHING',
            'ASSIGNED',
            'IN_PROGRESS',
            'NO_DRIVERS_FOUND',
          ],
        },
        {
          actionType: 'FORCE_FINISH_ORDER' as const,
          targetType: 'ORDER' as const,
          description: 'Force finish order in ASSIGNED or IN_PROGRESS',
          requiresReason: true,
          supportsDryRun: true,
          allowedStatuses: ['ASSIGNED', 'IN_PROGRESS'],
        },
        {
          actionType: 'RECONCILE_DRIVER' as const,
          targetType: 'DRIVER' as const,
          description: 'Reconcile driver READY/BUSY against active order fact',
          requiresReason: true,
          supportsDryRun: true,
          allowedStatuses: [],
        },
        {
          actionType: 'REDRIVE_DISPATCH' as const,
          targetType: 'ORDER' as const,
          description: 'Clear and restart dispatch flow for searching order',
          requiresReason: true,
          supportsDryRun: true,
          allowedStatuses: ['SEARCHING'],
        },
      ],
    };
  }

  private parseExecutionError(error: unknown) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : 'UNKNOWN_ERROR';

    if (message.includes('ORDER_NOT_FOUND')) {
      return {
        errorCode: 'ORDER_NOT_FOUND',
        errorMessage: message,
      };
    }
    if (message.includes('DRIVER_PROFILE_NOT_FOUND')) {
      return {
        errorCode: 'DRIVER_PROFILE_NOT_FOUND',
        errorMessage: message,
      };
    }
    if (message.includes('INVALID_STATUS')) {
      return {
        errorCode: 'INVALID_STATUS',
        errorMessage: message,
      };
    }

    return {
      errorCode: 'ACTION_EXECUTION_FAILED',
      errorMessage: message || 'ACTION_EXECUTION_FAILED',
    };
  }

  private async resolveActionTarget(params: {
    actionType: AdminActionType;
    orderId?: string;
    driverId?: string;
  }) {
    if (
      params.actionType === 'FORCE_CANCEL_ORDER' ||
      params.actionType === 'FORCE_FINISH_ORDER' ||
      params.actionType === 'REDRIVE_DISPATCH'
    ) {
      if (!params.orderId) {
        throw new BadRequestException('ORDER_ID_REQUIRED');
      }
      const order = await this.findOrderById(params.orderId);
      if (!order) {
        throw new NotFoundException('ORDER_NOT_FOUND');
      }
      return {
        targetType: 'ORDER' as const,
        targetId: order.id,
      };
    }

    if (params.actionType === 'RECONCILE_DRIVER') {
      if (!params.driverId) {
        throw new BadRequestException('DRIVER_ID_REQUIRED');
      }
      await this.driversService.getDriverProfileById(params.driverId);
      return {
        targetType: 'DRIVER' as const,
        targetId: params.driverId,
      };
    }

    throw new BadRequestException('ACTION_TYPE_NOT_SUPPORTED');
  }

  private async validateAdminActionPreconditions(params: {
    actionType: AdminActionType;
    orderId?: string;
    driverId?: string;
  }) {
    if (params.actionType === 'FORCE_CANCEL_ORDER') {
      const order = await this.findOrderById(params.orderId!);
      if (!order) {
        throw new NotFoundException('ORDER_NOT_FOUND');
      }
      const allowedStatuses = [
        OrderStatus.NEW,
        OrderStatus.ASSIGNED,
        OrderStatus.IN_PROGRESS,
        OrderStatus.NO_DRIVERS_FOUND,
      ];
      if (!allowedStatuses.includes(order.status)) {
        throw new BadRequestException(`INVALID_STATUS:${order.status}`);
      }
      return;
    }

    if (params.actionType === 'FORCE_FINISH_ORDER') {
      const order = await this.findOrderById(params.orderId!);
      if (!order) {
        throw new NotFoundException('ORDER_NOT_FOUND');
      }
      if (
        ![OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(order.status)
      ) {
        throw new BadRequestException(`INVALID_STATUS:${order.status}`);
      }
      return;
    }

    if (params.actionType === 'REDRIVE_DISPATCH') {
      const order = await this.findOrderById(params.orderId!);
      if (!order) {
        throw new NotFoundException('ORDER_NOT_FOUND');
      }
      if (order.status !== OrderStatus.NEW) {
        throw new BadRequestException(`INVALID_STATUS:${order.status}`);
      }
      const from = this.extractLatLng(order.fromLocation);
      const to = this.extractLatLng(order.toLocation);
      if (!this.hasValidLatLng(from) || !this.hasValidLatLng(to)) {
        throw new BadRequestException('ORDER_COORDINATES_INVALID');
      }
      return;
    }

    if (params.actionType === 'RECONCILE_DRIVER') {
      await this.driversService.getDriverProfileById(params.driverId!);
    }
  }

  async listAdminActionExecutions(
    user: RequestUser,
    query: AdminActionExecutionsQueryDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const qb = this.adminActionExecutionRepo
      .createQueryBuilder('execution')
      .orderBy('execution.createdAt', 'DESC')
      .addOrderBy('execution.id', 'DESC')
      .take(limit + 1);

    if (query.cursorCreatedAt) {
      qb.andWhere('execution.createdAt < :cursor', {
        cursor: new Date(query.cursorCreatedAt),
      });
    }
    if (query.actionType) {
      qb.andWhere('execution.actionType = :actionType', {
        actionType: query.actionType,
      });
    }
    if (query.status) {
      qb.andWhere('execution.status = :status', {
        status: query.status,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;
    const last = visibleRows[visibleRows.length - 1];

    return {
      items: visibleRows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        actionType: row.actionType,
        targetType: row.targetType,
        targetId: row.targetId,
        dryRun: row.dryRun,
        status: row.status,
        reason: row.reason,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
      limit,
      nextCursorCreatedAt:
        hasMore && last ? last.createdAt.toISOString() : null,
    };
  }

  async executeAdminActionCenter(
    user: RequestUser,
    dto: ExecuteAdminActionDto,
  ) {
    if (!['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('REASON_TOO_SHORT');
    }

    const target = await this.resolveActionTarget({
      actionType: dto.actionType,
      orderId: dto.orderId,
      driverId: dto.driverId,
    });
    await this.validateAdminActionPreconditions({
      actionType: dto.actionType,
      orderId: dto.orderId,
      driverId: dto.driverId,
    });

    const execution = this.adminActionExecutionRepo.create({
      actorUserId: user.sub,
      actionType: dto.actionType,
      targetType: target.targetType,
      targetId: target.targetId,
      dryRun: dto.dryRun,
      status: 'SKIPPED_DRY_RUN',
      reason: dto.reason,
      errorCode: null,
      errorMessage: null,
      metadata: {
        orderId: dto.orderId ?? null,
        driverId: dto.driverId ?? null,
      },
    });

    if (dto.dryRun) {
      const savedDryRun = await this.adminActionExecutionRepo.save(execution);
      return {
        ok: true,
        dryRun: true,
        executionId: savedDryRun.id,
        actionType: dto.actionType,
        targetType: target.targetType,
        targetId: target.targetId,
      };
    }

    try {
      let result: unknown;
      if (dto.actionType === 'FORCE_CANCEL_ORDER') {
        result = await this.forceCancelOrderByAdmin({
          orderId: dto.orderId!,
          adminUserId: user.sub,
          reason: dto.reason,
        });
      } else if (dto.actionType === 'FORCE_FINISH_ORDER') {
        result = await this.forceFinishOrderByAdmin({
          orderId: dto.orderId!,
          adminUserId: user.sub,
          reason: dto.reason,
        });
      } else if (dto.actionType === 'RECONCILE_DRIVER') {
        result = await this.reconcileDriverByAdmin({
          driverId: dto.driverId!,
          adminUserId: user.sub,
          reason: dto.reason,
        });
      } else if (dto.actionType === 'REDRIVE_DISPATCH') {
        result = await this.redriveDispatchByAdmin({
          orderId: dto.orderId!,
          adminUserId: user.sub,
          reason: dto.reason,
        });
      } else {
        throw new BadRequestException('ACTION_TYPE_NOT_SUPPORTED');
      }

      execution.status = 'SUCCESS';
      execution.metadata = {
        ...((execution.metadata ?? {}) as Record<string, unknown>),
        result,
      };
      const saved = await this.adminActionExecutionRepo.save(execution);

      return {
        ok: true,
        dryRun: false,
        executionId: saved.id,
        actionType: dto.actionType,
        targetType: target.targetType,
        targetId: target.targetId,
        result,
      };
    } catch (error) {
      const parsed = this.parseExecutionError(error);
      execution.status = 'FAILED';
      execution.errorCode = parsed.errorCode;
      execution.errorMessage = parsed.errorMessage;
      await this.adminActionExecutionRepo.save(execution);
      throw error;
    }
  }

  async forceCancelOrderByAdmin(params: {
    orderId: string;
    adminUserId: string;
    reason?: string;
  }) {
    const order = await this.findOrderById(params.orderId);
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }

    const allowedStatuses = [
      OrderStatus.NEW,
      OrderStatus.ASSIGNED,
      OrderStatus.IN_PROGRESS,
      OrderStatus.NO_DRIVERS_FOUND,
    ];
    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException(`INVALID_STATUS:${order.status}`);
    }

    const previousStatus = order.status;
    order.status = OrderStatus.CANCELLED;
    order.acceptedAt = null;
    const saved = await this.repo.save(order);

    await this.dispatchService.clearDispatchState(saved.id);

    if (saved.driverId) {
      await this.reconcileDriverAvailability(saved.driverId);
      this.gateway.emitToDriver(saved.driverId, 'order.cancelled', {
        orderId: saved.id,
      });
    }

    this.emitPassengerStatus(saved);
    this.emitDriverSnapshot(saved, {
      driverId: saved.driverId,
      location: null,
    });

    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_FORCE_CANCELLED_BY_ADMIN',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'ADMIN_RUNBOOK',
      actorId: params.adminUserId,
      reason: params.reason ?? 'MANUAL_FORCE_CANCEL',
      metric: 'orders_cancelled',
    });

    await this.observability.trackIncident({
      orderId: saved.id,
      incidentType: 'ADMIN_FORCE_CANCEL',
      severity: 'WARN',
      message: 'Order force-cancelled by admin runbook action',
      context: {
        adminUserId: params.adminUserId,
        reason: params.reason ?? 'MANUAL_FORCE_CANCEL',
      },
    });

    return {
      ok: true,
      orderId: saved.id,
      status: this.normalizeStatus(saved.status),
    };
  }

  async forceFinishOrderByAdmin(params: {
    orderId: string;
    adminUserId: string;
    reason?: string;
  }) {
    const order = await this.findOrderById(params.orderId);
    if (!order) {
      throw new NotFoundException('ORDER_NOT_FOUND');
    }

    if (
      ![OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(order.status)
    ) {
      throw new BadRequestException(`INVALID_STATUS:${order.status}`);
    }

    const previousStatus = order.status;
    order.status = OrderStatus.DONE;
    const saved = await this.repo.save(order);

    await this.dispatchService.clearDispatchState(saved.id);
    if (saved.driverId) {
      await this.reconcileDriverAvailability(saved.driverId);
      await this.driversService.recordTripEarning({
        driverId: saved.driverId,
        orderId: saved.id,
        amountRub: Number(saved.price),
        metadata: {
          source: 'ADMIN_FORCE_FINISH',
          adminUserId: params.adminUserId,
        },
      });
    }

    this.emitPassengerStatus(saved);
    this.emitDriverSnapshot(saved, {
      driverId: saved.driverId,
      location: null,
    });

    await this.trackStatusChange({
      orderId: saved.id,
      eventType: 'ORDER_FORCE_FINISHED_BY_ADMIN',
      fromStatus: previousStatus,
      toStatus: saved.status,
      actorType: 'ADMIN_RUNBOOK',
      actorId: params.adminUserId,
      reason: params.reason ?? 'MANUAL_FORCE_FINISH',
      metric: 'orders_finished',
    });

    await this.observability.trackIncident({
      orderId: saved.id,
      incidentType: 'ADMIN_FORCE_FINISH',
      severity: 'WARN',
      message: 'Order force-finished by admin runbook action',
      context: {
        adminUserId: params.adminUserId,
        reason: params.reason ?? 'MANUAL_FORCE_FINISH',
      },
    });

    return {
      ok: true,
      orderId: saved.id,
      status: this.normalizeStatus(saved.status),
    };
  }

  async reconcileDriverByAdmin(params: {
    driverId: string;
    adminUserId: string;
    reason?: string;
  }) {
    const result = await this.reconcileDriverAvailability(params.driverId);
    if (result.orderId) {
      await this.observability.trackIncident({
        orderId: result.orderId,
        incidentType: 'ADMIN_FORCE_DRIVER_RECONCILE',
        severity: 'INFO',
        message: 'Driver availability reconciled by admin runbook action',
        context: {
          adminUserId: params.adminUserId,
          driverId: params.driverId,
          state: result.state,
          reason: params.reason ?? 'MANUAL_DRIVER_RECONCILE',
        },
      });
    }

    return {
      ok: true,
      ...result,
    };
  }

  async reconcileDriverAvailability(driverId: string) {
    const activeOrder = await this.findActiveOrderByDriver(driverId);
    if (activeOrder && ACTIVE_ORDER_STATUSES.includes(activeOrder.status)) {
      await this.presence.setDriverBusy(driverId);
      return { driverId, state: 'BUSY' as const, orderId: activeOrder.id };
    }

    await this.presence.setDriverReady(driverId);
    return { driverId, state: 'READY' as const, orderId: null };
  }

  async recoverStaleAssignedOrders(params?: {
    timeoutSeconds?: number;
    batchSize?: number;
  }) {
    const timeoutSeconds = params?.timeoutSeconds ?? 180;
    const batchSize = params?.batchSize ?? 100;
    const threshold = new Date(Date.now() - timeoutSeconds * 1000);

    const staleOrders = await this.repo
      .createQueryBuilder('order')
      .where('order.status = :status', { status: OrderStatus.ASSIGNED })
      .andWhere('order.createdAt <= :threshold', {
        threshold: threshold.toISOString(),
      })
      .orderBy('order.createdAt', 'ASC')
      .limit(batchSize)
      .getMany();

    const recoveredIds: string[] = [];

    for (const stale of staleOrders) {
      const previousDriverId = stale.driverId;
      const previousStatus = stale.status;
      stale.status = OrderStatus.NEW;
      stale.driverId = null;
      stale.acceptedAt = null;

      const saved = await this.repo.save(stale);
      recoveredIds.push(saved.id);

      await this.dispatchService.clearDispatchState(saved.id);

      if (previousDriverId) {
        await this.reconcileDriverAvailability(previousDriverId);
      }

      this.emitPassengerStatus(saved);
      this.emitDriverSnapshot(saved, {
        driverId: null,
        location: null,
      });
      await this.trackStatusChange({
        orderId: saved.id,
        eventType: 'ORDER_RECOVERED_ASSIGNED',
        fromStatus: previousStatus,
        toStatus: saved.status,
        actorType: 'SYSTEM_RECOVERY',
        reason: 'STALE_ASSIGNED_TIMEOUT',
        metadata: { previousDriverId },
        metric: 'recoveries_assigned',
      });
      await this.observability.trackIncident({
        orderId: saved.id,
        incidentType: 'STALE_ASSIGNED_RECOVERY',
        severity: 'WARN',
        message: 'Order recovered from stale ASSIGNED state',
        context: { previousDriverId },
      });

      const from = this.extractLatLng(saved.fromLocation);
      const to = this.extractLatLng(saved.toLocation);

      if (this.hasValidLatLng(from) && this.hasValidLatLng(to)) {
        await this.dispatchService.createQueueAndDispatch({
          orderId: saved.id,
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: to.lat,
          toLng: to.lng,
          price: saved.price,
        });
      }
    }

    return {
      count: recoveredIds.length,
      orderIds: recoveredIds,
    };
  }

  async recoverStaleInProgressOrders(params?: {
    timeoutSeconds?: number;
    batchSize?: number;
  }) {
    const timeoutSeconds = params?.timeoutSeconds ?? 7200;
    const batchSize = params?.batchSize ?? 100;
    const threshold = new Date(Date.now() - timeoutSeconds * 1000);

    const staleOrders = await this.repo
      .createQueryBuilder('order')
      .where('order.status = :status', { status: OrderStatus.IN_PROGRESS })
      .andWhere('order.createdAt <= :threshold', {
        threshold: threshold.toISOString(),
      })
      .orderBy('order.createdAt', 'ASC')
      .limit(batchSize)
      .getMany();

    const recoveredIds: string[] = [];

    for (const stale of staleOrders) {
      const previousDriverId = stale.driverId;
      const previousStatus = stale.status;
      stale.status = OrderStatus.CANCELLED;

      const saved = await this.repo.save(stale);
      recoveredIds.push(saved.id);

      await this.dispatchService.clearDispatchState(saved.id);

      if (previousDriverId) {
        await this.reconcileDriverAvailability(previousDriverId);
        this.gateway.emitToDriver(previousDriverId, 'order.cancelled', {
          orderId: saved.id,
        });
      }

      this.emitPassengerStatus(saved);
      this.emitDriverSnapshot(saved, {
        driverId: saved.driverId,
        location: null,
      });
      await this.trackStatusChange({
        orderId: saved.id,
        eventType: 'ORDER_RECOVERED_IN_PROGRESS',
        fromStatus: previousStatus,
        toStatus: saved.status,
        actorType: 'SYSTEM_RECOVERY',
        reason: 'STALE_IN_PROGRESS_TIMEOUT',
        metadata: { previousDriverId },
        metric: 'recoveries_in_progress',
      });
      await this.observability.trackIncident({
        orderId: saved.id,
        incidentType: 'STALE_IN_PROGRESS_RECOVERY',
        severity: 'ERROR',
        message: 'Order cancelled by stale IN_PROGRESS recovery',
        context: { previousDriverId },
      });
    }

    return {
      count: recoveredIds.length,
      orderIds: recoveredIds,
    };
  }

  async findActiveOrderByDriver(driverId: string) {
    const assigned = await this.repo.findOne({
      where: {
        driverId,
        status: OrderStatus.ASSIGNED,
      },
      order: { createdAt: 'DESC' },
    });

    if (assigned) {
      return assigned;
    }

    return this.repo.findOne({
      where: {
        driverId,
        status: OrderStatus.IN_PROGRESS,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOrderById(orderId: string) {
    return this.repo.findOne({ where: { id: orderId } });
  }

  async listOrders() {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async cleanupTestOrders() {
    const orders = await this.repo.find();
    if (!orders.length) {
      return { deleted: 0 };
    }

    for (const order of orders) {
      await this.dispatchService.clearDispatchState(order.id);
      if (order.driverId) {
        await this.presence.setDriverReady(order.driverId);
      }
    }

    await this.repo.remove(orders);
    return { deleted: orders.length };
  }
}
