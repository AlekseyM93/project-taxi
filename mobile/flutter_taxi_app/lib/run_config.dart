import 'package:shared_core/shared_core.dart';

/// URL хоста с точки зрения Android эмулятора (localhost машины разработки).
const String kDefaultAndroidLoopbackHost = 'http://10.0.2.2:3000';

/// Пресет локального API для сборок passenger/driver (можно переопределить через --dart-define).
AppConfig presetLocalBackend({
  required String deviceIdSuffix,
}) {
  return AppConfig(
    environment: AppEnvironment.dev,
    apiBaseUrl: const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: kDefaultAndroidLoopbackHost,
    ),
    wsBaseUrl: const String.fromEnvironment(
      'WS_BASE_URL',
      defaultValue: kDefaultAndroidLoopbackHost,
    ),
    deviceId: 'mobile-$deviceIdSuffix',
    yandexMapApiKey: const String.fromEnvironment(
      'YANDEX_MAP_API_KEY',
      defaultValue: '',
    ),
  );
}
