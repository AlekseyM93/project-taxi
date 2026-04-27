abstract class AppException implements Exception {
  const AppException({
    required this.message,
    this.originalError,
    this.stackTrace,
  });

  final String message;
  final Object? originalError;
  final StackTrace? stackTrace;

  bool get isRetryable;

  String get userFriendlyMessage;

  @override
  String toString() => '$runtimeType: $message';
}

class NetworkException extends AppException {
  const NetworkException({
    required super.message,
    super.originalError,
    super.stackTrace,
    this.statusCode,
  });

  final int? statusCode;

  @override
  bool get isRetryable =>
      statusCode == null || statusCode! >= 500 || statusCode == 408;

  @override
  String get userFriendlyMessage {
    if (statusCode == null) {
      return 'Нет подключения к серверу. Проверьте интернет.';
    }
    if (statusCode! >= 500) {
      return 'Ошибка сервера. Попробуйте позже.';
    }
    if (statusCode == 408) {
      return 'Сервер не ответил вовремя. Повторите попытку.';
    }
    return 'Ошибка сети: $message';
  }
}

class AuthException extends AppException {
  const AuthException({
    required super.message,
    super.originalError,
    super.stackTrace,
    this.isSessionExpired = false,
  });

  final bool isSessionExpired;

  @override
  bool get isRetryable => false;

  @override
  String get userFriendlyMessage {
    if (isSessionExpired) {
      return 'Сессия истекла. Войдите заново.';
    }
    return 'Ошибка авторизации: $message';
  }
}

class ValidationException extends AppException {
  const ValidationException({
    required super.message,
    this.fieldErrors = const {},
  });

  final Map<String, String> fieldErrors;

  @override
  bool get isRetryable => false;

  @override
  String get userFriendlyMessage => message;
}

class LocationException extends AppException {
  const LocationException({
    required super.message,
    super.originalError,
    this.isPermissionDenied = false,
    this.isServiceDisabled = false,
  });

  final bool isPermissionDenied;
  final bool isServiceDisabled;

  @override
  bool get isRetryable => !isPermissionDenied;

  @override
  String get userFriendlyMessage {
    if (isPermissionDenied) {
      return 'Доступ к геолокации запрещён. Разрешите в настройках.';
    }
    if (isServiceDisabled) {
      return 'Геолокация отключена. Включите GPS.';
    }
    return 'Ошибка определения местоположения.';
  }
}

class MapException extends AppException {
  const MapException({
    required super.message,
    super.originalError,
  });

  @override
  bool get isRetryable => true;

  @override
  String get userFriendlyMessage => 'Ошибка карты: $message';
}
