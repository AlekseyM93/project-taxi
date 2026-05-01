import 'dart:async';

import 'package:driver_features/driver_features.dart';
import 'package:flutter/material.dart';
import 'package:passenger_features/passenger_features.dart';
import 'package:shared_core/shared_core.dart';

import 'screens/login_screen.dart';
import 'taxi_client_kind.dart';

class TaxiPlatformApp extends StatelessWidget {
  const TaxiPlatformApp({
    super.key,
    required this.config,
    required this.authRepository,
    required this.passengerOrderRepository,
    required this.shiftRepository,
    required this.locationService,
    required this.offlineQueue,
    required this.syncService,
    required this.logger,
    this.dgisSession,
    this.clientKind = TaxiClientKind.universal,
    this.materialAppTitle = 'Такси платформа',
  });

  final AppConfig config;
  final AuthRepository authRepository;
  final PassengerOrderRepositoryImpl passengerOrderRepository;
  final ShiftRepositoryImpl shiftRepository;
  final LocationService locationService;
  final OfflineCommandQueue offlineQueue;
  final SyncService syncService;
  final SafeLogger logger;
  final DgisSession? dgisSession;
  final TaxiClientKind clientKind;
  final String materialAppTitle;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: materialAppTitle,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.amber),
        useMaterial3: true,
      ),
      home: AppRoot(
        config: config,
        authRepository: authRepository,
        passengerOrderRepository: passengerOrderRepository,
        shiftRepository: shiftRepository,
        locationService: locationService,
        offlineQueue: offlineQueue,
        syncService: syncService,
        logger: logger,
        dgisSession: dgisSession,
        clientKind: clientKind,
        materialAppTitle: materialAppTitle,
      ),
    );
  }
}

class AppRoot extends StatefulWidget {
  const AppRoot({
    super.key,
    required this.config,
    required this.authRepository,
    required this.passengerOrderRepository,
    required this.shiftRepository,
    required this.locationService,
    required this.offlineQueue,
    required this.syncService,
    required this.logger,
    this.dgisSession,
    this.clientKind = TaxiClientKind.universal,
    this.materialAppTitle = 'Такси платформа',
  });

  final AppConfig config;
  final AuthRepository authRepository;
  final PassengerOrderRepositoryImpl passengerOrderRepository;
  final ShiftRepositoryImpl shiftRepository;
  final LocationService locationService;
  final OfflineCommandQueue offlineQueue;
  final SyncService syncService;
  final SafeLogger logger;
  final DgisSession? dgisSession;
  final TaxiClientKind clientKind;
  final String materialAppTitle;

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> with WidgetsBindingObserver {
  AuthSession? _session;
  bool _isRestoring = true;
  String? _loginBannerError;

  StreamSubscription<AuthSession?>? _sessionSub;

  PassengerRealtimeService? _passengerRealtime;
  DriverRealtimeService? _driverRealtime;

  /// Не пересоздаём сокет при refresh токена (тот же userId+role).
  String? _realtimeSessionKey;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _sessionSub = widget.authRepository.sessionStream.listen((session) async {
      if (!mounted) return;
      final cleared = await _enforceClientKind(session);
      if (!mounted || cleared) return;
      setState(() => _session = session);
      _bindRealtime(session);
      if (!_isRestoring) {
        _bindSync(session);
      }
    });

    _bootstrapSession();
  }

  Future<void> _bootstrapSession() async {
    await widget.authRepository.loadSession();
    if (!mounted) return;
    final s = widget.authRepository.currentSession;
    await _enforceClientKind(s);
    if (!mounted) return;
    final after = widget.authRepository.currentSession;
    _bindSync(after);
    _bindRealtime(after);
    if (!mounted) return;
    setState(() {
      _isRestoring = false;
      _session = after;
    });
  }

