import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const PAYMENT_STATUSES = [
  'INITIATED',
  'AUTHORIZED',
  'CAPTURED',
  'VOIDED',
  'FAILED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

@Entity('payments')
@Index('IDX_payments_order_status', ['orderId', 'status'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'uuid' })
  passengerId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 8, default: 'RUB' })
  currency!: string;

  @Column({ type: 'varchar', length: 16, default: 'AUTHORIZED' })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 64, default: 'INTERNAL_SIMULATOR' })
  provider!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  providerPaymentId!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  authorizedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  capturedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  voidedAt!: Date | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  failureReason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
