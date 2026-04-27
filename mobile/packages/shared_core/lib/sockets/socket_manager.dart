import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../logging/safe_logger.dart';

enum SocketConnectionState { disconnected, connecting, connected }

class SocketManager {
  SocketManager({
    required String baseUrl,
    required String namespace,
    required SafeLogger logger,
  })  : _baseUrl = baseUrl,
        _namespace = namespace,
        _logger = logger;

  final String _baseUrl;
  final String _namespace;
  final SafeLogger _logger;

  io.Socket? _socket;
  SocketConnectionState _state = SocketConnectionState.disconnected;
  int _reconnectAttempts = 0;
  Timer? _heartbeatTimer;
  int _lastSequence = 0;
  final _stateController = StreamController<SocketConnectionState>.broadcast();

  SocketConnectionState get state => _state;
  Stream<SocketConnectionState> get stateStream => _stateController.stream;
  bool get isConnected => _state == SocketConnectionState.connected;

  void connect({
    required String accessToken,
    String? deviceId,
    void Function()? onConnect,
    void Function()? onDisconnect,
  }) {
    dispose();
    _reconnectAttempts = 0;

    _updateState(SocketConnectionState.connecting);

    _socket = io.io(
      '$_baseUrl$_namespace',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({
            'token': accessToken,
            if (deviceId != null) 'deviceId': deviceId,
          })
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(30000)
          .setReconnectionAttempts(double.infinity.toInt())
          .build(),
    );

    _socket!.onConnect((_) {
      _reconnectAttempts = 0;
      _updateState(SocketConnectionState.connected);
      _startHeartbeat();
      _logger.info('Socket connected', {'namespace': _namespace});
      onConnect?.call();
    });

    _socket!.onDisconnect((_) {
      _updateState(SocketConnectionState.disconnected);
      _stopHeartbeat();
      _logger.info('Socket disconnected', {'namespace': _namespace});
      onDisconnect?.call();
    });

    _socket!.onReconnect((_) {
      _reconnectAttempts++;
      _logger.debug('Socket reconnecting', {
        'namespace': _namespace,
        'attempt': _reconnectAttempts,
      });
    });

    _socket!.onReconnect((_) {
      _updateState(SocketConnectionState.connected);
      _startHeartbeat();
      _logger.info('Socket reconnected', {'namespace': _namespace});
      onConnect?.call();
    });

    _socket!.onError((error) {
      _logger.error('Socket error on $_namespace', error);
    });

    _socket!.connect();
  }

  void on(String event, void Function(dynamic data) handler) {
    _socket?.on(event, handler);
  }

  void off(String event) {
    _socket?.off(event);
  }

  void emit(String event, [dynamic data]) {
    _socket?.emit(event, data);
  }

  void emitWithAck(
    String event,
    dynamic data,
    void Function(dynamic ack) onAck,
  ) {
    _socket?.emitWithAck(event, data, ack: onAck);
  }

  bool isDuplicateEvent(int sequence) {
    if (sequence <= _lastSequence) return true;
    _lastSequence = sequence;
    return false;
  }

  void resetSequence() {
    _lastSequence = 0;
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) {
        if (isConnected) {
          _socket?.emit('ping');
        }
      },
    );
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void _updateState(SocketConnectionState newState) {
    _state = newState;
    _stateController.add(newState);
  }

  void dispose() {
    _stopHeartbeat();
    _socket?.dispose();
    _socket = null;
    _updateState(SocketConnectionState.disconnected);
  }

  void close() {
    dispose();
    _stateController.close();
  }
}
