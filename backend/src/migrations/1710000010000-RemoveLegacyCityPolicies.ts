import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveLegacyCityPolicies1710000010000 implements MigrationInterface {
  name = 'RemoveLegacyCityPolicies1710000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "city_policies"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "city_policies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
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
  }
}
