import 'package:shared_core/shared_core.dart';

/// Вариант клиента: два отдельных APK (пассажир / водитель) или одно приложение со всеми ролями.
enum TaxiClientKind {
  universal,
  passenger,
  driver,
}

bool roleMatchesClientKind(AuthSession session, TaxiClientKind kind) {
  switch (kind) {
    case TaxiClientKind.universal:
      return true;
    case TaxiClientKind.passenger:
      return session.isPassenger;
    case TaxiClientKind.driver:
      return session.isDriver;
  }
}

String? forcedRoleForRegistration(TaxiClientKind kind) {
  switch (kind) {
    case TaxiClientKind.passenger:
      return 'PASSENGER';
    case TaxiClientKind.driver:
      return 'DRIVER';
    case TaxiClientKind.universal:
      return null;
  }
}
