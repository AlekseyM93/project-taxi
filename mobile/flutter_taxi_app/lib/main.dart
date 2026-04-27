import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/app_config.dart';
import 'core/api_client.dart';
import 'features/auth/auth_repository.dart';
import 'features/orders/offline_command_queue.dart';
import 'features/orders/sync_engine.dart';
import 'features/realtime/realtime_client.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();

  final config = AppConfig.fromEnvironment();
  final apiClient = ApiClient(config: config);
  final authRepository = AuthRepository(apiClient: apiClient, prefs: prefs);
  final queue = OfflineCommandQueue(prefs: prefs);
  final syncEngine = SyncEngine(
    apiClient: apiClient,
    authRepository: authRepository,
    queue: queue,
    deviceId: config.deviceId,
  );
  final realtimeClient = RealtimeClient(
    baseUrl: config.wsBaseUrl,
    deviceId: config.deviceId,
  );

  runApp(
    TaxiPlatformMobileApp(
      syncEngine: syncEngine,
      authRepository: authRepository,
      realtimeClient: realtimeClient,
    ),
  );
}

class TaxiPlatformMobileApp extends StatelessWidget {
  const TaxiPlatformMobileApp({
    super.key,
    required this.syncEngine,
    required this.authRepository,
    required this.realtimeClient,
  });

