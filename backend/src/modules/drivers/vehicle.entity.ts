import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DriverProfileEntity } from './driver-profile.entity';

@Entity('vehicles')
export class VehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  driverProfileId: string;

  @ManyToOne(
    () => DriverProfileEntity,
    (driverProfile) => driverProfile.vehicles,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'driverProfileId' })
  driverProfile: DriverProfileEntity;

  @Column({ type: 'varchar', length: 100 })
  brand: string;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ type: 'varchar', length: 50 })
  color: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  plateNumber: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
