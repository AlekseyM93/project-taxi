import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('pricing_audit_logs')
export class PricingAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  actionType!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  actorRole!: string | null;

  @Column({ type: 'varchar', length: 64 })
  cityId!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  serviceLevel!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
