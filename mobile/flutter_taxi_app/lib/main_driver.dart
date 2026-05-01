import 'package:flutter/widgets.dart';
import 'package:shared_core/shared_core.dart';

import 'app_bootstrap.dart';
import 'run_config.dart';
import 'taxi_client_kind.dart';

/// APK «Водитель»: Android flavor `--flavor driver`.
///
/// По умолчанию API хост `10.0.2.2:3000` (эмулятор). На устройстве / BlueStacks:
/// `--dart-define=API_BASE_URL=http://ВАШ_IP:3000` и то же для `WS_BASE_URL`.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final dgisSession = DgisSession.tryInitialize();
  await runTaxiPlatformApp(
    config: presetLocalBackend(deviceIdSuffix: 'driver'),
    dgisSession: dgisSession,
    clientKind: TaxiClientKind.driver,
    loggerTag: 'TaxiDriver',
    materialAppTitle: 'Такси · водитель',
  );
}
