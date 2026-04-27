import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentWebhookReplayCreatedAtIndex1710000014000 implements MigrationInterface {
  name = 'PaymentWebhookReplayCreatedAtIndex1710000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_webhook_replays_createdAt"
      ON "payment_webhook_replays" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_webhook_replays_createdAt"',
    );
  }
}
