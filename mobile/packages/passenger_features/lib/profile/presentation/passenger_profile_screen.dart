import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

class PassengerProfileScreen extends StatelessWidget {
  const PassengerProfileScreen({super.key, required this.authRepository});

  final AuthRepository authRepository;

  @override
  Widget build(BuildContext context) {
    final session = authRepository.currentSession;

    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const CircleAvatar(radius: 40, child: Icon(Icons.person, size: 40)),
            const SizedBox(height: 16),
            Text(
              'ID: ${session?.userId ?? "-"}',
              style: Theme.of(context).textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
            Text(
              'Роль: Пассажир',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const Spacer(),
            OutlinedButton(
              onPressed: () async {
                await authRepository.logout();
                if (context.mounted) {
                  Navigator.of(context).popUntil((route) => route.isFirst);
                }
              },
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Выйти из аккаунта'),
            ),
          ],
        ),
      ),
    );
  }
}
