import 'package:permission_handler/permission_handler.dart';

import '../errors/app_exception.dart';
import '../logging/safe_logger.dart';

class PermissionService {
  PermissionService({required SafeLogger logger}) : _logger = logger;

  final SafeLogger _logger;

  Future<bool> hasLocationPermission() async {
    final status = await Permission.locationWhenInUse.status;
    return status.isGranted;
  }

  Future<bool> requestLocationPermission() async {
    final status = await Permission.locationWhenInUse.request();
    _logger.info('Location permission result: ${status.name}');

    if (status.isPermanentlyDenied) {
      throw const LocationException(
        message: 'Location permission permanently denied',
        isPermissionDenied: true,
      );
    }

    return status.isGranted;
  }

  Future<bool> hasAlwaysLocationPermission() async {
    final status = await Permission.locationAlways.status;
    return status.isGranted;
  }

  Future<bool> requestAlwaysLocationPermission() async {
    final whenInUse = await Permission.locationWhenInUse.status;
    if (!whenInUse.isGranted) {
      await requestLocationPermission();
    }
    final status = await Permission.locationAlways.request();
    return status.isGranted;
  }
}
