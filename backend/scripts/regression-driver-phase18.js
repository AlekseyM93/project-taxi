const { Client } = require('pg');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

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

const API_URL = process.env.API_URL || 'http://localhost:3000';
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

const PASSWORD = process.env.SMOKE_PASSWORD || 'secret123';
const ADMIN_PHONE = process.env.SMOKE_ADMIN_PHONE || '79990000001';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'Admin123!';
const STEP_TIMEOUT_MS = Number(process.env.SMOKE_STEP_TIMEOUT_MS || 8000);
const OFFER_TIMEOUT_MS = Number(process.env.SMOKE_OFFER_TIMEOUT_MS || 15000);

function makePhone(prefix) {
  const seed = Date.now().toString().slice(-8);
  const rnd = Math.floor(Math.random() * 90 + 10);
  return `+79${prefix}${seed}${rnd}`.slice(0, 12);
}

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${API_URL}${pathname}`, options);
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
  assertOk(
    response.status === 201 || response.status === 200,
    `register ${role} failed: ${JSON.stringify(response.body)}`,
  );
  return response.body.id;
}

async function login(phone) {
  const response = await requestJson('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  assertOk(response.status === 201 || response.status === 200, 'login failed');
  assertOk(response.body?.accessToken, 'login token missing');
  return response.body.accessToken;
}

async function loginAdmin() {
  const response = await requestJson('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD }),
  });
  assertOk(
    response.status === 201 || response.status === 200,
    `admin login failed: ${JSON.stringify(response.body)}`,
  );
  assertOk(response.body?.accessToken, 'admin login token missing');
  return response.body.accessToken;
}

async function createDriverProfile(userId, adminToken) {
  const response = await requestJson('/drivers', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      firstName: 'Phase18',
      lastName: 'Driver',
      city: 'Moscow',
      status: 'ACTIVE',
    }),
  });
  assertOk(
    response.status === 201 || response.status === 200,
    `create driver profile failed: ${JSON.stringify(response.body)}`,
  );
  return response.body.id;
}

async function createVehicle(driverId, adminToken) {
  const response = await requestJson(`/drivers/${driverId}/vehicles`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      brand: 'Skoda',
      model: 'Rapid',
      color: 'Blue',
      plateNumber: `P18${Date.now().toString().slice(-6)}`,
      year: 2020,
      isActive: true,
    }),
  });
  assertOk(
    response.status === 201 || response.status === 200,
    `create vehicle failed: ${JSON.stringify(response.body)}`,
  );
}

function emitWithAck(socket, event, payload, timeoutMs = STEP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let done = false;
    socket.emit(event, payload, (ack) => {
      done = true;
      resolve(ack);
    });
    setTimeout(() => {
      if (!done) {
        resolve({ ok: false, reason: 'NO_ACK' });
      }
    }, timeoutMs);
  });
}

async function authPost(pathname, token, body) {
  return requestJson(pathname, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function authGet(pathname, token) {
  return requestJson(pathname, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

async function cleanup(ctx) {
  const db = new Client(DB_CONFIG);
  await db.connect();
  try {
    await db.query('BEGIN');
    if (ctx.orderId) {
      await db.query('DELETE FROM order_mobile_commands WHERE "orderId" = $1', [
        ctx.orderId,
      ]);
      await db.query('DELETE FROM order_events WHERE "orderId" = $1', [ctx.orderId]);
      await db.query('DELETE FROM order_incidents WHERE "orderId" = $1', [ctx.orderId]);
      await db.query('DELETE FROM orders WHERE id = $1', [ctx.orderId]);
    }
    if (ctx.driverProfileId) {
      await db.query('DELETE FROM driver_safety_alerts WHERE "driverId" = $1', [
        ctx.driverProfileId,
      ]);
      await db.query('DELETE FROM driver_shift_sessions WHERE "driverId" = $1', [
        ctx.driverProfileId,
      ]);
      await db.query('DELETE FROM driver_earning_ledger WHERE "driverId" = $1', [
        ctx.driverProfileId,
      ]);
      await db.query('DELETE FROM vehicles WHERE "driverProfileId" = $1', [
        ctx.driverProfileId,
      ]);
      await db.query('DELETE FROM driver_profiles WHERE id = $1', [ctx.driverProfileId]);
    }
    if (ctx.passengerUserId) {
      await db.query('DELETE FROM order_mobile_commands WHERE "actorUserId" = $1', [
        ctx.passengerUserId,
      ]);
      await db.query('DELETE FROM users WHERE id = $1', [ctx.passengerUserId]);
    }
    if (ctx.driverUserId) {
      await db.query('DELETE FROM order_mobile_commands WHERE "actorUserId" = $1', [
        ctx.driverUserId,
      ]);
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
  const report = {
    startedAt: new Date().toISOString(),
    steps: [],
    created: {},
  };
  const ctx = {
    passengerPhone: makePhone('30'),
    driverPhone: makePhone('31'),
    passengerUserId: null,
    driverUserId: null,
    driverProfileId: null,
    orderId: null,
  };
  let driverSocket = null;

  try {
    ctx.passengerUserId = await registerUser({
      phone: ctx.passengerPhone,
      role: 'PASSENGER',
    });
    ctx.driverUserId = await registerUser({ phone: ctx.driverPhone, role: 'DRIVER' });
    report.steps.push({ name: 'register users', status: 'ok' });

    const adminToken = await loginAdmin();
    ctx.driverProfileId = await createDriverProfile(ctx.driverUserId, adminToken);
    await createVehicle(ctx.driverProfileId, adminToken);
    report.steps.push({ name: 'create driver profile/vehicle', status: 'ok' });

    const passengerToken = await login(ctx.passengerPhone);
    const driverToken = await login(ctx.driverPhone);
    report.steps.push({ name: 'login users', status: 'ok' });

    const startShift = await authPost('/drivers/me/shift/start', driverToken, {
      reason: 'phase18 test shift',
    });
    assertOk(startShift.status === 201 || startShift.status === 200, 'start shift failed');
    report.steps.push({ name: 'start shift', status: 'ok' });

    driverSocket = io(`${API_URL}/driver`, {
      transports: ['websocket'],
      auth: { token: driverToken },
    });
    await new Promise((resolve, reject) => {
      driverSocket.on('connect', resolve);
      driverSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('driver socket connect timeout')), STEP_TIMEOUT_MS);
    });
    report.steps.push({ name: 'driver socket connect', status: 'ok' });

    const locAck = await emitWithAck(driverSocket, 'driver.location.update', {
      lat: 55.751244,
      lng: 37.618423,
      heading: 180,
      speed: 4,
      sequence: 1,
      clientTs: new Date().toISOString(),
      accuracy: 7,
      isMock: false,
    });
    assertOk(locAck?.ok === true, `driver location update failed: ${JSON.stringify(locAck)}`);
    report.steps.push({ name: 'driver online location update', status: 'ok' });

    const offerPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('order.offer timeout')), OFFER_TIMEOUT_MS);
      driverSocket.once('order.offer', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    const createOrder = await authPost('/orders', passengerToken, {
      fromLat: 55.751244,
      fromLng: 37.618423,
      toLat: 55.7601,
      toLng: 37.6202,
      price: 420,
      cityCode: 'MOSCOW',
    });
    assertOk(createOrder.status === 201 || createOrder.status === 200, 'create order failed');
    ctx.orderId = createOrder.body.orderId;

    const offer = await offerPromise;
    assertOk(offer?.orderId === ctx.orderId, 'offer mismatch');

    const accept = await emitWithAck(driverSocket, 'order.accept', {
      orderId: ctx.orderId,
      commandId: `p18.accept.${Date.now()}`,
    });
    assertOk(accept?.ok === true, `accept failed: ${JSON.stringify(accept)}`);

    const start = await emitWithAck(driverSocket, 'order.start', {
      orderId: ctx.orderId,
      commandId: `p18.start.${Date.now()}`,
    });
    assertOk(start?.ok === true, `start failed: ${JSON.stringify(start)}`);

    const finish = await emitWithAck(driverSocket, 'order.finish', {
      orderId: ctx.orderId,
      commandId: `p18.finish.${Date.now()}`,
    });
    assertOk(finish?.ok === true, `finish failed: ${JSON.stringify(finish)}`);
    report.steps.push({ name: 'driver trip flow', status: 'ok' });

    const earnings = await authGet('/drivers/me/earnings/summary?limit=20', driverToken);
    assertOk(earnings.status === 200, 'earnings summary failed');
    assertOk(
      Number(earnings.body?.totals?.completedTrips || 0) >= 1,
      `earnings trips invalid: ${JSON.stringify(earnings.body)}`,
    );
    report.steps.push({ name: 'earnings summary', status: 'ok' });

    const safety = await authPost('/drivers/me/safety/alerts', driverToken, {
      alertType: 'SOS',
      severity: 'CRITICAL',
      message: 'phase18 safety check',
      orderId: ctx.orderId,
      lat: 55.751244,
      lng: 37.618423,
      offlineBuffered: true,
    });
    assertOk(safety.status === 201 || safety.status === 200, 'safety alert failed');
    report.steps.push({ name: 'safety alert', status: 'ok' });

    const locationBatch = await authPost('/orders/sync/push', driverToken, {
      operations: [
        {
          commandId: `p18.loc.batch.${Date.now()}`,
          deviceId: 'driver-android-phase18',
          operationType: 'DRIVER_LOCATION_BATCH',
          clientTs: new Date().toISOString(),
          payload: {
            points: [
              {
                lat: 55.7513,
                lng: 37.6185,
                sequence: 1001,
                clientTs: new Date(Date.now() + 1000).toISOString(),
                offlineBuffered: true,
                accuracy: 8,
              },
              {
                lat: 55.75135,
                lng: 37.6186,
                sequence: 1002,
                clientTs: new Date(Date.now() + 2000).toISOString(),
                offlineBuffered: true,
                accuracy: 8,
              },
            ],
          },
        },
      ],
    });
    assertOk(locationBatch.status === 201 || locationBatch.status === 200, 'location batch failed');
    const batchResult = locationBatch.body?.results?.[0]?.result;
    assertOk(
      Number(batchResult?.acceptedCount || 0) >= 1,
      `location batch accepted count invalid: ${JSON.stringify(locationBatch.body)}`,
    );
    report.steps.push({ name: 'offline location batch flush', status: 'ok' });

    const endShift = await authPost('/drivers/me/shift/end', driverToken, {
      reason: 'phase18 end shift',
    });
    assertOk(endShift.status === 201 || endShift.status === 200, 'end shift failed');
    report.steps.push({ name: 'end shift', status: 'ok' });

    report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL';
    report.error = String(error?.message || error);
  } finally {
    if (driverSocket) {
      driverSocket.disconnect();
    }
    try {
      await cleanup(ctx);
      report.cleanup = 'done';
    } catch (cleanupError) {
      report.cleanup = `failed: ${String(cleanupError?.message || cleanupError)}`;
    }
    report.finishedAt = new Date().toISOString();
    console.log(JSON.stringify(report, null, 2));
    if (report.result !== 'PASS') {
      process.exit(1);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
