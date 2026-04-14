import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1710000000000 implements MigrationInterface {
  name = 'InitSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "postgis"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" character varying(32) NOT NULL,
        "passwordHash" character varying(255) NOT NULL,
        "role" character varying(16) NOT NULL,
        "fullName" character varying(255),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "driver_profiles_status_enum" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "firstName" character varying(100) NOT NULL,
        "lastName" character varying(100) NOT NULL,
        "status" "driver_profiles_status_enum" NOT NULL DEFAULT 'PENDING',
        "city" character varying(100),
        "rating" numeric(3,2) NOT NULL DEFAULT '5',
        "isOnlineEnabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "REL_driver_profiles_userId" UNIQUE ("userId"),
        CONSTRAINT "PK_driver_profiles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_driver_profiles_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "driverProfileId" uuid NOT NULL,
        "brand" character varying(100) NOT NULL,
        "model" character varying(100) NOT NULL,
        "color" character varying(50) NOT NULL,
        "plateNumber" character varying(20) NOT NULL,
        "year" integer NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_vehicles_plateNumber" UNIQUE ("plateNumber"),
        CONSTRAINT "PK_vehicles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vehicles_driverProfileId" FOREIGN KEY ("driverProfileId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vehicles_driverProfileId" ON "vehicles" ("driverProfileId")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "orders_status_enum" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'NO_DRIVERS_FOUND');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "passengerId" uuid NOT NULL,
        "driverId" uuid,
        "status" "orders_status_enum" NOT NULL DEFAULT 'NEW',
        "price" numeric(10,2) NOT NULL,
        "fromLocation" geometry(Point,4326) NOT NULL,
        "toLocation" geometry(Point,4326) NOT NULL,
        "acceptedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_passengerId_createdAt" ON "orders" ("passengerId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_driverId_createdAt" ON "orders" ("driverId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_status_createdAt" ON "orders" ("status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_orders_status_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_orders_driverId_createdAt"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_orders_passengerId_createdAt"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "orders"');
    await queryRunner.query('DROP TYPE IF EXISTS "orders_status_enum"');

    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_vehicles_driverProfileId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "vehicles"');
    await queryRunner.query('DROP TABLE IF EXISTS "driver_profiles"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "driver_profiles_status_enum"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
