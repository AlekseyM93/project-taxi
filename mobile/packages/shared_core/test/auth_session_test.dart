import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/auth/auth_session.dart';

void main() {
  group('AuthSession', () {
    test('isPassenger returns true for PASSENGER role', () {
      const session = AuthSession(
        accessToken: 'token',
        refreshToken: 'refresh',
        userId: 'user-1',
        role: 'PASSENGER',
      );
      expect(session.isPassenger, isTrue);
      expect(session.isDriver, isFalse);
    });

    test('isDriver returns true for DRIVER role', () {
      const session = AuthSession(
        accessToken: 'token',
        refreshToken: 'refresh',
        userId: 'user-2',
        role: 'DRIVER',
      );
      expect(session.isDriver, isTrue);
      expect(session.isPassenger, isFalse);
    });

    test('copyWith updates token fields', () {
      const session = AuthSession(
        accessToken: 'old',
        refreshToken: 'old-refresh',
        userId: 'user-1',
        role: 'PASSENGER',
      );
      final updated = session.copyWith(accessToken: 'new', refreshToken: 'new-refresh');
      expect(updated.accessToken, 'new');
      expect(updated.refreshToken, 'new-refresh');
      expect(updated.userId, 'user-1');
      expect(updated.role, 'PASSENGER');
    });
  });
}
