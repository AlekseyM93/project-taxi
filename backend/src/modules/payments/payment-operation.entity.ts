import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('payment_operations')
@Index(
  'IDX_payment_ops_idempotency',
  ['orderId', 'operationType', 'idempotencyKey'],
  {
    unique: true,
  },
)
export class PaymentOperationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  operationType!: 'CAPTURE' | 'VOID' | 'REFUND' | 'CONFIRM_3DS';

  @Column({ type: 'varchar', length: 128 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 16 })
  resultStatus!: 'SUCCESS' | 'SKIPPED' | 'FAILED';

  @Column({ type: 'varchar', length: 512, nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
