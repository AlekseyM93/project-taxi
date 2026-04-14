import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.userId,
    required this.role,
  });

  final String accessToken;
  final String userId;
  final String role;
}

class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required SharedPreferences prefs,
  })  : _apiClient = apiClient,
        _prefs = prefs;

  final ApiClient _apiClient;
  final SharedPreferences _prefs;

  static const _tokenKey = 'auth.accessToken';
  static const _userIdKey = 'auth.userId';
  static const _roleKey = 'auth.role';

  Future<AuthSession?> loadSession() async {
    final token = _prefs.getString(_tokenKey);
    final userId = _prefs.getString(_userIdKey);
    final role = _prefs.getString(_roleKey);
    if (token == null || userId == null || role == null) {
      return null;
    }
    return AuthSession(accessToken: token, userId: userId, role: role);
  }

  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async {
    final response = await _apiClient.post(
      '/auth/login',
      body: {'phone': phone, 'password': password},
    );
    final body = response.data as Map<String, dynamic>;
    final session = AuthSession(
      accessToken: body['accessToken'] as String,
      userId: body['id'] as String? ?? '',
      role: body['role'] as String? ?? 'PASSENGER',
    );
    await _persist(session);
    return session;
  }

  Future<void> logout() async {
    await _prefs.remove(_tokenKey);
    await _prefs.remove(_userIdKey);
    await _prefs.remove(_roleKey);
  }

  Future<void> _persist(AuthSession session) async {
    await _prefs.setString(_tokenKey, session.accessToken);
    await _prefs.setString(_userIdKey, session.userId);
    await _prefs.setString(_roleKey, session.role);
  }
}
