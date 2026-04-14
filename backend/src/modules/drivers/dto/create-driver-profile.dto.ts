import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { DriverProfileStatus } from '../driver-profile.entity';

export class CreateDriverProfileDto {
  @IsUUID()
  userId: string;

  @IsString()
  @Length(1, 100)
  firstName: string;

  @IsString()
  @Length(1, 100)
  lastName: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 32)
  cityCode?: string;

  @IsOptional()
  @IsEnum(DriverProfileStatus)
  status?: DriverProfileStatus;
}
