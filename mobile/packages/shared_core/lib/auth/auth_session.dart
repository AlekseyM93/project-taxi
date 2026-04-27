class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.role,
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String role;

  bool get isPassenger => role == 'PASSENGER';
  bool get isDriver => role == 'DRIVER';

  AuthSession copyWith({String? accessToken, String? refreshToken}) {
    return AuthSession(
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      userId: userId,
      role: role,
    );
  }
}
