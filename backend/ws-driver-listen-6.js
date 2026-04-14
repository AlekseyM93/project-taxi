const { io } = require('socket.io-client');

const token = process.env.TOKEN;

if (!token) {
  console.error('TOKEN is not set');
  process.exit(1);
}

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  auth: { token },
});

socket.on('connect', () => {
  console.log('DRIVER connected:', socket.id);

  socket.emit(
    'driver.location.update',
    {
      lat: 55.756,
      lng: 37.622,
      heading: 90,
      speed: 0,
    },
    (ack) => {
      console.log('location ack:', ack);
    },
  );
});

socket.on('connect_error', (err) => {
  console.error('connect_error:', err.message);
});

socket.on('disconnect', (reason) => {
  console.log('disconnect:', reason);
});

socket.on('order.offer', (payload) => {
  console.log('\n=== ORDER OFFER RECEIVED ===');
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