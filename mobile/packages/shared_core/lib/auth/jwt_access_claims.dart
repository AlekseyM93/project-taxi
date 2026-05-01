import 'dart:convert';

/// Извлекает `sub` и `role` из access JWT без проверки подписи (ответ login/refresh с backend по TLS).
({String userId, String role}) parseAccessTokenIdentity(String accessToken) {
  final payload = decodeJwtPayload(accessToken);
  if (payload == null) {
    return (userId: '', role: 'PASSENGER');
  }
  final sub = payload['sub'];
  final role = payload['role'];
  return (
    userId: sub is String ? sub : '',
    role: role is String ? role : 'PASSENGER',
  );
}

Map<String, dynamic>? decodeJwtPayload(String jwt) {
  final parts = jwt.split('.');
  if (parts.length != 3) return null;
  var seg = parts[1];
  switch (seg.length % 4) {
    case 2:
      seg += '==';
      break;
    case 3:
      seg += '=';
      break;
  }
  try {
    final jsonUtf8 = utf8.decode(base64Url.decode(seg));
    final decoded = jsonDecode(jsonUtf8);
    return decoded is Map<String, dynamic> ? decoded : null;
  } catch (_) {
    return null;
  }
}
