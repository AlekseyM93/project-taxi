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

function parseLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class DriverShiftActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : String(value).trim(),
  )
  reason?: string;
}

export class DriverEarningsSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => parseLimit(value))
  @Min(1)
  @Max(200)
  limit?: number;
}

export const DRIVER_SAFETY_ALERT_TYPES = [
  'SOS',
  'INCIDENT',
  'APP_HEALTH',
  'LOCATION_GAP',
] as const;
export type DriverSafetyAlertType = (typeof DRIVER_SAFETY_ALERT_TYPES)[number];

export const DRIVER_SAFETY_SEVERITIES = ['INFO', 'WARN', 'CRITICAL'] as const;
export type DriverSafetySeverity = (typeof DRIVER_SAFETY_SEVERITIES)[number];

export class CreateDriverSafetyAlertDto {
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsIn(DRIVER_SAFETY_ALERT_TYPES)
  alertType!: DriverSafetyAlertType;

  @IsOptional()
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsIn(DRIVER_SAFETY_SEVERITIES)
  severity?: DriverSafetySeverity;

  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => String(value).trim())
  message!: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsBoolean()
  offlineBuffered?: boolean;
}

export class DriverLocationBatchPointDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsBoolean()
  isMock?: boolean;

  @IsOptional()
  @IsBoolean()
  offlineBuffered?: boolean;

  @IsOptional()
  @IsDateString()
  clientTs?: string;

  @IsOptional()
  @IsNumber()
  sequence?: number;
}

export class DriverLocationBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => DriverLocationBatchPointDto)
  points!: DriverLocationBatchPointDto[];
}
