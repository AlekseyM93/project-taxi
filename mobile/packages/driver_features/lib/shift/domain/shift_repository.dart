class ShiftInfo {
  const ShiftInfo({
    required this.isOnline,
    this.startedAt,
    this.vehicleId,
  });
  final bool isOnline;
  final String? startedAt;
  final String? vehicleId;
}

class DriverOrderCard {
  const DriverOrderCard({
    required this.id,
    required this.status,
    this.passengerName,
    this.pickupLat,
    this.pickupLng,
    this.dropoffLat,
    this.dropoffLng,
    this.pickupAddress,
    this.dropoffAddress,
    this.price,
    this.createdAt,
  });
  final String id;
  final String status;
  final String? passengerName;
  final double? pickupLat;
  final double? pickupLng;
  final double? dropoffLat;
  final double? dropoffLng;
  final String? pickupAddress;
  final String? dropoffAddress;
  final double? price;
  final String? createdAt;
}

class EarningsSummary {
  const EarningsSummary({
    required this.totalEarnings,
    required this.tripsCount,
    this.currency = 'RUB',
    this.periodLabel,
  });
  final double totalEarnings;
  final int tripsCount;
  final String currency;
  final String? periodLabel;
}

class DriverProfile {
  const DriverProfile({
    required this.id,
    this.name,
    this.phone,
    this.status,
    this.rating,
  });
  final String id;
  final String? name;
  final String? phone;
  final String? status;
  final double? rating;
}

abstract class ShiftRepository {
  Future<ShiftInfo> getShiftStatus();
  Future<void> startShift({String? vehicleId});
  Future<void> endShift();
  Future<DriverOrderCard?> getActiveOrder();
  Future<void> acceptOrder(String orderId);
  Future<void> startOrder(String orderId);
  Future<void> finishOrder(String orderId);
  Future<void> cancelOrder(String orderId);
  Future<List<DriverOrderCard>> getOrderHistory({int? limit, int? offset});
  Future<EarningsSummary> getEarningsSummary({String? period});
  Future<DriverProfile> getProfile();
  Future<void> updateProfile(Map<String, dynamic> updates);
}
