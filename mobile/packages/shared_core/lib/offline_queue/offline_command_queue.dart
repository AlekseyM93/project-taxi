import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../logging/safe_logger.dart';
import 'offline_command.dart';

class OfflineCommandQueue {
  OfflineCommandQueue({
    required SafeLogger logger,
    FlutterSecureStorage? storage,
  })  : _logger = logger,
        _storage = storage ?? const FlutterSecureStorage();

  final SafeLogger _logger;
  final FlutterSecureStorage _storage;
  static const _queueKey = 'sync.pendingCommands';
  static const _maxRetries = 5;

  Future<List<OfflineCommand>> readAll() async {
    final raw = await _storage.read(key: _queueKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final parsed = jsonDecode(raw) as List<dynamic>;
      return parsed
          .map((item) => OfflineCommand.fromJson((item as Map).cast<String, dynamic>()))
          .toList();
    } catch (e) {
      _logger.error('Failed to parse offline queue', e);
      return [];
    }
  }

  Future<void> enqueue(OfflineCommand command) async {
    final current = await readAll();
    final isDuplicate = current.any((c) => c.commandId == command.commandId);
    if (isDuplicate) {
      _logger.debug('Duplicate command skipped: ${command.commandId}');
      return;
    }
    final next = [...current, command];
    await _save(next);
    _logger.debug('Command enqueued: ${command.operationType}');
  }

  Future<void> removeByIds(List<String> commandIds) async {
    final current = await readAll();
    final filtered = current.where((c) => !commandIds.contains(c.commandId)).toList();
    await _save(filtered);
  }

  Future<void> markRetry(String commandId) async {
    final current = await readAll();
    final updated = current.map((c) {
      if (c.commandId == commandId && c.retryCount < _maxRetries) {
        return c.withRetry();
      }
      return c;
    }).toList();

    final deadLetters = updated.where((c) => c.retryCount >= _maxRetries).toList();
    if (deadLetters.isNotEmpty) {
      for (final dl in deadLetters) {
        _logger.warn('Command exceeded max retries, removing: ${dl.commandId}');
      }
    }

    final alive = updated.where((c) => c.retryCount < _maxRetries).toList();
    await _save(alive);
  }

  Future<void> clear() async {
    await _storage.delete(key: _queueKey);
  }

  Future<int> get pendingCount async {
    final items = await readAll();
    return items.length;
  }

  Future<void> _save(List<OfflineCommand> items) async {
    await _storage.write(
      key: _queueKey,
      value: jsonEncode(items.map((item) => item.toJson()).toList()),
    );
  }
}
