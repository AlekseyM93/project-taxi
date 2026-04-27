import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:taxi_platform_mobile/features/orders/offline_command_queue.dart';

void main() {
  group('OfflineCommandQueue', () {
    setUp(() {
      SharedPreferences.setMockInitialValues(<String, Object>{});
    });

    test('enqueues and reads commands in order', () async {
      final prefs = await SharedPreferences.getInstance();
      final queue = OfflineCommandQueue(prefs: prefs);

      const first = OfflineCommand(
        commandId: 'cmd-1',
        operationType: 'ORDER_CREATE',
        payload: <String, dynamic>{'orderId': 'o-1'},
        createdAtIso: '2026-04-20T10:00:00.000Z',
      );
      const second = OfflineCommand(
        commandId: 'cmd-2',
        operationType: 'ORDER_CONFIRM',
        payload: <String, dynamic>{'orderId': 'o-1'},
        createdAtIso: '2026-04-20T10:01:00.000Z',
      );

      await queue.enqueue(first);
      await queue.enqueue(second);

      final items = await queue.readAll();
      expect(items.map((item) => item.commandId).toList(), <String>['cmd-1', 'cmd-2']);
      expect(items.first.payload['orderId'], 'o-1');
    });

    test('removes commands by id only', () async {
      final prefs = await SharedPreferences.getInstance();
      final queue = OfflineCommandQueue(prefs: prefs);

      const first = OfflineCommand(
        commandId: 'cmd-1',
        operationType: 'ORDER_CREATE',
        payload: <String, dynamic>{},
        createdAtIso: '2026-04-20T10:00:00.000Z',
      );
      const second = OfflineCommand(
        commandId: 'cmd-2',
        operationType: 'ORDER_CONFIRM',
        payload: <String, dynamic>{},
        createdAtIso: '2026-04-20T10:01:00.000Z',
      );

      await queue.enqueue(first);
      await queue.enqueue(second);
      await queue.removeByIds(<String>['cmd-1']);

      final items = await queue.readAll();
      expect(items.length, 1);
      expect(items.single.commandId, 'cmd-2');
    });
  });
}
