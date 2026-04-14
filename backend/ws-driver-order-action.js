const { io } = require('socket.io-client');

const token = process.env.TOKEN;
const orderId = process.env.ORDER_ID;
const action = process.env.ACTION;
const commandId = process.env.COMMAND_ID || `${action}:${orderId}:${Date.now()}`;

if (!token) {
  console.error('TOKEN is not set');
  process.exit(1);
}

if (!orderId) {
  console.error('ORDER_ID is not set');
  process.exit(1);
}

if (!action) {
  console.error('ACTION is not set');
  process.exit(1);
}

const socket = io('http://localhost:3000/driver', {
  transports: ['websocket'],
  auth: { token },
});

socket.on('connect', () => {
  console.log('DRIVER ACTION connected:', socket.id);
  console.log('sending action:', action, 'for order:', orderId);

  const ackTimeout = setTimeout(() => {
    console.log('No ack received, closing');
    process.exit(0);
  }, 3000);

  socket.emit(action, { orderId, commandId }, (ack) => {
    clearTimeout(ackTimeout);
    console.log('[WS] action ack:', ack);
    setTimeout(() => process.exit(0), 500);
  });
});

socket.on('connect_error', (err) => {
  console.error('connect_error:', err.message);
  process.exit(1);
});

socket.on('order.accept.result', (payload) => {
  console.log('[WS] order.accept.result:', payload);
});