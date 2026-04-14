const { io } = require('socket.io-client');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const PHONE = process.env.PHONE;
const PASSWORD = process.env.PASSWORD || 'secret123';
const ROLE = process.env.ROLE; // driver | passenger
const MODE = process.env.MODE; // listen | action | locations
const ORDER_ID = process.env.ORDER_ID || '';
const ACTION = process.env.ACTION || '';
const LAT = Number(process.env.LAT || 55.751244);
const LNG = Number(process.env.LNG || 37.618423);

const AUTO_ACCEPT =
  String(process.env.AUTO_ACCEPT || '').toLowerCase() === 'true';
const AUTO_ACCEPT_ONCE =
  String(process.env.AUTO_ACCEPT_ONCE || 'true').toLowerCase() === 'true';

const KEEPALIVE_MS = Number(process.env.KEEPALIVE_MS || 10000);

if (!PHONE) {
  console.error('PHONE is required');
  process.exit(1);
}
if (!ROLE || !['driver', 'passenger'].includes(ROLE)) {
  console.error('ROLE must be driver or passenger');
  process.exit(1);
}
if (!MODE || !['listen', 'action', 'locations'].includes(MODE)) {
  console.error('MODE must be listen, action, or locations');
  process.exit(1);
}

function getWsUrl() {
  return ROLE === 'driver'
    ? `${API_URL}/driver`
    : `${API_URL}/passenger`;
}

async function login() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: PHONE,
      password: PASSWORD,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error('Login failed:', text);
    process.exit(1);
  }

  const data = JSON.parse(text);
  if (!data.accessToken) {
    console.error('No accessToken in response:', data);
    process.exit(1);
  }

  return data.accessToken;
}

function connectSocket(token) {
  return io(getWsUrl(), {
    transports: ['websocket'],
    auth: { token },
  });
}

function buildCommandId(eventName, orderId) {
  return `${eventName}:${orderId}:${Date.now()}`;
}

function emitWithAck(socket, event, payload) {
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
    }, 3000);
  });
}

