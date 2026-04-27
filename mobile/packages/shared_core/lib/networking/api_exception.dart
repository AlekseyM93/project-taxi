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
          final message = data is Map ? (data['message'] ?? 'Unauthorized') : 'Unauthorized';
          return AuthException(
            message: message.toString(),
            originalError: error,
            stackTrace: stackTrace,
            isSessionExpired: true,
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
