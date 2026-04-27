const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

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

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  if (!item) {
    return fallback;
  }
  return item.slice(prefix.length);
}

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const fileEnv = loadEnvFile(envPath);
  const getEnv = (key, fallback = '') => process.env[key] || fileEnv[key] || fallback;

  const phone = getArg('phone', '79990000001');
  const password = getArg('password', 'Admin123!');
  const role = (getArg('role', 'ADMIN') || 'ADMIN').toUpperCase();

  if (!['ADMIN', 'DISPATCHER'].includes(role)) {
    throw new Error('role must be ADMIN or DISPATCHER');
  }

  const client = new Client({
    host: getEnv('DB_HOST', 'localhost'),
    port: Number(getEnv('DB_PORT', '5433')),
    user: getEnv('DB_USER', 'taxi'),
    password: getEnv('DB_PASSWORD', 'taxi'),
    database: getEnv('DB_NAME', 'taxi'),
    ssl:
      getEnv('DB_SSL', 'false') === 'true'
        ? {
            rejectUnauthorized: getEnv('DB_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false',
          }
        : false,
  });

  await client.connect();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await client.query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [phone]);
  if (existing.rows.length > 0) {
    await client.query(
      'UPDATE users SET "passwordHash" = $1, role = $2 WHERE phone = $3',
      [passwordHash, role, phone],
    );
    console.log(`Updated existing ${role} user: ${phone}`);
  } else {
    await client.query(
      'INSERT INTO users (phone, "passwordHash", role, "fullName") VALUES ($1, $2, $3, $4)',
      [phone, passwordHash, role, null],
    );
    console.log(`Created new ${role} user: ${phone}`);
  }

  await client.end();
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
