import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const ORDER_HISTORY_DEFAULT_LIMIT = 20;
export const ORDER_HISTORY_MAX_LIMIT = 100;
export const PASSENGER_SERVICE_LEVELS = [
  'ECONOMY',
  'COMFORT',
  'BUSINESS',
] as const;
export type PassengerServiceLevel = (typeof PASSENGER_SERVICE_LEVELS)[number];

export const ORDER_FILTER_STATUSES = [
  'SEARCHING',
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
  'NO_DRIVERS_FOUND',
] as const;

export type OrderFilterStatus = (typeof ORDER_FILTER_STATUSES)[number];

function parseStatuses(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const values = Array.isArray(value)
    ? value.flatMap((item) => String(item).split(','))
    : String(value).split(',');

  const normalized = values
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0);

  return normalized.length ? Array.from(new Set(normalized)) : undefined;
}

function parseLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return undefined;
}

export class CreateOrderDto {
  @IsNumber() fromLat!: number;
  @IsNumber() fromLng!: number;

  @IsNumber() toLat!: number;
  @IsNumber() toLng!: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  @IsIn(PASSENGER_SERVICE_LEVELS)
  serviceLevel?: PassengerServiceLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waitingSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isAirportRoute?: boolean;

  @IsOptional()
  @IsBoolean()
  withChildSeat?: boolean;

  @IsOptional()
  @IsBoolean()
  withPet?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  extraStopsCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outOfCityKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  requestedSurgeMultiplier?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  cityCode?: string;
}

export class ListMyOrdersQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseStatuses(value))
  @IsArray()
  @IsIn(ORDER_FILTER_STATUSES, { each: true })
  statuses?: OrderFilterStatus[];

  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(ORDER_HISTORY_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorCreatedAt?: string;
}

export class AdminOrderActionDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : String(value).trim(),
  )
  reason?: string;
}

export const ADMIN_AUDIT_KINDS = ['ALL', 'EVENT', 'INCIDENT'] as const;
export type AdminAuditKind = (typeof ADMIN_AUDIT_KINDS)[number];

function parseAuditKind(value: unknown): AdminAuditKind | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = String(value).trim().toUpperCase();
  return normalized as AdminAuditKind;
}

export class AdminOrdersPanelQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseStatuses(value))
  @IsArray()
  @IsIn(ORDER_FILTER_STATUSES, { each: true })
  statuses?: OrderFilterStatus[];

  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(ORDER_HISTORY_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorCreatedAt?: string;

  @IsOptional()
  @IsUUID()
  passengerId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  cityCode?: string;
}

export class AdminAuditFeedQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(ORDER_HISTORY_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorCreatedAt?: string;

  @IsOptional()
  @Transform(({ value }) => parseAuditKind(value))
  @IsIn(ADMIN_AUDIT_KINDS)
  kind?: AdminAuditKind;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}

export class AdminActionsHistoryQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(ORDER_HISTORY_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorCreatedAt?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  adminUserId?: string;
}

export const ADMIN_SAVED_FILTER_SCOPES = ['ORDERS', 'AUDIT'] as const;
export type AdminSavedFilterScope = (typeof ADMIN_SAVED_FILTER_SCOPES)[number];

function parseSavedFilterScope(
  value: unknown,
): AdminSavedFilterScope | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = String(value).trim().toUpperCase();
  return normalized as AdminSavedFilterScope;
}

export class AdminSavedFilterQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseSavedFilterScope(value))
  @IsIn(ADMIN_SAVED_FILTER_SCOPES)
  scope?: AdminSavedFilterScope;
}

export class UpsertAdminSavedFilterDto {
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => String(value).trim())
  name!: string;

  @Transform(({ value }) => parseSavedFilterScope(value))
  @IsIn(ADMIN_SAVED_FILTER_SCOPES)
  scope!: AdminSavedFilterScope;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export const ADMIN_DRIVER_OPS_STATES = [
  'ALL',
  'OFFLINE',
  'READY',
  'BUSY',
] as const;
export type AdminDriverOpsState = (typeof ADMIN_DRIVER_OPS_STATES)[number];

function parseAdminDriverOpsState(
  value: unknown,
): AdminDriverOpsState | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = String(value).trim().toUpperCase();
  return normalized as AdminDriverOpsState;
}

export class AdminDriverOpsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorCreatedAt?: string;

  @IsOptional()
  @Transform(({ value }) => parseAdminDriverOpsState(value))
  @IsIn(ADMIN_DRIVER_OPS_STATES)
  state?: AdminDriverOpsState;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  riskOnly?: boolean;
}

export class AdminDispatchControlTowerQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorCreatedAt?: string;

  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(30)
  @Max(1800)
  slaSeconds?: number;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  riskOnly?: boolean;
}

export const ADMIN_ACTION_TYPES = [
  'FORCE_CANCEL_ORDER',
  'FORCE_FINISH_ORDER',
  'RECONCILE_DRIVER',
  'REDRIVE_DISPATCH',
] as const;
export type AdminActionType = (typeof ADMIN_ACTION_TYPES)[number];

export const ADMIN_ACTION_EXECUTION_STATUSES = [
  'SUCCESS',
  'FAILED',
  'SKIPPED_DRY_RUN',
] as const;
export type AdminActionExecutionStatus =
  (typeof ADMIN_ACTION_EXECUTION_STATUSES)[number];

function parseAdminActionType(value: unknown): AdminActionType | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return String(value).trim().toUpperCase() as AdminActionType;
}

function parseAdminActionExecutionStatus(
  value: unknown,
): AdminActionExecutionStatus | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return String(value).trim().toUpperCase() as AdminActionExecutionStatus;
}

export class ExecuteAdminActionDto {
  @Transform(({ value }) => parseAdminActionType(value))
  @IsIn(ADMIN_ACTION_TYPES)
  actionType!: AdminActionType;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  dryRun!: boolean;

  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => String(value).trim())
  reason!: string;
}

export class AdminActionExecutionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorCreatedAt?: string;

  @IsOptional()
  @Transform(({ value }) => parseAdminActionType(value))
  @IsIn(ADMIN_ACTION_TYPES)
  actionType?: AdminActionType;

  @IsOptional()
  @Transform(({ value }) => parseAdminActionExecutionStatus(value))
  @IsIn(ADMIN_ACTION_EXECUTION_STATUSES)
  status?: AdminActionExecutionStatus;
}

export class PassengerOrderTimelineQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  includeIncidents?: boolean;
}

export class DriverOrderTimelineQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  includeIncidents?: boolean;
}

export const MOBILE_SYNC_OPERATION_TYPES = [
  'PASSENGER_CREATE_ORDER',
  'PASSENGER_CANCEL_ORDER',
  'DRIVER_ACCEPT_ORDER',
  'DRIVER_START_ORDER',
  'DRIVER_FINISH_ORDER',
  'DRIVER_CANCEL_ORDER',
  'DRIVER_LOCATION_BATCH',
] as const;

export type MobileSyncOperationType =
  (typeof MOBILE_SYNC_OPERATION_TYPES)[number];

export class MobileSyncPullQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsDateString()
  cursorUpdatedAt?: string;
}

export class MobileSyncPushOperationDto {
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => String(value).trim())
  commandId!: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => String(value).trim())
  deviceId!: string;

  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsIn(MOBILE_SYNC_OPERATION_TYPES)
  operationType!: MobileSyncOperationType;

  @IsOptional()
  @IsDateString()
  clientTs?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class MobileSyncPushDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MobileSyncPushOperationDto)
  operations!: MobileSyncPushOperationDto[];
}

export class PassengerFareEstimateDto {
  @IsNumber()
  fromLat!: number;

  @IsNumber()
  fromLng!: number;

  @IsNumber()
  toLat!: number;

  @IsNumber()
  toLng!: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  @IsIn(PASSENGER_SERVICE_LEVELS)
  serviceLevel?: PassengerServiceLevel;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  cityCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waitingSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isAirportRoute?: boolean;

  @IsOptional()
  @IsBoolean()
  withChildSeat?: boolean;

  @IsOptional()
  @IsBoolean()
  withPet?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  extraStopsCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outOfCityKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  requestedSurgeMultiplier?: number;
}

export class ConfirmPassengerOrderDto extends PassengerFareEstimateDto {}

export const PASSENGER_DISPUTE_REASON_CODES = [
  'PRICE_MISMATCH',
  'DRIVER_BEHAVIOR',
  'ROUTE_ISSUE',
  'PAYMENT_ISSUE',
  'OTHER',
] as const;
export type PassengerDisputeReasonCode =
  (typeof PASSENGER_DISPUTE_REASON_CODES)[number];

export class CreatePassengerDisputeDto {
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsIn(PASSENGER_DISPUTE_REASON_CODES)
  reasonCode!: PassengerDisputeReasonCode;

  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => String(value).trim())
  message!: string;
}
