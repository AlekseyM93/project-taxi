/**
 * Создаёт/обновляет демо-пользователей для мобильного приложения:
 * PASSENGER + DRIVER (с профилем и машиной, чтобы можно было выйти на линию).
 *
 * Из каталога backend (Postgres уже поднят, миграции применены):
 *   node scripts/create-test-users.js
 *   npm run seed:test-users
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const DEFAULT_PASSENGER_PHONE =
  process.env.TEST_PASSENGER_PHONE || '79991111101';
const DEFAULT_DRIVER_PHONE = process.env.TEST_DRIVER_PHONE || '79992222201';
const DEFAULT_PASSWORD = process.env.TEST_MOBILE_PASSWORD || 'Test123!';

function digitsOnly(phone) {
  return String(phone).replace(/\D/g, '');
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const rows = raw.split(/\r?\n/);
  const env = {};
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

/**
 * Находит пользователя по цифрам номера (+7 и скобки не мешают), выставляет роль и пароль,
 * приводит поле phone к каноническому виду $canonicalPhone — как в приложении без «+».
 */
async function upsertUserByDigits(client, canonicalPhone, password, role) {
  const digits = digitsOnly(canonicalPhone);
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await client.query(
    `SELECT id FROM users
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1
     LIMIT 1`,
    [digits],
  );
  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE users
       SET "passwordHash" = $1, role = $2, phone = $3
       WHERE id = $4`,
      [passwordHash, role, canonicalPhone, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }
  const ins = await client.query(
    `INSERT INTO users (phone, "passwordHash", role, "fullName")
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [canonicalPhone, passwordHash, role, null],
  );
  return ins.rows[0].id;
}

async function ensureDriverProfile(client, userId) {
  const row = await client.query(
    'SELECT id FROM driver_profiles WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
  if (row.rows.length > 0) {
    await client.query(
      `UPDATE driver_profiles
       SET "firstName" = $2, "lastName" = $3, status = 'ACTIVE'::driver_profiles_status_enum,
           city = $4, "cityCode" = 'DEFAULT', "isOnlineEnabled" = true
       WHERE "userId" = $1`,
      [userId, 'Test', 'Driver', 'Moscow'],
    );
    return row.rows[0].id;
  }
  const ins = await client.query(
    `INSERT INTO driver_profiles ("userId", "firstName", "lastName", status, city, "cityCode", rating, "isOnlineEnabled")
     VALUES ($1, $2, $3, 'ACTIVE'::driver_profiles_status_enum, $4, 'DEFAULT', 5.0, true)
     RETURNING id`,
    [userId, 'Test', 'Driver', 'Moscow'],
  );
  return ins.rows[0].id;
}

async function ensureDemoVehicle(client, driverProfileId) {
  const plate = 'T-DEMO-001';
  await client.query(
    `DELETE FROM vehicles WHERE "plateNumber" = $1`,
    [plate],
  );
  await client.query(
    `INSERT INTO vehicles ("driverProfileId", brand, model, color, "plateNumber", year, "isActive")
     VALUES ($1, 'Kia', 'Rio', 'White', $2, 2022, true)`,
    [driverProfileId, plate],
  );
}

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const fileEnv = loadEnvFile(envPath);
  const getEnv = (key, fallback = '') => process.env[key] || fileEnv[key] || fallback;

  const client = new Client({
    host: getEnv('DB_HOST', 'localhost'),
    port: Number(getEnv('DB_PORT', '5433')),
    user: getEnv('DB_USER', 'taxi'),
    password: getEnv('DB_PASSWORD', 'taxi'),
    database: getEnv('DB_NAME', 'taxi'),
    ssl:
      getEnv('DB_SSL', 'false') === 'true'
        ? {
            rejectUnauthorized:
              getEnv('DB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false',
          }
        : false,
  });

  await client.connect();

  const passPhone = DEFAULT_PASSENGER_PHONE;
  const drvPhone = DEFAULT_DRIVER_PHONE;
  const pwd = DEFAULT_PASSWORD;

  await upsertUserByDigits(client, passPhone, pwd, 'PASSENGER');
  const driverUserId = await upsertUserByDigits(client, drvPhone, pwd, 'DRIVER');
  const profileId = await ensureDriverProfile(client, driverUserId);
  await ensureDemoVehicle(client, profileId);

  await client.end();

  console.log('');
  console.log('=== Тестовые пользователи для мобильного приложения ===');
  console.log('');
  console.log('Пассажир:');
  console.log(`  Телефон: ${passPhone}`);
  console.log(`  Пароль:  ${pwd}`);
  console.log('');
  console.log('Водитель:');
  console.log(`  Телефон: ${drvPhone}`);
  console.log(`  Пароль:  ${pwd}`);
  console.log('');
  console.log('Backend должен быть доступен с телефона/эмулятора (не localhost):');
  console.log('  Android Emulator: http://10.0.2.2:3000 — см. lib/main_dev_emulator.dart');
  console.log('  BlueStacks / устройство: http://<IP_вашего_ПК>:3000');
  console.log('');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
