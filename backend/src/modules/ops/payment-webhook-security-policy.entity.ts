import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const PAYMENT_WEBHOOK_POLICY_COMPARATORS = ['GT', 'GTE'] as const;
export type PaymentWebhookPolicyComparator =
  (typeof PAYMENT_WEBHOOK_POLICY_COMPARATORS)[number];

@Entity('payment_webhook_security_policies')
@Index('IDX_payment_webhook_security_policies_ruleCode', ['ruleCode'], {
  unique: true,
})
@Index('IDX_payment_webhook_security_policies_isEnabled', ['isEnabled'])
export class PaymentWebhookSecurityPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  ruleCode!: string;

  @Column({ type: 'varchar', length: 64 })
  reasonCode!: string;

  @Column({ type: 'varchar', length: 16 })
  severity!: 'WARN' | 'CRITICAL';

  @Column({ type: 'varchar', length: 8, default: 'GTE' })
  comparator!: PaymentWebhookPolicyComparator;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  threshold!: string;

  @Column({ type: 'varchar', length: 256 })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  suggestedActions!: string[] | null;

  @Column({ type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
