import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/app_config.dart';
import 'core/api_client.dart';
import 'features/auth/auth_repository.dart';
import 'features/orders/offline_command_queue.dart';
import 'features/orders/sync_engine.dart';

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
  );

  runApp(TaxiPlatformMobileApp(syncEngine: syncEngine));
}

class TaxiPlatformMobileApp extends StatelessWidget {
  const TaxiPlatformMobileApp({super.key, required this.syncEngine});

  final SyncEngine syncEngine;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Taxi Platform',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.amber),
        useMaterial3: true,
      ),
      home: HomeScreen(syncEngine: syncEngine),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.syncEngine});

  final SyncEngine syncEngine;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Taxi Platform Mobile')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Foundation initialized: auth + api + offline queue + sync engine',
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () async {
                await syncEngine.flushPendingCommands();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Sync flush completed')),
                  );
                }
              },
              child: const Text('Run sync flush'),
            ),
          ],
        ),
      ),
    );
  }
}
