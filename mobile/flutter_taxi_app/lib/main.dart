import 'package:flutter/widgets.dart';
import 'package:shared_core/shared_core.dart';

import 'app_bootstrap.dart';

/// Запуск приложения (default config из `--dart-define`).
///
/// Карты: 2GIS Mobile SDK · `assets/dgissdk.key` · [dev.2gis.ru](https://dev.2gis.ru/order).
/// Варианты package: `com.example.taxi.passenger`, `com.example.taxi.driver`, `com.example.taxi_platform_mobile` (unified).
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final dgisSession = DgisSession.tryInitialize();
  await runTaxiPlatformApp(
    config: AppConfig.fromEnvironment(),
    dgisSession: dgisSession,
  );
}
