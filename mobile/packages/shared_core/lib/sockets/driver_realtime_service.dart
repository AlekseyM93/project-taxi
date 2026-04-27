import 'dart:async';

import '../logging/safe_logger.dart';
import '../location/location_service.dart';
import 'socket_manager.dart';

class OrderOfferEvent {
  const OrderOfferEvent({
    required this.orderId,
    this.price,
    this.fromAddress,
    this.toAddress,
    this.distanceKm,
    this.queuePosition,
  });
  final String orderId;
  final double? price;
  final String? fromAddress;
  final String? toAddress;
  final double? distanceKm;
  final int? queuePosition;
}

class OfferClosedEvent {
  const OfferClosedEvent({required this.orderId, this.reason, this.acceptedBy});
  final String orderId;
  final String? reason;
  final String? acceptedBy;
}

class DriverRealtimeService {
  DriverRealtimeService({
    required String baseUrl,
    required SafeLogger logger,
  })  : _socketManager = SocketManager(
          baseUrl: baseUrl,
          namespace: '/driver',
          logger: logger,
        );

  final SocketManager _socketManager;

  final _offerController = StreamController<OrderOfferEvent>.broadcast();
  final _offerClosedController = StreamController<OfferClosedEvent>.broadcast();
  final _cancelledController = StreamController<String>.broadcast();

  Stream<OrderOfferEvent> get offerStream => _offerController.stream;
  Stream<OfferClosedEvent> get offerClosedStream => _offerClosedController.stream;
  Stream<String> get orderCancelledStream => _cancelledController.stream;
  Stream<SocketConnectionState> get connectionStream => _socketManager.stateStream;
  bool get isConnected => _socketManager.isConnected;

  int _locationSequence = 0;

  void connect({required String accessToken, String? deviceId}) {
    _socketManager.connect(
      accessToken: accessToken,
      deviceId: deviceId,
    );

    _socketManager.on('order.offer', (data) {
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      _offerController.add(OrderOfferEvent(
        orderId: map['orderId'] as String? ?? '',
        price: (map['price'] as num?)?.toDouble(),
        fromAddress: (map['from'] as Map?)?['address'] as String?,
        toAddress: (map['to'] as Map?)?['address'] as String?,
        distanceKm: (map['distanceKm'] as num?)?.toDouble(),
        queuePosition: map['queuePosition'] as int?,
      ));
    });

    _socketManager.on('order.offer.closed', (data) {
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      _offerClosedController.add(OfferClosedEvent(
        orderId: map['orderId'] as String? ?? '',
        reason: map['reason'] as String?,
        acceptedBy: map['acceptedBy'] as String?,
      ));
    });

    _socketManager.on('order.cancelled', (data) {
      if (data is! Map) return;
      final map = Map<String, dynamic>.from(data);
      _cancelledController.add(map['orderId'] as String? ?? '');
    });
  }

  void sendLocationUpdate(LocationData location) {
    _locationSequence++;
    _socketManager.emit('driver.location.update', {
      'lat': location.latitude,
      'lng': location.longitude,
      if (location.heading != null) 'heading': location.heading,
      if (location.speed != null) 'speed': location.speed,
      if (location.accuracy != null) 'accuracy': location.accuracy,
      'clientTs': location.timestamp.toIso8601String(),
      'sequence': _locationSequence,
    });
  }

  void acceptOrder(String orderId, {String? commandId}) {
    _socketManager.emit('order.accept', {
      'orderId': orderId,
      if (commandId != null) 'commandId': commandId,
    });
  }

  void declineOrder(String orderId, {String? commandId}) {
    _socketManager.emit('order.decline', {
      'orderId': orderId,
      if (commandId != null) 'commandId': commandId,
    });
  }

  void startOrder(String orderId, {String? commandId}) {
    _socketManager.emit('order.start', {
      'orderId': orderId,
      if (commandId != null) 'commandId': commandId,
    });
  }

  void finishOrder(String orderId, {String? commandId}) {
    _socketManager.emit('order.finish', {
      'orderId': orderId,
      if (commandId != null) 'commandId': commandId,
    });
  }

  void cancelOrder(String orderId, {String? commandId}) {
    _socketManager.emit('order.cancel', {
      'orderId': orderId,
      if (commandId != null) 'commandId': commandId,
    });
  }

  void resetLocationSequence() {
    _locationSequence = 0;
  }

  void dispose() {
    _socketManager.close();
    _offerController.close();
    _offerClosedController.close();
    _cancelledController.close();
  }
}
