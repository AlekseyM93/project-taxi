import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @Length(1, 100)
  brand: string;

  @IsString()
  @Length(1, 100)
  model: string;

  @IsString()
  @Length(1, 50)
  color: string;

  @IsString()
  @Length(1, 20)
  plateNumber: string;

  @IsInt()
  @Min(1980)
  @Max(2100)
  year: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
