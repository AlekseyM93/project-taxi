import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';
import 'package:passenger_features/passenger_features.dart';
import 'package:driver_features/driver_features.dart';

import 'main.dart';

/// STAGE entry point.
///
/// Запуск:
///   flutter run --target lib/main_stage.dart \
///     --dart-define=YANDEX_MAP_API_KEY=ваш-ключ-для-stage
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  const yandexKey = String.fromEnvironment('YANDEX_MAP_API_KEY', defaultValue: '');

  const config = AppConfig(
    environment: AppEnvironment.stage,
    apiBaseUrl: 'https://stage-api.taxi-platform.example',
    wsBaseUrl: 'https://stage-api.taxi-platform.example',
    deviceId: 'flutter-stage-device',
    yandexMapApiKey: yandexKey,
  );

  if (config.yandexMapApiKey.isNotEmpty) {
    debugPrint('[STAGE] Инициализация Яндекс Карт...');
  }

  final secureStorage = SecureStorage();
  final logger = SafeLogger(environment: config.environment, tag: 'TaxiApp-STAGE');
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
