# Mobile Onboarding Checklist (Personal) — 2026-04-21

Owner: solo developer
Scope: Day 41 onboarding block (Flutter from zero)

## Current blocker snapshot
- [x] Checked Flutter CLI: `flutter --version` -> command not found.
- [x] Checked Android toolchain: `adb --version` -> command not found.
- [x] Checked Java runtime: `java -version` -> command not found.
- [x] Tried installing `pingbird.Puro` via winget twice -> failed with `InternetReadFile() failed` (`0x80072ee2` timeout).

## Recovery checklist (run in order)
1. Network and package-manager connectivity
   - [ ] Verify internet access from terminal (`winget search flutter` must return quickly).
   - [ ] Retry package install:
     - `winget install --id pingbird.Puro -e --accept-source-agreements --accept-package-agreements`
2. Flutter SDK bootstrap
   - [ ] `puro install stable`
   - [ ] `puro global stable`
   - [ ] Confirm:
     - `flutter --version`
     - `flutter doctor -v`
3. Android stack bootstrap
   - [ ] Install Android Studio + Android SDK + emulator image.
   - [ ] Install JDK if still missing.
   - [ ] Accept Android licenses:
     - `flutter doctor --android-licenses`
   - [ ] Re-run:
     - `flutter doctor -v`
4. Learning lab (required onboarding loop)
   - [ ] `flutter create taxi_mobile_lab`
   - [ ] `cd taxi_mobile_lab`
   - [ ] `flutter run`
   - [ ] Add one screen + one button; verify hot reload.
   - [ ] `flutter pub add dio`
   - [ ] Add one simple GET request demo.
   - [ ] Add one basic unit test.
   - [ ] `flutter test`
5. Transfer to project app
   - [ ] Re-run in `mobile/flutter_taxi_app`:
     - `flutter pub get`
     - `flutter test`
   - [ ] Verify app starts (`flutter run`) and record runtime notes.

## Exit criteria for Day 41 completion
- [ ] `flutter doctor -v` has no critical blockers.
- [ ] Learning lab created and executed (`run` + `test`).
- [ ] Personal notes and command logs captured.
