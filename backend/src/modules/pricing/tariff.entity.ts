import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const CITY_TIERS = [
  'CITY_TIER_A',
  'CITY_TIER_B',
  'CITY_TIER_C',
  'CITY_TIER_D',
  'CITY_TIER_E',
] as const;

export type CityTier = (typeof CITY_TIERS)[number];

export const PRICING_SERVICE_LEVELS = [
  'ECONOMY',
  'COMFORT',
  'BUSINESS',
] as const;

export type PricingServiceLevel = (typeof PRICING_SERVICE_LEVELS)[number];

@Entity('tariffs')
@Index('IDX_tariffs_cityId_serviceLevel', ['cityId', 'serviceLevel'], {
  unique: true,
})
export class TariffEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  cityId!: string;

  @Column({ type: 'varchar', length: 32 })
  cityTier!: CityTier;

  @Column({ type: 'varchar', length: 16 })
  serviceLevel!: PricingServiceLevel;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  fareBaseRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  farePerKmRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  farePerMinuteRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  minFareRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  includedKm!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  includedMinutes!: string;

  @Column({ type: 'int' })
  freeWaitingSeconds!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  waitingPerMinuteRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  cancelFeeRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  noShowFeeRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  outOfCityPerKmRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  airportSurchargeRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  childSeatRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  petRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  extraStopRub!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  maxSurgeMultiplier!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  commissionPercent!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  minimumPlatformFeeRub!: string;

  @Column({ type: 'boolean', default: true })
  isEnabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
