import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/errors/app_exception.dart';

void main() {
  group('NetworkException', () {
    test('server errors are retryable', () {
      const ex = NetworkException(message: 'Server Error', statusCode: 500);
      expect(ex.isRetryable, isTrue);
    });

    test('client errors are not retryable', () {
      const ex = NetworkException(message: 'Not Found', statusCode: 404);
      expect(ex.isRetryable, isFalse);
    });

    test('no status code is retryable (connection failure)', () {
      const ex = NetworkException(message: 'Connection failed');
      expect(ex.isRetryable, isTrue);
    });

    test('userFriendlyMessage for server error', () {
      const ex = NetworkException(message: 'err', statusCode: 502);
      expect(ex.userFriendlyMessage, contains('сервера'));
    });

    test('userFriendlyMessage for no connection', () {
      const ex = NetworkException(message: 'err');
      expect(ex.userFriendlyMessage, contains('подключения'));
    });
  });

  group('AuthException', () {
    test('is not retryable', () {
      const ex = AuthException(message: 'unauthorized');
      expect(ex.isRetryable, isFalse);
    });

    test('session expired message', () {
      const ex = AuthException(message: 'expired', isSessionExpired: true);
      expect(ex.userFriendlyMessage, contains('Сессия'));
    });
  });

  group('LocationException', () {
    test('permission denied is not retryable', () {
      const ex = LocationException(message: 'denied', isPermissionDenied: true);
      expect(ex.isRetryable, isFalse);
    });

    test('service disabled is retryable', () {
      const ex = LocationException(message: 'off', isServiceDisabled: true);
      expect(ex.isRetryable, isTrue);
    });
  });
}
