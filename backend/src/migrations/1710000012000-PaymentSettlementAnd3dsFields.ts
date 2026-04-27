import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentSettlementAnd3dsFields1710000012000 implements MigrationInterface {
  name = 'PaymentSettlementAnd3dsFields1710000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "requiresActionAt" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "payments" DROP COLUMN IF EXISTS "settledAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "payments" DROP COLUMN IF EXISTS "requiresActionAt"',
    );
  }
}
