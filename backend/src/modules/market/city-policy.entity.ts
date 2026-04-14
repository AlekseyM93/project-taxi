import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('city_policies')
export class CityPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  cityCode!: string;

  @Column({ type: 'varchar', length: 128 })
  cityName!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 110 })
  fareBaseRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 18 })
  farePerKmRub!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 4 })
  farePerMinuteRub!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 1 })
  surgeMultiplier!: string;

  @Column({ type: 'boolean', default: true })
  isEnabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
