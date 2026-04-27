import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingInputDto, UpsertCityTierDto, UpsertTariffDto } from './dto';
import { CITY_ID_BY_TIER, TARIFF_SEED_MATRIX } from './pricing.constants';
import { CityTierEntity } from './city-tier.entity';
import {
  CityTier,
  PricingServiceLevel,
  PRICING_SERVICE_LEVELS,
  TariffEntity,
} from './tariff.entity';
import { PricingAuditLogEntity } from './pricing-audit.entity';

type ResolveTariffParams = {
  cityCode?: string;
  serviceLevel?: PricingServiceLevel;
};

type CalculatePriceParams = ResolveTariffParams & PricingInputDto;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(TariffEntity)
    private readonly tariffRepo: Repository<TariffEntity>,
    @InjectRepository(CityTierEntity)
    private readonly cityTierRepo: Repository<CityTierEntity>,
    @InjectRepository(PricingAuditLogEntity)
    private readonly pricingAuditRepo: Repository<PricingAuditLogEntity>,
  ) {}

  private numeric(input: string): number {
    return Number(input);
  }

  private normalizeCityId(cityCode?: string): string {
    return cityCode?.trim().toUpperCase() || 'DEFAULT';
  }

  private normalizeServiceLevel(serviceLevel?: string): PricingServiceLevel {
    const normalized = serviceLevel?.trim().toUpperCase() || 'ECONOMY';
    if (!PRICING_SERVICE_LEVELS.includes(normalized as PricingServiceLevel)) {
      throw new BadRequestException('UNSUPPORTED_SERVICE_LEVEL');
    }
    return normalized as PricingServiceLevel;
  }

  private async resolveTier(cityId: string): Promise<CityTier> {
    const mapped = await this.cityTierRepo.findOne({
      where: { cityId },
    });
    return mapped?.cityTier ?? 'CITY_TIER_C';
  }

  async seedDefaultsIfEmpty() {
    const count = await this.tariffRepo.count();
    if (count > 0) {
      return;
    }

    const tierRows = (Object.keys(CITY_ID_BY_TIER) as CityTier[]).map((tier) =>
      this.cityTierRepo.create({
        cityId: CITY_ID_BY_TIER[tier],
        cityTier: tier,
      }),
    );
    await this.cityTierRepo.save(tierRows);

    const tariffRows = TARIFF_SEED_MATRIX.map((seed) =>
      this.tariffRepo.create({
        cityId: CITY_ID_BY_TIER[seed.cityTier],
        cityTier: seed.cityTier,
        serviceLevel: seed.serviceLevel,
        fareBaseRub: seed.fareBaseRub.toFixed(2),
        farePerKmRub: seed.farePerKmRub.toFixed(2),
        farePerMinuteRub: seed.farePerMinuteRub.toFixed(2),
        minFareRub: seed.minFareRub.toFixed(2),
        includedKm: seed.includedKm.toFixed(2),
        includedMinutes: seed.includedMinutes.toFixed(2),
        freeWaitingSeconds: seed.freeWaitingSeconds,
        waitingPerMinuteRub: seed.waitingPerMinuteRub.toFixed(2),
        cancelFeeRub: seed.cancelFeeRub.toFixed(2),
        noShowFeeRub: seed.noShowFeeRub.toFixed(2),
        outOfCityPerKmRub: seed.outOfCityPerKmRub.toFixed(2),
        airportSurchargeRub: seed.airportSurchargeRub.toFixed(2),
        childSeatRub: seed.childSeatRub.toFixed(2),
        petRub: seed.petRub.toFixed(2),
        extraStopRub: seed.extraStopRub.toFixed(2),
        maxSurgeMultiplier: seed.maxSurgeMultiplier.toFixed(2),
        commissionPercent: seed.commissionPercent.toFixed(2),
        minimumPlatformFeeRub: seed.minimumPlatformFeeRub.toFixed(2),
      }),
    );
    await this.tariffRepo.save(tariffRows);
  }

  async resolveTariff(params: ResolveTariffParams) {
    const cityId = this.normalizeCityId(params.cityCode);
    const serviceLevel = this.normalizeServiceLevel(params.serviceLevel);

    const directTariff = await this.tariffRepo.findOne({
      where: {
        cityId,
        serviceLevel,
        isEnabled: true,
      },
    });
    if (directTariff) {
      return {
        tariff: directTariff,
        resolvedCityId: cityId,
      };
    }

    const tier = await this.resolveTier(cityId);
    const fallbackCityId = CITY_ID_BY_TIER[tier];

    const tierTariff = await this.tariffRepo.findOne({
      where: {
        cityId: fallbackCityId,
        serviceLevel,
        isEnabled: true,
      },
    });
    if (!tierTariff) {
      throw new NotFoundException('TARIFF_NOT_FOUND');
    }

    return {
      tariff: tierTariff,
      resolvedCityId: cityId,
    };
  }

  async calculatePrice(params: CalculatePriceParams) {
    const { tariff, resolvedCityId } = await this.resolveTariff(params);

    const routeKm = Math.max(0, params.routeKm ?? 0);
    const routeMinutes = Math.max(0, params.routeMinutes ?? 0);
    const waitingSeconds = Math.max(0, params.waitingSeconds ?? 0);
    const extraStopsCount = Math.max(0, params.extraStopsCount ?? 0);
    const outOfCityKm = Math.max(0, params.outOfCityKm ?? 0);

    const fareBaseRub = this.numeric(tariff.fareBaseRub);
    const farePerKmRub = this.numeric(tariff.farePerKmRub);
    const farePerMinuteRub = this.numeric(tariff.farePerMinuteRub);
    const minFareRub = this.numeric(tariff.minFareRub);
    const includedKm = this.numeric(tariff.includedKm);
    const includedMinutes = this.numeric(tariff.includedMinutes);
    const waitingPerMinuteRub = this.numeric(tariff.waitingPerMinuteRub);
    const outOfCityPerKmRub = this.numeric(tariff.outOfCityPerKmRub);
    const airportSurchargeRub = this.numeric(tariff.airportSurchargeRub);
    const childSeatRub = this.numeric(tariff.childSeatRub);
    const petRub = this.numeric(tariff.petRub);
    const extraStopRub = this.numeric(tariff.extraStopRub);
    const maxSurgeMultiplier = this.numeric(tariff.maxSurgeMultiplier);
    const commissionPercent = this.numeric(tariff.commissionPercent);
    const minimumPlatformFeeRub = this.numeric(tariff.minimumPlatformFeeRub);

    const overIncludedKm = Math.max(0, routeKm - includedKm);
    const overIncludedMinutes = Math.max(0, routeMinutes - includedMinutes);
    const distanceChargeRub = overIncludedKm * farePerKmRub;
    const timeChargeRub = overIncludedMinutes * farePerMinuteRub;
    const baseTripRub = Math.max(
      minFareRub,
      fareBaseRub + distanceChargeRub + timeChargeRub,
    );

    const waitingChargeRub =
      waitingSeconds > tariff.freeWaitingSeconds
        ? ((waitingSeconds - tariff.freeWaitingSeconds) / 60) *
          waitingPerMinuteRub
        : 0;
    const airportChargeRub = params.isAirportRoute ? airportSurchargeRub : 0;
    const childSeatChargeRub = params.withChildSeat ? childSeatRub : 0;
    const petChargeRub = params.withPet ? petRub : 0;
    const extraStopChargeRub = extraStopsCount * extraStopRub;
    const outOfCityChargeRub = outOfCityKm * outOfCityPerKmRub;

    const beforeSurgeRub =
      baseTripRub +
      waitingChargeRub +
      airportChargeRub +
      childSeatChargeRub +
      petChargeRub +
      extraStopChargeRub +
      outOfCityChargeRub;

    const requestedSurgeMultiplier = Math.max(
      1,
      params.requestedSurgeMultiplier ?? 1,
    );
    const appliedSurgeMultiplier = Math.min(
      maxSurgeMultiplier,
      requestedSurgeMultiplier,
    );
    const surgedTotalRub = beforeSurgeRub * appliedSurgeMultiplier;
    const platformFeeRub = Math.max(
      minimumPlatformFeeRub,
      (surgedTotalRub * commissionPercent) / 100,
    );
    const totalPriceRub = round2(surgedTotalRub);
    const roundedPlatformFeeRub = round2(platformFeeRub);
    const driverGrossIncomeRub = round2(totalPriceRub - roundedPlatformFeeRub);
    const selfEmploymentTaxRub = round2(driverGrossIncomeRub * 0.04);
    const driverNetIncomeRub = round2(
      driverGrossIncomeRub - selfEmploymentTaxRub,
    );

    return {
      cityId: resolvedCityId,
      cityTier: tariff.cityTier,
      serviceLevel: tariff.serviceLevel,
      tariffId: tariff.id,
      totalPriceRub,
      platformFeeRub: roundedPlatformFeeRub,
      driverGrossIncomeRub,
      selfEmploymentTaxRub,
      driverNetIncomeRub,
      waitingChargeRub: round2(waitingChargeRub),
      airportChargeRub: round2(airportChargeRub),
      childSeatChargeRub: round2(childSeatChargeRub),
      petChargeRub: round2(petChargeRub),
      extraStopChargeRub: round2(extraStopChargeRub),
      outOfCityChargeRub: round2(outOfCityChargeRub),
      distanceChargeRub: round2(distanceChargeRub),
      timeChargeRub: round2(timeChargeRub),
      appliedSurgeMultiplier: round2(appliedSurgeMultiplier),
      minimumPlatformFeeRub: round2(minimumPlatformFeeRub),
      commissionPercent: round2(commissionPercent),
      baseTripRub: round2(baseTripRub),
      beforeSurgeRub: round2(beforeSurgeRub),
      meta: {
        routeKm: round2(routeKm),
        routeMinutes: round2(routeMinutes),
        waitingSeconds,
        outOfCityKm: round2(outOfCityKm),
      },
    };
  }

  async listTariffs(cityId?: string) {
    const normalized = cityId?.trim().toUpperCase();
    return this.tariffRepo.find({
      where: normalized ? { cityId: normalized } : {},
      order: {
        cityTier: 'ASC',
        cityId: 'ASC',
        serviceLevel: 'ASC',
      },
    });
  }

  private async writeAudit(params: {
    actionType: string;
    actorId?: string | null;
    actorRole?: string | null;
    cityId: string;
    serviceLevel?: string | null;
    payload: Record<string, unknown>;
  }) {
    await this.pricingAuditRepo.save(
      this.pricingAuditRepo.create({
        actionType: params.actionType,
        actorId: params.actorId ?? null,
        actorRole: params.actorRole ?? null,
        cityId: params.cityId,
        serviceLevel: params.serviceLevel ?? null,
        payload: params.payload,
      }),
    );
  }

  async upsertTariff(
    dto: UpsertTariffDto,
    actor?: { actorId?: string | null; actorRole?: string | null },
  ) {
    const cityId =
      dto.cityId?.trim().toUpperCase() || CITY_ID_BY_TIER[dto.cityTier];
    const row =
      (await this.tariffRepo.findOne({
        where: {
          cityId,
          serviceLevel: dto.serviceLevel,
        },
      })) ?? this.tariffRepo.create({ cityId, serviceLevel: dto.serviceLevel });

    Object.assign(row, {
      cityTier: dto.cityTier,
      fareBaseRub: dto.fareBaseRub.toFixed(2),
      farePerKmRub: dto.farePerKmRub.toFixed(2),
      farePerMinuteRub: dto.farePerMinuteRub.toFixed(2),
      minFareRub: dto.minFareRub.toFixed(2),
      includedKm: dto.includedKm.toFixed(2),
      includedMinutes: dto.includedMinutes.toFixed(2),
      freeWaitingSeconds: Math.round(dto.freeWaitingSeconds),
      waitingPerMinuteRub: dto.waitingPerMinuteRub.toFixed(2),
      cancelFeeRub: dto.cancelFeeRub.toFixed(2),
      noShowFeeRub: dto.noShowFeeRub.toFixed(2),
      outOfCityPerKmRub: dto.outOfCityPerKmRub.toFixed(2),
      airportSurchargeRub: dto.airportSurchargeRub.toFixed(2),
      childSeatRub: dto.childSeatRub.toFixed(2),
      petRub: dto.petRub.toFixed(2),
      extraStopRub: dto.extraStopRub.toFixed(2),
      maxSurgeMultiplier: dto.maxSurgeMultiplier.toFixed(2),
      commissionPercent: dto.commissionPercent.toFixed(2),
      minimumPlatformFeeRub: dto.minimumPlatformFeeRub.toFixed(2),
      isEnabled: true,
    });
    const saved = await this.tariffRepo.save(row);
    await this.upsertCityTier({ cityId, cityTier: dto.cityTier });
    await this.writeAudit({
      actionType: 'UPSERT_TARIFF',
      actorId: actor?.actorId,
      actorRole: actor?.actorRole,
      cityId,
      serviceLevel: dto.serviceLevel,
      payload: dto as unknown as Record<string, unknown>,
    });
    return saved;
  }

  async listCityTiers() {
    return this.cityTierRepo.find({
      order: {
        cityId: 'ASC',
      },
    });
  }

  async upsertCityTier(
    dto: UpsertCityTierDto,
    actor?: { actorId?: string | null; actorRole?: string | null },
  ) {
    const normalizedCityId = dto.cityId.trim().toUpperCase();
    const row =
      (await this.cityTierRepo.findOne({
        where: { cityId: normalizedCityId },
      })) ?? this.cityTierRepo.create({ cityId: normalizedCityId });
    row.cityTier = dto.cityTier;
    const saved = await this.cityTierRepo.save(row);
    await this.writeAudit({
      actionType: 'UPSERT_CITY_TIER',
      actorId: actor?.actorId,
      actorRole: actor?.actorRole,
      cityId: normalizedCityId,
      payload: dto as unknown as Record<string, unknown>,
    });
    return saved;
  }

  async listAuditLogs(limit = 50) {
    return this.pricingAuditRepo.find({
      order: {
        createdAt: 'DESC',
      },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
