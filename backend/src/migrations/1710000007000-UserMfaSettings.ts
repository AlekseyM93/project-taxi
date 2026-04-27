import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserMfaSettings1710000007000 implements MigrationInterface {
  name = 'UserMfaSettings1710000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_mfa_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "encryptedSecret" character varying(255) NOT NULL,
        "secretIv" character varying(255) NOT NULL,
        "secretAuthTag" character varying(255) NOT NULL,
        "recoveryCodesHash" jsonb NOT NULL DEFAULT '[]',
        "enabled" boolean NOT NULL DEFAULT true,
        "enrolledAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_mfa_settings_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_mfa_settings_userId"
      ON "user_mfa_settings" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_user_mfa_settings_userId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "user_mfa_settings"');
  }
}
