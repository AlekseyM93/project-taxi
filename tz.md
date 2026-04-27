Ты Senior Mobile Architect, Senior Flutter Engineer, Senior Backend Architect, Product Engineer и Technical Auditor уровня Uber/Yandex/Bolt.

Твоя задача — провести подробный аудит mobile-направления taxi-platform и подготовить production-grade план разработки Flutter-приложений для пассажира и водителя, включая полную пошаговую интеграцию Яндекс Карт в web и mobile.

ВАЖНО:
- Не ври.
- Не придумывай несуществующую реализацию.
- Не выдавай предположения за факты.
- Не делай учебный MVP.
- Не ломай текущий backend.
- Работай как технический директор проекта.
- Идем строго поэтапно.
- После каждого этапа пиши:
  1. Что проверено
  2. Что сделано
  3. Какие файлы изменены
  4. Как тестировать
  5. Какие риски остались
  6. Следующий шаг

==================================================
КОНТЕКСТ ПРОЕКТА
==================================================

Есть production-oriented taxi-platform:

Backend:
- NestJS + TypeScript
- REST API
- Socket.IO
- PostgreSQL + PostGIS
- Redis
- auth
- orders
- dispatch
- realtime
- offline sync
- payments foundation
- ops/readiness
- runbooks
- security gates

Frontend:
- React + TypeScript
- passenger/driver/admin web контуры
- admin/dispatcher panel
- map/realtime UX частично реализован

Текущий статус:
- Backend зрелый
- Web почти production-ready
- Mobile foundation начат, но mobile maturity слабее backend/web

Главная задача:
довести mobile до production-ready уровня.

Стратегическое решение:
НЕ делать сейчас отдельно Swift + Kotlin.
Основной путь:
Flutter как единый мобильный контур.

Причины:
- быстрее запуск;
- одна кодовая база;
- дешевле поддержка;
- проще интеграция с backend;
- native оставить как future path.

==================================================
1. ПЕРВИЧНЫЙ АУДИТ MOBILE FOUNDATION
==================================================

Проведи аудит существующего mobile-контура.

Найди:

Что уже реализовано:
- project structure
- auth
- networking
- realtime
- offline queue
- maps foundation
- tests
- config
- env setup

Что отсутствует:
- экраны
- repositories
- DTO
- socket events
- map integration
- secure token storage
- push
- crash reporting
- integration tests

Сильные стороны:
1. зрелый backend
2. realtime foundation
3. offline sync foundation
4. PostGIS + Redis
5. web-контур как UX ориентир
6. admin/ops слой
7. security/quality gates
8. runbooks

Для каждой сильной стороны:
- почему это важно
- как использовать в mobile

==================================================
2. СЛАБЫЕ СТОРОНЫ И ИХ ИСПРАВЛЕНИЕ
==================================================

Проверь и опиши:

Слабое место
Описание
Риск
Как исправить
Приоритет
Definition of Done

Обязательно проверить:
1. Mobile maturity gap
2. Мало mobile tests
3. Нет полноценной map integration
4. Нет production push
5. Нет mobile release pipeline
6. Плохая сеть / reconnect риски
7. Background location риски
8. API DTO риски
9. Secure storage риски
10. Нет crash reporting

Исправления:
- Clean Architecture
- shared mobile core
- strict DTO contracts
- secure token storage
- offline queue
- reconnect strategy
- widget/integration tests
- dev/stage/prod flavors
- crash reporting readiness
- mobile smoke flow

==================================================
3. ЦЕЛЕВАЯ FLUTTER АРХИТЕКТУРА
==================================================

Сделай architecture design:

- Feature-based
- Clean Architecture
- Domain/Data/Presentation
- Repository Pattern
- DI
- Offline-first
- API contract driven
- Socket layer
- MapProvider abstraction

Выбери:
Riverpod или Bloc
Выбери один и обоснуй.

Структура:

mobile/
 apps/
   passenger_app/
   driver_app/

 packages/
   shared_core/
      auth/
      networking/
      sockets/
      offline_queue/
      location/
      maps/
      storage/
      logging/
      ui_kit/
      config/

   passenger_features/
   driver_features/

