import { IsEnum } from 'class-validator';
import { DriverProfileStatus } from '../driver-profile.entity';

export class UpdateDriverStatusDto {
  @IsEnum(DriverProfileStatus)
  status: DriverProfileStatus;
}
