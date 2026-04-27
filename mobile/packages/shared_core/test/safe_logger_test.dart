import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/config/app_environment.dart';
import 'package:shared_core/logging/safe_logger.dart';

void main() {
  group('SafeLogger', () {
    test('creates with tag and environment', () {
      final logger = SafeLogger(environment: AppEnvironment.dev, tag: 'TestTag');
      expect(logger.tag, 'TestTag');
      expect(logger.environment, AppEnvironment.dev);
    });

    test('debug does not throw in dev', () {
      final logger = SafeLogger(environment: AppEnvironment.dev, tag: 'Test');
      expect(() => logger.debug('test message'), returnsNormally);
    });

    test('info does not throw in prod', () {
      final logger = SafeLogger(environment: AppEnvironment.prod, tag: 'Test');
      expect(() => logger.info('test message'), returnsNormally);
    });

    test('error does not throw', () {
      final logger = SafeLogger(environment: AppEnvironment.dev, tag: 'Test');
      expect(() => logger.error('error msg', Exception('err')), returnsNormally);
    });
  });
}
