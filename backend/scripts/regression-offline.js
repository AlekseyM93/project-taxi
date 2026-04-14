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
const OFFER_TIMEOUT_MS = Number(process.env.SMOKE_OFFER_TIMEOUT_MS || 15000);
const STEP_TIMEOUT_MS = Number(process.env.SMOKE_STEP_TIMEOUT_MS || 8000);

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

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
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
  const payload = {
    userId,
    firstName: 'Offline',
    lastName: 'Driver',
    city: 'Moscow',
    status: 'ACTIVE',
  };
  const response = await requestJson('/drivers', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  assertOk(
    response.status === 201 || response.status === 200,
    `createDriverProfile failed: ${JSON.stringify(response.body)}`,
  );
  return response.body.id;
}

async function createVehicle(driverId, adminToken) {
  const payload = {
    brand: 'Hyundai',
    model: 'Solaris',
    color: 'Gray',
    plateNumber: `OFF${Date.now().toString().slice(-6)}`,
    year: 2021,
    isActive: true,
  };
  const response = await requestJson(`/drivers/${driverId}/vehicles`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  assertOk(
    response.status === 201 || response.status === 200,
    `createVehicle failed: ${JSON.stringify(response.body)}`,
  );
}

function emitWithAck(socket, event, payload, timeoutMs = STEP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let finished = false;
    socket.emit(event, payload, (ack) => {
      finished = true;
      resolve(ack);
    });
    setTimeout(() => {
      if (!finished) {
        resolve({ ok: false, reason: 'NO_ACK' });
      }
    }, timeoutMs);
  });
}

async function pushSync(token, operations) {
  const response = await requestJson('/orders/sync/push', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ operations }),
  });
  assertOk(
    response.status === 201 || response.status === 200,
    `sync push failed: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

async function pullSync(token, cursorUpdatedAt = null) {
  const search = new URLSearchParams();
  search.set('limit', '50');
  if (cursorUpdatedAt) {
    search.set('cursorUpdatedAt', cursorUpdatedAt);
  }
  const response = await requestJson(`/orders/sync/pull?${search.toString()}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  assertOk(response.status === 200, `sync pull failed: ${JSON.stringify(response.body)}`);
  return response.body;
}

