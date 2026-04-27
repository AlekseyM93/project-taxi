import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentWebhookSecurityPolicies1710000016000 implements MigrationInterface {
  name = 'PaymentWebhookSecurityPolicies1710000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_webhook_security_policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ruleCode" character varying(64) NOT NULL,
        "reasonCode" character varying(64) NOT NULL,
        "severity" character varying(16) NOT NULL,
        "comparator" character varying(8) NOT NULL DEFAULT 'GTE',
        "threshold" numeric(12,2) NOT NULL,
        "message" character varying(256) NOT NULL,
        "suggestedActions" jsonb,
        "isEnabled" boolean NOT NULL DEFAULT true,
        "updatedBy" character varying(64),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_webhook_security_policies_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_webhook_security_policies_ruleCode"
      ON "payment_webhook_security_policies" ("ruleCode")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_webhook_security_policies_isEnabled"
      ON "payment_webhook_security_policies" ("isEnabled")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_webhook_security_policies_isEnabled"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_webhook_security_policies_ruleCode"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "payment_webhook_security_policies"',
    );
  }
}