==================================================
4. SHARED CORE
==================================================

Реализовать:

Config:
- dev/stage/prod
- api urls
- socket urls
- map config

Networking:
- http client
- interceptors
- refresh token flow
- timeout
- retry
- trace id

Secure Storage:
- tokens
- user role
- device id

Socket layer:
- connect
- reconnect
- heartbeat
- subscriptions
- recovery

Offline queue:
- queue
- retries
- idempotency
- conflict handling

Location:
- permissions
- foreground location
- background readiness
- throttling

Maps:
- MapProvider
- markers
- routes
- ETA

Logging:
- safe logs
- no secrets

Errors:
- retryable errors
- user-friendly errors

==================================================
5. PASSENGER APP
==================================================

Реализовать:

Auth:
- login
- register
- restore session

Home map:
- current location
- pickup
- dropoff
- route preview
- ETA
- fare estimate

Order flow:
- create order
- searching driver
- assigned driver
- live trip
- cancel
- complete

History

Profile

==================================================
6. DRIVER APP
==================================================

Реализовать:

Driver auth

Shift:
- online/offline
- availability

Driver map

Offer card:
- accept
- reject
- timer

Trip lifecycle:
- arrive
- start
- finish
- cancel

Earnings

Vehicle/Profile

==================================================
7. REALTIME
==================================================

Passenger events:
- order.created
- order.searching
- order.assigned
- driver.location.updated
- in_progress
- done
- cancelled

Driver events:
- offer.received
- offer.expired
- status.updated

Обязательно:
- reconnect
- duplicate event protection
- REST fallback
- restore active order

==================================================
8. OFFLINE-FIRST
==================================================

Passenger:
- restore active order
- safe cancel
- pull after reconnect

Driver:
- queued actions
- location updates
- sync recovery

Использовать backend sync endpoints.

==================================================
9. PUSH NOTIFICATIONS
==================================================

Предусмотреть:
- FCM
- APNs
- device token registration

Passenger:
- driver found
- driver arrived
- trip started
- trip ended

Driver:
- new order
- cancellations

==================================================
10. TEST STRATEGY
==================================================

Unit tests

Widget tests

Integration tests

Smoke flow:

Passenger login ->
Create order ->
Driver accepts ->
Ride starts ->
Ride ends ->
Admin sees completed order

==================================================
11. RELEASE READINESS
==================================================

Flavors:
- dev
- stage
- prod

Build configs

Secrets hygiene

Crash reporting readiness

Distribution:
- TestFlight
- Android builds
- RuStore ready

==================================================
12. FUTURE NATIVE EVOLUTION
==================================================

Не писать сейчас Swift/Kotlin apps.

Но архитектурно предусмотреть:
- Passenger можно оставить Flutter
- Driver можно позже вынести native

==================================================
13. PRODUCT GAPS AUDIT
==================================================

Проверить:
- тарифы
- surge pricing
- рейтинг
- support
- disputes
- payouts
- bonuses
- loyalty
- corporate rides
- refunds
- legal docs

Для каждого:
есть/нет
риск
приоритет
что делать

==================================================
14. ИНТЕГРАЦИЯ ЯНДЕКС КАРТ (ПОШАГОВО)
==================================================

Объяснять как человеку без опыта.

Сделать пошагово:
- что создать
- что установить
- куда вставить код
- какие ключи получить
- какие файлы менять
- как тестировать

Цель:
Интеграция Яндекс Карт в:
1. Website
2. Flutter Passenger
3. Flutter Driver

Нужно:
- карта
- текущая геопозиция
- точка пользователя
- pickup/dropoff
- маркеры
- маршрут
- водитель на карте
- realtime movement

==================================================
15. ПОДГОТОВКА YANDEX API
==================================================

Пошагово показать:

1. Регистрация Yandex developer/cloud
2. Получение JS API key
3. Получение mobile SDK key
4. Ограничения доменов/packages
5. Какие ключи для:
- web
- android
- ios

Где хранить:
frontend/.env

