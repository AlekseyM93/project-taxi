const { io } = require('socket.io-client');

const token = process.env.TOKEN;
const orderId = process.env.ORDER_ID;

if (!token) {
  console.error('TOKEN is not set');
  process.exit(1);
}

const socket = io('http://localhost:3000/passenger', {
  transports: ['websocket'],
  auth: { token },
});

socket.on('connect', () => {
  console.log('PASSENGER connected:', socket.id);

  socket.emit('passenger.join', {}, (ack) => {
    console.log('join ack:', ack);
  });

  if (orderId) {
    socket.emit('passenger.order.subscribe', { orderId }, (ack) => {
      console.log('order subscribe ack:', ack);
    });
  } else {
    console.log('ORDER_ID is not set. Waiting only for passenger-level events.');
  }
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

socket.on('order.driver.snapshot', (payload) => {
  console.log('\n=== ORDER DRIVER SNAPSHOT ===');
  console.dir(payload, { depth: null });
});

socket.on('order.driver.location', (payload) => {
  console.log('\n=== ORDER DRIVER LOCATION ===');
  console.dir(payload, { depth: null });
});