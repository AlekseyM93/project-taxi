import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderIncidentEntity } from '../orders/order-incident.entity';
import { GovernanceService } from './governance.service';
import { GovernanceController } from './governance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OrderIncidentEntity])],
  providers: [GovernanceService],
  controllers: [GovernanceController],
})
export class GovernanceModule {}
