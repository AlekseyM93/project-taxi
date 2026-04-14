import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_panel_filters')
@Index('IDX_admin_panel_filters_owner_scope_createdAt', [
  'ownerUserId',
  'scope',
  'createdAt',
])
export class AdminPanelFilterEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  ownerUserId!: string;

  @Column({ type: 'varchar', length: 32 })
  scope!: 'ORDERS' | 'AUDIT';

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  isPinned!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
