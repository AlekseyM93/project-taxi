import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type UserRole = 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';

@Entity('users')
@Unique(['phone'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  phone!: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: UserRole;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fullName!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
