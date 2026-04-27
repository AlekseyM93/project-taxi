# Mobile Release Checklist

## Pre-Release

### Code Quality
- [ ] `flutter analyze` — 0 errors, 0 warnings across all packages
- [ ] All unit tests pass (`flutter test` in shared_core, passenger_features, driver_features)
- [ ] All widget tests pass (`flutter test` in flutter_taxi_app)
- [ ] No hardcoded credentials or API keys in source code
- [ ] Sensitive data stored in `flutter_secure_storage` only
- [ ] SafeLogger configured — no secrets in logs

### Build Configuration
- [ ] Correct flavor selected (dev/stage/prod)
- [ ] API URLs point to correct environment
- [ ] Map API keys configured in native manifests (not in git)
- [ ] `key.properties` and signing keys present locally

### Android Specific
- [ ] `INTERNET` permission in main AndroidManifest.xml
- [ ] `ACCESS_FINE_LOCATION` permission in main AndroidManifest.xml
- [ ] `ACCESS_COARSE_LOCATION` permission in main AndroidManifest.xml
- [ ] Yandex MapKit API key in AndroidManifest.xml meta-data
- [ ] ProGuard rules updated if needed
- [ ] Release signing configured
- [ ] Build: `flutter build apk --release` or `flutter build appbundle --release`
- [ ] minSdkVersion >= 21

### iOS Specific
- [ ] `NSLocationWhenInUseUsageDescription` in Info.plist
- [ ] `NSLocationAlwaysUsageDescription` in Info.plist
- [ ] Yandex MapKit API key in AppDelegate
- [ ] Signing certificates and provisioning profiles valid
- [ ] Build: `flutter build ios --release`
- [ ] Archive and upload to TestFlight

### Functional Smoke Test
- [ ] Passenger: login → map loads → select points → fare estimate → create order
- [ ] Passenger: see driver assigned → track on map → trip complete → history
- [ ] Driver: login → start shift → receive offer → accept → start → finish
- [ ] Driver: earnings visible → profile editable
- [ ] Offline: go offline → queue commands → reconnect → sync succeeds
- [ ] Realtime: socket connects → events received → reconnect works
- [ ] Auth: login → logout → session restore → token refresh

### Security
- [ ] No API keys in git (`git log --all -p -- '*.xml' '*.plist' '*.dart' | grep -i 'apikey\|api_key\|secret'`)
- [ ] `.gitignore` covers secrets, keystores, env files
- [ ] Tokens encrypted at rest (flutter_secure_storage)

### Crash Reporting (when integrated)
- [ ] Sentry/Crashlytics SDK initialized
- [ ] Test crash captured in dashboard
- [ ] No secrets in crash reports

### Push Notifications (when integrated)
- [ ] FCM token registration working (Android)
- [ ] APNs token registration working (iOS)
- [ ] Test push delivered

## Build Commands

```bash
# Dev
flutter run --target lib/main_dev.dart

# Stage
flutter run --target lib/main_stage.dart

# Prod Release (Android)
flutter build appbundle --release --target lib/main_prod.dart

# Prod Release (iOS)
flutter build ios --release --target lib/main_prod.dart
```

## Distribution

### Android
- APK: `build/app/outputs/flutter-apk/app-release.apk`
- AAB: `build/app/outputs/bundle/release/app-release.aab`
- Upload to Google Play Console / RuStore

### iOS
- Archive via Xcode
- Upload to TestFlight via Xcode or `xcrun altool`
