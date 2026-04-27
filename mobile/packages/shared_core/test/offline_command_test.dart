import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/offline_queue/offline_command.dart';

void main() {
  group('OfflineCommand', () {
    test('serializes and deserializes correctly', () {
      const cmd = OfflineCommand(
        commandId: 'cmd-1',
        operationType: 'PASSENGER_CREATE_ORDER',
        payload: {'orderId': 'o-1'},
        createdAtIso: '2026-04-27T10:00:00.000Z',
        deviceId: 'dev-1',
      );

      final json = cmd.toJson();
      final restored = OfflineCommand.fromJson(json);

      expect(restored.commandId, 'cmd-1');
      expect(restored.operationType, 'PASSENGER_CREATE_ORDER');
      expect(restored.payload['orderId'], 'o-1');
      expect(restored.deviceId, 'dev-1');
      expect(restored.retryCount, 0);
    });

    test('withRetry increments retry count', () {
      const cmd = OfflineCommand(
        commandId: 'cmd-1',
        operationType: 'ORDER',
        payload: {},
        createdAtIso: '2026-04-27T10:00:00.000Z',
      );

      final retried = cmd.withRetry();
      expect(retried.retryCount, 1);
      expect(retried.commandId, cmd.commandId);

      final retriedAgain = retried.withRetry();
      expect(retriedAgain.retryCount, 2);
    });
  });
}
