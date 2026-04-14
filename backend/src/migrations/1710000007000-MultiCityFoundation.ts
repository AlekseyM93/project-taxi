import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiCityFoundation1710000007000 implements MigrationInterface {
  name = 'MultiCityFoundation1710000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "cityCode" character varying(32) NOT NULL DEFAULT 'DEFAULT'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_cityCode_createdAt"
      ON "orders" ("cityCode", "createdAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
      ADD COLUMN IF NOT EXISTS "cityCode" character varying(32) NOT NULL DEFAULT 'DEFAULT'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_driver_profiles_cityCode_status"
      ON "driver_profiles" ("cityCode", "status")
    `);

    await queryRunner.query(`
      UPDATE "driver_profiles"
      SET "cityCode" = UPPER(REPLACE(TRIM("city"), ' ', '_'))
      WHERE "city" IS NOT NULL
        AND LENGTH(TRIM("city")) > 0
        AND ("cityCode" = 'DEFAULT' OR "cityCode" IS NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_driver_profiles_cityCode_status"',
    );
    await queryRunner.query(
      'ALTER TABLE "driver_profiles" DROP COLUMN IF EXISTS "cityCode"',
    );

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_orders_cityCode_createdAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "orders" DROP COLUMN IF EXISTS "cityCode"',
    );
  }
}
