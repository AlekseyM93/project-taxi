import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminActionExecutions1710000003000 implements MigrationInterface {
  name = 'AdminActionExecutions1710000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_action_executions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actorUserId" uuid NOT NULL,
        "actionType" character varying(64) NOT NULL,
        "targetType" character varying(16) NOT NULL,
        "targetId" uuid NOT NULL,
        "dryRun" boolean NOT NULL DEFAULT false,
        "status" character varying(32) NOT NULL,
        "reason" character varying(256) NOT NULL,
        "errorCode" character varying(64),
        "errorMessage" character varying(512),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_action_executions_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_action_executions_actor_createdAt"
      ON "admin_action_executions" ("actorUserId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_action_executions_action_createdAt"
      ON "admin_action_executions" ("actionType", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_action_executions_status_createdAt"
      ON "admin_action_executions" ("status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_admin_action_executions_status_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_admin_action_executions_action_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_admin_action_executions_actor_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "admin_action_executions"');
  }
}
