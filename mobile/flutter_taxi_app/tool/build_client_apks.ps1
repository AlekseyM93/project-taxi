# Сборка двух debug APK из корня приложения:
#   mobile/flutter_taxi_app
#
# Выходные файлы (пути Gradle):
#   build/app/outputs/flutter-apk/app-passenger-debug.apk
#   build/app/outputs/flutter-apk/app-driver-debug.apk

$ErrorActionPreference = 'Stop'

Write-Host '>>> flutter passenger (debug APK)...' -ForegroundColor Cyan
flutter build apk --debug --flavor passenger -t lib/main_passenger.dart

Write-Host '>>> flutter driver (debug APK)...' -ForegroundColor Cyan
flutter build apk --debug --flavor driver -t lib/main_driver.dart

Write-Host 'Done.' -ForegroundColor Green
Get-ChildItem 'build/app/outputs/flutter-apk/*.apk' | ForEach-Object { Write-Host $_.FullName }
