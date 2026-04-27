import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';
import 'package:passenger_features/passenger_features.dart';
import 'package:driver_features/driver_features.dart';

import 'screens/login_screen.dart';

/// Запуск приложения.
///
/// API-ключ Яндекс Карт передаётся через --dart-define:
///   flutter run --dart-define=YANDEX_MAP_API_KEY=ваш-ключ
///
/// Или через окружение конкретного flavor:
///   flutter run --target lib/main_dev.dart --dart-define=YANDEX_MAP_API_KEY=ваш-ключ
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final config = AppConfig.fromEnvironment();

  // ── Инициализация Яндекс Карт ──
  // API-ключ берётся из config.yandexMapApiKey,
  // который приходит из --dart-define=YANDEX_MAP_API_KEY=...
  if (config.yandexMapApiKey.isNotEmpty) {
    await _initYandexMapKit(config.yandexMapApiKey);
  }

  final secureStorage = SecureStorage();
  final logger = SafeLogger(environment: config.environment, tag: 'TaxiApp');
  final permissionService = PermissionService(logger: logger);
  final locationService = LocationService(
    permissionService: permissionService,
    logger: logger,
  );

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

  runApp(
    TaxiPlatformApp(
      authRepository: authRepository,
      passengerOrderRepository: passengerOrderRepository,
      shiftRepository: shiftRepository,
      locationService: locationService,
    ),
  );
}

/// Инициализация Yandex MapKit SDK.
///
/// Вызывается один раз при старте приложения.
/// Без вызова этой функции виджет YandexMap не будет работать.
Future<void> _initYandexMapKit(String apiKey) async {
  try {
    // Раскомментируйте после установки yandex_maps_mapkit_lite:
    //
    // import 'package:yandex_maps_mapkit_lite/init.dart' as mapkit_init;
    // await mapkit_init.initMapkit(apiKey: apiKey);

    debugPrint('[MapKit] Yandex MapKit SDK готов к инициализации. '
        'API-ключ получен (${apiKey.length} символов).');
  } catch (e) {
    debugPrint('[MapKit] Ошибка инициализации: $e');
  }
}

class TaxiPlatformApp extends StatelessWidget {
  const TaxiPlatformApp({
    super.key,
    required this.authRepository,
    required this.passengerOrderRepository,
    required this.shiftRepository,
    required this.locationService,
  });

  final AuthRepository authRepository;
  final PassengerOrderRepositoryImpl passengerOrderRepository;
  final ShiftRepositoryImpl shiftRepository;
  final LocationService locationService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Такси Платформа',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.amber),
        useMaterial3: true,
      ),
      home: AppRoot(
        authRepository: authRepository,
        passengerOrderRepository: passengerOrderRepository,
        shiftRepository: shiftRepository,
        locationService: locationService,
      ),
    );
  }
}

class AppRoot extends StatefulWidget {
  const AppRoot({
    super.key,
    required this.authRepository,
    required this.passengerOrderRepository,
    required this.shiftRepository,
    required this.locationService,
  });

  final AuthRepository authRepository;
  final PassengerOrderRepositoryImpl passengerOrderRepository;
  final ShiftRepositoryImpl shiftRepository;
  final LocationService locationService;

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  AuthSession? _session;
  bool _isRestoring = true;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final session = await widget.authRepository.loadSession();
    if (!mounted) return;
    setState(() {
      _session = session;
      _isRestoring = false;
    });
  }

  void _onLoginSuccess(AuthSession session) {
    setState(() => _session = session);
  }

  @override
  Widget build(BuildContext context) {
    if (_isRestoring) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_session == null) {
      return LoginScreen(
        authRepository: widget.authRepository,
        onLoginSuccess: _onLoginSuccess,
      );
    }

    if (_session!.isDriver) {
      return DriverHomeScreen(
        shiftRepository: widget.shiftRepository,
        locationService: widget.locationService,
        authRepository: widget.authRepository,
      );
    }

    return PassengerHomeScreen(
      orderRepository: widget.passengerOrderRepository,
      locationService: widget.locationService,
      authRepository: widget.authRepository,
    );
  }
}
