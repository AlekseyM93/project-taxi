import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OrderMobileCommandStatus = 'APPLIED' | 'REJECTED';

@Entity('order_mobile_commands')
@Index(
  'IDX_order_mobile_commands_actor_device_cmd',
  ['actorUserId', 'deviceId', 'commandId'],
  {
    unique: true,
  },
)
@Index('IDX_order_mobile_commands_actor_createdAt', [
  'actorUserId',
  'createdAt',
])
export class OrderMobileCommandEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 64 })
  deviceId!: string;

  @Column({ type: 'varchar', length: 128 })
  commandId!: string;

  @Column({ type: 'varchar', length: 64 })
  operationType!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: OrderMobileCommandStatus;

  @Column({ type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  result!: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  clientTs!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
