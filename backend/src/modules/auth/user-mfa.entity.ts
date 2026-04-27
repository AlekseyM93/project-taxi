import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_mfa_settings')
@Unique(['userId'])
export class UserMfaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  encryptedSecret!: string;

  @Column({ type: 'varchar', length: 255 })
  secretIv!: string;

  @Column({ type: 'varchar', length: 255 })
  secretAuthTag!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  recoveryCodesHash!: string[];

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  enrolledAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
