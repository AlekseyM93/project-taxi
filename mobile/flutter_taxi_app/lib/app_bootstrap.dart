import 'package:flutter/material.dart';
import 'package:driver_features/driver_features.dart';
import 'package:passenger_features/passenger_features.dart';
import 'package:shared_core/shared_core.dart';

import 'app_shell.dart';
import 'taxi_client_kind.dart';

/// Общая инициализация приложения для [main.dart] и flavored entrypoints.
Future<void> runTaxiPlatformApp({
  required AppConfig config,
  required DgisSession? dgisSession,
  TaxiClientKind clientKind = TaxiClientKind.universal,
  String loggerTag = 'TaxiApp',
  String materialAppTitle = 'Такси платформа',
}) async {
  WidgetsFlutterBinding.ensureInitialized();

  final secureStorage = SecureStorage();
  final logger = SafeLogger(environment: config.environment, tag: loggerTag);
  final permissionService = PermissionService(logger: logger);
  final locationService = LocationService(
    permissionService: permissionService,
    logger: logger,
  );
  final offlineQueue = OfflineCommandQueue(logger: logger);

  final authRepository = AuthRepository(
    apiClient: ApiClient(
      config: config,
      secureStorage: secureStorage,
      logger: logger,
    ),
    secureStorage: secureStorage,
    logger: logger,
  );

  final apiClient = ApiClient(
    config: config,
    secureStorage: secureStorage,
    logger: logger,
    tokenRefresher: authRepository.refreshAccessToken,
  );

  final syncService = SyncService(
    apiClient: apiClient,
    authRepository: authRepository,
    queue: offlineQueue,
    logger: logger,
    deviceId: config.deviceId,
  );

  final passengerOrderRepository = PassengerOrderRepositoryImpl(
    apiClient: apiClient,
    offlineQueue: offlineQueue,
    deviceId: config.deviceId,
  );
  final shiftRepository = ShiftRepositoryImpl(
    apiClient: apiClient,
    offlineQueue: offlineQueue,
    deviceId: config.deviceId,
  );

  runApp(
    TaxiPlatformApp(
      config: config,
      authRepository: authRepository,
      passengerOrderRepository: passengerOrderRepository,
      shiftRepository: shiftRepository,
      locationService: locationService,
      offlineQueue: offlineQueue,
      syncService: syncService,
      logger: logger,
      dgisSession: dgisSession,
      clientKind: clientKind,
      materialAppTitle: materialAppTitle,
    ),
  );
}
