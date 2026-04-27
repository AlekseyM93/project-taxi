import 'package:shared_core/shared_core.dart';

import '../domain/passenger_order_repository.dart';

class PassengerOrderRepositoryImpl implements PassengerOrderRepository {
  PassengerOrderRepositoryImpl({required ApiClient apiClient})
      : _apiClient = apiClient;

  final ApiClient _apiClient;

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
    return RouteEstimate(
      distanceKm: (data['distanceKm'] as num).toDouble(),
      estimatedDurationMin: (data['estimatedDurationMin'] as num).toDouble(),
      provider: data['provider'] as String?,
      fallbackUsed: data['fallbackUsed'] as bool? ?? false,
    );
  }

  @override
  Future<String> reverseGeocode({required double lat, required double lng}) async {
    final response = await _apiClient.post('/geo/reverse', body: {
      'lat': lat,
      'lng': lng,
    });
    final data = response.data as Map<String, dynamic>;
    return data['address'] as String? ?? '$lat, $lng';
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
    return FareEstimate(
      totalPrice: (data['totalPrice'] as num?)?.toDouble() ?? 0,
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
    final response = await _apiClient.post('/orders/me/passenger/confirm', body: {
      'fromLat': fromLat,
      'fromLng': fromLng,
      'toLat': toLat,
      'toLng': toLng,
      if (pickupAddress != null) 'pickupAddress': pickupAddress,
      if (dropoffAddress != null) 'dropoffAddress': dropoffAddress,
    });
    return _parseOrderDetails(response.data as Map<String, dynamic>);
  }

  @override
  Future<void> cancelOrder(String orderId) async {
    await _apiClient.post('/orders/$orderId/cancel');
  }

  @override
  Future<OrderDetails?> getActiveOrder() async {
    try {
      final response = await _apiClient.get('/orders/me/passenger/active');
      final data = response.data;
      if (data == null) return null;
      return _parseOrderDetails(data as Map<String, dynamic>);
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
    return _parseOrderDetails(response.data as Map<String, dynamic>);
  }

  OrderDetails _parseOrderDetails(Map<String, dynamic> data) {
    return OrderDetails(
      id: data['id'] as String? ?? '',
      status: data['status'] as String? ?? 'UNKNOWN',
      driverId: data['driverId'] as String?,
      driverName: data['driverName'] as String?,
      driverPhone: data['driverPhone'] as String?,
      vehicleModel: data['vehicleModel'] as String?,
      vehiclePlate: data['vehiclePlate'] as String?,
      pickupLat: (data['fromLat'] as num?)?.toDouble(),
      pickupLng: (data['fromLng'] as num?)?.toDouble(),
      dropoffLat: (data['toLat'] as num?)?.toDouble(),
      dropoffLng: (data['toLng'] as num?)?.toDouble(),
      pickupAddress: data['pickupAddress'] as String?,
      dropoffAddress: data['dropoffAddress'] as String?,
      price: (data['price'] as num?)?.toDouble(),
      createdAt: data['createdAt'] as String?,
    );
  }
}
