import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaymentWebhookDto {
  @IsString()
  @MaxLength(64)
  provider!: string;

  @IsString()
  @MaxLength(128)
  providerEventId!: string;

  @IsString()
  @MaxLength(64)
  eventType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  signature?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
