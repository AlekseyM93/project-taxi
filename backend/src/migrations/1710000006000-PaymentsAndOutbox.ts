import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentsAndOutbox1710000006000 implements MigrationInterface {
  name = 'PaymentsAndOutbox1710000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "passengerId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(8) NOT NULL DEFAULT 'RUB',
        "status" character varying(16) NOT NULL DEFAULT 'AUTHORIZED',
        "provider" character varying(64) NOT NULL DEFAULT 'INTERNAL_SIMULATOR',
        "providerPaymentId" character varying(128),
        "authorizedAt" TIMESTAMP,
        "capturedAt" TIMESTAMP,
        "voidedAt" TIMESTAMP,
        "failureReason" character varying(512),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payments_order_status"
      ON "payments" ("orderId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_webhooks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" character varying(64) NOT NULL,
        "providerEventId" character varying(128) NOT NULL,
        "eventType" character varying(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "processedAt" TIMESTAMP,
        "status" character varying(16) NOT NULL DEFAULT 'RECEIVED',
        "errorMessage" character varying(512),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_webhooks_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_webhooks_provider_event"
      ON "payment_webhooks" ("provider", "providerEventId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outbox_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "topic" character varying(64) NOT NULL,
        "eventType" character varying(128) NOT NULL,
        "aggregateType" character varying(128) NOT NULL,
        "aggregateId" uuid NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'PENDING',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "lastAttemptAt" TIMESTAMP,
        "nextAttemptAt" TIMESTAMP,
        "lastError" character varying(512),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outbox_events_status_createdAt"
      ON "outbox_events" ("status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_outbox_events_status_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "outbox_events"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_webhooks_provider_event"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "payment_webhooks"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_payments_order_status"');
    await queryRunner.query('DROP TABLE IF EXISTS "payments"');
  }
}
