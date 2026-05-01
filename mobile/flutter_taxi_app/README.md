# taxi_platform_mobile



Клиенты такси-платформы на Flutter: **отдельные APK для пассажира и водителя** (разные `applicationId`), плюс объединённая сборка для разработки. Карта **2GIS**, REST, websocket realtime, офлайн-очередь.



## Два приложения (продукт)



| Flavor (`--flavor`) | `applicationId`               | Точка входа Dart              | Экран входа                          |

|---------------------|-------------------------------|--------------------------------|---------------------------------------|

| `passenger`         | `com.example.taxi.passenger`  | `lib/main_passenger.dart`      | только пассажир; чужая роль → выход   |

| `driver`            | `com.example.taxi.driver`    | `lib/main_driver.dart`          | только водитель; чужая роль → выход   |

| `unified`           | `com.example.taxi_platform_mobile` | `lib/main.dart`, `main_dev.dart` … | выбор роли только в режиме регистрации |



Сборка двух debug APK одной командой из `mobile/flutter_taxi_app`:



```powershell

.\tool\build_client_apks.ps1

```



или вручную:



```bash

flutter build apk --debug --flavor passenger -t lib/main_passenger.dart

flutter build apk --debug --flavor driver -t lib/main_driver.dart

```



Артефакты Gradle:



- `build/app/outputs/flutter-apk/app-passenger-debug.apk`

- `build/app/outputs/flutter-apk/app-driver-debug.apk`



`main_passenger` / `main_driver` по умолчанию ходят на **`http://10.0.2.2:3000`** (Android-эмулятор). Для BlueStacks/реального телефона подставьте IP ПК:



```bash

flutter build apk --debug --flavor passenger -t lib/main_passenger.dart \

  --dart-define=API_BASE_URL=http://192.168.1.10:3000 \

  --dart-define=WS_BASE_URL=http://192.168.1.10:3000

```



Разработка «всё в одном» (эмулятор + localhost на хосте через 10.0.2.2):



```bash

flutter run --flavor unified -t lib/main_dev_emulator.dart

```



## Ключ 2GIS



Для **каждого** Android `applicationId` в кабинете [dev.2gis.ru](https://dev.2gis.ru/order) нужен свой бинарный ключ (или один ключ, если поддержка 2GIS явно разрешила несколько package name).



Файл ключа лежит в **`flutter_taxi_app/assets/dgissdk.key`** (общий asset для всех flavors).



Ключ **Web MapGL** с фронтенда сюда не подходит.



## iOS (macOS)



Flavors на iOS требуют отдельных Xcode schemes — в этом репозитории основной акцент на Android APK; для iOS временно можно использовать `unified` после настройки scheme вручную.



Podfile: `platform :ios, '16.0'`.



## Тестовые пользователи (локальный backend)



Из каталога **`backend`**:



```bash

npm run seed:test-users

```



| Роль       | Телефон       | Пароль    |

|------------|---------------|-----------|

| Пассажир   | `79991111101` | `Test123!` |

| Водитель   | `79992222201` | `Test123!` |



Если приложение **водителя** пишет «аккаунт не водительский», номер раньше мог быть зарегистрирован как пассажир или в БД другой формат `phone`. Ещё раз выполните `npm run seed:test-users` — скрипт находит пользователя по **цифрам** номера и выставляет нужную роль.



## Локальный чек качества



```bash

flutter analyze

flutter test

```


