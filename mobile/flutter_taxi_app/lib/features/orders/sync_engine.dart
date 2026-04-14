import '../../core/api_client.dart';
import '../auth/auth_repository.dart';
import 'offline_command_queue.dart';

class SyncEngine {
  SyncEngine({
    required ApiClient apiClient,
    required AuthRepository authRepository,
    required OfflineCommandQueue queue,
  })  : _apiClient = apiClient,
        _authRepository = authRepository,
        _queue = queue;

  final ApiClient _apiClient;
  final AuthRepository _authRepository;
  final OfflineCommandQueue _queue;

  Future<void> flushPendingCommands() async {
    final session = await _authRepository.loadSession();
    if (session == null) {
      return;
    }

    final pending = await _queue.readAll();
    if (pending.isEmpty) {
      return;
    }

    final response = await _apiClient.post(
      '/orders/sync/push',
      bearerToken: session.accessToken,
      body: {
        'operations': pending
            .map(
              (item) => {
                'commandId': item.commandId,
                'deviceId': 'flutter-mobile',
                'operationType': item.operationType,
                'clientTs': item.createdAtIso,
                'payload': item.payload,
              },
            )
            .toList(),
      },
    );

    final body = response.data as Map<String, dynamic>;
    final results = (body['results'] as List<dynamic>? ?? const []);
    final acceptedCommandIds = results
        .where((item) => (item as Map<String, dynamic>)['status'] == 'APPLIED')
        .map((item) => (item as Map<String, dynamic>)['commandId'] as String)
        .toList();

    if (acceptedCommandIds.isNotEmpty) {
      await _queue.removeByIds(acceptedCommandIds);
    }
  }
}
