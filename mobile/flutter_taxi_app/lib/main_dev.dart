import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';
import 'package:passenger_features/passenger_features.dart';
import 'package:driver_features/driver_features.dart';

import 'main.dart';

/// DEV entry point.
///
/// Запуск:
///   flutter run --target lib/main_dev.dart \
///     --dart-define=YANDEX_MAP_API_KEY=ваш-ключ-для-dev
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // API-ключ можно задать через --dart-define или прямо здесь для dev
  const yandexKey = String.fromEnvironment(
    'YANDEX_MAP_API_KEY',
    defaultValue: '', // <-- Вставьте ваш dev API-ключ сюда если не хотите --dart-define
  );

  const config = AppConfig(
    environment: AppEnvironment.dev,
    apiBaseUrl: 'http://localhost:3000',
    wsBaseUrl: 'http://localhost:3000',
    deviceId: 'flutter-dev-device',
    yandexMapApiKey: yandexKey,
  );

  // Инициализация Яндекс Карт
  if (config.yandexMapApiKey.isNotEmpty) {
    debugPrint('[DEV] Инициализация Яндекс Карт...');
    // Раскомментируйте:
    // import 'package:yandex_maps_mapkit_lite/init.dart' as mapkit_init;
    // await mapkit_init.initMapkit(apiKey: config.yandexMapApiKey);
  }

  final secureStorage = SecureStorage();
  final logger = SafeLogger(environment: config.environment, tag: 'TaxiApp-DEV');
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
