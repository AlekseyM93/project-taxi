import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OrderStatus {
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
  NO_DRIVERS_FOUND = 'NO_DRIVERS_FOUND',
}

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  passengerId!: string;

  @Column({ type: 'uuid', nullable: true })
  driverId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DEFAULT' })
  cityCode!: string;

  @Column({ type: 'varchar', length: 16, default: 'ECONOMY' })
  serviceLevel!: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.NEW,
  })
  status!: OrderStatus;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price!: string;

  @Column({ type: 'jsonb', nullable: true })
  pricingBreakdown!: Record<string, unknown> | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  fromLocation!: {
    type: 'Point';
    coordinates: number[];
  };

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  toLocation!: {
    type: 'Point';
    coordinates: number[];
  };

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
