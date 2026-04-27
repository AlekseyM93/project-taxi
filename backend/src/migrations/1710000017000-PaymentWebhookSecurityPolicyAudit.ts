import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentWebhookSecurityPolicyAudit1710000017000 implements MigrationInterface {
  name = 'PaymentWebhookSecurityPolicyAudit1710000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_webhook_security_policy_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ruleCode" character varying(64) NOT NULL,
        "reasonCode" character varying(64) NOT NULL,
        "actionType" character varying(32) NOT NULL,
        "actorId" character varying(64),
        "payload" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_webhook_security_policy_audit_logs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_webhook_security_policy_audit_createdAt"
      ON "payment_webhook_security_policy_audit_logs" ("createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_webhook_security_policy_audit_ruleCode"
      ON "payment_webhook_security_policy_audit_logs" ("ruleCode")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_webhook_security_policy_audit_ruleCode"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_webhook_security_policy_audit_createdAt"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "payment_webhook_security_policy_audit_logs"',
    );
  }
}
