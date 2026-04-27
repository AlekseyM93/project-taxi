import 'package:socket_io_client/socket_io_client.dart' as io;

class RealtimeClient {
  RealtimeClient({
    required this.baseUrl,
    required this.deviceId,
  });

  final String baseUrl;
  final String deviceId;
  io.Socket? _socket;

  void connectPassenger({required String accessToken}) {
    _socket?.dispose();
    _socket = io.io(
      '$baseUrl/passenger',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': accessToken, 'deviceId': deviceId})
          .enableReconnection()
          .build(),
    );
    _socket?.connect();
  }

  void connectDriver({required String accessToken}) {
    _socket?.dispose();
    _socket = io.io(
      '$baseUrl/driver',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': accessToken, 'deviceId': deviceId})
          .enableReconnection()
          .build(),
    );
    _socket?.connect();
  }

  void subscribeOrder(String orderId, void Function(dynamic payload) onSnapshot) {
    _socket?.emit('passenger.order.subscribe', {
      'orderId': orderId,
      'deviceId': deviceId,
    });
    _socket?.on('order.driver.snapshot', onSnapshot);
    _socket?.on('order.driver.location', onSnapshot);
    _socket?.on('order.status.changed', onSnapshot);
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
