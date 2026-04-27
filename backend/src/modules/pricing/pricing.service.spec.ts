import { Repository } from 'typeorm';
import { PricingService } from './pricing.service';
import { TariffEntity } from './tariff.entity';
import { CityTierEntity } from './city-tier.entity';
import { PricingAuditLogEntity } from './pricing-audit.entity';

function createRepoMock<T extends object>() {
  return {
    count: jest.fn<Promise<number>, []>(),
    findOne: jest.fn<Promise<T | null>, [unknown]>(),
    find: jest.fn<Promise<T[]>, [unknown]>(),
    create: jest.fn((payload: Partial<T>) => payload as T),
    save: jest.fn<Promise<T | T[]>, [T | T[]]>(),
  } as unknown as jest.Mocked<Repository<T>>;
}

describe('PricingService', () => {
  const tariffRepo = createRepoMock<TariffEntity>();
  const cityTierRepo = createRepoMock<CityTierEntity>();
  const pricingAuditRepo = createRepoMock<PricingAuditLogEntity>();
  const service = new PricingService(
    tariffRepo,
    cityTierRepo,
    pricingAuditRepo,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates full breakdown with addons and surge cap', async () => {
    tariffRepo.findOne.mockResolvedValue({
      id: 'tariff-id',
      cityId: 'MOSCOW',
      cityTier: 'CITY_TIER_A',
      serviceLevel: 'ECONOMY',
      fareBaseRub: '159.00',
      farePerKmRub: '14.00',
      farePerMinuteRub: '12.00',
      minFareRub: '179.00',
      includedKm: '1.00',
      includedMinutes: '3.00',
      freeWaitingSeconds: 180,
      waitingPerMinuteRub: '12.00',
      cancelFeeRub: '79.00',
      noShowFeeRub: '129.00',
      outOfCityPerKmRub: '20.00',
      airportSurchargeRub: '150.00',
      childSeatRub: '150.00',
      petRub: '100.00',
      extraStopRub: '100.00',
      maxSurgeMultiplier: '2.00',
      commissionPercent: '14.00',
      minimumPlatformFeeRub: '45.00',
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TariffEntity);

    const result = await service.calculatePrice({
      cityCode: 'MOSCOW',
      serviceLevel: 'ECONOMY',
      routeKm: 10,
      routeMinutes: 20,
      waitingSeconds: 600,
      isAirportRoute: true,
      withChildSeat: true,
      withPet: true,
      extraStopsCount: 2,
      outOfCityKm: 5,
      requestedSurgeMultiplier: 2.5,
    });

    expect(result.appliedSurgeMultiplier).toBe(2);
    expect(result.totalPriceRub).toBe(2546);
    expect(result.platformFeeRub).toBe(356.44);
    expect(result.driverGrossIncomeRub).toBe(2189.56);
    expect(result.selfEmploymentTaxRub).toBe(87.58);
    expect(result.driverNetIncomeRub).toBe(2101.98);
    expect(result.waitingChargeRub).toBe(84);
    expect(result.airportChargeRub).toBe(150);
    expect(result.childSeatChargeRub).toBe(150);
    expect(result.petChargeRub).toBe(100);
    expect(result.extraStopChargeRub).toBe(200);
    expect(result.outOfCityChargeRub).toBe(100);
  });

  it('uses minimum platform fee floor when commission is lower', async () => {
    tariffRepo.findOne.mockResolvedValue({
      id: 'tariff-id',
      cityId: 'SMALL_CITY_DEFAULT',
      cityTier: 'CITY_TIER_E',
      serviceLevel: 'ECONOMY',
      fareBaseRub: '75.00',
      farePerKmRub: '9.00',
      farePerMinuteRub: '5.00',
      minFareRub: '95.00',
      includedKm: '1.00',
      includedMinutes: '3.00',
      freeWaitingSeconds: 120,
      waitingPerMinuteRub: '8.00',
      cancelFeeRub: '29.00',
      noShowFeeRub: '49.00',
      outOfCityPerKmRub: '10.00',
      airportSurchargeRub: '0.00',
      childSeatRub: '80.00',
      petRub: '50.00',
      extraStopRub: '40.00',
      maxSurgeMultiplier: '1.60',
      commissionPercent: '10.00',
      minimumPlatformFeeRub: '20.00',
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TariffEntity);

    const result = await service.calculatePrice({
      cityCode: 'SATELLITE_CITY',
      serviceLevel: 'ECONOMY',
      routeKm: 1,
      routeMinutes: 3,
    });

    expect(result.totalPriceRub).toBe(95);
    expect(result.platformFeeRub).toBe(20);
    expect(result.driverGrossIncomeRub).toBe(75);
  });
});
