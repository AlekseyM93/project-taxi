import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CityTierEntity } from './city-tier.entity';
import { TariffEntity } from './tariff.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { PricingAuditLogEntity } from './pricing-audit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TariffEntity,
      CityTierEntity,
      PricingAuditLogEntity,
    ]),
  ],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule implements OnModuleInit {
  constructor(private readonly pricingService: PricingService) {}

  async onModuleInit() {
    await this.pricingService.seedDefaultsIfEmpty();
  }
}
