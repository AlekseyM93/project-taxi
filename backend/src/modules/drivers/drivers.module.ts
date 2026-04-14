import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/user.entity';
import { DriverProfileEntity } from './driver-profile.entity';
import { VehicleEntity } from './vehicle.entity';
import { DriverShiftSessionEntity } from './driver-shift-session.entity';
import { DriverEarningLedgerEntity } from './driver-earning-ledger.entity';
import { DriverSafetyAlertEntity } from './driver-safety-alert.entity';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      DriverProfileEntity,
      VehicleEntity,
      DriverShiftSessionEntity,
      DriverEarningLedgerEntity,
      DriverSafetyAlertEntity,
    ]),
  ],
  providers: [DriversService],
  controllers: [DriversController],
  exports: [DriversService],
})
export class DriversModule {}
