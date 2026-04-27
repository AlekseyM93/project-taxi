import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';
import 'package:passenger_features/passenger_features.dart';
import 'package:driver_features/driver_features.dart';

import 'main.dart';

/// PROD entry point.
///
/// Запуск:
///   flutter run --release --target lib/main_prod.dart \
///     --dart-define=YANDEX_MAP_API_KEY=ваш-ключ-для-prod
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  const yandexKey = String.fromEnvironment('YANDEX_MAP_API_KEY', defaultValue: '');

  const config = AppConfig(
    environment: AppEnvironment.prod,
    apiBaseUrl: 'https://api.taxi-platform.example',
    wsBaseUrl: 'https://api.taxi-platform.example',
    deviceId: 'flutter-prod-device',
    yandexMapApiKey: yandexKey,
  );

  if (config.yandexMapApiKey.isNotEmpty) {
    debugPrint('[PROD] Инициализация Яндекс Карт...');
  }

  final secureStorage = SecureStorage();
  final logger = SafeLogger(environment: config.environment, tag: 'TaxiApp');
  final permissionService = PermissionService(logger: logger);
  final locationService = LocationService(permissionService: permissionService, logger: logger);

  final authRepository = AuthRepository(
    apiClient: ApiClient(config: config, secureStorage: secureStorage, logger: logger),
    secureStorage: secureStorage,
    logger: logger,
  );
  final apiClient = ApiClient(
    config: config,
    secureStorage: secureStorage,
    logger: logger,
    tokenRefresher: authRepository.refreshAccessToken,
  );

  final passengerOrderRepository = PassengerOrderRepositoryImpl(apiClient: apiClient);
  final shiftRepository = ShiftRepositoryImpl(apiClient: apiClient);

  runApp(TaxiPlatformApp(
    authRepository: authRepository,
    passengerOrderRepository: passengerOrderRepository,
    shiftRepository: shiftRepository,
    locationService: locationService,
  ));
}
