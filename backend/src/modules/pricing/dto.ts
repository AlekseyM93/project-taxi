import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CITY_TIERS, PRICING_SERVICE_LEVELS } from './tariff.entity';

export class PricingInputDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  routeKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  routeMinutes?: number;

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

export class UpsertTariffDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) =>
    value === undefined || value === null
      ? undefined
      : String(value).trim().toUpperCase(),
  )
  cityId?: string;

  @IsIn(CITY_TIERS)
  cityTier!: (typeof CITY_TIERS)[number];

  @IsIn(PRICING_SERVICE_LEVELS)
  serviceLevel!: (typeof PRICING_SERVICE_LEVELS)[number];

  @IsNumber()
  @Min(0)
  fareBaseRub!: number;

  @IsNumber()
  @Min(0)
  farePerKmRub!: number;

  @IsNumber()
  @Min(0)
  farePerMinuteRub!: number;

  @IsNumber()
  @Min(0)
  minFareRub!: number;

  @IsNumber()
  @Min(0)
  includedKm!: number;

  @IsNumber()
  @Min(0)
  includedMinutes!: number;

  @IsNumber()
  @Min(0)
  freeWaitingSeconds!: number;

  @IsNumber()
  @Min(0)
  waitingPerMinuteRub!: number;

  @IsNumber()
  @Min(0)
  cancelFeeRub!: number;

  @IsNumber()
  @Min(0)
  noShowFeeRub!: number;

  @IsNumber()
  @Min(0)
  outOfCityPerKmRub!: number;

  @IsNumber()
  @Min(0)
  airportSurchargeRub!: number;

  @IsNumber()
  @Min(0)
  childSeatRub!: number;

  @IsNumber()
  @Min(0)
  petRub!: number;

  @IsNumber()
  @Min(0)
  extraStopRub!: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  maxSurgeMultiplier!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent!: number;

  @IsNumber()
  @Min(0)
  minimumPlatformFeeRub!: number;
}

export class UpsertCityTierDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => String(value).trim().toUpperCase())
  cityId!: string;

  @IsIn(CITY_TIERS)
  cityTier!: (typeof CITY_TIERS)[number];
}
