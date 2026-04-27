const fs = require('fs');
const path = require('path');
const net = require('net');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const text = fs.readFileSync(envPath, 'utf8');
  const result = {};
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
    result[key] = value;
  }
  return result;
}

function envValue(fileEnv, key, fallback = '') {
  return process.env[key] || fileEnv[key] || fallback;
}

function checkRequiredEnv(fileEnv) {
  const required = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'REDIS_URL',
    'JWT_SECRET',
  ];
  const missing = required.filter((key) => !envValue(fileEnv, key));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function connectTcp({ host, port, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, detail) => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      resolve({ ok, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, 'reachable'));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (error) => finish(false, error.message));
    socket.connect(port, host);
  });
}

async function checkDbPort(fileEnv) {
  const host = envValue(fileEnv, 'DB_HOST', 'localhost');
  const port = Number(envValue(fileEnv, 'DB_PORT', '5433'));
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, detail: `invalid DB_PORT: ${port}` };
  }
  return connectTcp({ host, port });
}

async function checkRedisPort(fileEnv) {
  const redisUrlRaw = envValue(fileEnv, 'REDIS_URL', 'redis://localhost:6379');
  let host = 'localhost';
  let port = 6379;
  try {
    const parsed = new URL(redisUrlRaw);
    host = parsed.hostname || host;
    if (parsed.port) {
      port = Number(parsed.port);
    }
  } catch {
    return { ok: false, detail: `invalid REDIS_URL: ${redisUrlRaw}` };
  }
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, detail: `invalid Redis port: ${port}` };
  }
  return connectTcp({ host, port });
}

async function checkBackendPortFree() {
  const probe = await connectTcp({ host: '127.0.0.1', port: 3000, timeoutMs: 800 });
  if (probe.ok) {
    return {
      ok: false,
      detail: 'port 3000 is already occupied (stop stale backend before run)',
    };
  }
  return { ok: true, detail: 'port 3000 is free' };
}

async function main() {
  const fileEnv = loadEnvFile();

  const envCheck = checkRequiredEnv(fileEnv);
  const [dbCheck, redisCheck, portCheck] = await Promise.all([
    checkDbPort(fileEnv),
    checkRedisPort(fileEnv),
    checkBackendPortFree(),
  ]);

  const report = {
    env: envCheck,
    dbTcp: dbCheck,
    redisTcp: redisCheck,
    backendPort: portCheck,
  };

  const failed = [
    !envCheck.ok ? 'env' : null,
    !dbCheck.ok ? 'dbTcp' : null,
    !redisCheck.ok ? 'redisTcp' : null,
    !portCheck.ok ? 'backendPort' : null,
  ].filter(Boolean);

  console.log(JSON.stringify(report, null, 2));

  if (failed.length > 0) {
    console.error(`Preflight failed: ${failed.join(', ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
