import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GeoSuggestDto {
  @IsString()
  @MaxLength(128)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cityCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class GeoGeocodeDto {
  @IsString()
  @MaxLength(256)
  addressText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  cityCode?: string;
}

export class GeoReverseDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class GeoRouteEstimateDto {
  @IsNumber()
  fromLat!: number;

  @IsNumber()
  fromLng!: number;

  @IsNumber()
  toLat!: number;

  @IsNumber()
  toLng!: number;
}
