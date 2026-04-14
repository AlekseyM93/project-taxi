import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderMobileSync1710000004000 implements MigrationInterface {
  name = 'OrderMobileSync1710000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_mobile_commands" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actorUserId" uuid NOT NULL,
        "deviceId" character varying(64) NOT NULL,
        "commandId" character varying(128) NOT NULL,
        "operationType" character varying(64) NOT NULL,
        "status" character varying(16) NOT NULL,
        "orderId" uuid,
        "errorCode" character varying(64),
        "errorMessage" character varying(512),
        "payload" jsonb,
        "result" jsonb,
        "clientTs" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_mobile_commands_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_mobile_commands_actor_device_cmd"
      ON "order_mobile_commands" ("actorUserId", "deviceId", "commandId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_mobile_commands_actor_createdAt"
      ON "order_mobile_commands" ("actorUserId", "createdAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_updatedAt"
      ON "orders" ("updatedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_orders_updatedAt"');
    await queryRunner.query(
      'ALTER TABLE "orders" DROP COLUMN IF EXISTS "updatedAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_order_mobile_commands_actor_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_order_mobile_commands_actor_device_cmd"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "order_mobile_commands"');
  }
}
