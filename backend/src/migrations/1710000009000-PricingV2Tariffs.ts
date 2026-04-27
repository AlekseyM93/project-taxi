import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CITY_ID_BY_TIER,
  TARIFF_SEED_MATRIX,
} from '../modules/pricing/pricing.constants';

export class PricingV2Tariffs1710000009000 implements MigrationInterface {
  name = 'PricingV2Tariffs1710000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "city_tiers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cityId" character varying(64) NOT NULL UNIQUE,
        "cityTier" character varying(32) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tariffs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cityId" character varying(64) NOT NULL,
        "cityTier" character varying(32) NOT NULL,
        "serviceLevel" character varying(16) NOT NULL,
        "fareBaseRub" numeric(10,2) NOT NULL,
        "farePerKmRub" numeric(10,2) NOT NULL,
        "farePerMinuteRub" numeric(10,2) NOT NULL,
        "minFareRub" numeric(10,2) NOT NULL,
        "includedKm" numeric(10,2) NOT NULL,
        "includedMinutes" numeric(10,2) NOT NULL,
        "freeWaitingSeconds" integer NOT NULL,
        "waitingPerMinuteRub" numeric(10,2) NOT NULL,
        "cancelFeeRub" numeric(10,2) NOT NULL,
        "noShowFeeRub" numeric(10,2) NOT NULL,
        "outOfCityPerKmRub" numeric(10,2) NOT NULL,
        "airportSurchargeRub" numeric(10,2) NOT NULL,
        "childSeatRub" numeric(10,2) NOT NULL,
        "petRub" numeric(10,2) NOT NULL,
        "extraStopRub" numeric(10,2) NOT NULL,
        "maxSurgeMultiplier" numeric(5,2) NOT NULL,
        "commissionPercent" numeric(5,2) NOT NULL,
        "minimumPlatformFeeRub" numeric(10,2) NOT NULL,
        "isEnabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_tariffs_cityId_serviceLevel" UNIQUE ("cityId", "serviceLevel")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pricing_audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "actionType" character varying(64) NOT NULL,
        "actorId" character varying(64),
        "actorRole" character varying(32),
        "cityId" character varying(64) NOT NULL,
        "serviceLevel" character varying(32),
        "payload" jsonb NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "serviceLevel" character varying(16) NOT NULL DEFAULT 'ECONOMY'
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "pricingBreakdown" jsonb
    `);

    const now = new Date().toISOString();

    for (const [tier, cityId] of Object.entries(CITY_ID_BY_TIER)) {
      await queryRunner.query(
        `
          INSERT INTO "city_tiers" ("cityId", "cityTier", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $3)
          ON CONFLICT ("cityId") DO UPDATE
          SET "cityTier" = EXCLUDED."cityTier",
              "updatedAt" = EXCLUDED."updatedAt"
        `,
        [cityId, tier, now],
      );
    }

    for (const seed of TARIFF_SEED_MATRIX) {
      const cityId = CITY_ID_BY_TIER[seed.cityTier];
      await queryRunner.query(
        `
          INSERT INTO "tariffs" (
            "cityId","cityTier","serviceLevel","fareBaseRub","farePerKmRub","farePerMinuteRub",
            "minFareRub","includedKm","includedMinutes","freeWaitingSeconds","waitingPerMinuteRub",
            "cancelFeeRub","noShowFeeRub","outOfCityPerKmRub","airportSurchargeRub","childSeatRub",
            "petRub","extraStopRub","maxSurgeMultiplier","commissionPercent","minimumPlatformFeeRub",
            "isEnabled","createdAt","updatedAt"
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,true,$22,$22
          )
          ON CONFLICT ("cityId","serviceLevel") DO UPDATE
          SET "cityTier" = EXCLUDED."cityTier",
              "fareBaseRub" = EXCLUDED."fareBaseRub",
              "farePerKmRub" = EXCLUDED."farePerKmRub",
              "farePerMinuteRub" = EXCLUDED."farePerMinuteRub",
              "minFareRub" = EXCLUDED."minFareRub",
              "includedKm" = EXCLUDED."includedKm",
              "includedMinutes" = EXCLUDED."includedMinutes",
              "freeWaitingSeconds" = EXCLUDED."freeWaitingSeconds",
              "waitingPerMinuteRub" = EXCLUDED."waitingPerMinuteRub",
              "cancelFeeRub" = EXCLUDED."cancelFeeRub",
              "noShowFeeRub" = EXCLUDED."noShowFeeRub",
              "outOfCityPerKmRub" = EXCLUDED."outOfCityPerKmRub",
              "airportSurchargeRub" = EXCLUDED."airportSurchargeRub",
              "childSeatRub" = EXCLUDED."childSeatRub",
              "petRub" = EXCLUDED."petRub",
              "extraStopRub" = EXCLUDED."extraStopRub",
              "maxSurgeMultiplier" = EXCLUDED."maxSurgeMultiplier",
              "commissionPercent" = EXCLUDED."commissionPercent",
              "minimumPlatformFeeRub" = EXCLUDED."minimumPlatformFeeRub",
              "isEnabled" = EXCLUDED."isEnabled",
              "updatedAt" = EXCLUDED."updatedAt"
        `,
        [
          cityId,
          seed.cityTier,
          seed.serviceLevel,
          seed.fareBaseRub.toFixed(2),
          seed.farePerKmRub.toFixed(2),
          seed.farePerMinuteRub.toFixed(2),
          seed.minFareRub.toFixed(2),
          seed.includedKm.toFixed(2),
          seed.includedMinutes.toFixed(2),
          seed.freeWaitingSeconds,
          seed.waitingPerMinuteRub.toFixed(2),
          seed.cancelFeeRub.toFixed(2),
          seed.noShowFeeRub.toFixed(2),
          seed.outOfCityPerKmRub.toFixed(2),
          seed.airportSurchargeRub.toFixed(2),
          seed.childSeatRub.toFixed(2),
          seed.petRub.toFixed(2),
          seed.extraStopRub.toFixed(2),
          seed.maxSurgeMultiplier.toFixed(2),
          seed.commissionPercent.toFixed(2),
          seed.minimumPlatformFeeRub.toFixed(2),
          now,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "orders" DROP COLUMN IF EXISTS "pricingBreakdown"',
    );
    await queryRunner.query(
      'ALTER TABLE "orders" DROP COLUMN IF EXISTS "serviceLevel"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "pricing_audit_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "tariffs"');
    await queryRunner.query('DROP TABLE IF EXISTS "city_tiers"');
  }
}
