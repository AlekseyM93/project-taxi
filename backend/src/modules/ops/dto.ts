import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PAYMENT_WEBHOOK_POLICY_COMPARATORS } from './payment-webhook-security-policy.entity';

export class UpsertPaymentWebhookSecurityPolicyDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => String(value).trim().toUpperCase())
  ruleCode!: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => String(value).trim().toUpperCase())
  reasonCode!: string;

  @IsIn(['WARN', 'CRITICAL'])
  severity!: 'WARN' | 'CRITICAL';

  @IsIn(PAYMENT_WEBHOOK_POLICY_COMPARATORS)
  comparator!: (typeof PAYMENT_WEBHOOK_POLICY_COMPARATORS)[number];

  @IsNumber()
  @Min(0)
  threshold!: number;

  @IsString()
  @MaxLength(256)
  message!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestedActions?: string[];

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
