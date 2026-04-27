# Phase 1: Mobile Foundation Audit Report

## 1. Что проверено

- Все 7 Dart-файлов в `mobile/flutter_taxi_app/lib/`
- Единственный тестовый файл в `test/`
- Android/iOS конфигурации (manifest, Info.plist, build.gradle.kts)
- pubspec.yaml (зависимости)
- Backend API контракты (auth, orders, geo, drivers, payments, realtime)
- Web frontend как UX-ориентир (services, realtime hooks, map integration)

## 2. Текущее состояние mobile (factual baseline)

### Файлы в lib/ (7 штук)
| Файл | Строк | Назначение | Качество |
|------|-------|-----------|----------|
| `main.dart` | 378 | UI + логика + auth + sync + realtime в одном файле | Монолит, hardcoded dev creds |
| `core/app_config.dart` | 32 | Конфиг через `--dart-define` | Минимальный, нет flavors |
| `core/api_client.dart` | 49 | HTTP client (Dio) | Нет interceptors, нет retry, нет refresh |
| `features/auth/auth_repository.dart` | 70 | Login/logout/session restore | SharedPreferences (не secure), нет refresh token, нет register |
| `features/orders/offline_command_queue.dart` | 70 | Очередь offline-команд | Работает, но SharedPreferences (не persistent DB) |
| `features/orders/sync_engine.dart` | 79 | Push/pull sync | Минимальный, нет error handling, нет retry |
| `features/realtime/realtime_client.dart` | 53 | Socket.IO passenger/driver | Нет reconnect logic, дублирование handlers, нет sequence tracking |

### Тесты (1 файл, 2 теста)
| Файл | Тесты | Покрытие |
|------|-------|----------|
| `offline_command_queue_test.dart` | 2 | enqueue/readAll, removeByIds |

### Зависимости (pubspec.yaml)
- `dio: ^5.7.0` — HTTP
- `shared_preferences: ^2.3.2` — local storage (не secure)
- `socket_io_client: ^3.0.0` — WebSocket
- **Отсутствуют:** flutter_secure_storage, geolocator, yandex_mapkit, flutter_bloc, get_it, injectable, freezed, json_annotation, connectivity_plus

### Android конфигурация
- **INTERNET** — только в debug/profile manifest, НЕ в main
- **Location permissions** — отсутствуют
- **Yandex API key** — отсутствует
- **productFlavors** — отсутствуют
- compileSdk: 35, minSdk: 21, targetSdk: 35

### iOS конфигурация
- **NSLocationWhenInUseUsageDescription** — отсутствует
- **NSLocationAlwaysUsageDescription** — отсутствует
- **Yandex API key** — отсутствует
- **Podfile** — отсутствует (генерируется при `flutter pub get`)

## 3. Gap Matrix (текущее vs целевое)

| Компонент | Текущее | Целевое (ТЗ) | Gap | Приоритет |
|-----------|---------|-------------|-----|-----------|
| Project structure | Плоская, 1 app | Multi-package, 2 apps | FULL | P0 |
| Clean Architecture | Нет | Domain/Data/Presentation | FULL | P0 |
| DI | Нет | get_it + injectable | FULL | P0 |
| State management | setState | Bloc | FULL | P0 |
| Config/Flavors | dart-define only | dev/stage/prod flavors | FULL | P1 |
| Networking | Базовый Dio | Interceptors, retry, refresh | PARTIAL | P0 |
| Auth | Login only | Login + register + refresh + secure storage | PARTIAL | P0 |
| Secure storage | SharedPreferences | flutter_secure_storage | FULL | P0 |
| Socket/Realtime | Базовый connect | Reconnect, heartbeat, sequence, dedup | PARTIAL | P0 |
| Offline queue | In-memory + prefs | Persistent DB + retry + idempotency | PARTIAL | P1 |
| Location service | Нет | Foreground + permissions + throttling | FULL | P0 |
| Maps | Нет | Yandex MapKit + markers + routes | FULL | P0 |
| Passenger screens | Нет (1 монолит) | Map, order flow, history, profile | FULL | P0 |
| Driver screens | Нет | Shift, map, offers, trip, earnings | FULL | P0 |
| Push notifications | Нет | FCM + APNs readiness | FULL | P2 |
| Crash reporting | Нет | Sentry/Crashlytics | FULL | P2 |
| Tests | 2 unit | Unit + widget + integration + smoke | NEAR-FULL | P1 |
| Release pipeline | Нет | Flavors + signing + distribution | FULL | P2 |
| DTO contracts | Нет | Strict typed DTOs | FULL | P0 |

## 4. Backend API Contract Compatibility

