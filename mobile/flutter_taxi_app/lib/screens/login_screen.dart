import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.authRepository,
    required this.onLoginSuccess,
  });

  final AuthRepository authRepository;
  final void Function(AuthSession session) onLoginSuccess;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String? _error;
  bool _isRegisterMode = false;
  String _selectedRole = 'PASSENGER';

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phone = _phoneController.text.trim();
    final password = _passwordController.text;
    if (phone.isEmpty || password.isEmpty) {
      setState(() => _error = 'Введите телефон и пароль');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      AuthSession session;
      if (_isRegisterMode) {
        session = await widget.authRepository.register(
          phone: phone,
          password: password,
          role: _selectedRole,
        );
      } else {
        session = await widget.authRepository.login(
          phone: phone,
          password: password,
        );
      }
      if (!mounted) return;
      widget.onLoginSuccess(session);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e is AppException ? e.userFriendlyMessage : 'Ошибка. Попробуйте снова.';
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.local_taxi, size: 80, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 16),
                Text(
                  'Такси Платформа',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Телефон',
                    prefixIcon: Icon(Icons.phone),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Пароль',
                    prefixIcon: Icon(Icons.lock),
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_isRegisterMode) ...[
                  const SizedBox(height: 12),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'PASSENGER', label: Text('Пассажир'), icon: Icon(Icons.person)),
                      ButtonSegment(value: 'DRIVER', label: Text('Водитель'), icon: Icon(Icons.drive_eta)),
                    ],
                    selected: {_selectedRole},
                    onSelectionChanged: (v) => setState(() => _selectedRole = v.first),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Colors.red[700]), textAlign: TextAlign.center),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _isLoading ? null : _submit,
                  style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                  child: _isLoading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(_isRegisterMode ? 'Зарегистрироваться' : 'Войти', style: const TextStyle(fontSize: 16)),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => setState(() {
                    _isRegisterMode = !_isRegisterMode;
                    _error = null;
                  }),
                  child: Text(_isRegisterMode ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
