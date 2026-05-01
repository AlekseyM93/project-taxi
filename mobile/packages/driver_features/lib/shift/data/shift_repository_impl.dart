import 'package:shared_core/shared_core.dart';
import 'package:uuid/uuid.dart';

import '../domain/shift_repository.dart';

class ShiftRepositoryImpl implements ShiftRepository {
  ShiftRepositoryImpl({
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
  Future<ShiftInfo> getShiftStatus() async {
    final response = await _apiClient.get('/drivers/me/shift');
    final data = response.data as Map<String, dynamic>;
    return ShiftInfo(
      isOnline: data['isOnline'] as bool? ?? false,
      startedAt: data['startedAt'] as String?,
      vehicleId: data['vehicleId'] as String?,
    );
  }

  @override
  Future<void> startShift({String? vehicleId}) async {
    await _apiClient.post('/drivers/me/shift/start', body: {
      if (vehicleId != null) 'vehicleId': vehicleId,
    });
  }

  @override
  Future<void> endShift() async {
    await _apiClient.post('/drivers/me/shift/end');
  }

  @override
  Future<DriverOrderCard?> getActiveOrder() async {
    try {
      final response = await _apiClient.get('/orders/me/driver/active/card');
      final data = response.data;
      if (data == null) return null;
      final root = data as Map<String, dynamic>;
      final active = root['activeOrder'];
      if (active == null) return null;
      return _parseOrderCard(active as Map<String, dynamic>);
    } catch (e) {
      if (e is NetworkException && e.statusCode == 404) return null;
      rethrow;
    }
  }

  @override
  Future<void> acceptOrder(String orderId) async {
    try {
      await _apiClient.post('/orders/me/driver/$orderId/accept');
    } on NetworkException catch (e, st) {
      if (_offlineQueue == null) Error.throwWithStackTrace(e, st);
      await _enqueueDriverOp('DRIVER_ACCEPT_ORDER', orderId);
      throw const QueuedForSyncException();
    }
  }

  @override
  Future<void> startOrder(String orderId) async {
    try {
      await _apiClient.post('/orders/me/driver/$orderId/start');
    } on NetworkException catch (e, st) {
      if (_offlineQueue == null) Error.throwWithStackTrace(e, st);
      await _enqueueDriverOp('DRIVER_START_ORDER', orderId);
      throw const QueuedForSyncException();
    }
  }

  @override
  Future<void> finishOrder(String orderId) async {
    try {
      await _apiClient.post('/orders/me/driver/$orderId/finish');
    } on NetworkException catch (e, st) {
      if (_offlineQueue == null) Error.throwWithStackTrace(e, st);
      await _enqueueDriverOp('DRIVER_FINISH_ORDER', orderId);
      throw const QueuedForSyncException();
    }
  }

  @override
  Future<void> cancelOrder(String orderId) async {
    try {
      await _apiClient.post('/orders/me/driver/$orderId/cancel');
    } on NetworkException catch (e, st) {
      if (_offlineQueue == null) Error.throwWithStackTrace(e, st);
      await _enqueueDriverOp('DRIVER_CANCEL_ORDER', orderId);
      throw const QueuedForSyncException();
    }
  }

  Future<void> _enqueueDriverOp(String operationType, String orderId) async {
    await _offlineQueue!.enqueue(
      OfflineCommand(
        commandId: _uuid.v4(),
        operationType: operationType,
        payload: {'orderId': orderId},
        createdAtIso: DateTime.now().toUtc().toIso8601String(),
        deviceId: _deviceId,
      ),
    );
  }

  @override
  Future<List<DriverOrderCard>> getOrderHistory({int? limit, int? offset}) async {
    final params = <String, dynamic>{};
    if (limit != null) params['limit'] = limit;
    if (offset != null) params['offset'] = offset;

    final response = await _apiClient.get('/orders/me/driver', queryParameters: params);
    final data = response.data;
    if (data is List) {
      return data.map((item) => _parseOrderCard(item as Map<String, dynamic>)).toList();
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .map((item) => _parseOrderCard(item as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  @override
  Future<EarningsSummary> getEarningsSummary({String? period}) async {
    final params = <String, dynamic>{};
    if (period != null) params['period'] = period;

    final response = await _apiClient.get('/drivers/me/earnings/summary', queryParameters: params);
    final data = response.data as Map<String, dynamic>;
    return EarningsSummary(
      totalEarnings: (data['totalEarnings'] as num?)?.toDouble() ?? 0,
      tripsCount: data['tripsCount'] as int? ?? 0,
      currency: data['currency'] as String? ?? 'RUB',
      periodLabel: data['periodLabel'] as String?,
    );
  }

  @override
  Future<DriverProfile> getProfile() async {
    final response = await _apiClient.get('/drivers/me/profile');
    final data = response.data as Map<String, dynamic>;
    return DriverProfile(
      id: data['id'] as String? ?? '',
      name: data['name'] as String?,
      phone: data['phone'] as String?,
      status: data['status'] as String?,
      rating: (data['rating'] as num?)?.toDouble(),
    );
  }

  @override
  Future<void> updateProfile(Map<String, dynamic> updates) async {
    await _apiClient.patch('/drivers/me/profile', body: updates);
  }

  DriverOrderCard _parseOrderCard(Map<String, dynamic> data) {
    return DriverOrderCard(
      id: data['id'] as String? ?? '',
      status: data['status'] as String? ?? 'UNKNOWN',
      passengerName: data['passengerName'] as String?,
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
