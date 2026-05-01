import 'package:dio/dio.dart';

import '../errors/app_exception.dart';

class ApiExceptionMapper {
  const ApiExceptionMapper();

  AppException map(Object error, [StackTrace? stackTrace]) {
    if (error is DioException) {
      return _mapDio(error, stackTrace);
    }
    return NetworkException(
      message: error.toString(),
      originalError: error,
      stackTrace: stackTrace,
    );
  }

  AppException _mapDio(DioException error, StackTrace? stackTrace) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return NetworkException(
          message: 'Connection failed: ${error.message}',
          originalError: error,
          stackTrace: stackTrace,
        );
      case DioExceptionType.badResponse:
        final statusCode = error.response?.statusCode;
        if (statusCode == 401) {
          final data = error.response?.data;
          final path = error.requestOptions.uri.path;

          /// Nest [ApiExceptionFilter]: `{ ok:false, error: { reason, code, … } }`
          final apiReason =
              data is Map && data['error'] is Map
                  ? ((data['error'] as Map)['reason'] ?? (data['error'] as Map)['code'])
                      ?.toString()
                      .toUpperCase()
                  : null;
          final nestedMessage =
              data is Map && data['message'] != null ? data['message'].toString() : null;

          final isAuthEntry =
              path.endsWith('/auth/login') ||
              path.endsWith('/auth/register') ||
              path.contains('/auth/login/recovery');
          final isInvalidCredentials = apiReason == 'INVALID_CREDENTIALS';

          /// Протухший refresh / истёкший access после обновления — «сессия истекла»;
          /// 401 при входе (в т.ч. неверный пароль) — нет.
          final sessionExpired = !isAuthEntry && !isInvalidCredentials;

          final message = nestedMessage ?? apiReason ?? 'Unauthorized';

          return AuthException(
            message: message,
            originalError: error,
            stackTrace: stackTrace,
            isSessionExpired: sessionExpired,
            userFacingOverride: isInvalidCredentials ? 'Неверный телефон или пароль' : null,
          );
        }
        if (statusCode == 403) {
          return AuthException(
            message: 'Access denied',
            originalError: error,
            stackTrace: stackTrace,
          );
        }
        return NetworkException(
          message: 'HTTP $statusCode',
          originalError: error,
          stackTrace: stackTrace,
          statusCode: statusCode,
        );
      case DioExceptionType.cancel:
        return NetworkException(
          message: 'Request cancelled',
          originalError: error,
          stackTrace: stackTrace,
        );
      case DioExceptionType.badCertificate:
        return NetworkException(
          message: 'Certificate error',
          originalError: error,
          stackTrace: stackTrace,
        );
      case DioExceptionType.unknown:
        return NetworkException(
          message: error.message ?? 'Unknown network error',
          originalError: error,
          stackTrace: stackTrace,
        );
    }
  }
}
