import 'dart:async';

import 'package:geolocator/geolocator.dart';

import '../errors/app_exception.dart';
import '../logging/safe_logger.dart';
import 'permission_service.dart';

class LocationData {
  const LocationData({
    required this.latitude,
    required this.longitude,
    this.heading,
    this.speed,
    this.accuracy,
    required this.timestamp,
  });

  final double latitude;
  final double longitude;
  final double? heading;
  final double? speed;
  final double? accuracy;
  final DateTime timestamp;
}

class LocationService {
  LocationService({
    required PermissionService permissionService,
    required SafeLogger logger,
  })  : _permissionService = permissionService,
        _logger = logger;

  final PermissionService _permissionService;
  final SafeLogger _logger;

  StreamSubscription<Position>? _positionSubscription;
  final _locationController = StreamController<LocationData>.broadcast();
  LocationData? _lastLocation;

  Stream<LocationData> get locationStream => _locationController.stream;
  LocationData? get lastLocation => _lastLocation;

  Future<LocationData> getCurrentLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw const LocationException(
        message: 'Location service disabled',
        isServiceDisabled: true,
      );
    }

    final hasPermission = await _permissionService.hasLocationPermission();
    if (!hasPermission) {
      final granted = await _permissionService.requestLocationPermission();
      if (!granted) {
        throw const LocationException(
          message: 'Location permission denied',
          isPermissionDenied: true,
        );
      }
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      final data = _positionToLocationData(position);
      _lastLocation = data;
      return data;
    } catch (e) {
      throw LocationException(
        message: 'Failed to get location',
        originalError: e,
      );
    }
  }

  Future<void> startTracking({
    Duration interval = const Duration(seconds: 5),
    int distanceFilter = 10,
  }) async {
    await stopTracking();

    final hasPermission = await _permissionService.hasLocationPermission();
    if (!hasPermission) {
      throw const LocationException(
        message: 'Location permission required for tracking',
        isPermissionDenied: true,
      );
    }

    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilter,
      ),
    ).listen(
      (position) {
        final data = _positionToLocationData(position);
        _lastLocation = data;
        _locationController.add(data);
      },
      onError: (Object error) {
        _logger.error('Location tracking error', error);
      },
    );

    _logger.info('Location tracking started');
  }

  Future<void> stopTracking() async {
    await _positionSubscription?.cancel();
    _positionSubscription = null;
    _logger.info('Location tracking stopped');
  }

  LocationData _positionToLocationData(Position position) {
    return LocationData(
      latitude: position.latitude,
      longitude: position.longitude,
      heading: position.heading != 0 ? position.heading : null,
      speed: position.speed > 0 ? position.speed : null,
      accuracy: position.accuracy,
      timestamp: position.timestamp,
    );
  }

  void dispose() {
    stopTracking();
    _locationController.close();
  }
}
