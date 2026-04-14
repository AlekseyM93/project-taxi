class AppConfig {
  AppConfig({
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    required this.deviceId,
  });

  final String apiBaseUrl;
  final String wsBaseUrl;
  final String deviceId;

  factory AppConfig.fromEnvironment() {
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

    return AppConfig(
      apiBaseUrl: apiBaseUrl,
      wsBaseUrl: wsBaseUrl,
      deviceId: deviceId,
    );
  }
}
