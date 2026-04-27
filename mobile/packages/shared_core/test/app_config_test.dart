import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/config/app_config.dart';
import 'package:shared_core/config/app_environment.dart';

void main() {
  group('AppConfig', () {
    test('dev factory creates dev environment', () {
      final config = AppConfig.dev();
      expect(config.environment, AppEnvironment.dev);
      expect(config.apiBaseUrl, contains('localhost'));
    });

    test('stage factory creates stage environment', () {
      final config = AppConfig.stage();
      expect(config.environment, AppEnvironment.stage);
      expect(config.apiBaseUrl, contains('stage'));
    });

    test('prod factory creates prod environment', () {
      final config = AppConfig.prod();
      expect(config.environment, AppEnvironment.prod);
    });

    test('fromEnvironment defaults to dev', () {
      final config = AppConfig.fromEnvironment();
      expect(config.environment, AppEnvironment.dev);
      expect(config.apiBaseUrl, 'http://localhost:3000');
    });
  });

  group('AppEnvironment', () {
    test('isDev returns true for dev', () {
      expect(AppEnvironment.dev.isDev, isTrue);
      expect(AppEnvironment.dev.isProd, isFalse);
    });

    test('isProd returns true for prod', () {
      expect(AppEnvironment.prod.isProd, isTrue);
      expect(AppEnvironment.prod.isDev, isFalse);
    });
  });
}
