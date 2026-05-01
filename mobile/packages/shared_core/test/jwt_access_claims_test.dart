import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/auth/jwt_access_claims.dart';

void main() {
  test('parseAccessTokenIdentity reads sub and role from payload', () {
    final payload = base64Url.encode(utf8.encode('{"sub":"user-uuid","role":"DRIVER"}'));
    final jwt = 'x.$payload.y';
    final out = parseAccessTokenIdentity(jwt);
    expect(out.userId, 'user-uuid');
    expect(out.role, 'DRIVER');
  });

  test('defaults on malformed token', () {
    final out = parseAccessTokenIdentity('');
    expect(out.userId, '');
    expect(out.role, 'PASSENGER');
  });
}
