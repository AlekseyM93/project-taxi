import 'dart:developer' as developer;

import '../config/app_environment.dart';

class SafeLogger {
  SafeLogger({required this.environment, required this.tag});

  final AppEnvironment environment;
  final String tag;

  static const _sensitiveKeys = {
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'authorization',
  };

  void debug(String message, [Map<String, dynamic>? context]) {
    if (environment.isProd) return;
    _log('DEBUG', message, context);
  }

  void info(String message, [Map<String, dynamic>? context]) {
    _log('INFO', message, context);
  }

  void warn(String message, [Map<String, dynamic>? context]) {
    _log('WARN', message, context);
  }

  void error(String message, [Object? error, StackTrace? stackTrace]) {
    developer.log(
      '[$tag] ERROR: $message',
      name: tag,
      error: error,
      stackTrace: stackTrace,
      level: 1000,
    );
  }

  void _log(String level, String message, Map<String, dynamic>? context) {
    final sanitized = context != null ? _sanitize(context).toString() : '';
    developer.log(
      '[$tag] $level: $message${sanitized.isNotEmpty ? ' $sanitized' : ''}',
      name: tag,
    );
  }

  Map<String, dynamic> _sanitize(Map<String, dynamic> data) {
    return data.map((key, value) {
      if (_sensitiveKeys.contains(key.toLowerCase())) {
        return MapEntry(key, '***');
      }
      if (value is Map<String, dynamic>) {
        return MapEntry(key, _sanitize(value));
      }
      return MapEntry(key, value);
    });
  }
}
