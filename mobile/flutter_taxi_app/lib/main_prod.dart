import 'package:flutter/widgets.dart';
import 'package:shared_core/shared_core.dart';

import 'app_bootstrap.dart';

/// PROD entry point.
///
/// Запуск:
///   flutter run --release --flavor unified -t lib/main_prod.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final dgisSession = DgisSession.tryInitialize();

  const yandexKey = String.fromEnvironment('YANDEX_MAP_API_KEY', defaultValue: '');

  await runTaxiPlatformApp(
    config: const AppConfig(
      environment: AppEnvironment.prod,
      apiBaseUrl: 'https://api.taxi-platform.example',
      wsBaseUrl: 'https://api.taxi-platform.example',
      deviceId: 'flutter-prod-device',
      yandexMapApiKey: yandexKey,
    ),
    dgisSession: dgisSession,
    loggerTag: 'TaxiApp',
  );
}
