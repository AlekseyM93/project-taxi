const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const idx = line.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const PASSWORD = process.env.SMOKE_PASSWORD || 'secret123';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USER || 'taxi',
  password: process.env.DB_PASSWORD || 'taxi',
  database: process.env.DB_NAME || 'taxi',
  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : false,
};

function makePhone(prefix) {
  const seed = Date.now().toString().slice(-8);
  const rnd = Math.floor(Math.random() * 90 + 10);
  return `+79${prefix}${seed}${rnd}`.slice(0, 12);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}

async function registerUser({ phone, role }) {
  const response = await requestJson('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD, role }),
  });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`register ${role} failed: ${JSON.stringify(response.body)}`);
  }
  return response.body?.id ?? null;
}

async function login(phone) {
  const response = await requestJson('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  if ((response.status !== 201 && response.status !== 200) || !response.body?.accessToken) {
    throw new Error(`login failed: ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken;
}

async function expectUnauthorized(path, method = 'GET') {
  const response = await fetch(`${BASE_URL}${path}`, { method });
  if (response.status !== 401) {
    const body = await response.text();
    throw new Error(
      `Expected 401 for ${method} ${path}, got ${response.status}. Body: ${body}`,
    );
  }
  console.log(`OK 401: ${method} ${path}`);
}

async function expectForbidden(path, token, method = 'GET', body = null) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status !== 403) {
    const responseBody = await response.text();
    throw new Error(
      `Expected 403 for ${method} ${path}, got ${response.status}. Body: ${responseBody}`,
    );
  }
  console.log(`OK 403: ${method} ${path}`);
}

async function cleanupTestUsers(ctx) {
  if (!ctx.passengerUserId && !ctx.driverUserId) {
    return;
  }
  const db = new Client(DB_CONFIG);
  await db.connect();
  try {
    await db.query('BEGIN');
    if (ctx.passengerUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [ctx.passengerUserId]);
    }
    if (ctx.driverUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [ctx.driverUserId]);
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

async function run() {
  const ctx = {
    passengerUserId: null,
    driverUserId: null,
  };
  try {
    console.log('[security-authz] Starting unauthorized access regression...');

    await expectUnauthorized('/drivers');
    await expectUnauthorized('/drivers/00000000-0000-0000-0000-000000000000');
    await expectUnauthorized(
      '/vehicles/00000000-0000-0000-0000-000000000000',
      'PATCH',
    );
    await expectUnauthorized('/orders/00000000-0000-0000-0000-000000000000');
    await expectUnauthorized('/orders/00000000-0000-0000-0000-000000000000/dispatch');

    const passengerPhone = makePhone('51');
    const driverPhone = makePhone('52');

    ctx.passengerUserId = await registerUser({ phone: passengerPhone, role: 'PASSENGER' });
    ctx.driverUserId = await registerUser({ phone: driverPhone, role: 'DRIVER' });
    const passengerToken = await login(passengerPhone);
    const driverToken = await login(driverPhone);

    console.log('[security-authz] Starting role-based forbidden regression...');

    await expectForbidden('/orders/admin/metrics', passengerToken);
    await expectForbidden('/orders/admin/metrics', driverToken);
    await expectForbidden('/ops/dashboard/summary?windowMinutes=60', passengerToken);
    await expectForbidden('/payments/security/snapshot?windowMinutes=60', passengerToken);
    await expectForbidden(
      '/orders/admin/actions/00000000-0000-0000-0000-000000000000/force-cancel',
      driverToken,
      'POST',
      {
        reason: 'authz regression check',
      },
    );

    console.log('[security-authz] Completed successfully.');
  } finally {
    await cleanupTestUsers(ctx);
  }
}

run().catch((error) => {
  console.error('[security-authz] FAILED:', error.message || error);
  process.exit(1);
});
