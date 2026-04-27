import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/offline_queue/offline_command.dart';

void main() {
  group('OfflineCommand', () {
    test('serializes and reads fields correctly', () {
      const cmd = OfflineCommand(
        commandId: 'cmd-1',
        operationType: 'ORDER_CREATE',
        payload: <String, dynamic>{'orderId': 'o-1'},
        createdAtIso: '2026-04-20T10:00:00.000Z',
      );

      final json = cmd.toJson();
      final restored = OfflineCommand.fromJson(json);

      expect(restored.commandId, 'cmd-1');
      expect(restored.operationType, 'ORDER_CREATE');
      expect(restored.payload['orderId'], 'o-1');
    });

    test('withRetry increments retry count', () {
      const cmd = OfflineCommand(
        commandId: 'cmd-1',
        operationType: 'ORDER_CONFIRM',
        payload: <String, dynamic>{},
        createdAtIso: '2026-04-20T10:01:00.000Z',
      );

      final retried = cmd.withRetry();
      expect(retried.retryCount, 1);
      expect(retried.commandId, cmd.commandId);
    });
  });
}
