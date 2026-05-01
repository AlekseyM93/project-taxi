import 'package:flutter/widgets.dart';
import 'package:shared_core/shared_core.dart';

import 'app_bootstrap.dart';

/// DEV для Android-эмулятора / BlueStacks: `localhost` на хосте → `10.0.2.2`.
///
/// Запуск:
///   flutter run --flavor unified -t lib/main_dev_emulator.dart
///
/// На реальном устройстве в той же Wi‑Fi подставьте IP ПК, например:
///   --dart-define=API_BASE_URL=http://192.168.1.10:3000
///   --dart-define=WS_BASE_URL=http://192.168.1.10:3000
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final dgisSession = DgisSession.tryInitialize();

  await runTaxiPlatformApp(
    config: const AppConfig(
      environment: AppEnvironment.dev,
      apiBaseUrl: String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://10.0.2.2:3000',
      ),
      wsBaseUrl: String.fromEnvironment(
        'WS_BASE_URL',
        defaultValue: 'http://10.0.2.2:3000',
      ),
      deviceId: 'flutter-android-emulator',
      yandexMapApiKey: String.fromEnvironment(
        'YANDEX_MAP_API_KEY',
        defaultValue: '',
      ),
    ),
    dgisSession: dgisSession,
    loggerTag: 'TaxiApp-DEV-EMU',
  );
}
