import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('payment_webhook_security_policy_audit_logs')
@Index('IDX_payment_webhook_security_policy_audit_createdAt', ['createdAt'])
@Index('IDX_payment_webhook_security_policy_audit_ruleCode', ['ruleCode'])
export class PaymentWebhookSecurityPolicyAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  ruleCode!: string;

  @Column({ type: 'varchar', length: 64 })
  reasonCode!: string;

  @Column({ type: 'varchar', length: 32 })
  actionType!: 'UPSERT_POLICY';

  @Column({ type: 'varchar', length: 64, nullable: true })
  actorId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
