import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class OfflineCommand {
  const OfflineCommand({
    required this.commandId,
    required this.operationType,
    required this.payload,
    required this.createdAtIso,
  });

  final String commandId;
  final String operationType;
  final Map<String, dynamic> payload;
  final String createdAtIso;

  Map<String, dynamic> toJson() => {
        'commandId': commandId,
        'operationType': operationType,
        'payload': payload,
        'createdAtIso': createdAtIso,
      };

  static OfflineCommand fromJson(Map<String, dynamic> json) {
    return OfflineCommand(
      commandId: json['commandId'] as String,
      operationType: json['operationType'] as String,
      payload: (json['payload'] as Map).cast<String, dynamic>(),
      createdAtIso: json['createdAtIso'] as String,
    );
  }
}

class OfflineCommandQueue {
  OfflineCommandQueue({required SharedPreferences prefs}) : _prefs = prefs;

  final SharedPreferences _prefs;
  static const _queueKey = 'sync.pendingCommands';

  Future<List<OfflineCommand>> readAll() async {
    final raw = _prefs.getString(_queueKey);
    if (raw == null || raw.isEmpty) {
      return [];
    }
    final parsed = jsonDecode(raw) as List<dynamic>;
    return parsed
        .map((item) => OfflineCommand.fromJson((item as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<void> enqueue(OfflineCommand command) async {
    final current = await readAll();
    final next = [...current, command];
    await _save(next);
  }

  Future<void> removeByIds(List<String> commandIds) async {
    final current = await readAll();
    final filtered = current.where((item) => !commandIds.contains(item.commandId)).toList();
    await _save(filtered);
  }

  Future<void> _save(List<OfflineCommand> items) async {
    await _prefs.setString(
      _queueKey,
      jsonEncode(items.map((item) => item.toJson()).toList()),
    );
  }
}
