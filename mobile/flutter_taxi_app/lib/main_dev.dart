import 'package:flutter/widgets.dart';
import 'package:shared_core/shared_core.dart';

import 'app_bootstrap.dart';

/// DEV entry point (одно приложение, выбор роли при регистрации).
///
/// Запуск:
///   flutter run --flavor unified -t lib/main_dev.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final dgisSession = DgisSession.tryInitialize();

  const yandexKey = String.fromEnvironment(
    'YANDEX_MAP_API_KEY',
    defaultValue: '',
  );

  await runTaxiPlatformApp(
    config: const AppConfig(
      environment: AppEnvironment.dev,
      apiBaseUrl: 'http://localhost:3000',
      wsBaseUrl: 'http://localhost:3000',
      deviceId: 'flutter-dev-device',
      yandexMapApiKey: yandexKey,
    ),
    dgisSession: dgisSession,
    loggerTag: 'TaxiApp-DEV',
  );
}
