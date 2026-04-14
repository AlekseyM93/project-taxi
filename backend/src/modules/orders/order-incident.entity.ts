import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('order_incidents')
export class OrderIncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'varchar', length: 64 })
  incidentType!: string;

  @Column({ type: 'varchar', length: 16, default: 'WARN' })
  severity!: 'INFO' | 'WARN' | 'ERROR';

  @Column({ type: 'varchar', length: 512 })
  message!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  traceId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  context!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
