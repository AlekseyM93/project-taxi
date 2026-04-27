# Taxi Platform (production-oriented)

Единый репозиторий платформы такси уровня production: backend, web-frontend и инфраструктурные заготовки.

Цель проекта: построить масштабируемую экосистему (пассажир, водитель, диспетчер, админ) с устойчивостью к сбоям сети и прозрачным операционным контролем.

## 1) Технологический стек

- Backend: `NestJS` + `TypeScript`
- API: `REST` + `WebSocket (Socket.IO)`
- БД: `PostgreSQL` + `PostGIS` (гео-логика)
- Cache/Realtime state: `Redis`
- Frontend: `React 18` + `TypeScript` + `Vite` + `@tanstack/react-query`

## 2) Текущая структура репозитория

- `backend` — основной серверный контур (авторизация, заказы, dispatch, realtime, ops, offline sync).
- `frontend` — единое web-приложение:
  - публичная часть,
  - кабинет пассажира,
  - кабинет водителя,
  - админ/диспетчер панель (`/admin`, `/admin/login`).
- `infra` — резерв под инфраструктурные скрипты/конфигурации.
- `docker-compose.yml` — локальный запуск PostgreSQL/PostGIS + Redis.

Важно: отдельная legacy-папка `admin-web` удалена, чтобы не было дублирующихся админ-клиентов и расхождения контрактов.

## 3) Доменные роли и ключевые контуры

- Роли: `PASSENGER`, `DRIVER`, `DISPATCHER`, `ADMIN`.
- Заказы: `NEW`, `SEARCHING`, `ASSIGNED`, `IN_PROGRESS`, `DONE`, `CANCELLED`, `NO_DRIVERS_FOUND`.
- Realtime-контур:
  - офферы водителям,
  - события заказа,
  - статусы присутствия/занятости.
- Операционный контур:
  - административные read-model API,
  - action-center операции,
  - аудит и операционная история.
- Offline-first контур:
  - `POST /orders/sync/push`,
  - `GET /orders/sync/pull`,
  - idempotency и conflict-handling для нестабильной сети.

## 4) Быстрый старт (локальная разработка)

### 4.1 Поднять инфраструктуру

Из корня проекта:

```bash
docker compose up -d
```

Сервисы:
- PostgreSQL/PostGIS: `localhost:5433`
- Redis: `localhost:6379`

### 4.2 Запустить backend

```bash
cd backend
npm install
npm run start:dev
```

Перед запуском заполнить `backend/.env` на основе `backend/.env.example` (локальная БД или Supabase-пулер).

### 4.3 Запустить frontend

```bash
cd frontend
npm install
npm run dev
```

Создать `frontend/.env` на основе `frontend/.env.example`:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## 5) Тестирование и проверка стабильности

### Backend (из `backend`)

```bash
npm run build
npm run lint
npm run test
npm run test:smoke
npm run test:offline
```

Дополнительно для driver-контура (если нужен отдельный прогон):

```bash
npm run test:driver-phase18
```

### Frontend (из `frontend`)

```bash
npm run lint
npm run test
npm run build
```

## 6) Production-принципы, зафиксированные в проекте

- Единый источник правды по веб-интерфейсу: только `frontend`.
- Никаких дублирующих контуров админки.
- Идемпотентность команд и контролируемые state transitions на backend.
- Offline/online совместимость для продуктового развития мобильных клиентов.
- Наблюдаемость через ops/admin read-модели, аудит и операционные события.

## 7) Текущий статус работ

Уже реализовано:

- стабилизация core backend + geo-dispatch;
- расширенные backend-контракты для пассажира и водителя;
- offline sync foundation (push/pull + replay/conflict policy);
- интеграция админ-контуров backend с web-frontend;
- консолидация структуры репозитория (удалены дубли/конфликты);
- улучшение frontend-админки (табличные представления, состояния загрузки);
- fallback на кэш для admin read API при сетевой деградации;
- lazy-loading роутов и декомпозиция vendor-чанков.

## 8) Ближайший roadmap

1. Довести admin UX до полного операционного формата (пагинация, расширенные фильтры, typed-columns).
2. Сделать сквозной интеграционный smoke-flow (`backend + frontend`) в одном сценарии.
3. Подготовить мобильный integration-layer (iOS/Android) поверх текущих offline sync контрактов.
4. Укрепить release-процедуру: единый чеклист, регрессионный прогон, контроль SLO/ops-метрик.

## 9) CI/CD quality и security gates

В репозиторий добавлен обязательный workflow:

- `.github/workflows/quality-security-gates.yml`

Он проверяет:

- backend: `build + lint + unit tests`;
- frontend: `lint + tests + build`;
- security: `gitleaks` (secret scan) + `npm audit --omit=dev --audit-level=high` + `trivy` (vuln/misconfig/secret scan).

Также добавлен `dependabot` для weekly обновления зависимостей:

- `.github/dependabot.yml`

Локально перед push рекомендуется прогонять:

### Backend

```bash
cd backend
npm run build
npm run lint
npm run test -- --runInBand
npm run test:security-authz
```

### Frontend

```bash
cd frontend
npm run lint
npm run test
npm run build
```

## 10) Примечание по README

По проектному соглашению README оставлен только в корне репозитория. Вложенные `README` удалены.