.env.example

mobile configs:
dev/stage/prod

не коммитить ключи.

==================================================
16. WEB ЯНДЕКС КАРТЫ
==================================================

Сделать пошагово:

Создать:
src/shared/maps/YandexMap.tsx

Добавить:
VITE_YANDEX_MAPS_API_KEY=

Реализовать:
- карта
- browser geolocation
- current marker
- pickup marker
- dropoff marker
- route line

Подключить:
Passenger flow

Driver dashboard

Realtime driver marker updates.

Ошибки:
- геолокация запрещена
- карта не загрузилась
- api key invalid
- no network

Показать как тестировать пошагово.

==================================================
17. FLUTTER ЯНДЕКС КАРТЫ
==================================================

Пошагово:

Проверить актуальный flutter yandex map plugin.

Настроить Android:
- AndroidManifest
- permissions
- api key

Настроить iOS:
- Info.plist
- location permissions
- api key

Создать:

shared_core/maps/
- map_provider.dart
- yandex_map_provider.dart
- map_controller.dart

shared_core/location/
- location_service.dart
- permission_service.dart

Passenger:
- current location
- pickup
- dropoff
- route
- track driver

Driver:
- current location
- send location backend
- route to passenger
- route trip

==================================================
18. BACKEND GEO CONTRACTS
==================================================

Проверить:
create order with coordinates

driver location updates

socket events:
- driver.location.updated
- order.assigned
- order.status.updated

Если нет:
предложить endpoints и DTO
добавить тесты

==================================================
19. КАРТЫ TEST SCENARIO
==================================================

WEB:
1 backend up
2 frontend up
3 open map
4 allow geolocation
5 current point visible
6 pickup/dropoff
7 create order
8 driver accepts
9 passenger sees driver moving

MOBILE:
1 passenger app
2 allow location
3 current point
4 create order
5 driver app
6 driver online
7 accept order
8 realtime movement
9 finish ride

==================================================
20. ОБЯЗАТЕЛЬНЫЕ ОШИБКИ
==================================================

Обработать:
- no location permission
- gps off
- no internet
- api key invalid
- map not loaded
- bad gps
- socket reconnect
- backend unavailable

Для каждой:
message
fallback
retry
no crashes

==================================================
21. SECURITY ДЛЯ API KEYS
==================================================

- keys не в git
- domain restrictions
- package restrictions
- bundle restrictions
- rotation guide

==================================================
22. DEFINITION OF DONE FOR MAPS
==================================================

WEB:
- карта работает
- геопозиция есть
- pickup/dropoff работают
- маршрут есть
- водитель realtime виден

MOBILE:
- android ok
- ios ok
- geolocation ok
- trip flow работает
- realtime работает
- плохая сеть не ломает приложение

BACKEND:
- coords сохраняются
- events работают
- reconnect работает
- тесты зеленые

==================================================
23. ПРИОРИТЕТЫ
==================================================

Работать строго:

Phase 1 Audit
Phase 2 Shared Core
Phase 3 Auth
Phase 4 Passenger flow
Phase 5 Driver flow
Phase 6 Realtime
Phase 7 Web maps
Phase 8 Mobile maps
Phase 9 Offline sync
Phase 10 Testing
Phase 11 Release readiness

Карты:
сначала web
потом mobile
сначала current point
потом pickup/dropoff
потом route
потом realtime driver movement

Не хаотично.

==================================================
24. ОТЧЕТ ПОСЛЕ КАЖДОГО ЭТАПА
==================================================

Всегда выдавай:
1 Что проверено
2 Что найдено
3 Что исправлено
4 Какие файлы изменены
5 Как тестировать
6 Какие риски остались
7 Следующий шаг

==================================================
ГЛАВНАЯ ЦЕЛЬ
==================================================

Получить production-ready mobile контур:

- Passenger App
- Driver App
- Realtime
- Maps
- Geo
- Offline-first
- Push-ready
- Secure auth
- Stable order lifecycle
- Test coverage
- Release-ready builds

Не делать демо.
Делать основу реального агрегатора.