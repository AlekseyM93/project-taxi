import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { DriverProfileStatus } from '../driver-profile.entity';

export class UpdateDriverProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;

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

  @IsOptional()
  @IsBoolean()
  isOnlineEnabled?: boolean;
}