## 11) Политика секретов и переменных окружения

- Секреты (`DB_PASSWORD`, `JWT_SECRET`, API-ключи) хранятся только в локальных/защищенных env-файлах и не коммитятся в репозиторий.
- Для backend использовать только шаблон `backend/.env.example`, рабочие значения держать в `backend/.env`.
- Для frontend использовать `frontend/.env.example` и локальный `frontend/.env`.
- Для привилегированных ролей (`ADMIN`, `DISPATCHER`) включен обязательный TOTP MFA на `/auth/login`:
  - `AUTH_PRIVILEGED_MFA_REQUIRED=true`
  - `AUTH_PRIVILEGED_MFA_WINDOW_STEPS=1` (допустимое окно по времени)
  - enrollment/confirm/recovery реализованы через `/auth/mfa/enroll/*` и `/auth/mfa/recovery/*`
  - `AUTH_MFA_ENCRYPTION_KEY` используется для шифрования MFA secret в БД
  - `AUTH_MFA_ISSUER` задает issuer в otpauth URI для Authenticator приложений
- Для security-аудита auth-событий:
  - `AUTH_AUDIT_RETENTION` (например `30d`)
  - `AUTH_AUDIT_MAX_ITEMS` (максимум записей в Redis-list)
  - доступ к последним событиям: `GET /auth/audit/recent` (только `ADMIN`/`DISPATCHER`)
- Для сессионной безопасности используется access+refresh схема:
  - `JWT_EXPIRES_IN` для access token,
  - `JWT_REFRESH_EXPIRES_IN` для refresh token,
  - refresh-сессии и ревокация access token хранятся в Redis.
- Для платежных webhook обязательно задавать `PAYMENT_WEBHOOK_SECRET` (длинный случайный секрет, минимум 32 байта).
- Для платежного провайдера используется `PAYMENT_PROVIDER` (`MOCK_PSP`/другой адаптер), доступны admin endpoints:
  - `POST /payments/orders/:orderId/refund`
  - `GET /payments/reconcile/snapshot`
- Логи не должны содержать чувствительные значения (`DATABASE_URL`, токены, пароли, приватные ключи).
- Минимальная длина `JWT_SECRET`: 32+ байта случайных данных.
- Для production окружения:
  - включать проверку TLS-сертификата БД (`DB_SSL_REJECT_UNAUTHORIZED=true`);
  - регулярно ротировать секреты (не реже 1 раза в 90 дней или сразу после инцидента);
  - после ротации делать полный smoke-regression (`backend + frontend + auth`).

## 12) Incident/DR готовность

Для операционной зрелости добавлены runbook-и и скрипты:

- `infra/runbooks/incident-response.md`
- `infra/runbooks/disaster-recovery.md`
- `infra/scripts/backup-postgres.ps1`
- `infra/scripts/restore-postgres.ps1`

Минимальный цикл:

1. Еженедельный backup PostgreSQL.
2. Ежемесячный restore drill на тестовом окружении.
3. Обязательный postmortem на каждый SEV-1/SEV-2 инцидент.

## 13) Клиентская презентация через GitHub (без локального ПК)

Основной канал демо: `GitHub Actions -> stage`.
Резервный канал демо: `GitHub Codespaces`.

### 13.1 Что подготовить в GitHub перед релизом stage

1. Создать `Environment` с именем `stage` в репозитории.
2. Заполнить secrets для workflow:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`
   - `DEPLOY_WEBHOOK_URL`, `DEPLOY_WEBHOOK_TOKEN`
   - `HEALTHCHECK_URL`
   - `ROLLBACK_WEBHOOK_URL`, `ROLLBACK_WEBHOOK_TOKEN`
3. Проверить, что endpoint `HEALTHCHECK_URL/ops/health/ready` возвращает `200`.

Workflow релиза:
- `.github/workflows/release-stage-prod.yml`

### 13.2 Как запустить релиз stage из GitHub UI

1. Открыть `Actions -> Release Stage And Prod`.
2. Нажать `Run workflow`.
3. Выбрать:
   - `target_environment = stage`
   - `release_version = demo-YYYY-MM-DD` (например, `demo-2026-04-27`)
4. Дождаться успешного завершения этапов:
   - `Validate And Build`
   - `Migration Gate`
   - `Deploy`
5. Проверить stage:
   - `GET /ops/health/live`
   - `GET /ops/health/ready`
   - вход в web-приложение по публичному stage URL.

### 13.3 Минимальный demo-hardening перед показом

1. Создать demo-админа:
   - `cd backend`
   - `node scripts/create-admin.js`
2. Прогнать минимальные проверки:
   - backend: `npm run test:preflight-runtime && npm run test:smoke`
   - frontend: `npm run build`
3. Проверить сценарий показа end-to-end:
   - заказ пассажира -> назначение водителя -> обновление статуса -> проверка в админке.

### 13.4 Показ через Codespaces (fallback)

Если stage недоступен, использовать сценарий в `.devcontainer`:
1. `Code -> Codespaces -> Create codespace on main`.
2. В Codespaces выполнить команды из `scripts/codespaces-demo.sh`.
3. Открыть forwarded ports:
   - `5173` (frontend)
   - `3000` (backend)
