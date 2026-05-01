import 'package:dgis_mobile_sdk_map/dgis.dart' as dgis;
import 'package:flutter/foundation.dart';

/// Обертка над [dgis.Context] после [dgis.DGis.initialize].
///
/// Ключ `assets/dgissdk.key` в приложении должен быть валидным для вашего
/// `applicationId` / Bundle ID ([dev.2gis.ru](https://dev.2gis.ru/order)).
class DgisSession {
  DgisSession._(this._native);
  final dgis.Context _native;

  dgis.Context get nativeContext => _native;

  /// Возвращает `null`, если файл ключа некорректен или SDK не смог стартовать.
  static DgisSession? tryInitialize() {
    try {
      return DgisSession._(dgis.DGis.initialize());
    } catch (e, st) {
      debugPrint('[2GIS] SDK init failed: $e\n$st');
      return null;
    }
  }
}
