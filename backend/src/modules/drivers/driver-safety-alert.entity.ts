import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DriverSafetyAlertType =
  | 'SOS'
  | 'INCIDENT'
  | 'APP_HEALTH'
  | 'LOCATION_GAP';
export type DriverSafetyAlertSeverity = 'INFO' | 'WARN' | 'CRITICAL';
export type DriverSafetyAlertStatus = 'OPEN' | 'RESOLVED';

@Entity('driver_safety_alerts')
export class DriverSafetyAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  driverId!: string;

  @Column({ type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  alertType!: DriverSafetyAlertType;

  @Column({ type: 'varchar', length: 16, default: 'WARN' })
  severity!: DriverSafetyAlertSeverity;

  @Column({ type: 'varchar', length: 512 })
  message!: string;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status!: DriverSafetyAlertStatus;

  @Column({ type: 'jsonb', nullable: true })
  location!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