### Auth — COMPATIBLE
- `POST /auth/register` — phone, password, role — mobile ready
- `POST /auth/login` — phone, password, optional mfaCode — mobile ready
- `POST /auth/refresh` — refreshToken — mobile ready (but mobile doesn't store refreshToken yet)
- `POST /auth/logout` — optional refreshToken — mobile ready

### Orders (passenger) — COMPATIBLE
- `POST /orders` — CreateOrderDto — mobile ready
- `POST /orders/:id/cancel` — mobile ready
- `GET /orders/me/passenger` — pagination — mobile ready
- `GET /orders/me/passenger/active` — mobile ready
- `POST /orders/me/passenger/fare-estimate` — mobile ready
- `POST /orders/me/passenger/confirm` — mobile ready
- `GET /orders/me/passenger/:id/details` — mobile ready
- `GET /orders/me/passenger/:id/receipt` — mobile ready

### Orders (driver) — COMPATIBLE
- `GET /orders/me/driver/active` — mobile ready
- `GET /orders/me/driver/active/card` — mobile ready
- `POST /orders/me/driver/:id/accept|start|finish|cancel` — mobile ready

### Geo — COMPATIBLE
- `POST /geo/suggest|geocode|reverse|route-estimate` — mobile ready

### Drivers — COMPATIBLE
- `POST /drivers/me/shift/start|end` — mobile ready
- `GET /drivers/me/shift|earnings/summary|profile|vehicles` — mobile ready

### Sync — COMPATIBLE
- `GET /orders/sync/pull` — mobile ready
- `POST /orders/sync/push` — mobile ready

### Realtime — PARTIAL MISMATCH
- Mobile listens to `order.status.changed` but backend emits `order.status` — MISMATCH
- Backend emits `order.driver.snapshot` and `order.driver.location` — mobile handles both
- Mobile does NOT implement `passenger.join` event — MISSING

## 5. Product Gaps

| Feature | Status | Risk | Priority | Action |
|---------|--------|------|----------|--------|
| Тарифы/pricing | Есть (backend) | Low | — | Integrate in mobile |
| Surge pricing | Нет | Medium | P2 | Future backend+mobile |
| Рейтинг | Нет | High | P1 | Need backend endpoint + mobile UI |
| Support | Есть (backend) | Low | P2 | Integrate in mobile |
| Disputes | Есть (backend) | Low | P2 | Integrate in mobile |
| Payouts | Нет | High | P1 | Need backend + mobile |
| Bonuses | Нет | Low | P3 | Future |
| Loyalty | Нет | Low | P3 | Future |
| Corporate rides | Нет | Low | P3 | Future |
| Refunds | Есть (admin only) | Medium | P2 | No mobile action needed |
| Legal docs | Нет | Medium | P1 | Need mobile screens |

## 6. Сильные стороны

1. **Зрелый backend** — 20+ endpoints, полный lifecycle, security gates → mobile может сразу интегрироваться
2. **Realtime foundation** — Socket.IO namespaces, events, ack → mobile переиспользует контракты
3. **Offline sync foundation** — push/pull, idempotency → mobile расширяет существующую очередь
4. **PostGIS + geo facade** — suggest/geocode/reverse/route-estimate → mobile получает geo из коробки
5. **Web как UX ориентир** — проверенные паттерны passenger/driver dashboards → mobile копирует flow
6. **Admin/ops слой** — мониторинг, health checks → не нужно для mobile, но помогает при debug
7. **Security/quality gates** — CI, dependabot, secret scan → mobile добавляется в pipeline
8. **Runbooks** — incident/DR/checklists → mobile добавляет свой checklist

## 7. Слабые стороны и риски

| Слабое место | Описание | Риск | Как исправить | Приоритет | DoD |
|-------------|----------|------|--------------|-----------|-----|
| Mobile maturity gap | 7 файлов, монолит, нет архитектуры | Critical | Clean Architecture restructure | P0 | Multi-package, Bloc, DI |
| Мало mobile tests | 2 unit теста, 0 widget/integration | High | Test strategy по всем слоям | P1 | Unit + widget + integration + smoke |
| Нет map integration | Ни Yandex SDK, ни MapProvider | High | Phase 8 implementation | P0 | Android+iOS maps working |
| Нет production push | Нет FCM/APNs | Medium | Phase 11 | P2 | Device token registration + push delivery |
| Нет mobile release pipeline | Нет flavors, нет signing | Medium | Phase 11 | P2 | dev/stage/prod builds |
| Reconnect риски | Нет backoff, нет heartbeat, нет dedup | High | Socket layer hardening | P0 | Auto-reconnect + sequence tracking |
| Background location | Нет location service вообще | High | LocationService + permissions | P0 | Foreground location working |
| API DTO риски | dynamic typing, no validation | Medium | Freezed/json_serializable DTOs | P1 | Typed DTOs for all endpoints |
| Secure storage | Tokens в SharedPreferences | High | flutter_secure_storage | P0 | Tokens encrypted at rest |
| Нет crash reporting | Нет Sentry/Crashlytics | Medium | Phase 11 | P2 | Crash reports collected |

## 8. Следующий шаг

Phase 2: Shared Core + Project Restructure — перестроить проект из монолита в multi-package Clean Architecture.
