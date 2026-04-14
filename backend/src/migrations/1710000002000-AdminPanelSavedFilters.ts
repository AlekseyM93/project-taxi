import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminPanelSavedFilters1710000002000 implements MigrationInterface {
  name = 'AdminPanelSavedFilters1710000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_panel_filters" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ownerUserId" uuid NOT NULL,
        "scope" character varying(32) NOT NULL,
        "name" character varying(80) NOT NULL,
        "payload" jsonb NOT NULL,
        "isPinned" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_panel_filters_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_panel_filters_owner_scope_createdAt"
      ON "admin_panel_filters" ("ownerUserId", "scope", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_admin_panel_filters_owner_scope_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "admin_panel_filters"');
  }
}
