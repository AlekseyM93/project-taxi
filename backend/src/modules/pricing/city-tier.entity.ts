import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CityTier } from './tariff.entity';

@Entity('city_tiers')
@Index('IDX_city_tiers_cityId', ['cityId'], { unique: true })
export class CityTierEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  cityId!: string;

  @Column({ type: 'varchar', length: 32 })
  cityTier!: CityTier;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
