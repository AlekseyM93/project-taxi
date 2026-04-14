import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('support_cases')
export class SupportCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'uuid' })
  passengerId!: string;

  @Column({ type: 'varchar', length: 24, default: 'OPEN' })
  status!: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

  @Column({ type: 'varchar', length: 16, default: 'MEDIUM' })
  priority!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ type: 'varchar', length: 64 })
  reasonCode!: string;

  @Column({ type: 'varchar', length: 512 })
  message!: string;

  @Column({ type: 'uuid', nullable: true })
  assignedToUserId!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
