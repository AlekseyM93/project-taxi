import { MigrationInterface, QueryRunner } from 'typeorm';

export class EcosystemExpansion1710000008000 implements MigrationInterface {
  name = 'EcosystemExpansion1710000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "city_policies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cityCode" character varying(32) NOT NULL,
        "cityName" character varying(128) NOT NULL,
        "fareBaseRub" numeric(10,2) NOT NULL DEFAULT 110,
        "farePerKmRub" numeric(10,2) NOT NULL DEFAULT 18,
        "farePerMinuteRub" numeric(10,2) NOT NULL DEFAULT 4,
        "surgeMultiplier" numeric(6,2) NOT NULL DEFAULT 1,
        "isEnabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_city_policies_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_city_policies_cityCode" UNIQUE ("cityCode")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_cases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "passengerId" uuid NOT NULL,
        "status" character varying(24) NOT NULL DEFAULT 'OPEN',
        "priority" character varying(16) NOT NULL DEFAULT 'MEDIUM',
        "reasonCode" character varying(64) NOT NULL,
        "message" character varying(512) NOT NULL,
        "assignedToUserId" uuid,
        "resolvedAt" TIMESTAMP,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_cases_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_support_cases_status_createdAt"
      ON "support_cases" ("status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_support_cases_status_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "support_cases"');
    await queryRunner.query('DROP TABLE IF EXISTS "city_policies"');
  }
}