async function cleanupTestData(ctx) {
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
    passengerUserId: null,
    driverUserId: null,
    driverProfileId: null,
    orderId: null,
    passengerPhone: makePhone('20'),
    driverPhone: makePhone('21'),
  };

  let driverSocket = null;
  try {
    ctx.passengerUserId = await registerUser({
      phone: ctx.passengerPhone,
      role: 'PASSENGER',
    });
    report.steps.push({ name: 'register passenger', status: 'ok' });
    ctx.driverUserId = await registerUser({ phone: ctx.driverPhone, role: 'DRIVER' });
    report.steps.push({ name: 'register driver', status: 'ok' });

    const adminToken = await loginAdmin();
    ctx.driverProfileId = await createDriverProfile(ctx.driverUserId, adminToken);
    await createVehicle(ctx.driverProfileId, adminToken);
    report.steps.push({ name: 'driver profile + vehicle', status: 'ok' });

    const passengerToken = await login(ctx.passengerPhone);
    const driverToken = await login(ctx.driverPhone);
    report.steps.push({ name: 'login users', status: 'ok' });

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

    const locationAck = await emitWithAck(driverSocket, 'driver.location.update', {
      lat: 55.751244,
      lng: 37.618423,
      heading: 120,
      speed: 3,
      sequence: 1,
      clientTs: new Date().toISOString(),
    });
    assertOk(
      locationAck?.ok === true,
      `driver location update failed: ${JSON.stringify(locationAck)}`,
    );
    report.steps.push({ name: 'driver location heartbeat', status: 'ok' });

    const offerPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('order.offer timeout')), OFFER_TIMEOUT_MS);
      driverSocket.once('order.offer', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    const createCommandId = `offline:create:${Date.now()}`;
    const createPush = await pushSync(passengerToken, [
      {
        commandId: createCommandId,
        deviceId: 'passenger-ios-1',
        operationType: 'PASSENGER_CREATE_ORDER',
        clientTs: new Date().toISOString(),
        payload: {
          fromLat: 55.751244,
          fromLng: 37.618423,
          toLat: 55.7601,
          toLng: 37.6202,
          price: 375,
          cityCode: 'MOSCOW',
        },
      },
    ]);
    assertOk(createPush.results?.[0]?.status === 'APPLIED', 'create sync command not applied');
    ctx.orderId = createPush.results[0]?.result?.orderId;
    assertOk(ctx.orderId, `orderId missing in sync push response: ${JSON.stringify(createPush)}`);
    report.steps.push({ name: 'offline create order push', status: 'ok', orderId: ctx.orderId });

    const replayCreate = await pushSync(passengerToken, [
      {
        commandId: createCommandId,
        deviceId: 'passenger-ios-1',
        operationType: 'PASSENGER_CREATE_ORDER',
        clientTs: new Date().toISOString(),
        payload: {
          fromLat: 55.751244,
          fromLng: 37.618423,
          toLat: 55.7601,
          toLng: 37.6202,
          price: 375,
          cityCode: 'MOSCOW',
        },
      },
    ]);
    assertOk(replayCreate.results?.[0]?.replayed === true, 'idempotent replay failed');
    report.steps.push({ name: 'offline replay idempotency', status: 'ok' });

    const baselinePull = await pullSync(passengerToken, null);
    const baselineCursor = baselinePull.nextCursorUpdatedAt;
    assertOk(!!baselineCursor, 'baseline cursor missing');
    report.steps.push({ name: 'baseline sync pull', status: 'ok', cursor: baselineCursor });

    const offer = await offerPromise;
    assertOk(offer?.orderId === ctx.orderId, 'offer received for unexpected order');
    report.steps.push({ name: 'driver received offer', status: 'ok' });

    const acceptPush = await pushSync(driverToken, [
      {
        commandId: `offline:accept:${ctx.orderId}`,
        deviceId: 'driver-android-1',
        operationType: 'DRIVER_ACCEPT_ORDER',
        clientTs: new Date().toISOString(),
        payload: { orderId: ctx.orderId },
      },
    ]);
    assertOk(acceptPush.results?.[0]?.status === 'APPLIED', 'driver accept not applied');
    report.steps.push({ name: 'driver accept through sync push', status: 'ok' });

    driverSocket.disconnect();
    report.steps.push({ name: 'driver offline simulation', status: 'ok' });

    const driverOfflinePush = await pushSync(driverToken, [
      {
        commandId: `offline:start:${ctx.orderId}`,
        deviceId: 'driver-android-1',
        operationType: 'DRIVER_START_ORDER',
        clientTs: new Date().toISOString(),
        payload: { orderId: ctx.orderId },
      },
      {
        commandId: `offline:finish:${ctx.orderId}`,
        deviceId: 'driver-android-1',
        operationType: 'DRIVER_FINISH_ORDER',
        clientTs: new Date().toISOString(),
        payload: { orderId: ctx.orderId },
      },
    ]);
    assertOk(
      driverOfflinePush.results?.every((item) => item.status === 'APPLIED'),
      `driver offline queue flush failed: ${JSON.stringify(driverOfflinePush)}`,
    );
    report.steps.push({ name: 'driver offline queued commands flush', status: 'ok' });

    const deltaPull = await pullSync(passengerToken, baselineCursor);
    assertOk(
      Array.isArray(deltaPull.items) &&
        deltaPull.items.some((item) => item.id === ctx.orderId && item.status === 'DONE'),
      `delta pull did not include DONE order: ${JSON.stringify(deltaPull)}`,
    );
    report.steps.push({ name: 'delta sync pull after reconnect', status: 'ok' });

    const conflictPush = await pushSync(driverToken, [
      {
        commandId: `offline:finish:conflict:${ctx.orderId}`,
        deviceId: 'driver-android-1',
        operationType: 'DRIVER_FINISH_ORDER',
        clientTs: new Date().toISOString(),
        payload: { orderId: ctx.orderId },
      },
    ]);
    assertOk(
      conflictPush.results?.[0]?.status === 'REJECTED' &&
        conflictPush.results?.[0]?.errorCode === 'STATE_CONFLICT',
      `conflict resolution expectation failed: ${JSON.stringify(conflictPush)}`,
    );
    report.steps.push({ name: 'state-machine conflict policy', status: 'ok' });

    report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL';
    report.error = String(error?.message || error);
  } finally {
    if (driverSocket) {
      driverSocket.disconnect();
    }
    try {
      await cleanupTestData(ctx);
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
