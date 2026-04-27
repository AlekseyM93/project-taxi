import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('payment_security_events')
@Index('IDX_payment_security_events_createdAt', ['createdAt'])
@Index('IDX_payment_security_events_outcome_provider', ['outcome', 'provider'])
export class PaymentSecurityEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerEventId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  eventType!: string | null;

  @Column({ type: 'varchar', length: 16 })
  outcome!: 'ACCEPTED' | 'REJECTED';

  @Column({ type: 'varchar', length: 64 })
  reasonCode!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
