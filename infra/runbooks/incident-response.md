# Incident Response Runbook

## Цель

Единый порядок реакции на прод-инциденты в taxi-platform с минимальным MTTR и контролируемым риском регрессий.

## Severity матрица

- `SEV-1`: полный простой заказа/логина/диспетчеризации, утечка данных, массовая деградация.
- `SEV-2`: частичная деградация core-фич, заметный рост ошибок, проблемы отдельного контура.
- `SEV-3`: локальные сбои без критичного impact на core.

## Шаги реагирования

1. Детект и первичная квалификация инцидента:
   - входной канал: алерт, клиентский репорт, мониторинг.
   - зафиксировать `startTs`, impact, затронутый контур.
2. Коммуникация:
   - назначить Incident Commander;
   - открыть incident channel;
   - обновлять статус каждые 15 минут для SEV-1/2.
3. Техническая стабилизация:
   - проверить health endpoints:
     - `GET /ops/health/live`
     - `GET /ops/health/ready`
     - `GET /ops/health/dependencies`
   - проверить Redis/DB connectivity;
   - при необходимости включить rollback/failover.
4. Снижение ущерба:
   - ограничить проблемный feature-flag/маршрут;
   - применить безопасный workaround (без data-loss).
5. Восстановление:
   - вернуть сервис к SLO baseline;
   - подтвердить восстановление smoke-проверкой.
6. Postmortem (обязательно):
   - root cause;
   - timeline;
   - corrective/preventive actions;
   - контроль сроков исполнения.

## Технический checklist во время инцидента

- Проверить рост 5xx/4xx в API.
- Проверить lag/зависания dispatch wave.
- Проверить auth rate-limit anomalies.
- Проверить stale orders recovery метрики.
- Проверить error envelope/traceId для последних ошибок.

## Smoke Triage Playbook

Цель: быстро локализовать причину падения `npm run test:smoke` до конкретного слоя (env/infra/runtime/realtime/auth/data).

1. **Preflight окружения**
   - из `backend`: `npm run test:preflight-runtime`
   - если `backendPort` не `ok=true`, завершить старый процесс на `:3000`.
2. **Проверка инфраструктуры**
   - из корня: `docker compose up -d`
   - убедиться, что `taxi_db` и `taxi_redis` в статусе `Running`.
3. **Проверка backend health**
   - `GET /ops/health/live`
   - `GET /ops/health/ready`
   - `GET /ops/health/dependencies`
   - если `ready=false` или `healthy=false`, не запускать smoke до устранения.
4. **Стабилизация admin тест-аккаунта**
   - из `backend`: `node scripts/create-admin.js --phone=79990000001 --password=Admin123! --role=ADMIN`
5. **Запуск smoke**
   - из `backend`: `npm run test:smoke`
6. **Если smoke упал — локализация**
   - проверить последний `traceId` и `reason` в логах `driver.location.update`;
   - сверить с `GET /ops/dashboard/realtime-ack?windowMinutes=60` и `GET /ops/dashboard/summary?windowMinutes=60`;
   - по необходимости сразу прогнать:
     - `npm run test:offline`
     - `npm run test:driver-phase18`
     - `npm run test:security-authz`

## Known Failures и быстрые фиксы

1. **`fetch failed` в начале smoke**
   - Признак: backend недоступен на `localhost:3000`.
   - Проверка: `GET /ops/health/live`.
   - Фикс: запустить backend (`npm run start:dev`) и дождаться `ready=true`.

2. **`EADDRINUSE :::3000` при запуске backend**
   - Признак: второй backend пытается занять уже занятый порт.
   - Проверка: `netstat -ano | findstr :3000`.
   - Фикс: завершить stale процесс `node.exe` на найденном PID, затем повторить старт.

3. **`QueryFailedError: read ECONNRESET` (DB connect)**
   - Признак: runtime падает на handshake с БД.
   - Проверка: `DB_*`/`DB_SSL` в `backend/.env` + `test:preflight-runtime`.
   - Фикс: для локального docker окружения использовать `DB_HOST=localhost`, `DB_PORT=5433`, `DB_SSL=false`.

4. **`admin login failed: INVALID_CREDENTIALS` в smoke**
   - Признак: шаги регистрации PASS, падение на admin login.
   - Проверка: телефон/пароль smoke-дефолта (`79990000001` / `Admin123!`).
   - Фикс: пересоздать admin через `create-admin.js` с тем же телефоном/паролем.

5. **`driver location ack failed` (`INTERNAL_ERROR`)**
   - Признак: падение на шаге `driver location keepalive`.
   - Проверка: логи `[driver.location.update] ERROR` + `[driver.location.update][ack]` с `traceId`.
   - Фикс: проверить `reason/code` в ack, затем точечно диагностировать соответствующий слой:
     - `DRIVER_PROFILE_NOT_FOUND` -> профиль водителя/привязка userId;
     - `UNAUTHORIZED` -> токен/роль;
     - `INTERNAL_ERROR` -> Redis/DB/runtime dependency.

## Критерий закрытия smoke-инцидента

- `npm run test:smoke` -> PASS.
- `GET /ops/health/ready` -> `ready=true`.
- `GET /ops/health/dependencies` -> `healthy=true`.
- Последний `realtimeAck` snapshot не показывает рост `failRatePct` после фикса.

## SLA коммуникации

- SEV-1: первое подтверждение инцидента до 10 минут.
- SEV-2: до 20 минут.
- Статус-апдейты до стабилизации — не реже 15 минут.
