import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentOperations1710000011000 implements MigrationInterface {
  name = 'PaymentOperations1710000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_operations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "paymentId" uuid,
        "operationType" character varying(32) NOT NULL,
        "idempotencyKey" character varying(128) NOT NULL,
        "resultStatus" character varying(16) NOT NULL,
        "reason" character varying(512),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_operations_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_ops_idempotency"
      ON "payment_operations" ("orderId", "operationType", "idempotencyKey")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_payment_ops_idempotency"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "payment_operations"');
  }
}
