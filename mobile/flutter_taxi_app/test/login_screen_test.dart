import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_core/shared_core.dart';
import 'package:taxi_platform_mobile/screens/login_screen.dart';

void main() {
  group('LoginScreen widget', () {
    late AuthRepository authRepository;

    setUp(() {
      final config = AppConfig.dev();
      final storage = SecureStorage();
      final logger = SafeLogger(environment: config.environment, tag: 'Test');
      final apiClient = ApiClient(config: config, secureStorage: storage, logger: logger);
      authRepository = AuthRepository(apiClient: apiClient, secureStorage: storage, logger: logger);
    });

    testWidgets('renders login form with phone and password fields', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: LoginScreen(
          authRepository: authRepository,
          onLoginSuccess: (_) {},
        ),
      ));

      expect(find.text('Такси Платформа'), findsOneWidget);
      expect(find.byType(TextField), findsNWidgets(2));
      expect(find.text('Войти'), findsOneWidget);
    });

    testWidgets('shows register mode toggle', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: LoginScreen(
          authRepository: authRepository,
          onLoginSuccess: (_) {},
        ),
      ));

      expect(find.text('Нет аккаунта? Зарегистрироваться'), findsOneWidget);
      await tester.tap(find.text('Нет аккаунта? Зарегистрироваться'));
      await tester.pump();
      expect(find.text('Зарегистрироваться'), findsOneWidget);
      expect(find.text('Уже есть аккаунт? Войти'), findsOneWidget);
    });

    testWidgets('shows error when submitting empty fields', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: LoginScreen(
          authRepository: authRepository,
          onLoginSuccess: (_) {},
        ),
      ));

      await tester.tap(find.text('Войти'));
      await tester.pump();
      expect(find.text('Введите телефон и пароль'), findsOneWidget);
    });
  });
}
