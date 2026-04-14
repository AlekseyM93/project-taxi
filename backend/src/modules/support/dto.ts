import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class OpenSupportCaseDto {
  @IsUUID()
  orderId!: string;

  @IsIn([
    'PRICE_MISMATCH',
    'DRIVER_BEHAVIOR',
    'ROUTE_ISSUE',
    'PAYMENT_ISSUE',
    'OTHER',
  ])
  reasonCode!: string;

  @IsString()
  @MaxLength(512)
  message!: string;
}

export class ResolveSupportCaseDto {
  @IsIn(['RESOLVED', 'IN_PROGRESS'])
  status!: 'RESOLVED' | 'IN_PROGRESS';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}
