# Runtime Baseline - 2026-04-20

## Scope
- Environment reset by stopping duplicate `backend start:dev` and `frontend vite` processes.
- Local infra checked via Docker (`taxi_db`, `taxi_redis` running).
- Runtime baseline collected for backend health/readiness, admin API smoke, frontend critical paths, and mobile toolchain availability.

## Backend Baseline
- Backend launched with `npm run start:dev`.
- `GET /ops/health/live`: `ok`
- `GET /ops/health/ready`: `ready=true`
- `GET /ops/health/dependencies`: `healthy=true`
- `GET /ops/dashboard/summary?windowMinutes=60`: returns expected payload keys.
- `GET /ops/dashboard/payments-security?windowMinutes=60`: `total=0`, `rejected=0`, `rejectRatePct=0`

## Smoke Status
- `npm run test:smoke`: **FAIL**
- Failure point: `driver location ack failed`
- WS payload returned:
  - `ok=false`
  - `reason=INTERNAL_ERROR`
  - `event=driver.location.update`

## Frontend Baseline
- Frontend launched with `npm run dev -- --host 127.0.0.1 --port 5173`.
- `GET /`: HTTP 200
- `GET /admin`: HTTP 200

## Mobile Baseline
- `flutter doctor -v`: command not found on host machine.
- Current machine is not ready for Flutter execution yet (toolchain install required).

## Baseline Risks Opened
1. Release-blocking smoke failure in driver location websocket ack path.
2. Mobile local development blocked by missing Flutter SDK in PATH.
3. Multiple parallel dev servers were running before baseline, causing non-deterministic local runtime.

## Immediate Next Actions
1. Investigate and fix `driver location` websocket internal error.
2. Add targeted tests for websocket driver location ack path.
3. Add frontend/mobile test hardening coverage for critical paths.
4. Install Flutter SDK and verify with `flutter doctor` before mobile execution tasks.
