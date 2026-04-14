import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_action_executions')
@Index('IDX_admin_action_executions_actor_createdAt', [
  'actorUserId',
  'createdAt',
])
@Index('IDX_admin_action_executions_action_createdAt', [
  'actionType',
  'createdAt',
])
@Index('IDX_admin_action_executions_status_createdAt', ['status', 'createdAt'])
export class AdminActionExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 64 })
  actionType!: string;

  @Column({ type: 'varchar', length: 16 })
  targetType!: 'ORDER' | 'DRIVER';

  @Column({ type: 'uuid' })
  targetId!: string;

  @Column({ type: 'boolean', default: false })
  dryRun!: boolean;

  @Column({ type: 'varchar', length: 32 })
  status!: 'SUCCESS' | 'FAILED' | 'SKIPPED_DRY_RUN';

  @Column({ type: 'varchar', length: 256 })
  reason!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
