import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentSecurityEvents1710000015000 implements MigrationInterface {
  name = 'PaymentSecurityEvents1710000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_security_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" character varying(64) NOT NULL,
        "providerEventId" character varying(128),
        "eventType" character varying(64),
        "outcome" character varying(16) NOT NULL,
        "reasonCode" character varying(64) NOT NULL,
        "ipAddress" character varying(64),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_security_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_security_events_createdAt"
      ON "payment_security_events" ("createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_security_events_outcome_provider"
      ON "payment_security_events" ("outcome", "provider")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_security_events_outcome_provider"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_security_events_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "payment_security_events"');
  }
}
