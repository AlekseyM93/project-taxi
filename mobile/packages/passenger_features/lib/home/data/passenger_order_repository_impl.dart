import 'package:shared_core/shared_core.dart';
import 'package:uuid/uuid.dart';

import '../domain/passenger_order_repository.dart';

class PassengerOrderRepositoryImpl implements PassengerOrderRepository {
  PassengerOrderRepositoryImpl({
    required ApiClient apiClient,
    OfflineCommandQueue? offlineQueue,
    String? deviceId,
  })  : _apiClient = apiClient,
        _offlineQueue = offlineQueue,
        _deviceId = deviceId;

  final ApiClient _apiClient;
  final OfflineCommandQueue? _offlineQueue;
  final String? _deviceId;

  static const _uuid = Uuid();

  @override
  Future<RouteEstimate> estimateRoute({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  }) async {
    final response = await _apiClient.post('/geo/route-estimate', body: {
      'fromLat': fromLat,
      'fromLng': fromLng,
      'toLat': toLat,
      'toLng': toLng,
    });
    final data = response.data as Map<String, dynamic>;
    List<MapLatLng>? polyline;
    final rawPoly = data['polyline'];
    if (rawPoly is List) {
      final pts = <MapLatLng>[];
      for (final item in rawPoly) {
        if (item is Map) {
          final la = item['lat'];
          final ln = item['lng'];
          if (la is num && ln is num) {
            pts.add(MapLatLng(la.toDouble(), ln.toDouble()));
          }
        }
      }
      if (pts.length >= 2) polyline = pts;
    }

    return RouteEstimate(
      distanceKm: (data['distanceKm'] as num).toDouble(),
      estimatedDurationMin: (data['estimatedDurationMin'] as num).toDouble(),
      provider: data['provider'] as String?,
      fallbackUsed: data['fallbackUsed'] as bool? ?? false,
      polyline: polyline,
    );
  }

  @override
  Future<String> reverseGeocode({required double lat, required double lng}) async {
    final response = await _apiClient.post('/geo/reverse', body: {
      'lat': lat,
      'lng': lng,
    });
    final data = response.data as Map<String, dynamic>;
    return data['normalizedAddress'] as String? ??
        data['address'] as String? ??
        '$lat, $lng';
  }

  @override
  Future<GeocodeAddressResult> geocodeAddress(String addressText, {String? cityCode}) async {
    final trimmed = addressText.trim();
    if (trimmed.isEmpty) {
      throw const ValidationException(message: 'Введите адрес');
    }
    final response = await _apiClient.post('/geo/geocode', body: {
      'addressText': trimmed,
      if (cityCode != null) 'cityCode': cityCode,
    });
    final data = response.data as Map<String, dynamic>;
    final point = data['point'];
    if (point is! Map) {
      throw const ValidationException(message: 'Адрес не найден');
    }
    final la = point['lat'];
    final ln = point['lng'];
    if (la is! num || ln is! num) {
      throw const ValidationException(message: 'Адрес не найден');
    }
    final norm = data['normalizedAddress'] as String? ?? trimmed;
    return GeocodeAddressResult(
      latitude: la.toDouble(),
      longitude: ln.toDouble(),
      normalizedAddress: norm,
    );
  }

  @override
  Future<FareEstimate> estimateFare({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  }) async {
    final response = await _apiClient.post('/orders/me/passenger/fare-estimate', body: {
      'fromLat': fromLat,
      'fromLng': fromLng,
      'toLat': toLat,
      'toLng': toLng,
    });
    final data = response.data as Map<String, dynamic>;
    final pricing = data['pricing'];
    num? fromPricing;
    if (pricing is Map) {
      fromPricing = pricing['totalPriceRub'] as num?;
    }
    return FareEstimate(
      totalPrice:
          (data['totalPrice'] as num?)?.toDouble() ?? fromPricing?.toDouble() ?? 0,
      currency: data['currency'] as String? ?? 'RUB',
      distanceKm: (data['distanceKm'] as num?)?.toDouble(),
      estimatedDurationMin: (data['estimatedDurationMin'] as num?)?.toDouble(),
    );
  }

  @override
  Future<OrderDetails> createOrder({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
    String? pickupAddress,
    String? dropoffAddress,
  }) async {
    try {
      final response = await _apiClient.post('/orders/me/passenger/confirm', body: {
        'fromLat': fromLat,
        'fromLng': fromLng,
        'toLat': toLat,
        'toLng': toLng,
        if (pickupAddress != null) 'pickupAddress': pickupAddress,
        if (dropoffAddress != null) 'dropoffAddress': dropoffAddress,
      });
      return _parseOrderDetails(response.data as Map<String, dynamic>);
    } on NetworkException catch (e, st) {
      if (_offlineQueue == null) {
        Error.throwWithStackTrace(e, st);
      }
      await _enqueuePassengerCreate(
        fromLat: fromLat,
        fromLng: fromLng,
        toLat: toLat,
        toLng: toLng,
      );
      throw const QueuedForSyncException();
    }
  }

