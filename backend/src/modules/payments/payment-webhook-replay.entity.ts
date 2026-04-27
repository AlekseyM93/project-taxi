import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('payment_webhook_replays')
@Index('IDX_payment_webhook_replays_provider_nonce', ['provider', 'nonce'], {
  unique: true,
})
@Index('IDX_payment_webhook_replays_createdAt', ['createdAt'])
export class PaymentWebhookReplayEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 256 })
  nonce!: string;

  @Column({ type: 'timestamp' })
  receivedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  sourceTimestamp!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
