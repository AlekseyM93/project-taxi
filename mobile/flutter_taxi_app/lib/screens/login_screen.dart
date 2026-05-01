import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

import '../taxi_client_kind.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.authRepository,
    required this.onLoginSuccess,
    this.clientKind = TaxiClientKind.universal,
    this.appTitle = 'Такси платформа',
    this.initialBannerError,
    this.onClearInitialBanner,
  });

  final AuthRepository authRepository;
  final Future<void> Function(AuthSession session) onLoginSuccess;
  final TaxiClientKind clientKind;
  final String appTitle;
  final String? initialBannerError;
  final VoidCallback? onClearInitialBanner;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String? _error;
  bool _isRegisterMode = false;
  late String _selectedRole;

  @override
  void initState() {
    super.initState();
    _selectedRole = forcedRoleForRegistration(widget.clientKind) ?? 'PASSENGER';
    if (widget.initialBannerError != null) {
      _error = widget.initialBannerError;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onClearInitialBanner?.call();
      });
    }
  }

  @override
  void didUpdateWidget(LoginScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialBannerError != null &&
        widget.initialBannerError != oldWidget.initialBannerError) {
      setState(() => _error = widget.initialBannerError);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onClearInitialBanner?.call();
      });
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  bool get _roleLocked =>
      widget.clientKind == TaxiClientKind.passenger ||
      widget.clientKind == TaxiClientKind.driver;

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
      final role = forcedRoleForRegistration(widget.clientKind) ?? _selectedRole;
      AuthSession session;
      if (_isRegisterMode) {
        session = await widget.authRepository.register(
          phone: phone,
          password: password,
          role: role,
        );
      } else {
        session = await widget.authRepository.login(
          phone: phone,
          password: password,
        );
      }
      if (!mounted) return;
      await widget.onLoginSuccess(session);
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
    final showRolePicker =
        !_roleLocked &&
        widget.clientKind == TaxiClientKind.universal &&
        _isRegisterMode;

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
                  widget.appTitle,
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
                if (_roleLocked && _isRegisterMode) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Роль: ${widget.clientKind == TaxiClientKind.driver ? 'Водитель' : 'Пассажир'}',
                    style: Theme.of(context).textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                ],
                if (showRolePicker) ...[
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
