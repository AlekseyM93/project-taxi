import 'package:dio/dio.dart';

import 'app_config.dart';

class ApiClient {
  ApiClient({required AppConfig config})
      : _dio = Dio(
          BaseOptions(
            baseUrl: config.apiBaseUrl,
            connectTimeout: const Duration(seconds: 8),
            receiveTimeout: const Duration(seconds: 12),
            headers: const {'content-type': 'application/json'},
          ),
        );

  final Dio _dio;

  Future<Response<dynamic>> get(
    String path, {
    String? bearerToken,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.get(
      path,
      queryParameters: queryParameters,
      options: Options(
        headers: bearerToken != null
            ? {'authorization': 'Bearer $bearerToken'}
            : null,
      ),
    );
  }

  Future<Response<dynamic>> post(
    String path, {
    String? bearerToken,
    Object? body,
  }) {
    return _dio.post(
      path,
      data: body,
      options: Options(
        headers: bearerToken != null
            ? {'authorization': 'Bearer $bearerToken'}
            : null,
      ),
    );
  }
}
