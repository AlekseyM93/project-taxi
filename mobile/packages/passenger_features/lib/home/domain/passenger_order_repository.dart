import 'package:shared_core/shared_core.dart';

class GeoPoint {
  const GeoPoint({required this.latitude, required this.longitude, this.address});
  final double latitude;
  final double longitude;
  final String? address;
}

class RouteEstimate {
  const RouteEstimate({
    required this.distanceKm,
    required this.estimatedDurationMin,
    this.provider,
    this.fallbackUsed = false,
    this.polyline,
  });
  final double distanceKm;
  final double estimatedDurationMin;
  final String? provider;
  final bool fallbackUsed;

  /// Геометрия дороги (например OSRM через backend).
  final List<MapLatLng>? polyline;
}

class GeocodeAddressResult {
  const GeocodeAddressResult({
    required this.latitude,
    required this.longitude,
    required this.normalizedAddress,
  });
  final double latitude;
  final double longitude;
  final String normalizedAddress;
}

class FareEstimate {
  const FareEstimate({
    required this.totalPrice,
    this.currency = 'RUB',
    this.distanceKm,
    this.estimatedDurationMin,
  });
  final double totalPrice;
  final String currency;
  final double? distanceKm;
  final double? estimatedDurationMin;
}

class OrderDetails {
  const OrderDetails({
    required this.id,
    required this.status,
    this.driverId,
    this.driverName,
    this.driverPhone,
    this.vehicleModel,
    this.vehiclePlate,
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
  final String? driverId;
  final String? driverName;
  final String? driverPhone;
  final String? vehicleModel;
  final String? vehiclePlate;
  final double? pickupLat;
  final double? pickupLng;
  final double? dropoffLat;
  final double? dropoffLng;
  final String? pickupAddress;
  final String? dropoffAddress;
  final double? price;
  final String? createdAt;

  OrderDetails copyWith({
    String? status,
    String? driverId,
    String? driverName,
    double? pickupLat,
    double? pickupLng,
    double? dropoffLat,
    double? dropoffLng,
  }) {
    return OrderDetails(
      id: id,
      status: status ?? this.status,
      driverId: driverId ?? this.driverId,
      driverName: driverName ?? this.driverName,
      driverPhone: driverPhone,
      vehicleModel: vehicleModel,
      vehiclePlate: vehiclePlate,
      pickupLat: pickupLat ?? this.pickupLat,
      pickupLng: pickupLng ?? this.pickupLng,
      dropoffLat: dropoffLat ?? this.dropoffLat,
      dropoffLng: dropoffLng ?? this.dropoffLng,
      pickupAddress: pickupAddress,
      dropoffAddress: dropoffAddress,
      price: price,
      createdAt: createdAt,
    );
  }
}

abstract class PassengerOrderRepository {
  Future<RouteEstimate> estimateRoute({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  });

  Future<String> reverseGeocode({required double lat, required double lng});

  Future<GeocodeAddressResult> geocodeAddress(String addressText, {String? cityCode});

  Future<FareEstimate> estimateFare({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
  });

  Future<OrderDetails> createOrder({
    required double fromLat,
    required double fromLng,
    required double toLat,
    required double toLng,
    String? pickupAddress,
    String? dropoffAddress,
  });

  Future<void> cancelOrder(String orderId);

  Future<OrderDetails?> getActiveOrder();

  Future<List<OrderDetails>> getOrderHistory({int? limit, int? offset});

  Future<OrderDetails> getOrderDetails(String orderId);
}
