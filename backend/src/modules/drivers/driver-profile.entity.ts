import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { VehicleEntity } from './vehicle.entity';

export enum DriverProfileStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
}

@Entity('driver_profiles')
export class DriverProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @OneToOne(() => UserEntity, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({
    type: 'enum',
    enum: DriverProfileStatus,
    default: DriverProfileStatus.PENDING,
  })
  status: DriverProfileStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 32, default: 'DEFAULT' })
  cityCode: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  rating: string;

  @Column({ type: 'boolean', default: true })
  isOnlineEnabled: boolean;

  @OneToMany(() => VehicleEntity, (vehicle) => vehicle.driverProfile, {
    cascade: false,
  })
  vehicles: VehicleEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
