const { io } = require('socket.io-client');

const token = process.env.TOKEN;
const orderId = process.env.ORDER_ID;
const commandId = process.env.COMMAND_ID || `order.accept:${orderId}:${Date.now()}`;

if (!token) {
  console.error('[ERR] TOKEN env is required.');
  process.exit(1);
}

if (!orderId) {
  console.error('[ERR] ORDER_ID env is required.');
  process.exit(1);
}

console.log('[OK] Starting accept script...');
console.log('[OK] ORDER_ID =', orderId);
console.log('[OK] TOKEN length =', token.length);

const socket = io('http://localhost:3000/driver', {
  auth: { token },
  transports: ['websocket'],
  timeout: 10000,
});

socket.on('connect', () => {
  console.log('[WS] connected:', socket.id);

  const ackTimeout = setTimeout(() => {
    console.error('[ERR] No ack received in 5s');
    socket.disconnect();
    process.exit(2);
  }, 5000);

  socket.emit('order.accept', { orderId, commandId }, (ack) => {
    clearTimeout(ackTimeout);
    console.log('[WS] accept ack:', ack);
    socket.disconnect();
    process.exit(0);
  });
});

socket.on('connect_error', (err) => {
  console.error('[WS] connect_error:', err.message);
  process.exit(3);
});

socket.on('disconnect', (reason) => {
  console.log('[WS] disconnected:', reason);
});