  final SyncEngine syncEngine;
  final AuthRepository authRepository;
  final RealtimeClient realtimeClient;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Такси Платформа',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.amber),
        useMaterial3: true,
      ),
      home: HomeScreen(
        syncEngine: syncEngine,
        authRepository: authRepository,
        realtimeClient: realtimeClient,
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.syncEngine,
    required this.authRepository,
    required this.realtimeClient,
  });

  final SyncEngine syncEngine;
  final AuthRepository authRepository;
  final RealtimeClient realtimeClient;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _phoneController = TextEditingController(text: '+79990000001');
  final _passwordController = TextEditingController(text: 'devpass123');
  final _orderIdController = TextEditingController();
  AuthSession? _session;
  bool _authLoading = false;
  String _status = 'Ожидание';
  String _lastRealtimePayload = '-';

  String _roleLabel(String? role) {
    switch (role) {
      case 'PASSENGER':
        return 'Пассажир';
      case 'DRIVER':
        return 'Водитель';
      case 'DISPATCHER':
        return 'Диспетчер';
      case 'ADMIN':
        return 'Администратор';
      case null:
        return '-';
      default:
        return role;
    }
  }

  String _errorMessage(Object error, {required String fallback}) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionError:
          return 'Нет соединения с сервером. Проверьте, что backend запущен и адрес API указан правильно.';
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.sendTimeout:
          return 'Сервер не ответил вовремя. Повторите попытку.';
        case DioExceptionType.badResponse:
          final statusCode = error.response?.statusCode;
          if (statusCode == 401) {
            return 'Неверный телефон или пароль.';
          }
          if (statusCode == 403) {
            return 'Доступ запрещен для этой операции.';
          }
          if (statusCode == 404) {
            return 'Запрошенный ресурс не найден.';
          }
          if (statusCode != null && statusCode >= 500) {
            return 'Ошибка сервера. Попробуйте позже.';
          }
          return fallback;
        case DioExceptionType.cancel:
          return 'Запрос отменен.';
        case DioExceptionType.badCertificate:
          return 'Ошибка сертификата при подключении к серверу.';
        case DioExceptionType.unknown:
          return 'Неизвестная ошибка сети. Проверьте подключение.';
      }
    }
    return fallback;
  }

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  @override
  void dispose() {
    widget.realtimeClient.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _orderIdController.dispose();
    super.dispose();
  }

  Future<void> _restoreSession() async {
    final session = await widget.authRepository.loadSession();
    if (!mounted) {
      return;
    }
    if (session != null) {
      setState(() {
        _session = session;
        _status = 'Сессия восстановлена для роли: ${_roleLabel(session.role)}';
      });
    }
  }

  Future<void> _login() async {
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;
    if (phone.isEmpty || password.isEmpty) {
      setState(() {
        _status = 'Введите телефон и пароль';
      });
      return;
    }

    setState(() {
      _authLoading = true;
      _status = 'Выполняется вход...';
    });
    try {
      final session = await widget.authRepository.login(
        phone: phone,
        password: password,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _session = session;
        _status = 'Вход выполнен: ${_roleLabel(session.role)}';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _status = _errorMessage(
          error,
          fallback: 'Ошибка входа. Проверьте подключение к серверу.',
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _authLoading = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    await widget.authRepository.logout();
    widget.realtimeClient.dispose();
    if (!mounted) {
      return;
    }
    setState(() {
      _session = null;
      _lastRealtimePayload = '-';
      _status = 'Вы вышли из аккаунта';
    });
  }

  Future<void> _runFullSync() async {
    if (_session == null) {
      setState(() {
        _status = 'Нет активной сессии. Сначала войдите.';
      });
      return;
    }
    try {
      final result = await widget.syncEngine.runFullSyncCycle();
      if (!mounted) {
        return;
      }
      setState(() {
        _status = result == null
            ? 'Нет активной сессии'
            : 'Синхронизация завершена (${result.keys.length} ключей)';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _status = _errorMessage(
          error,
          fallback: 'Ошибка синхронизации. Повторите попытку.',
        );
      });
    }
  }

  Future<void> _connectPassengerRealtime() async {
    final session = _session ?? await widget.authRepository.loadSession();
    if (session == null) {
      setState(() {
        _status = 'Нет сессии. Сначала войдите.';
      });
      return;
    }

    widget.realtimeClient.connectPassenger(accessToken: session.accessToken);
    setState(() {
      _status = 'Realtime пассажира подключен';
    });
  }

  void _subscribeOrder() {
    final orderId = _orderIdController.text.trim();
    if (orderId.isEmpty) {
      setState(() {
        _status = 'Укажите ID заказа';
      });
      return;
    }

    widget.realtimeClient.subscribeOrder(orderId, (payload) {
      if (!mounted) {
        return;
      }
      setState(() {
        _lastRealtimePayload = payload.toString();
      });
    });
    setState(() {
      _status = 'Подписка на заказ $orderId выполнена';
    });
  }

  @override
  Widget build(BuildContext context) {
    final previewLen = _session == null
        ? 0
        : (_session!.accessToken.length < 12 ? _session!.accessToken.length : 12);
    final shortToken = _session == null
        ? '-'
        : '${_session!.accessToken.substring(0, previewLen)}...';
    return Scaffold(
      appBar: AppBar(title: const Text('Такси Платформа Мобильная')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Рабочий контур: синхронизация push/pull и отслеживание заказа в realtime',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Телефон'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Пароль'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                FilledButton(
                  onPressed: _authLoading ? null : _login,
                  child: Text(_authLoading ? 'Вход...' : 'Войти'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _session == null ? null : _logout,
                  child: const Text('Выйти'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('Роль в сессии: ${_roleLabel(_session?.role)}'),
            Text('ID пользователя: ${_session?.userId ?? '-'}'),
            Text('Токен сессии: $shortToken'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _session == null ? null : _runFullSync,
              child: const Text('Запустить полный цикл синхронизации'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _session == null ? null : _connectPassengerRealtime,
              child: const Text('Подключить realtime пассажира'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _orderIdController,
              decoration: const InputDecoration(
                labelText: 'ID заказа для подписки',
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _subscribeOrder,
              child: const Text('Подписаться на поток заказа'),
            ),
            const SizedBox(height: 12),
            Text('Статус: $_status'),
            const SizedBox(height: 8),
            Text('Последний realtime payload: $_lastRealtimePayload'),
          ],
        ),
      ),
    );
  }
}
