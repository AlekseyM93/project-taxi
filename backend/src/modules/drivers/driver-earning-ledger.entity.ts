import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type DriverEarningType = 'TRIP_FARE' | 'ADJUSTMENT';

@Entity('driver_earning_ledger')
export class DriverEarningLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  driverId!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 16, default: 'TRIP_FARE' })
  earningType!: DriverEarningType;

  @Column({ type: 'varchar', length: 16, default: 'RUB' })
  currency!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
