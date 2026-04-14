import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CityPolicyEntity } from './city-policy.entity';
import { MarketService } from './market.service';

@Module({
  imports: [TypeOrmModule.forFeature([CityPolicyEntity])],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
