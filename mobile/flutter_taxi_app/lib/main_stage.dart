import 'package:flutter/widgets.dart';
import 'package:shared_core/shared_core.dart';

import 'app_bootstrap.dart';

/// STAGE entry point.
///
/// Запуск:
///   flutter run --flavor unified -t lib/main_stage.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final dgisSession = DgisSession.tryInitialize();

  const yandexKey = String.fromEnvironment('YANDEX_MAP_API_KEY', defaultValue: '');

  await runTaxiPlatformApp(
    config: const AppConfig(
      environment: AppEnvironment.stage,
      apiBaseUrl: 'https://stage-api.taxi-platform.example',
      wsBaseUrl: 'https://stage-api.taxi-platform.example',
      deviceId: 'flutter-stage-device',
      yandexMapApiKey: yandexKey,
    ),
    dgisSession: dgisSession,
    loggerTag: 'TaxiApp-STAGE',
  );
}
