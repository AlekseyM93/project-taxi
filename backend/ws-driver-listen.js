const { io } = require('socket.io-client');

const token = process.env.TOKEN;

if (!token) {
  console.error('TOKEN is not set');
  process.exit(1);
}

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  auth: {
    token,
  },
});

socket.on('connect', () => {
  console.log('PASSENGER connected:', socket.id);

  socket.emit('passenger.join', {}, (ack) => {
    console.log('join ack:', ack);
  });
});

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

socket.on('driver.location', (payload) => {
  console.log('\n=== DRIVER LOCATION ===');
  console.dir(payload, { depth: null });
});