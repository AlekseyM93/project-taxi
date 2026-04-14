import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CityPolicyEntity } from './city-policy.entity';

@Injectable()
export class MarketService {
  constructor(
    @InjectRepository(CityPolicyEntity)
    private readonly cityPolicyRepo: Repository<CityPolicyEntity>,
  ) {}

  async getPricingPolicy(cityCode?: string) {
    const normalizedCityCode = cityCode?.trim().toUpperCase() || 'DEFAULT';
    const policy = await this.cityPolicyRepo.findOne({
      where: { cityCode: normalizedCityCode, isEnabled: true },
    });

    if (!policy) {
      return {
        cityCode: normalizedCityCode,
        baseFare: Number(process.env.FARE_BASE_RUB || 110),
        perKmFare: Number(process.env.FARE_PER_KM_RUB || 18),
        perMinuteFare: Number(process.env.FARE_PER_MINUTE_RUB || 4),
        surgeMultiplier: Number(process.env.FARE_SURGE_MULTIPLIER || 1),
      };
    }

    return {
      cityCode: policy.cityCode,
      baseFare: Number(policy.fareBaseRub),
      perKmFare: Number(policy.farePerKmRub),
      perMinuteFare: Number(policy.farePerMinuteRub),
      surgeMultiplier: Number(policy.surgeMultiplier),
    };
  }
}