  @override
  Future<void> cancelOrder(String orderId) async {
    try {
      await _apiClient.post('/orders/$orderId/cancel');
    } on NetworkException catch (e, st) {
      if (_offlineQueue == null) {
        Error.throwWithStackTrace(e, st);
      }
      await _enqueuePassengerCancel(orderId);
      throw const QueuedForSyncException();
    }
  }

  Future<void> _enqueuePassengerCreate({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  }) async {
    await _offlineQueue!.enqueue(
      OfflineCommand(
        commandId: _uuid.v4(),
        operationType: 'PASSENGER_CREATE_ORDER',
        payload: {
          'fromLat': fromLat,
          'fromLng': fromLng,
          'toLat': toLat,
          'toLng': toLng,
        },
        createdAtIso: DateTime.now().toUtc().toIso8601String(),
        deviceId: _deviceId,
      ),
    );
  }

  Future<void> _enqueuePassengerCancel(String orderId) async {
    await _offlineQueue!.enqueue(
      OfflineCommand(
        commandId: _uuid.v4(),
        operationType: 'PASSENGER_CANCEL_ORDER',
        payload: {'orderId': orderId},
        createdAtIso: DateTime.now().toUtc().toIso8601String(),
        deviceId: _deviceId,
      ),
    );
  }

  @override
  Future<OrderDetails?> getActiveOrder() async {
    try {
      final response = await _apiClient.get('/orders/me/passenger/active');
      final data = response.data;
      if (data == null) return null;
      final root = data as Map<String, dynamic>;
      final active = root['activeOrder'];
      if (active == null) return null;
      return _parseOrderDetails(active as Map<String, dynamic>);
    } catch (e) {
      if (e is NetworkException && e.statusCode == 404) return null;
      rethrow;
    }
  }

  @override
  Future<List<OrderDetails>> getOrderHistory({int? limit, int? offset}) async {
    final params = <String, dynamic>{};
    if (limit != null) params['limit'] = limit;
    if (offset != null) params['offset'] = offset;

    final response = await _apiClient.get(
      '/orders/me/passenger',
      queryParameters: params,
    );
    final data = response.data;
    if (data is List) {
      return data.map((item) => _parseOrderDetails(item as Map<String, dynamic>)).toList();
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .map((item) => _parseOrderDetails(item as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  @override
  Future<OrderDetails> getOrderDetails(String orderId) async {
    final response = await _apiClient.get('/orders/me/passenger/$orderId/details');
    final root = response.data as Map<String, dynamic>;
    final orderMap = root['order'] as Map<String, dynamic>? ?? root;
    final driverEnv = root['driver'] as Map<String, dynamic>?;
    return _parseOrderDetails(orderMap, driverEnvelope: driverEnv);
  }

  OrderDetails _parseOrderDetails(
    Map<String, dynamic> data, {
    Map<String, dynamic>? driverEnvelope,
  }) {
    String? driverName = data['driverName'] as String?;
    String? vehicleModel = data['vehicleModel'] as String?;
    String? vehiclePlate = data['vehiclePlate'] as String?;

    if (driverEnvelope != null) {
      final fn = driverEnvelope['firstName'] as String?;
      final ln = driverEnvelope['lastName'] as String?;
      final parts = <String>[if (fn != null && fn.isNotEmpty) fn, if (ln != null && ln.isNotEmpty) ln];
      if (parts.isNotEmpty) {
        driverName = parts.join(' ');
      }
      final v = driverEnvelope['vehicle'];
      if (v is Map) {
        final brand = v['brand'] as String? ?? '';
        final model = v['model'] as String? ?? '';
        final bm = '$brand $model'.trim();
        if (bm.isNotEmpty) vehicleModel = bm;
        vehiclePlate = v['plateNumber'] as String? ?? vehiclePlate;
      }
    }

    return OrderDetails(
      id: data['id'] as String? ?? '',
      status: data['status'] as String? ?? 'UNKNOWN',
      driverId: data['driverId'] as String?,
      driverName: driverName,
      driverPhone: data['driverPhone'] as String?,
      vehicleModel: vehicleModel,
      vehiclePlate: vehiclePlate,
      pickupLat: orderPickupLat(data),
      pickupLng: orderPickupLng(data),
      dropoffLat: orderDropoffLat(data),
      dropoffLng: orderDropoffLng(data),
      pickupAddress: data['pickupAddress'] as String?,
      dropoffAddress: data['dropoffAddress'] as String?,
      price: parseOrderPriceField(data['price']),
      createdAt: data['createdAt'] as String?,
    );
  }
}
