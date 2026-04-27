import 'dart:async';

import '../logging/safe_logger.dart';
import '../networking/api_client.dart';
import '../storage/secure_storage.dart';
import 'auth_session.dart';

class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required SecureStorage secureStorage,
    required SafeLogger logger,
  })  : _apiClient = apiClient,
        _secureStorage = secureStorage,
        _logger = logger;

  final ApiClient _apiClient;
  final SecureStorage _secureStorage;
  final SafeLogger _logger;

  AuthSession? _currentSession;
  final _sessionController = StreamController<AuthSession?>.broadcast();

  AuthSession? get currentSession => _currentSession;
  Stream<AuthSession?> get sessionStream => _sessionController.stream;

  Future<AuthSession?> loadSession() async {
    final accessToken = await _secureStorage.accessToken;
    final refreshToken = await _secureStorage.refreshToken;
    final userId = await _secureStorage.userId;
    final role = await _secureStorage.role;

    if (accessToken == null || refreshToken == null || userId == null || role == null) {
      _currentSession = null;
      _sessionController.add(null);
      return null;
    }

    _currentSession = AuthSession(
      accessToken: accessToken,
      refreshToken: refreshToken,
      userId: userId,
      role: role,
    );
    _sessionController.add(_currentSession);
    return _currentSession;
  }

  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async {
    final response = await _apiClient.post(
      '/auth/login',
      body: {'phone': phone, 'password': password},
      requireAuth: false,
    );
    final body = response.data as Map<String, dynamic>;
    final session = AuthSession(
      accessToken: body['accessToken'] as String,
      refreshToken: body['refreshToken'] as String? ?? '',
      userId: body['id'] as String? ?? '',
      role: body['role'] as String? ?? 'PASSENGER',
    );
    await _persistSession(session);
    _logger.info('Login successful', {'role': session.role});
    return session;
  }

  Future<AuthSession> register({
    required String phone,
    required String password,
    required String role,
  }) async {
    final response = await _apiClient.post(
      '/auth/register',
      body: {'phone': phone, 'password': password, 'role': role},
      requireAuth: false,
    );
    final body = response.data as Map<String, dynamic>;
    final session = AuthSession(
      accessToken: body['accessToken'] as String,
      refreshToken: body['refreshToken'] as String? ?? '',
      userId: body['id'] as String? ?? '',
      role: body['role'] as String? ?? role,
    );
    await _persistSession(session);
    _logger.info('Registration successful', {'role': session.role});
    return session;
  }

  Future<String?> refreshAccessToken(String refreshToken) async {
    try {
      final response = await _apiClient.post(
        '/auth/refresh',
        body: {'refreshToken': refreshToken},
        requireAuth: false,
      );
      final body = response.data as Map<String, dynamic>;
      final newAccessToken = body['accessToken'] as String;
      final newRefreshToken = body['refreshToken'] as String? ?? refreshToken;

      await _secureStorage.saveAuthTokens(
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      );

      if (_currentSession != null) {
        _currentSession = _currentSession!.copyWith(
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        );
        _sessionController.add(_currentSession);
      }

      _logger.debug('Token refreshed successfully');
      return newAccessToken;
    } catch (e) {
      _logger.error('Token refresh failed', e);
      return null;
    }
  }

  Future<void> logout() async {
    try {
      if (_currentSession != null) {
        await _apiClient.post(
          '/auth/logout',
          body: {'refreshToken': _currentSession!.refreshToken},
        );
      }
    } catch (_) {
      // best-effort server-side logout
    }
    await _secureStorage.clearAuth();
    _currentSession = null;
    _sessionController.add(null);
    _logger.info('Logged out');
  }

  Future<void> _persistSession(AuthSession session) async {
    _currentSession = session;
    _sessionController.add(session);
    await _secureStorage.saveAuthTokens(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    await _secureStorage.saveUserInfo(
      userId: session.userId,
      role: session.role,
    );
  }

  void dispose() {
    _sessionController.close();
  }
}