  /// Возвращает `true`, если сессию сбросили как несовместимую с данным APK.
  Future<bool> _enforceClientKind(AuthSession? session) async {
    if (session == null) {
      return false;
    }
    if (widget.clientKind == TaxiClientKind.universal) {
      return false;
    }
    if (roleMatchesClientKind(session, widget.clientKind)) {
      return false;
    }
    await widget.authRepository.logout();
    if (!mounted) return true;
    final msg = widget.clientKind == TaxiClientKind.passenger
        ? 'Этот аккаунт не пассажирский. Войдите пассажиром или откройте приложение водителя.'
        : 'Этот аккаунт не водительский. Войдите водителем или откройте приложение для пассажиров.';
    setState(() {
      _session = null;
      _loginBannerError = msg;
    });
    return true;
  }

  void _bindSync(AuthSession? session) {
    if (session == null) {
      widget.syncService.stopAutoSync();
      return;
    }
    unawaited(widget.syncService.runFullSync());
    widget.syncService.startAutoSync();
  }

  void _bindRealtime(AuthSession? session) {
    if (session == null) {
      _realtimeSessionKey = null;
      _passengerRealtime?.dispose();
      _driverRealtime?.dispose();
      _passengerRealtime = null;
      _driverRealtime = null;
      return;
    }

    final sessionKey = '${session.userId}|${session.role}';
    if (sessionKey == _realtimeSessionKey &&
        ((session.isPassenger && _passengerRealtime != null) ||
            (session.isDriver && _driverRealtime != null))) {
      return;
    }
    _realtimeSessionKey = sessionKey;

    _passengerRealtime?.dispose();
    _driverRealtime?.dispose();
    _passengerRealtime = null;
    _driverRealtime = null;

    if (session.isDriver) {
      _driverRealtime = DriverRealtimeService(
        baseUrl: widget.config.wsBaseUrl,
        logger: widget.logger,
      );
      _driverRealtime!.connect(
        accessToken: session.accessToken,
        deviceId: widget.config.deviceId,
      );
    } else {
      _passengerRealtime = PassengerRealtimeService(
        baseUrl: widget.config.wsBaseUrl,
        logger: widget.logger,
      );
      _passengerRealtime!.connect(
        accessToken: session.accessToken,
        deviceId: widget.config.deviceId,
      );
      unawaited(_subscribePassengerToActiveOrder());
    }
  }

  Future<void> _subscribePassengerToActiveOrder() async {
    try {
      final active = await widget.passengerOrderRepository.getActiveOrder();
      if (!mounted || active == null || _passengerRealtime == null) return;
      _passengerRealtime!.subscribeToOrder(active.id);
    } catch (_) {}
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        widget.authRepository.currentSession != null) {
      unawaited(widget.syncService.runFullSync());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sessionSub?.cancel();
    _passengerRealtime?.dispose();
    _driverRealtime?.dispose();
    widget.syncService.dispose();
    super.dispose();
  }

  Future<void> _onLoginSuccess(AuthSession session) async {
    final cleared = await _enforceClientKind(session);
    if (!mounted || cleared) {
      return;
    }
    setState(() {
      _session = session;
      _loginBannerError = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isRestoring) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_session == null) {
      return LoginScreen(
        authRepository: widget.authRepository,
        onLoginSuccess: _onLoginSuccess,
        clientKind: widget.clientKind,
        appTitle:
            widget.clientKind == TaxiClientKind.passenger
                ? 'Такси · пассажир'
                : widget.clientKind == TaxiClientKind.driver
                    ? 'Такси · водитель'
                    : 'Такси платформа',
        initialBannerError: _loginBannerError,
        onClearInitialBanner:
            _loginBannerError == null
                ? null
                : () {
                    if (mounted) setState(() => _loginBannerError = null);
                  },
      );
    }

    if (_session!.isDriver) {
      return DriverHomeScreen(
        shiftRepository: widget.shiftRepository,
        locationService: widget.locationService,
        authRepository: widget.authRepository,
        dgisSession: widget.dgisSession,
        realtimeService: _driverRealtime,
        syncService: widget.syncService,
      );
    }

    return PassengerHomeScreen(
      orderRepository: widget.passengerOrderRepository,
      locationService: widget.locationService,
      authRepository: widget.authRepository,
      dgisSession: widget.dgisSession,
      passengerRealtime: _passengerRealtime,
      syncService: widget.syncService,
    );
  }
}