function installCommonHandlers(socket) {
  socket.on('connect_error', (err) => {
    console.error('connect_error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('disconnect:', reason);
  });

  socket.on('order.status', (payload) => {
    console.log('\n=== ORDER STATUS ===');
    console.dir(payload, { depth: null });
  });

  socket.on('order.driver.snapshot', (payload) => {
    console.log('\n=== ORDER DRIVER SNAPSHOT ===');
    console.dir(payload, { depth: null });
  });

  socket.on('order.driver.location', (payload) => {
    console.log('\n=== ORDER DRIVER LOCATION ===');
    console.dir(payload, { depth: null });
  });

  socket.on('order.offer.closed', (payload) => {
    console.log('\n=== ORDER OFFER CLOSED ===');
    console.dir(payload, { depth: null });
  });

  socket.on('order.accept.result', (payload) => {
    console.log('\n=== ORDER ACCEPT RESULT ===');
    console.dir(payload, { depth: null });
  });
}

async function sendDriverLocation(socket, payload) {
  const ack = await emitWithAck(socket, 'driver.location.update', payload);
  console.log('location ack:', ack);
  return ack;
}

async function runDriverListen(socket) {
  console.log(`DRIVER ${PHONE} connected:`, socket.id);

  let seq = 0;

  const buildPayload = () => {
    seq += 1;
    return {
      lat: LAT + seq * 0.00001,
      lng: LNG + seq * 0.00001,
      heading: 90,
      speed: 0,
      sequence: seq,
      clientTs: new Date().toISOString(),
    };
  };

  const initialAck = await sendDriverLocation(socket, buildPayload());
  console.log('initial location ack:', initialAck);

  setInterval(async () => {
    try {
      const payload = buildPayload();
      console.log('keepalive location:', payload);
      await sendDriverLocation(socket, payload);
    } catch (err) {
      console.error('keepalive failed:', err);
    }
  }, KEEPALIVE_MS);
}

async function runPassengerListen(socket) {
  console.log(`PASSENGER ${PHONE} connected:`, socket.id);

  const joinAck = await emitWithAck(socket, 'passenger.join', {});
  console.log('join ack:', joinAck);

  if (ORDER_ID) {
    const subscribeAck = await emitWithAck(socket, 'passenger.order.subscribe', {
      orderId: ORDER_ID,
    });
    console.log('order subscribe ack:', subscribeAck);
  } else {
    console.log('ORDER_ID not set, listening without order subscription');
  }
}

async function runDriverAction(socket) {
  console.log(`DRIVER ACTION ${PHONE} connected:`, socket.id);

  if (!ORDER_ID) {
    console.error('ORDER_ID is required for MODE=action');
    process.exit(1);
  }

  if (!ACTION) {
    console.error('ACTION is required for MODE=action');
    process.exit(1);
  }

  const ack = await emitWithAck(socket, ACTION, {
    orderId: ORDER_ID,
    commandId: buildCommandId(ACTION, ORDER_ID),
  });
  console.log('action ack:', ack);

  setTimeout(() => process.exit(0), 500);
}

async function runDriverLocations(socket) {
  console.log(`DRIVER LOCATIONS ${PHONE} connected:`, socket.id);

  const updates = [
    {
      lat: LAT + 0.0008,
      lng: LNG + 0.0004,
      heading: 95,
      speed: 5,
      sequence: 1,
      clientTs: new Date().toISOString(),
    },
    {
      lat: LAT + 0.0016,
      lng: LNG + 0.001,
      heading: 100,
      speed: 8,
      sequence: 2,
      clientTs: new Date().toISOString(),
    },
    {
      lat: LAT + 0.0024,
      lng: LNG + 0.0018,
      heading: 110,
      speed: 10,
      sequence: 3,
      clientTs: new Date().toISOString(),
    },
  ];

  for (const payload of updates) {
    console.log('sending location:', payload);
    const ack = await emitWithAck(socket, 'driver.location.update', payload);
    console.log('location ack:', ack);
    await new Promise((r) => setTimeout(r, 1000));
  }

  setTimeout(() => process.exit(0), 500);
}

async function main() {
  const token = await login();
  const socket = connectSocket(token);
  installCommonHandlers(socket);

  let autoAccepted = false;

  socket.on('order.offer', async (payload) => {
    console.log('\n=== ORDER OFFER ===');
    console.dir(payload, { depth: null });

    if (ROLE !== 'driver' || MODE !== 'listen' || !AUTO_ACCEPT) {
      return;
    }

    if (AUTO_ACCEPT_ONCE && autoAccepted) {
      console.log('AUTO_ACCEPT skipped: already accepted one offer in this session');
      return;
    }

    if (!payload?.orderId) {
      console.log('AUTO_ACCEPT skipped: offer has no orderId');
      return;
    }

    autoAccepted = true;

    console.log('\n=== AUTO ACCEPT START ===');
    console.log('orderId:', payload.orderId);

    const ack = await emitWithAck(socket, 'order.accept', {
      orderId: payload.orderId,
      commandId: buildCommandId('order.accept', payload.orderId),
    });

    console.log('\n=== AUTO ACCEPT ACK ===');
    console.dir(ack, { depth: null });
  });

  socket.on('connect', async () => {
    try {
      if (ROLE === 'driver' && MODE === 'listen') {
        await runDriverListen(socket);
      } else if (ROLE === 'passenger' && MODE === 'listen') {
        await runPassengerListen(socket);
      } else if (ROLE === 'driver' && MODE === 'action') {
        await runDriverAction(socket);
      } else if (ROLE === 'driver' && MODE === 'locations') {
        await runDriverLocations(socket);
      } else {
        console.error('Unsupported ROLE/MODE combination');
        process.exit(1);
      }
    } catch (err) {
      console.error('Runner failed:', err);
      process.exit(1);
    }
  });
}

main();