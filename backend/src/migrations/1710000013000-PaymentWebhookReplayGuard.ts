import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentWebhookReplayGuard1710000013000 implements MigrationInterface {
  name = 'PaymentWebhookReplayGuard1710000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_webhook_replays" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" character varying(64) NOT NULL,
        "nonce" character varying(256) NOT NULL,
        "receivedAt" TIMESTAMP NOT NULL,
        "sourceTimestamp" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_webhook_replays_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_webhook_replays_provider_nonce"
      ON "payment_webhook_replays" ("provider", "nonce")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_webhook_replays_provider_nonce"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "payment_webhook_replays"');
  }
}
