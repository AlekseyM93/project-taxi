import 'dart:async';

import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../config/app_config.dart';
import '../logging/safe_logger.dart';
import '../storage/secure_storage.dart';
import 'api_exception.dart';

typedef TokenRefresher = Future<String?> Function(String refreshToken);

class ApiClient {
  ApiClient({
    required AppConfig config,
    required SecureStorage secureStorage,
    required SafeLogger logger,
    TokenRefresher? tokenRefresher,
    Dio? dio,
  })  : _secureStorage = secureStorage,
        _logger = logger,
        _tokenRefresher = tokenRefresher,
        _exceptionMapper = const ApiExceptionMapper(),
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: config.apiBaseUrl,
                connectTimeout: const Duration(seconds: 10),
                receiveTimeout: const Duration(seconds: 15),
                sendTimeout: const Duration(seconds: 10),
                headers: const {'content-type': 'application/json'},
              ),
            ) {
    _dio.interceptors.add(_buildAuthInterceptor());
    _dio.interceptors.add(_buildTraceInterceptor());
    _dio.interceptors.add(_buildRetryInterceptor());
  }

  final Dio _dio;
  final SecureStorage _secureStorage;
  final SafeLogger _logger;
  final TokenRefresher? _tokenRefresher;
  final ApiExceptionMapper _exceptionMapper;
  static const _uuid = Uuid();

  bool _isRefreshing = false;
  final List<_QueuedRequest> _refreshQueue = [];

  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    bool requireAuth = true,
  }) async {
    try {
      return await _dio.get(
        path,
        queryParameters: queryParameters,
        options: Options(extra: {'requireAuth': requireAuth}),
      );
    } catch (e, st) {
      throw _exceptionMapper.map(e, st);
    }
  }

  Future<Response<dynamic>> post(
    String path, {
    Object? body,
    bool requireAuth = true,
  }) async {
    try {
      return await _dio.post(
        path,
        data: body,
        options: Options(extra: {'requireAuth': requireAuth}),
      );
    } catch (e, st) {
      throw _exceptionMapper.map(e, st);
    }
  }

  Future<Response<dynamic>> patch(
    String path, {
    Object? body,
    bool requireAuth = true,
  }) async {
    try {
      return await _dio.patch(
        path,
        data: body,
        options: Options(extra: {'requireAuth': requireAuth}),
      );
    } catch (e, st) {
      throw _exceptionMapper.map(e, st);
    }
  }

  Interceptor _buildAuthInterceptor() {
    return InterceptorsWrapper(
      onRequest: (options, handler) async {
        final requireAuth = options.extra['requireAuth'] ?? true;
        if (requireAuth) {
          final token = await _secureStorage.accessToken;
          if (token != null && token.isNotEmpty) {
            options.headers['authorization'] = 'Bearer $token';
          }
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401 && _tokenRefresher != null) {
          final result = await _handleTokenRefresh(error);
          if (result != null) {
            return handler.resolve(result);
          }
        }
        handler.next(error);
      },
    );
  }

  Interceptor _buildTraceInterceptor() {
    return InterceptorsWrapper(
      onRequest: (options, handler) {
        options.headers['x-trace-id'] = _uuid.v4();
        handler.next(options);
      },
    );
  }

  Interceptor _buildRetryInterceptor() {
    return InterceptorsWrapper(
      onError: (error, handler) async {
        final statusCode = error.response?.statusCode;
        final isRetryable = statusCode == null || statusCode >= 500 || statusCode == 408;
        if (isRetryable && (error.requestOptions.extra['_retryCount'] ?? 0) < 2) {
          final retryCount = (error.requestOptions.extra['_retryCount'] ?? 0) as int;
          error.requestOptions.extra['_retryCount'] = retryCount + 1;
          final delay = Duration(milliseconds: 500 * (retryCount + 1));
          await Future<void>.delayed(delay);
          _logger.debug('Retrying request (attempt ${retryCount + 1}): ${error.requestOptions.path}');
          try {
            final response = await _dio.fetch(error.requestOptions);
            return handler.resolve(response);
          } catch (_) {}
        }
        handler.next(error);
      },
    );
  }

  Future<Response<dynamic>?> _handleTokenRefresh(DioException error) async {
    if (_isRefreshing) {
      final completer = _QueuedRequest();
      _refreshQueue.add(completer);
      final newToken = await completer.future;
      if (newToken != null) {
        error.requestOptions.headers['authorization'] = 'Bearer $newToken';
        return _dio.fetch(error.requestOptions);
      }
      return null;
    }

    _isRefreshing = true;
    try {
      final refreshToken = await _secureStorage.refreshToken;
      if (refreshToken == null) return null;

      final newAccessToken = await _tokenRefresher!(refreshToken);
      if (newAccessToken == null) return null;

      for (final queued in _refreshQueue) {
        queued.complete(newAccessToken);
      }
      _refreshQueue.clear();

      error.requestOptions.headers['authorization'] = 'Bearer $newAccessToken';
      return _dio.fetch(error.requestOptions);
    } catch (e) {
      for (final queued in _refreshQueue) {
        queued.complete(null);
      }
      _refreshQueue.clear();
      return null;
    } finally {
      _isRefreshing = false;
    }
  }
}

class _QueuedRequest {
  final _completer = Completer<String?>();

  Future<String?> get future => _completer.future;

  void complete(String? token) {
    if (!_completer.isCompleted) {
      _completer.complete(token);
    }
  }
}
