import { MigrationInterface, QueryRunner } from 'typeorm';

export class DriverAppCompleteness1710000005000 implements MigrationInterface {
  name = 'DriverAppCompleteness1710000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_shift_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "driverId" uuid NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'OPEN',
        "startedAt" TIMESTAMP NOT NULL,
        "endedAt" TIMESTAMP,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_driver_shift_sessions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_driver_shift_sessions_driver_status"
      ON "driver_shift_sessions" ("driverId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_earning_ledger" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "driverId" uuid NOT NULL,
        "orderId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "earningType" character varying(16) NOT NULL DEFAULT 'TRIP_FARE',
        "currency" character varying(16) NOT NULL DEFAULT 'RUB',
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_driver_earning_ledger_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_driver_earning_ledger_orderId"
      ON "driver_earning_ledger" ("orderId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_driver_earning_ledger_driver_createdAt"
      ON "driver_earning_ledger" ("driverId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_safety_alerts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "driverId" uuid NOT NULL,
        "orderId" uuid,
        "alertType" character varying(32) NOT NULL,
        "severity" character varying(16) NOT NULL DEFAULT 'WARN',
        "message" character varying(512) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'OPEN',
        "location" jsonb,
        "metadata" jsonb,
        "resolvedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_driver_safety_alerts_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_driver_safety_alerts_driver_status"
      ON "driver_safety_alerts" ("driverId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_driver_safety_alerts_driver_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "driver_safety_alerts"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_driver_earning_ledger_driver_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_driver_earning_ledger_orderId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "driver_earning_ledger"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_driver_shift_sessions_driver_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "driver_shift_sessions"');
  }
}
