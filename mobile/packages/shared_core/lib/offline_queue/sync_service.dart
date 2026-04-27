import 'dart:async';

import '../auth/auth_repository.dart';
import '../logging/safe_logger.dart';
import '../networking/api_client.dart';
import 'offline_command_queue.dart';

class SyncResult {
  const SyncResult({
    required this.pushedCount,
    required this.acceptedCount,
    required this.pulledItems,
    this.hasMore = false,
  });
  final int pushedCount;
  final int acceptedCount;
  final List<Map<String, dynamic>> pulledItems;
  final bool hasMore;
}

class SyncService {
  SyncService({
    required ApiClient apiClient,
    required AuthRepository authRepository,
    required OfflineCommandQueue queue,
    required SafeLogger logger,
    required String deviceId,
  })  : _apiClient = apiClient,
        _authRepository = authRepository,
        _queue = queue,
        _logger = logger,
        _deviceId = deviceId;

  final ApiClient _apiClient;
  final AuthRepository _authRepository;
  final OfflineCommandQueue _queue;
  final SafeLogger _logger;
  final String _deviceId;

  Timer? _autoSyncTimer;

  Future<SyncResult> runFullSync() async {
    final session = _authRepository.currentSession;
    if (session == null) {
      _logger.warn('Sync skipped: no active session');
      return const SyncResult(pushedCount: 0, acceptedCount: 0, pulledItems: []);
    }

    final pushResult = await _flushPendingCommands();
    final pullResult = await _pullChanges();

    _logger.info('Full sync completed', {
      'pushed': pushResult.pushedCount,
      'accepted': pushResult.acceptedCount,
      'pulled': pullResult.length,
    });

    return SyncResult(
      pushedCount: pushResult.pushedCount,
      acceptedCount: pushResult.acceptedCount,
      pulledItems: pullResult,
    );
  }

  Future<({int pushedCount, int acceptedCount})> _flushPendingCommands() async {
    final pending = await _queue.readAll();
    if (pending.isEmpty) return (pushedCount: 0, acceptedCount: 0);

    try {
      final response = await _apiClient.post(
        '/orders/sync/push',
        body: {
          'operations': pending.map((cmd) => {
            'commandId': cmd.commandId,
            'deviceId': cmd.deviceId ?? _deviceId,
            'operationType': cmd.operationType,
            'clientTs': cmd.createdAtIso,
            'payload': cmd.payload,
          }).toList(),
        },
      );

      final body = response.data as Map<String, dynamic>;
      final results = body['results'] as List<dynamic>? ?? [];
      final acceptedIds = results
          .where((r) => (r as Map<String, dynamic>)['status'] == 'APPLIED')
          .map((r) => (r as Map<String, dynamic>)['commandId'] as String)
          .toList();

      if (acceptedIds.isNotEmpty) {
        await _queue.removeByIds(acceptedIds);
      }

      final failedIds = results
          .where((r) => (r as Map<String, dynamic>)['status'] != 'APPLIED')
          .map((r) => (r as Map<String, dynamic>)['commandId'] as String)
          .toList();
      for (final id in failedIds) {
        await _queue.markRetry(id);
      }

      return (pushedCount: pending.length, acceptedCount: acceptedIds.length);
    } catch (e) {
      _logger.error('Push sync failed', e);
      return (pushedCount: pending.length, acceptedCount: 0);
    }
  }

  Future<List<Map<String, dynamic>>> _pullChanges() async {
    try {
      final response = await _apiClient.get(
        '/orders/sync/pull',
        queryParameters: {'limit': 100},
      );
      final body = response.data as Map<String, dynamic>;
      final items = body['items'] as List<dynamic>? ?? [];
      return items.map((item) => Map<String, dynamic>.from(item as Map)).toList();
    } catch (e) {
      _logger.error('Pull sync failed', e);
      return [];
    }
  }

  void startAutoSync({Duration interval = const Duration(seconds: 30)}) {
    stopAutoSync();
    _autoSyncTimer = Timer.periodic(interval, (_) async {
      final pendingCount = await _queue.pendingCount;
      if (pendingCount > 0) {
        await runFullSync();
      }
    });
    _logger.info('Auto-sync started');
  }

  void stopAutoSync() {
    _autoSyncTimer?.cancel();
    _autoSyncTimer = null;
  }

  void dispose() {
    stopAutoSync();
  }
}
