import 'app_environment.dart';

class AppConfig {
  const AppConfig({
    required this.environment,
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    required this.deviceId,
    this.yandexMapApiKey = '',
  });

  final AppEnvironment environment;
  final String apiBaseUrl;
  final String wsBaseUrl;
  final String deviceId;
  final String yandexMapApiKey;

  factory AppConfig.dev() => const AppConfig(
        environment: AppEnvironment.dev,
        apiBaseUrl: 'http://localhost:3000',
        wsBaseUrl: 'http://localhost:3000',
        deviceId: 'flutter-dev-device',
      );

  factory AppConfig.stage() => const AppConfig(
        environment: AppEnvironment.stage,
        apiBaseUrl: 'https://stage-api.taxi-platform.example',
        wsBaseUrl: 'https://stage-api.taxi-platform.example',
        deviceId: 'flutter-stage-device',
      );

  factory AppConfig.prod() => const AppConfig(
        environment: AppEnvironment.prod,
        apiBaseUrl: 'https://api.taxi-platform.example',
        wsBaseUrl: 'https://api.taxi-platform.example',
        deviceId: 'flutter-prod-device',
      );

  factory AppConfig.fromEnvironment() {
    const env = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    const apiBaseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://localhost:3000',
    );
    const wsBaseUrl = String.fromEnvironment(
      'WS_BASE_URL',
      defaultValue: 'http://localhost:3000',
    );
    const deviceId = String.fromEnvironment(
      'DEVICE_ID',
      defaultValue: 'flutter-device',
    );
    const yandexMapApiKey = String.fromEnvironment(
      'YANDEX_MAP_API_KEY',
      defaultValue: '',
    );

    final environment = AppEnvironment.values.firstWhere(
      (e) => e.name == env,
      orElse: () => AppEnvironment.dev,
    );

    return AppConfig(
      environment: environment,
      apiBaseUrl: apiBaseUrl,
      wsBaseUrl: wsBaseUrl,
      deviceId: deviceId,
      yandexMapApiKey: yandexMapApiKey,
    );
  }
}
