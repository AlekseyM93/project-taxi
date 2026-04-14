import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderObservability1710000001000 implements MigrationInterface {
  name = 'OrderObservability1710000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "eventType" character varying(64) NOT NULL,
        "fromStatus" character varying(32),
        "toStatus" character varying(32),
        "actorType" character varying(32),
        "actorId" character varying(64),
        "reason" character varying(128),
        "traceId" character varying(64),
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_events_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_events_orderId_createdAt"
      ON "order_events" ("orderId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_incidents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "incidentType" character varying(64) NOT NULL,
        "severity" character varying(16) NOT NULL DEFAULT 'WARN',
        "message" character varying(512) NOT NULL,
        "traceId" character varying(64),
        "context" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_incidents_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_incidents_orderId_createdAt"
      ON "order_incidents" ("orderId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_order_incidents_orderId_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "order_incidents"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_order_events_orderId_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "order_events"');
  }
}
