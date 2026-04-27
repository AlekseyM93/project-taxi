import 'dart:async';

import '../logging/safe_logger.dart';
import 'socket_manager.dart';

class DriverLocationUpdate {
  const DriverLocationUpdate({required this.lat, required this.lng, this.heading, this.speed});
  final double lat;
  final double lng;
  final double? heading;
  final double? speed;
}

class OrderStatusEvent {
  const OrderStatusEvent({required this.orderId, required this.status, this.driverId});
  final String orderId;
  final String status;
  final String? driverId;
}

class DriverSnapshotEvent {
  const DriverSnapshotEvent({
    required this.orderId,
    this.status,
    this.driverId,
    this.lat,
    this.lng,
  });
  final String orderId;
  final String? status;
  final String? driverId;
  final double? lat;
  final double? lng;
}

class PassengerRealtimeService {
  PassengerRealtimeService({
    required String baseUrl,
    required SafeLogger logger,
  })  : _socketManager = SocketManager(
          baseUrl: baseUrl,
          namespace: '/passenger',
          logger: logger,
        ),
        _logger = logger;

  final SocketManager _socketManager;
  final SafeLogger _logger;

  final _statusController = StreamController<OrderStatusEvent>.broadcast();
  final _driverLocationController = StreamController<DriverLocationUpdate>.broadcast();
  final _driverSnapshotController = StreamController<DriverSnapshotEvent>.broadcast();

  Stream<OrderStatusEvent> get orderStatusStream => _statusController.stream;
  Stream<DriverLocationUpdate> get driverLocationStream => _driverLocationController.stream;
  Stream<DriverSnapshotEvent> get driverSnapshotStream => _driverSnapshotController.stream;
  Stream<SocketConnectionState> get connectionStream => _socketManager.stateStream;
  bool get isConnected => _socketManager.isConnected;

  String? _subscribedOrderId;

  void connect({required String accessToken, String? deviceId}) {
    _socketManager.connect(
      accessToken: accessToken,
      deviceId: deviceId,
      onConnect: () {
        _socketManager.emit('passenger.join');
        if (_subscribedOrderId != null) {
          _subscribeToOrder(_subscribedOrderId!);
        }
      },
    );

    _socketManager.on('order.status', (data) {
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      _statusController.add(OrderStatusEvent(
        orderId: map['orderId'] as String? ?? '',
        status: map['status'] as String? ?? '',
        driverId: map['driverId'] as String?,
      ));
    });

    _socketManager.on('order.driver.location', (data) {
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      _driverLocationController.add(DriverLocationUpdate(
        lat: (map['lat'] as num?)?.toDouble() ?? 0,
        lng: (map['lng'] as num?)?.toDouble() ?? 0,
        heading: (map['heading'] as num?)?.toDouble(),
        speed: (map['speed'] as num?)?.toDouble(),
      ));
    });

    _socketManager.on('order.driver.snapshot', (data) {
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      final location = map['location'] as Map?;
      _driverSnapshotController.add(DriverSnapshotEvent(
        orderId: map['orderId'] as String? ?? '',
        status: map['status'] as String?,
        driverId: map['driverId'] as String?,
        lat: location != null ? (location['lat'] as num?)?.toDouble() : null,
        lng: location != null ? (location['lng'] as num?)?.toDouble() : null,
      ));
    });
  }

  void subscribeToOrder(String orderId) {
    _subscribedOrderId = orderId;
    if (_socketManager.isConnected) {
      _subscribeToOrder(orderId);
    }
  }

  void _subscribeToOrder(String orderId) {
    _socketManager.emit('passenger.order.subscribe', {'orderId': orderId});
    _logger.info('Subscribed to order', {'orderId': orderId});
  }

  void unsubscribeFromOrder() {
    _subscribedOrderId = null;
    _socketManager.resetSequence();
  }

  void dispose() {
    _socketManager.close();
    _statusController.close();
    _driverLocationController.close();
    _driverSnapshotController.close();
  }
}
