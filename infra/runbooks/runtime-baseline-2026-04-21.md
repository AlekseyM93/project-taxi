# Runtime Baseline - 2026-04-21

## Scope
- Day 1 baseline for 60-day execution plan.
- Captured current quality gates and runtime blockers on local machine.
- Goal: establish deterministic starting point before Day 2 smoke websocket debugging.

## Git / Workspace State
- Branch: `master` tracking `origin/main`.
- Working tree is heavily dirty (large in-progress feature set in backend/frontend/mobile).
- Conclusion: continue as stabilization sprint over current uncommitted implementation.

## Quality Gate Snapshot
- Backend unit tests: PASS (`9/9` suites, `25/25` tests).
- Frontend tests: PASS (`3/3` files, `8/8` tests).
- Backend lint (readonly eslint run): PASS (0 errors).
- Frontend lint: PASS with warnings only (10 `react-refresh/only-export-components` warnings, no errors).
- Backend build: PASS.
- Frontend build: PASS.

## Runtime / Infra Snapshot
- Docker daemon is available; containers are running: `taxi_db`, `taxi_redis`.
- Backend `start:dev`: PASS (API starts on `http://localhost:3000` with local DB settings).
- Health checks: PASS (`/ops/health/live`, `/ops/health/ready`).
- Smoke regression (`npm run test:smoke`): PASS.
- Additional regressions: PASS (`test:offline`, `test:driver-phase18`, `test:security-authz`).
- Flutter SDK remains unavailable in PATH (`flutter` command not found).

## Day 1 Open Blockers (prioritized)
1. P1: Flutter toolchain missing -> mobile execution remains blocked.
2. P1: Installing Flutter via package manager currently fails with network timeout (`winget` download `0x80072ee2`).
3. P2: Frontend lint warning debt (`react-refresh/only-export-components`) remains non-blocking but should be scheduled.

## Day 1 Exit Criteria Status
- Baseline fixed: DONE.
- Blockers list with priority: DONE.
- Unified quality checklist prepared for daily execution: DONE (see `infra/runbooks/quality-checklist.md`).
- P0 runtime/smoke blockers: DONE.

## Next Actions for Day 2
1. Keep local dev baseline pinned to Docker DB defaults from `.env.example`.
2. Proceed to Day 2 technical scope (websocket ack deep-check) only if smoke regresses again.
3. For Flutter toolchain, use manual SDK install fallback if `winget` remains unavailable.

## Day 1 Re-run (same day verification)
- Re-ran baseline checks after plan re-confirmation.
- Backend tests: PASS (`9/9`, `25/25`).
- Frontend tests: PASS (`3/3`, `8/8`).
- Backend lint/build: PASS.
- Frontend lint/build: PASS with same warning-only profile.
- Docker status: PASS (`taxi_db`, `taxi_redis` up).
- Backend runtime: PASS after switching local DB config (`localhost:5433`, `DB_SSL=false`).
- Smoke: PASS after aligning admin seed with smoke credentials/phone.

## Day 2 Clean Reproduction Check
- Environment reset target: local Docker (`taxi_db`, `taxi_redis`) + fresh backend boot.
- Backend startup: PASS (`API listening on http://localhost:3000`).
- Health checks after startup: PASS (`live`, `ready`, `dependencies`).
- Smoke reproducibility run: PASS `5/5` consecutive launches.
- `driver.location.update` ack path: not reproduced as failing in clean local environment.

## Day 2 Conclusion
- Historical websocket ack incident is currently **not reproducible** under stabilized local config.
- Decision: mark Day 2 as complete, keep watch on smoke flakiness in daily checklist.

## Day 3 Localization (realtime + orders)
- Investigated `driver.location.update` flow in:
  - `backend/src/modules/realtime/driver.gateway.ts`
  - `backend/src/modules/realtime/presence.service.ts`
  - `backend/src/modules/orders/orders.service.ts`
- Localized potential `INTERNAL_ERROR` sources in update path:
  1. `ensureDriverId()` failure (token/profile lookup, including `DRIVER_PROFILE_NOT_FOUND`);
  2. Redis/presence operations (`getDriverLocation` / `updateDriverLocation`);
  3. `ordersService.reconcileDriverAvailability()` DB-dependent failures.
- Verified that `findActiveOrderByDriver()` failure is non-fatal for ack because it is wrapped in a local try/catch in gateway.

## Day 3 Hardening Performed
- Improved diagnostic quality for `driver.location.update` acks:
  - Added per-request `traceId` to all ack metadata paths;
  - Reused centralized `mapErrorToAck()` in catch branch (instead of unconditional `INTERNAL_ERROR`);
  - Added structured gateway error log with `traceId`.
- File changed: `backend/src/modules/realtime/driver.gateway.ts`.

## Day 3 Verification
- Backend build: PASS.
- Backend unit tests: PASS (`9/9`, `25/25`).
- Smoke after changes: PASS.

## Day 3 Conclusion
- Primary historical instability was environmental (DB/TLS/admin-seed mismatch), now fixed.
- Remaining risk is reduced to runtime exceptions with now-traceable ack metadata (`traceId`) for rapid triage on Day 4+.

## Day 4 Targeted Fix + Tests
- Implemented focused hardening and regression coverage for websocket ack path:
  - Added dedicated spec: `backend/src/modules/realtime/driver.gateway.spec.ts`.
  - Covered key scenarios:
    1. invalid coordinates -> `INVALID_COORDINATES` + `traceId` in `_meta`;
    2. missing driver profile -> `DRIVER_PROFILE_NOT_FOUND` mapping in ack;
    3. presence-layer failure -> mapped `INTERNAL_ERROR` with consistent `traceId`.
- This closes the gap where ack-path had weak automated protection around realtime edge-cases.

## Day 4 Verification
- Backend build: PASS.
- Backend tests: PASS (`10/10`, `28/28`) including new gateway spec.
- Smoke: PASS after test additions.

## Day 4 Conclusion
- Day 4 goal completed: defect class is now covered by targeted tests and diagnostics remain traceable via `traceId`.
- Next: Day 5 integration-level reinforcement (ack/state transition coverage across websocket + order lifecycle).

## Day 5 Integration Reinforcement
- Expanded realtime gateway regression tests to cover websocket action flow in one suite:
  - active order location path -> `tracking=true` and passenger location emit;
  - websocket transitions `order.accept -> order.start -> order.finish`;
  - invalid transition mapping (`INVALID_STATUS:NEW`) for `order.start`.
- Updated test file: `backend/src/modules/realtime/driver.gateway.spec.ts`.

## Day 5 Verification
- Backend tests: PASS (`10/10`, `31/31`).
- Smoke: PASS (`driver.location.update` + order lifecycle `accept/start/finish`).

## Day 5 Conclusion
- Day 5 objective completed: ack/state transition path now has explicit automated coverage beyond smoke script.
- Next: Day 6 multi-regression pass (`test:smoke`, `test:offline`, `test:driver-phase18`) and flakiness cleanup.

## Day 6 Regression Stability Pass
- Executed full regression pack once:
  - `npm run test:smoke` -> PASS
  - `npm run test:offline` -> PASS
  - `npm run test:driver-phase18` -> PASS
- Executed additional flakiness check with 2 full repeated cycles of the same pack.
- Aggregate Day 6 stability result:
  - `test:smoke`: `3/3` PASS
  - `test:offline`: `3/3` PASS
  - `test:driver-phase18`: `3/3` PASS
- No intermittent failures or ack regressions observed.

## Day 6 Conclusion
- Day 6 objective completed: regression pack is stable under repeated local execution.
- Next: Day 7 (realtime gateway cleanup/refactor for maintainability while preserving current behavior).

## Day 7 Realtime Refactor (no behavior change)
- Refactored `backend/src/modules/realtime/driver.gateway.ts` for maintainability:
  - introduced `buildMeta()` to remove repeated `_meta` payload construction;
  - introduced `parseLocationUpdateBody()` to centralize location payload normalization;
  - reused normalized values in `updateLocation` for sequence/clientTs/coordinates handling.
- Kept runtime behavior and ack contracts unchanged.

## Day 7 Verification
- Backend build: PASS.
- Backend tests: PASS (`10/10`, `31/31`).
- Smoke: PASS.

## Day 7 Conclusion
- Day 7 objective completed: realtime gateway is cleaner and easier to evolve, with regression safety preserved.
- Next: Day 8 (idempotency and sequence-handling deep verification in location pipeline).

## Day 8 Sequence/Idempotency Verification
- Extended realtime gateway regression suite with sequence/timestamp edge-cases:
  - duplicate sequence rejection (`sequence` not incremented) -> `DUPLICATE_OR_LATE_UPDATE`;
  - late timestamp rejection (`clientTs` older than stored point) -> `DUPLICATE_OR_LATE_UPDATE`.
- File updated: `backend/src/modules/realtime/driver.gateway.spec.ts`.

## Day 8 Verification
- Backend tests: PASS (`10/10`, `33/33`).
- Smoke: PASS.

## Day 8 Conclusion
- Day 8 objective completed: location pipeline duplicate/late update behavior is explicitly guarded by tests.
- Next: Day 9 (observability hardening for realtime errors and structured reason-code visibility).

## Day 9 Observability Hardening
- Added structured ack observability for `driver.location.update` in `backend/src/modules/realtime/driver.gateway.ts`:
  - centralized log event: `[driver.location.update][ack]`;
  - fields captured: `ok`, `reason`, `code`, `tracking`, `orderId`, `driverId`, `traceId`, `contractVersion`, `serverTs`.
- Logging is now consistent for both success and failure acks, enabling fast triage via `traceId` + reason codes.

## Day 9 Verification
- Backend tests: PASS (`10/10`, `33/33`).
- Backend build: PASS.
- Smoke: PASS.

## Day 9 Conclusion
- Day 9 objective completed: realtime ack observability now emits structured diagnostic context for all update outcomes.
- Next: Day 10 (ops-level metrics for ack success/fail rates).

## Day 10 Ops Metrics for Realtime Ack
- Implemented ack success/fail metrics wiring:
  - Added metric keys in `backend/src/modules/orders/order-observability.service.ts`:
    - `driver_location_ack_ok`, `driver_location_ack_fail`,
    - reason buckets (`invalid_coordinates`, `duplicate_or_late`, `internal_error`, `driver_profile_not_found`, `unauthorized`).
  - Added metric tracking method in `backend/src/modules/orders/orders.service.ts`:
    - `trackDriverLocationAckMetric({ ok, reason })`.
  - Connected realtime gateway ack flow to metrics emission in
    `backend/src/modules/realtime/driver.gateway.ts`.
- Added ops API snapshot in `backend/src/modules/ops/ops.service.ts`:
  - `getRealtimeAckSnapshot(windowMinutes)`.
- Exposed new endpoint in `backend/src/modules/ops/ops.controller.ts`:
  - `GET /ops/dashboard/realtime-ack?windowMinutes=60`.
- Included realtime ack snapshot in `GET /ops/dashboard/summary` payload (`realtimeAck` section).

## Day 10 Verification
- Backend build: PASS.
- Backend tests: PASS (`10/10`, `33/33`).
- Smoke: PASS.
- Live endpoint check after smoke:
  - `GET /ops/dashboard/realtime-ack?windowMinutes=60` returned
    `total=1`, `ok=1`, `fail=0`, `successRatePct=100`.

## Day 10 Conclusion
- Day 10 objective completed: ops can now monitor realtime `driver.location.update` ack quality via explicit metrics and dashboard API.
- Next: Day 11 (close remaining P0 issues from early regression history and keep baseline green).

## Day 11 P0 Closure Sweep
- Executed stabilization sweep focused on early regression/P0 failure classes:
  - `npm run test:smoke` -> PASS
  - `npm run test:offline` -> PASS
  - `npm run test:driver-phase18` -> PASS
  - `npm run test:security-authz` -> PASS
- Runtime status checks:
  - `GET /ops/health/live` -> `ok`
  - `GET /ops/health/ready` -> `ready=true`
  - `GET /ops/health/dependencies` -> `healthy=true`
- Ops summary check confirms integrated realtime metrics:
  - `GET /ops/dashboard/summary?windowMinutes=60` includes `realtimeAck`
  - sampled result: `total=4`, `ok=4`, `fail=0`, `alertsOpen=0`.

## Day 11 Conclusion
- Day 11 objective completed: no remaining P0 regressions reproduced; baseline remains green after recent realtime/ops changes.
- Next: Day 12 (repeat full smoke+regression and environment determinism hardening).

## Day 12 Determinism Hardening
- Added runtime preflight automation script:
  - `backend/scripts/preflight-runtime.js`
  - checks required env keys (`DB_*`, `REDIS_URL`, `JWT_SECRET`);
  - checks TCP reachability for DB/Redis;
  - verifies backend port `3000` is free before local start.
- Added npm script:
  - `npm run test:preflight-runtime` in `backend/package.json`.
- Updated daily checklist:
  - `infra/runbooks/quality-checklist.md` now requires preflight pass before backend regressions.

## Day 12 Verification
- Preflight check: PASS (`env/dbTcp/redisTcp/backendPort` all `ok=true`).
- Backend unit tests: PASS (`10/10`, `33/33`).
- Regression suite: PASS
  - `test:smoke`,
  - `test:offline`,
  - `test:driver-phase18`.
- Runtime health: PASS
  - `live=ok`, `ready=true`, `dependencies.healthy=true`.
- Summary snapshot confirms realtime metrics available:
  - `realtimeAck.total=4`, `ok=4`, `fail=0`, `successRatePct=100`.

## Day 12 Conclusion
- Day 12 objective completed: environment checks are now codified and repeatable; baseline remains stable under full regression pass.
- Next: Day 13 (update smoke triage runbook section and known-failure playbook).

## Day 13 Runbook Update (Smoke Triage + Known Failures)
- Updated incident runbook with operational smoke triage flow:
  - preflight -> infra -> health -> admin seed -> smoke -> deep-dive diagnostics.
- Added known-failure catalog with fast checks and fixes:
  - `fetch failed`,
  - `EADDRINUSE :3000`,
  - DB `ECONNRESET`,
  - admin `INVALID_CREDENTIALS`,
  - realtime `driver location ack failed`.
- Added explicit smoke incident closure criteria based on smoke PASS + health/dependencies + realtimeAck trend.
- File updated: `infra/runbooks/incident-response.md`.

## Day 13 Conclusion
- Day 13 objective completed: smoke triage and known-failure playbook are now formalized in runbook form.
- Next: Day 14 checkpoint (verify stabilized P0 scope and readiness to move into backend hardening phase).

## Day 14 Checkpoint #1 (P0 Stabilization Closure)
- Executed full P0 checkpoint verification pack on stabilized local environment:
  - `npm run test:preflight-runtime` -> PASS (`env/dbTcp/redisTcp/backendPort` all `ok=true`);
  - `npm run test:smoke` -> PASS;
  - `npm run test:offline` -> PASS;
  - `npm run test:driver-phase18` -> PASS;
  - `npm run test:security-authz` -> PASS;
  - `npm test -- --runInBand` -> PASS (`10/10` suites, `33/33` tests).
- Runtime and ops health snapshot:
  - `GET /ops/health/live` -> `ok`;
  - `GET /ops/health/ready` -> `ready=true`;
  - `GET /ops/health/dependencies` -> `healthy=true`;
  - `GET /ops/dashboard/summary?windowMinutes=60` -> `alertsOpen=0`;
  - `GET /ops/dashboard/realtime-ack?windowMinutes=60` -> `total=7`, `ok=7`, `fail=0`, `successRatePct=100`.
- No unresolved P0 smoke/realtime blockers reproduced during checkpoint execution.

## Day 14 Conclusion
- Day 14 objective completed: checkpoint confirms Days 1-13 P0 stabilization scope is closed and stable under repeated automated checks.
- Transition approved to next block: Day 15 backend hardening (coverage prioritization for `orders/realtime/payments` critical paths).

## Day 15 Backend Hardening Prioritization (Coverage Map)
- Built a factual coverage map for backend critical paths (`orders/realtime/payments`) using:
  - test inventory from current `*.spec.ts` suites;
  - regression scripts scope (`regression-smoke`, `regression-offline`, `regression-driver-phase18`, `regression-security-authz`);
  - targeted coverage run:
    `npm test -- --coverage --runInBand --collectCoverageFrom modules/orders/orders.service.ts --collectCoverageFrom modules/realtime/driver.gateway.ts --collectCoverageFrom modules/payments/payments.service.ts`.
- Coverage snapshot (current baseline):
  - `orders.service.ts`: `2.71%` statements, `0%` branches, `0%` functions;
  - `driver.gateway.ts`: `65.74%` statements, `59.85%` branches, `66.66%` functions;
  - `payments.service.ts`: `59.74%` statements, `44.87%` branches, `83.33%` functions.

## Day 15 Priority Matrix (critical-path test gaps)
1. P1-HIGH: `orders.service.ts`
   - Largest risk concentration: order lifecycle decisions and sync flows are mostly exercised only through smoke/integration scripts.
   - Unit-level gaps to close first: `createOrder`, `accept/start/finish/cancel` transition guards, passenger cancel policy, `pushMobileSyncCommands`, driver availability reconciliation.
2. P1-MEDIUM: `payments.service.ts`
   - Existing tests cover webhook replay/signature/3DS and reconciliation basics, but branch coverage remains limited.
   - Next gaps: provider failure mapping, settlement/reconcile edge states, timeout/fallback branches, negative idempotency paths.
3. P2-MEDIUM: `driver.gateway.ts`
   - Ack-path is now well protected, but connection lifecycle and auth/disconnect branches remain partially uncovered.
   - Next gaps: `handleConnection`/`handleDisconnect` negative paths, malformed WS payload branches outside `driver.location.update`.

## Day 15 Execution Plan for Days 16-18
- Day 16: start with `orders.service.ts` unit suite for deterministic lifecycle transitions and guards.
- Day 17: extend `orders` edge-case coverage (dispatch conflicts, cancel policy, invalid state combinations, idempotency).
- Day 18: expand `payments.service.ts` branch coverage around webhook security policy and reconciliation edge-paths.

## Day 15 Conclusion
- Day 15 objective completed: backend hardening has a quantified priority map and execution order based on real coverage and risk concentration.
- Next: Day 16 implementation of unit tests for key `orders` transitions.

## Day 16 Orders Transition Unit Tests
- Added new critical-path unit suite:
  - `backend/src/modules/orders/orders.service.spec.ts`.
- Implemented transition-focused tests for `OrdersService`:
  - `acceptOrder`: happy-path with `acceptedAt` persistence;
  - `acceptOrder`: rejection when driver already has active order;
  - `startOrder`: invalid transition guard (`INVALID_STATUS:NEW`);
  - `finishOrder`: `IN_PROGRESS -> DONE` with earning/capture side-effects;
  - `cancelOrder`: invalid transition rejection;
  - `cancelOrder`: successful cancellation with void/notification workflow.
- Verification:
  - `npm test -- src/modules/orders/orders.service.spec.ts --runInBand` -> PASS (`6/6`);
  - `npm test -- src/modules/orders/orders.service.spec.ts --coverage --runInBand --collectCoverageFrom modules/orders/orders.service.ts` -> PASS.
- Coverage delta for `orders.service.ts` (targeted run):
  - was `2.71%` statements (Day 15 baseline);
  - now `10.21%` statements (`branch 1.19%`, `func 5.12%`).

## Day 16 Conclusion
- Day 16 objective completed: unit coverage started for highest-risk `orders` transitions with deterministic tests and green run.
- Next: Day 17 expand edge-case coverage for dispatch/accept/start/finish/cancel conflicts and status-guard combinations.

## Day 17 Orders Edge-case Expansion
- Expanded `backend/src/modules/orders/orders.service.spec.ts` with conflict and guard branches for lifecycle transitions:
  - `acceptOrder`: `ORDER_NOT_FOUND`, `NOT_ASSIGNED_TO_THIS_DRIVER`, `INVALID_STATUS`, active-order conflict;
  - `startOrder`: `ORDER_NOT_FOUND`, `NOT_ASSIGNED_TO_THIS_DRIVER`, `INVALID_STATUS`, plus happy-path notification assertion;
  - `finishOrder`: `ORDER_NOT_FOUND`, `NOT_ASSIGNED_TO_THIS_DRIVER`, `INVALID_STATUS`, plus happy-path capture/earning assertions;
  - `cancelOrder`: `ORDER_NOT_FOUND`, `NOT_ASSIGNED_TO_THIS_DRIVER`, `INVALID_STATUS`, plus happy-path void workflow assertion.
- Verification:
  - `npm test -- src/modules/orders/orders.service.spec.ts --runInBand` -> PASS (`17/17`);
  - `npm test -- src/modules/orders/orders.service.spec.ts --coverage --runInBand --collectCoverageFrom modules/orders/orders.service.ts` -> PASS.
- Coverage delta for `orders.service.ts` (targeted run):
  - Day 16: `10.21%` statements (`branch 1.19%`);
  - Day 17: `12.30%` statements (`branch 2.89%`, `func 5.12%`).

## Day 17 Conclusion
- Day 17 objective completed: critical lifecycle edge-cases are now guarded by deterministic unit tests.
- Next: Day 18 payments hardening (webhook security/replay and reconciliation edge branches).

## Day 18 Payments Edge-branch Hardening
- Extended `backend/src/modules/payments/payments.service.spec.ts` with additional edge-branch tests:
  - duplicate webhook event replay path (`replayed=true`, existing webhook reuse);
  - replay guard branch for missing required timestamp (`WEBHOOK_TIMESTAMP_REQUIRED`);
  - reconciliation mismatch branch `PAYMENT_NOT_FOUND` from webhook/provider payment id;
  - empty/clamped security snapshot behavior (`windowMinutes` upper bound, zero totals).
- Verification:
  - `npm test -- src/modules/payments/payments.service.spec.ts --runInBand` -> PASS (`11/11`);
  - `npm test -- src/modules/payments/payments.service.spec.ts --coverage --runInBand --collectCoverageFrom modules/payments/payments.service.ts` -> PASS.
- Coverage delta for `payments.service.ts` (targeted run):
  - previous baseline: `59.74%` statements, `44.87%` branches, `83.33%` funcs;
  - current: `61.90%` statements, `50.00%` branches, `83.33%` funcs.

## Day 18 Conclusion
- Day 18 objective completed: webhook security/replay and reconciliation edge branches are better protected by deterministic tests.
- Next: Day 19 verify and harden refund/reconcile admin flows.

## Day 19 Admin Refund/Reconcile Flow Hardening
- Extended `backend/src/modules/payments/payments.service.spec.ts` for admin operation branches:
  - `refundOrderPayment` (idempotent/admin path) with `FAILED` result when payment is missing;
  - `refundOrderPayment` with `SKIPPED` result on non-refundable status;
  - `refundOrderPayment` with `SUCCESS` result on refundable (`CAPTURED`) payment;
  - reconciliation limit bound behavior (`getReconciliationSnapshot` max clamp to `1000`).
- Verification:
  - `npm test -- src/modules/payments/payments.service.spec.ts --runInBand` -> PASS (`15/15`);
  - `npm test -- src/modules/payments/payments.service.spec.ts --coverage --runInBand --collectCoverageFrom modules/payments/payments.service.ts` -> PASS.
- Coverage delta for `payments.service.ts` (targeted run):
  - Day 18: `61.90%` statements, `50.00%` branches;
  - Day 19: `64.93%` statements, `53.20%` branches (`func 83.33%` unchanged).

## Day 19 Conclusion
- Day 19 objective completed: admin refund/reconcile decision branches now include explicit deterministic tests for `FAILED/SKIPPED/SUCCESS` outcomes.
- Next: Day 20 auth privileged MFA edge-case hardening.

## Day 20 Auth Privileged MFA Edge-case Hardening
- Extended `backend/src/modules/auth/auth.security-flow.spec.ts` with privileged MFA policy edge-cases:
  - reject privileged login when MFA challenge is missing while MFA is configured;
  - reject privileged login with invalid recovery code;
  - reject second login attempt with already consumed recovery code;
  - allow privileged login when `AUTH_PRIVILEGED_MFA_REQUIRED=false` policy flag is disabled.
- Verification:
  - `npm test -- src/modules/auth/auth.security-flow.spec.ts --runInBand` -> PASS (`7/7`);
  - `npm test -- src/modules/auth/auth.security-flow.spec.ts --coverage --runInBand --collectCoverageFrom modules/auth/auth.service.ts` -> PASS.
- Coverage snapshot for `auth.service.ts` (targeted run):
  - `50.60%` statements, `41.11%` branches, `43.58%` funcs.

## Day 20 Conclusion
- Day 20 objective completed: privileged MFA enforcement and recovery-code misuse branches are now explicitly guarded by tests.
- Next: Day 21 negative authz scenarios for admin/dispatcher endpoints.

## Day 21 Negative Authz Scenarios (Admin/Dispatcher Endpoints)
- Extended `backend/scripts/regression-security-authz.js` beyond anonymous (`401`) checks to role-based (`403`) checks with authenticated non-privileged users.
- Added role-forbidden coverage with real passenger/driver tokens:
  - `GET /orders/admin/metrics` (passenger, driver) -> `403`;
  - `GET /ops/dashboard/summary?windowMinutes=60` (passenger) -> `403`;
  - `GET /payments/security/snapshot?windowMinutes=60` (passenger) -> `403`;
  - `POST /orders/admin/actions/:id/force-cancel` (driver) -> `403`.
- Kept existing unauthorized checks:
  - `GET /drivers`,
  - `GET /drivers/:id`,
  - `PATCH /vehicles/:id`,
  - `GET /orders/:id`,
  - `GET /orders/:id/dispatch` -> all `401`.
- Verification:
  - `npm run test:security-authz` -> PASS.

## Day 21 Conclusion
- Day 21 objective completed: admin/dispatcher authz boundaries are now regression-tested for both `401` and `403` classes.
- Next: Day 22 expand `backend/test/app.e2e-spec.ts` with cross-domain scenarios.

## Day 22 Cross-domain E2E Expansion
- Expanded `backend/test/app.e2e-spec.ts` from single-domain pricing checks to cross-domain API coverage with mocked services:
  - `PricingController (e2e)`: tariffs list/upsert;
  - `PaymentsController (e2e)`: webhook ingest, admin refund route, reconciliation snapshot route;
  - `OpsController (e2e)`: liveness, dashboard summary, payments-security snapshot route.
- Kept controller-level guard integration (`JwtAuthGuard`, `RolesGuard`) overridden for focused contract/routing checks in e2e harness.
- Verification:
  - `npm run test:e2e -- --runInBand` -> PASS (`8/8` tests).

## Day 22 Conclusion
- Day 22 objective completed: cross-domain e2e scaffold now covers pricing + payments + ops route contracts in one regression suite.
- Next: Day 23 add DTO validation/contract checks for critical APIs.

## Day 23 DTO Validation Contract Checks (Critical APIs)
- Enhanced `backend/test/app.e2e-spec.ts` with explicit negative contract checks under `ValidationPipe`:
  - `POST /pricing/tariffs` rejects invalid enums (`cityTier`, `serviceLevel`) -> `400`;
  - `POST /payments/orders/:orderId/refund` rejects missing required dto fields (`idempotencyKey`) -> `400`;
  - `POST /payments/webhooks` rejects non-object `payload` -> `400`.
- Updated e2e harness to mirror runtime DTO validation behavior by enabling global validation pipe in test apps:
  - `whitelist: true`,
  - `transform: true`,
  - `forbidUnknownValues: true`.
- Verification:
  - `npm run test:e2e -- --runInBand` -> PASS (`11/11` tests).

## Day 23 Conclusion
- Day 23 objective completed: critical API DTO contracts now have regression guards for invalid payload classes.
- Next: Day 24 stabilize flaky tests and seed/fixture determinism.

## Day 24 Flaky/Fixture Determinism Hardening
- Stabilized authz regression fixture lifecycle in:
  - `backend/scripts/regression-security-authz.js`.
- Hardening implemented:
  - added `.env` loader for deterministic local config resolution;
  - added DB config wiring (`pg` client) aligned with existing regression scripts;
  - `registerUser` now returns created user id;
  - added `cleanupTestUsers()` transaction and `finally` cleanup for created passenger/driver users;
  - preserved `401` + `403` authz assertions while preventing test data accumulation between runs.
- Flakiness verification (repeatability check):
  - `npm run test:security-authz` x3 -> PASS (`3/3`);
  - `npm run test:e2e -- --runInBand` x2 -> PASS (`2/2`).

## Day 24 Conclusion
- Day 24 objective completed: fixture cleanup is deterministic for authz regression, and repeated runs remained stable without intermittent failures.
- Next: Day 25 technical-debt review for `outbox` and `governance`.

## Day 25 Technical-debt Review (`outbox` + `governance`)
- Conducted focused code audit of:
  - `backend/src/modules/outbox/outbox.service.ts`,
  - `backend/src/modules/outbox/outbox-processor.service.ts`,
  - `backend/src/modules/outbox/outbox-event.entity.ts`,
  - `backend/src/modules/governance/governance.service.ts`,
  - `backend/src/modules/governance/governance.controller.ts`,
  - `backend/src/migrations/1710000006000-PaymentsAndOutbox.ts`.

### Findings (priority-ordered)
1. P1: Outbox processor currently marks events as processed without domain handlers.
   - Evidence: `outbox-processor.service.ts` contains explicit stage-1 placeholder and unconditional `markProcessed`.
   - Risk: false-positive delivery status (`PROCESSED`) while no external side-effect actually happens.
2. P1: No automated tests for outbox/governance modules.
   - Evidence: no `*.spec.ts` files under `src/modules/outbox` and `src/modules/governance`.
   - Risk: retry semantics, failure transitions, and retention logic can regress silently.
3. P2: Governance currently provides retention snapshot only; no purge/archive execution path.
   - Evidence: `governance.service.ts` calculates stale count but does not perform data lifecycle actions.
   - Risk: incident/outbox tables may grow unbounded; operational retention policy remains advisory.
4. P2: Outbox retry policy is fixed-delay only and lacks max-attempt/dead-letter governance.
   - Evidence: `markFailed()` schedules `nextAttemptAt` with static delay; no terminal state policy.
   - Risk: poisoned messages can loop indefinitely and consume processing budget.

### Day 26-27 Implementation Backlog (derived from review)
- Day 26 (`outbox` handlers):
  - introduce event handler registry by `topic/eventType`;
  - process only supported events, mark failed on unknown handler;
  - keep `PROCESSED` transition only after handler success.
- Day 26 tests:
  - add `outbox.service` + `outbox-processor.service` specs (reserve/mark/retry/unknown-handler branches).
- Day 27 (`governance` retention actions):
  - add retention execution endpoint/service method (dry-run + execute mode);
  - implement bounded purge/archive strategy with limits and audit metadata;
  - add governance service/controller tests for retention snapshot + purge flow.

## Day 25 Conclusion
- Day 25 objective completed: technical debt in `outbox` and `governance` is documented with concrete risk ranking and implementation-ready backlog for Days 26-27.
- Next: Day 26 implement real outbox handler integrations and processor branch tests.

## Day 26 Outbox Handler Integrations
- Replaced stage-1 placeholder logic in
  `backend/src/modules/outbox/outbox-processor.service.ts` with real handler dispatch:
  - introduced handler registry (`topic:eventType` + `topic:*` resolution);
  - implemented `order.lifecycle:*` handler with concrete side-effect integration:
    - publishes notifications via `NotificationsService` for actor-bound lifecycle events:
      - driver actor -> `DRIVER_ORDER_STATUS_CHANGED`,
      - passenger actor -> `PASSENGER_ORDER_STATUS_CHANGED`;
  - added explicit unknown-handler failure path:
    - throws `OUTBOX_HANDLER_NOT_FOUND:<topic>:<eventType>`;
    - event is marked `FAILED` with retry delay instead of false `PROCESSED`.
- Wiring updates:
  - `backend/src/modules/outbox/outbox.module.ts` now imports `NotificationsModule`.
- Added processor tests:
  - `backend/src/modules/outbox/outbox-processor.service.spec.ts`.
  - covered branches:
    1. known handler success -> notification publish + `markProcessed`;
    2. unknown handler -> `markFailed`;
    3. handler exception -> `markFailed`.
- Verification:
  - `npm test -- src/modules/outbox/outbox-processor.service.spec.ts --runInBand` -> PASS (`3/3`);
  - `npm run build` -> PASS.

## Day 26 Conclusion
- Day 26 objective completed: outbox processor now has real integration handlers and deterministic failure behavior for unsupported or failed events.
- Next: Day 27 implement governance retention execution (purge/archive strategy) with tests.

## Day 27 Governance Retention Execution (Dry-run + Bounded Purge)
- Implemented retention execution path in `governance`:
  - service updates in `backend/src/modules/governance/governance.service.ts`:
    - normalized retention/env bounds;
    - new `executeRetention({ dryRun, limit })`;
    - bounded execution limit (max `5000`);
    - dry-run reporting with candidate counts;
    - execute mode with bounded purge (`delete` by candidate ids) and remaining estimate;
    - explicit archive strategy metadata (`ARCHIVE_STORE_NOT_CONFIGURED`) to keep behavior transparent until archive backend is introduced.
  - controller updates in `backend/src/modules/governance/governance.controller.ts`:
    - new admin-only endpoint `POST /governance/retention/execute`.
  - new dto contract:
    - `backend/src/modules/governance/dto.ts` (`dryRun`, `limit` validation/transform).
- Added tests:
  - `backend/src/modules/governance/governance.service.spec.ts`;
  - `backend/src/modules/governance/governance.controller.spec.ts`.
  - covered: snapshot, dry-run no-delete, execute purge, limit clamp, controller payload forwarding.
- Verification:
  - `npm test -- src/modules/governance/governance.service.spec.ts src/modules/governance/governance.controller.spec.ts --runInBand` -> PASS (`6/6`);
  - `npm run build` -> PASS.

## Day 27 Conclusion
- Day 27 objective completed: governance retention now supports operational dry-run/execute workflow with bounded purge semantics and automated coverage.
- Next: Day 28 checkpoint #2 (backend quality gate stabilization review).

## Day 28 Checkpoint #2 (Backend Quality Gates Stability)
- Executed full checkpoint gate pack after Days 15-27 hardening:
  - `npm run test:preflight-runtime` -> initial FAIL due stale port `3000` (`backendPort occupied`), remediated by stopping stale process, rerun -> PASS;
  - `npm test -- --runInBand` -> PASS (`14/14` suites, `71/71` tests);
  - `npm run test:e2e -- --runInBand` -> PASS (`11/11`);
  - `npm run test:security-authz` -> PASS (`401 + 403` matrix);
  - `npm run test:smoke` -> PASS;
  - `npm run test:offline` -> PASS;
  - `npm run test:driver-phase18` -> PASS;
  - `npm run build` -> PASS.
- Runtime/ops health snapshot at checkpoint:
  - `GET /ops/health/live` -> `ok`;
  - `GET /ops/health/ready` -> `ready=true`;
  - `GET /ops/health/dependencies` -> `healthy=true`;
  - `GET /ops/dashboard/summary?windowMinutes=60`:
    - `alerts.openCount=0`,
    - `realtimeAck.total=12`, `ok=12`, `fail=0`, `successRatePct=100`.

## Day 28 Conclusion
- Day 28 objective completed: backend quality gate is stable end-to-end after the hardening block (Days 15-27), with no reproduced blockers across unit/e2e/security/regression/runtime gates.
- Next: Day 29 frontend/map UX audit kickoff (passenger dashboard + map UX debt backlog).

## Day 29 Frontend UX + Map UX Debt Audit
- Performed focused UX audit for:
  - `frontend/src/pages/PassengerDashboard.tsx`,
  - `frontend/src/pages/DriverDashboard.tsx`,
  - `frontend/src/components/MapPlaceholder.tsx`,
  - `frontend/src/pages/Index.tsx`.
- Produced standalone audit artifact (Canvas):
  - `C:/Users/moroz/.cursor/projects/c-Users-moroz-OneDrive-taxi-platform/canvases/day-29-ux-map-audit.canvas.tsx`.

### Key Findings (priority)
1. P0: Passenger booking still depends on manual lat/lng inputs; no in-flow map picker/search UX.
2. P1: Route preview/ETA/live-driver visualization is absent in passenger active order flow.
3. P1: Map integration is isolated to landing page; dashboard flows are not map-native.
4. P1: No explicit degraded-mode fallback UX when map API/geocoding is unavailable.
5. P2: History/active cards are id-centric and expose low contextual value (pickup/dropoff readability debt).

### Day 30-34 Execution Backlog Prepared
- Day 30: web map contracts and fallback UX policy.
- Day 31: backend geo adapter wiring in frontend calls.
- Day 32: passenger map shell.
- Day 33: pricing + ETA coupling with map-selected route.
- Day 34: driver map flow with realtime updates.

## Day 29 Conclusion
- Day 29 objective completed: UX/map debt is audited and transformed into implementation-prioritized backlog for map integration block.
- Next: Day 30 map integration design (web/mobile/backend contracts, keys, limits, fallback mode).

## Day 30 Yandex Maps Integration Design
- Produced formal integration blueprint:
  - `infra/runbooks/yandex-maps-integration-design.md`.
- Covered design scope:
  - backend geo facade contracts (`suggest`, `geocode`, `reverse`, `route-estimate`);
  - shared DTO normalization rules for web/mobile;
  - key management and security policy;
  - runtime limits (timeout/retry/rate-control/cache);
  - degraded fallback behavior (`YANDEX` -> `INTERNAL` / manual coordinates UX);
  - observability metrics for map SLA.
- Produced visual implementation artifact (Canvas):
  - `C:/Users/moroz/.cursor/projects/c-Users-moroz-OneDrive-taxi-platform/canvases/day-30-yandex-maps-design.canvas.tsx`.
- Prepared execution path for Days 31-34:
  - Day 31 backend adapter wiring,
  - Day 32 passenger map shell,
  - Day 33 pricing/ETA coupling,
  - Day 34 driver map flow.

## Day 30 Conclusion
- Day 30 objective completed: map integration architecture and operational policy are now documented and implementation-ready.
- Next: Day 31 implement backend geo adapter and normalized map response contracts.

## Day 31 Backend Geo Adapter + Normalized Contracts
- Implemented provider-based geo adapter architecture in backend:
  - provider contract: `backend/src/modules/geo/geo-provider.ts`;
  - shared normalized response types: `backend/src/modules/geo/geo.types.ts`;
  - providers:
    - `backend/src/modules/geo/providers/internal-geo.provider.ts`,
    - `backend/src/modules/geo/providers/yandex-geo.provider.ts`.
- Implemented normalized geo API DTOs:
  - `backend/src/modules/geo/dto.ts`.
- Exposed geo API endpoints:
  - `backend/src/modules/geo/geo.controller.ts`:
    - `POST /geo/suggest`,
    - `POST /geo/geocode`,
    - `POST /geo/reverse`,
    - `POST /geo/route-estimate`.
- Updated geo service/module wiring:
  - `backend/src/modules/geo/geo.service.ts` now supports provider selection (`GEO_PROVIDER`) with fallback mode (`GEO_FALLBACK_ENABLED`);
  - `backend/src/modules/geo/geo.module.ts` now registers controller + providers.
- Compatibility preserved:
  - existing synchronous `estimateRoute()` path used in orders remains supported via internal provider sync estimator.
- Added tests:
  - `backend/src/modules/geo/geo.service.spec.ts`:
    - internal default path;
    - Yandex failure fallback to internal;
    - error propagation when fallback disabled.
- Verification:
  - `npm test -- src/modules/geo/geo.service.spec.ts --runInBand` -> PASS (`3/3`);
  - `npm run build` -> PASS.

## Day 31 Conclusion
- Day 31 objective completed: backend now has adapterized geo provider layer and normalized contracts ready for frontend/mobile map-shell integration.
- Next: Day 32 implement web passenger map shell (map init, markers, point selection, API error handling).

## Day 32 Web Passenger Map Shell
- Implemented passenger map shell in:
  - `frontend/src/pages/PassengerDashboard.tsx`.
- Added map-shell capabilities:
  - Yandex map initialization in dashboard flow;
  - map click point selection mode (`from` / `to`);
  - dynamic A/B marker placement tied to current coordinates;
  - route preview block (`distanceKm`, `estimatedDurationMin`, provider/fallback flags).
- Added backend geo API client bindings:
  - `frontend/src/services/passengerApi.ts`:
    - `reverseGeocodePoint()` -> `POST /geo/reverse`;
    - `estimateGeoRoute()` -> `POST /geo/route-estimate`.
- Integrated geo responses into booking UX:
  - reverse geocode on map click updates pickup/dropoff address fields;
  - route estimate action renders compact route preview in active order panel.
- Added degraded mode / API error handling in UI:
  - explicit warning if map API is unavailable;
  - warning when fallback geocoder is used;
  - warning when route response is invalid or estimation fails.
- Verification:
  - `frontend npm run build` -> PASS.

## Day 32 Conclusion
- Day 32 objective completed: passenger dashboard now has operational map-shell primitives (init, markers, point selection, geo API error/fallback handling) instead of manual-only coordinate flow.
- Next: Day 33 couple route estimate with pricing preview and tighten validation of point selection in booking flow.

## Day 33 Route/ETA Coupling + Point Validation Hardening
- Strengthened passenger booking flow in:
  - `frontend/src/pages/PassengerDashboard.tsx`.
- Added strict point validation gate for all route/fare/order actions:
  - numeric parse for `from/to lat/lng`;
  - coordinate range checks (`lat [-90..90]`, `lng [-180..180]`);
  - rejection of identical A/B points.
- Coupled route estimate with fare/order actions:
  - introduced `ensureRouteEstimate()` orchestration;
  - `Рассчитать тариф` and `Создать заказ` now first require successful `POST /geo/route-estimate`;
  - fare preview now includes route context (`distanceKm`, `estimatedDurationMin`) when available.
- Improved degraded UX behavior:
  - explicit validation message in map panel when points are invalid;
  - route preview reset when coordinates change, preventing stale ETA usage.
- Verification:
  - `frontend npm run build` -> PASS;
  - lint diagnostics for updated file -> no errors.

## Day 33 Conclusion
- Day 33 objective completed: passenger flow now operationally binds map route estimate to pricing preview and prevents invalid point selections from reaching fare/order API paths.
- Next: Day 34 implement driver map flow (map-centric active order visibility and movement UX) and align with the same geo fallback behavior.

## Day 34 Driver Map Flow + ETA Updates
- Implemented map-centric active order block in driver dashboard:
  - `frontend/src/pages/DriverDashboard.tsx`.
- Added map runtime for active driver order:
  - map initialization with Yandex Maps;
  - placemarks for driver position (blue), pickup A (green), dropoff B (red);
  - active order coordinates rendered directly in card.
- Added driver-side route estimate actions:
  - `ETA до A` (driver location -> pickup);
  - `ETA A→B` (pickup -> dropoff).
- Added geo client method:
  - `frontend/src/services/driverAppApi.ts`:
    - `estimateDriverGeoRoute()` -> `POST /geo/route-estimate`.
- Added degraded mode handling in driver UX:
  - warning when map API is unavailable;
  - warning when geolocation is unavailable or fails;
  - warning on route-estimate API failure / incomplete payload;
  - fallback-mode flag surfaced in ETA info text.
- Verification:
  - `frontend npm run build` -> PASS;
  - lint diagnostics for updated files -> no errors.

## Day 34 Conclusion
- Day 34 objective completed: driver flow now has map-native active order visibility and ETA refresh paths (to pickup and trip leg) with explicit fallback/error handling.
- Next: Day 35 align admin/ops map observability widgets and finalize cross-role map UX consistency checks.

## Day 35 Frontend Test Hardening (Auth + apiClient + Map Widgets)
- Added auth flow request-contract tests:
  - `frontend/src/services/authApi.test.ts`;
  - coverage includes:
    - `loginByPhonePassword`,
    - `registerByPhonePassword`,
    - `refreshAccessToken`,
    - `logoutSession`.
- Added `apiClient` reliability tests:
  - `frontend/src/lib/apiClient.test.ts`;
  - coverage includes:
    - retry behavior for `5xx` responses;
    - token refresh flow on `401` with request replay;
    - local storage token update after refresh.
- Added map widget API client tests:
  - `frontend/src/services/passengerApi.test.ts`:
    - `/geo/reverse`,
    - `/geo/route-estimate`;
  - `frontend/src/services/driverAppApi.test.ts`:
    - `/geo/route-estimate` for driver ETA widgets.
- Verification:
  - `frontend npm run test -- src/services/authApi.test.ts src/lib/apiClient.test.ts src/services/passengerApi.test.ts src/services/driverAppApi.test.ts` -> PASS (`9/9`);
  - lint diagnostics for new test files -> no errors.

## Day 35 Conclusion
- Day 35 objective completed: frontend now has explicit regression coverage for auth API contracts, apiClient retry/refresh reliability path, and map-widget geo endpoint bindings.
- Next: Day 36 expand frontend integration tests for passenger/driver map flows and start mobile readiness block.

## Day 36 Passenger/Driver Map Journey Integration Tests
- Added passenger map journey integration coverage:
  - `frontend/src/pages/PassengerDashboard.map.integration.test.tsx`.
- Passenger scenario covered:
  - map click selection for pickup/dropoff;
  - reverse geocode binding;
  - route estimate call;
  - order creation triggered through map-selected points.
- Added driver map journey integration coverage:
  - `frontend/src/pages/DriverDashboard.map.integration.test.tsx`.
- Driver scenarios covered:
  - `ETA A→B` route estimation from active order coordinates;
  - `ETA до A` route estimation after resolving driver geolocation.
- Test strategy:
  - page-level render with `QueryClientProvider` + `MemoryRouter`;
  - mocked Yandex Maps runtime (`window.ymaps`) and geolocation;
  - assertions on geo API contracts and orchestration flow.
- Verification:
  - `frontend npm run test -- src/pages/PassengerDashboard.map.integration.test.tsx src/pages/DriverDashboard.map.integration.test.tsx` -> PASS (`3/3`);
  - lint diagnostics for new files -> no errors.

## Day 36 Conclusion
- Day 36 objective completed: passenger/driver map journeys now have integration-level frontend coverage for end-user map actions and geo route orchestration.
- Next: Day 37 prepare web realtime layer (socket client + query sync) with map-state synchronization.

## Day 37 Web Realtime Layer (Socket Client + Query Sync + Map-State Sync)
- Added web realtime socket client manager:
  - `frontend/src/lib/realtime/socketClient.ts`;
  - supports:
    - namespace-based sockets (`/passenger`, `/driver`);
    - token-based auth handshake;
    - ref-counted acquire/release lifecycle to avoid duplicate connections.
- Added passenger realtime query-sync hook:
  - `frontend/src/features/realtime/usePassengerRealtime.ts`;
  - handles:
    - `order.status`,
    - `order.driver.snapshot`,
    - `order.driver.location`;
  - updates `react-query` cache (`passenger-active-order`) and invalidates order history when needed.
- Added driver realtime query-sync hook:
  - `frontend/src/features/realtime/useDriverRealtime.ts`;
  - handles:
    - `order.offer`,
    - `order.offer.closed`,
    - `order.cancelled`;
  - synchronizes dashboard state with query invalidation and realtime offer updates.
- Integrated realtime layer into dashboards:
  - `frontend/src/pages/PassengerDashboard.tsx`:
    - connected to passenger realtime hook;
    - map-state synchronization: live driver location marker rendered from realtime events.
  - `frontend/src/pages/DriverDashboard.tsx`:
    - connected to driver realtime hook;
    - realtime offer summary displayed when active card is not yet loaded.
- Dependency update:
  - added `socket.io-client` to frontend dependencies.
- Verification:
  - `frontend npm run build` -> PASS;
  - `frontend npm run test -- src/pages/PassengerDashboard.map.integration.test.tsx src/pages/DriverDashboard.map.integration.test.tsx` -> PASS (`3/3`);
  - lint diagnostics for changed files -> no errors.

## Day 37 Conclusion
- Day 37 objective completed: web realtime foundation is now in place with reusable socket client abstraction, cache synchronization hooks, and initial map-state sync in passenger/driver dashboards.
- Next: Day 38 integrate realtime stream deeper into passenger order lifecycle and live driver movement UX (state transitions + visual updates).

## Day 38 Passenger Realtime Lifecycle + Live Driver UX
- Enhanced passenger realtime hook behavior:
  - `frontend/src/features/realtime/usePassengerRealtime.ts`.
- Improvements implemented:
  - decoupled socket lifecycle from active order subscription to avoid reconnect loops on order switch;
  - explicit `connect` / `disconnect` handling with connection-state callback;
  - explicit order status callback for UI-level lifecycle rendering;
  - active order subscribe replay when order id changes while socket remains connected.
- Expanded passenger map UX with realtime visibility:
  - `frontend/src/pages/PassengerDashboard.tsx`.
- Added realtime UI/UX primitives:
  - online/offline realtime badge;
  - live order status text fed from realtime events;
  - timestamp of latest realtime event;
  - live driver coordinate readout;
  - follow-driver mode toggle (auto map center updates on incoming location stream).
- Added focused hook-level regression test:
  - `frontend/src/features/realtime/usePassengerRealtime.test.tsx`;
  - validates:
    - join + subscribe flow;
    - status/location event handling;
    - react-query cache synchronization;
    - switching active order without repeated socket acquire.
- Stabilized existing integration tests by mocking realtime hooks:
  - `frontend/src/pages/PassengerDashboard.map.integration.test.tsx`;
  - `frontend/src/pages/DriverDashboard.map.integration.test.tsx`.
- Verification:
  - `frontend npm run test -- src/features/realtime/usePassengerRealtime.test.tsx src/pages/PassengerDashboard.map.integration.test.tsx src/pages/DriverDashboard.map.integration.test.tsx` -> PASS (`4/4`);
  - `frontend npm run build` -> PASS;
  - lint diagnostics for changed files -> no errors.

## Day 38 Conclusion
- Day 38 objective completed: passenger order lifecycle and live driver map movement now consume realtime stream with explicit connection/status telemetry and stable subscription semantics.
- Next: Day 39 integrate realtime stream deeper into driver active order panel and live route update UX.

## Day 39 Driver Realtime Panel + Live Route Updates
- Enhanced driver realtime hook:
  - `frontend/src/features/realtime/useDriverRealtime.ts`.
- Added capabilities:
  - connection state tracking (`connected`);
  - socket lifecycle stabilization via memoized return contract;
  - `sendLocationUpdate()` helper that emits `driver.location.update`.
- Integrated realtime deeper into driver active order panel:
  - `frontend/src/pages/DriverDashboard.tsx`.
- UX additions in active order block:
  - realtime online/offline badge;
  - timestamp of last realtime event;
  - live tracking toggle (geolocation watcher on/off);
  - live ETA toggle (auto-recalculation loop on movement).
- Implemented live movement route updates:
  - geolocation `watchPosition` started for active order when live tracking enabled;
  - each position update:
    - updates driver marker on map,
    - emits websocket location update with sequence/clientTs metadata;
  - in `ASSIGNED` status, route ETA to pickup auto-refreshes with throttling.
- Added hook-level test coverage:
  - `frontend/src/features/realtime/useDriverRealtime.test.tsx`;
  - validates:
    - offer event handling,
    - `driver.location.update` emission path,
    - cleanup/release behavior.
- Updated integration test compatibility:
  - `frontend/src/pages/DriverDashboard.map.integration.test.tsx` now mocks `watchPosition/clearWatch` and realtime hook return contract.
- Verification:
  - `frontend npm run test -- src/features/realtime/useDriverRealtime.test.tsx src/features/realtime/usePassengerRealtime.test.tsx src/pages/DriverDashboard.map.integration.test.tsx src/pages/PassengerDashboard.map.integration.test.tsx` -> PASS (`5/5`);
  - `frontend npm run build` -> PASS;
  - lint diagnostics for changed files -> no errors.

## Day 39 Conclusion
- Day 39 objective completed: driver active order panel now consumes realtime stream as a first-class UX layer, including websocket-backed live location push and automatic ETA refresh while moving.
- Next: Day 40 checkpoint #3 (frontend UX + web realtime + baseline map flow) and close remaining integration gaps before mobile block.

## Day 40 Checkpoint #3 (Frontend UX + Realtime + Map Flow)
- Goal:
  - validate checkpoint #3 readiness:
    - frontend UX baseline;
    - web realtime wiring;
    - passenger/driver map journey stability.
- Checkpoint quality gate execution (frontend):
  - `npm run lint` -> PASS with **0 errors** (existing non-blocking warnings only);
  - `npm run test` -> PASS (`22/22`);
  - `npm run build` -> PASS.
- Blockers encountered and resolved inside checkpoint:
  - PowerShell command chaining incompatibility (`&&`) handled by sequential execution strategy;
  - realtime/map test hang under full suite:
    - fixed geolocation mock behavior for `watchPosition/clearWatch`;
    - added runtime guards in `DriverDashboard` for missing geolocation watcher API;
    - stabilized hook return identity in `useDriverRealtime` and dependency handling to avoid unstable rerender/test behavior.
  - lint blockers removed:
    - eliminated new `no-explicit-any` violations in realtime tests and map event typing.
- Validation scope confirmed:
  - passenger realtime + map lifecycle:
    - order status telemetry,
    - live driver location marker,
    - follow-driver UX;
  - driver realtime + live route flow:
    - realtime offer panel sync,
    - websocket location push (`driver.location.update`),
    - auto ETA refresh in active trip contexts.

## Day 40 Conclusion
- Checkpoint #3 completed: frontend web UX/realtime/map stack is stable and passes operational quality gates (lint errors=0, tests green, build green).
- Next: Day 41 mobile onboarding day (toolchain bootstrap + first guided Flutter loop for a solo developer without prior mobile experience).

## Day 41 Mobile Onboarding (Recovered and Completed)
- Planned onboarding scope:
  - bootstrap Flutter SDK and Android toolchain;
  - run `flutter doctor -v`;
  - execute first mobile unit test;
  - capture personal checklist and unblock next mobile days.
- Recovery and execution steps:
  - validated downloaded standalone binary: `C:/Users/moroz/Downloads/puro.exe --version` -> `Puro 1.5.0`;
  - created and activated environment in project context:
    - `puro create stable`;
    - `puro use stable` in `mobile/flutter_taxi_app`;
  - validated Flutter runtime:
    - `puro flutter --version` -> `Flutter 3.41.7`, `Dart 3.11.5`;
  - installed mobile dependencies:
    - `flutter pub get` -> dependencies resolved and downloaded;
  - validated test baseline:
    - `flutter test` -> PASS (`offline_command_queue_test.dart`, `2/2`);
  - installed Android stack components:
    - `winget install --id Google.AndroidStudio -e`;
    - `winget install --id Google.PlatformTools -e`;
    - installed Android `cmdline-tools` into `C:/Users/moroz/AppData/Local/Android/sdk/cmdline-tools/latest`;
  - accepted Android licenses:
    - `flutter doctor --android-licenses` -> `All SDK package licenses accepted`.
- Final verification:
  - `flutter doctor -v` -> Flutter `OK`, Android toolchain `OK`, emulator detected, licenses accepted;
  - remaining doctor warning is non-blocking for mobile app scope: missing Visual Studio workload (required only for Windows desktop target).
- Artifacts:
  - `infra/runbooks/mobile-onboarding-checklist-2026-04-21.md` (recovery checklist remains valid as fallback);
  - this runbook section updated from blocked to completed state.

## Day 41 Conclusion
- Day 41 is `DONE`: mobile onboarding exit criteria met, toolchain and tests are operational in `mobile/flutter_taxi_app`.
- Next: proceed to Day 42 mobile product tasks (auth UI/sync/realtime expansion) with no tooling blocker.

## Day 42 Mobile Login UI + AuthRepository Binding
- Planned scope:
  - add mobile login UI;
  - bind UI with `auth_repository`;
  - validate that sync/realtime actions are available only after auth.
- Delivered:
  - updated `mobile/flutter_taxi_app/lib/main.dart`:
    - added phone/password fields and login/logout actions;
    - wired login flow to `AuthRepository.login(phone, password)`;
    - wired logout flow to `AuthRepository.logout()`;
    - added startup session restore via `AuthRepository.loadSession()`;
    - added auth session status block (role, userId, token preview);
    - gated sync/realtime buttons when no active session exists.
- Validation:
  - `flutter analyze` -> PASS (`No issues found`);
  - `flutter test` -> PASS (`offline_command_queue_test.dart`, `2/2`).
- Not completed:
  - no dedicated widget/integration auth tests yet (planned for subsequent mobile testing days).
- Risks/notes:
  - default dev credentials are prefilled in UI for local bootstrap convenience and should be moved to safer developer config handling before production hardening.

## Day 42 Conclusion
- Day 42 is `DONE`: mobile app now supports a real auth entry point and session-aware access control for sync/realtime actions.
- Next: Day 43 — remove hardcoded `deviceId` and route it through `app_config` across sync/realtime paths.

## Day 43 DeviceId De-Hardcode in Mobile Sync/Realtime
- Planned scope:
  - remove hardcoded device identifier from mobile sync/realtime paths;
  - route device id through shared mobile config (`app_config`);
  - validate with analyzer/tests.
- Delivered:
  - updated `mobile/flutter_taxi_app/lib/features/orders/sync_engine.dart`:
    - removed static hardcoded `_deviceId`;
    - added constructor-injected `deviceId` field.
  - updated `mobile/flutter_taxi_app/lib/features/realtime/realtime_client.dart`:
    - added constructor-injected `deviceId`;
    - included `deviceId` in socket auth payload for passenger/driver namespaces;
    - included `deviceId` in `passenger.order.subscribe` payload.
  - updated `mobile/flutter_taxi_app/lib/main.dart`:
    - now passes `config.deviceId` to both `SyncEngine` and `RealtimeClient`.
- Validation:
  - `flutter analyze` -> PASS (`No issues found`);
  - `flutter test` -> PASS (`offline_command_queue_test.dart`, `2/2`).
- Not completed:
  - full server-side verification that backend consumes/records `deviceId` from realtime auth payload is pending a dedicated integration day.
- Risks/notes:
  - realtime payload extension (`deviceId`) is backward-compatible, but should be reflected in backend/mobile contract docs during map/realtime integration hardening.

## Day 43 Conclusion
- Day 43 is `DONE`: mobile sync/realtime now uses config-driven `deviceId` instead of hardcoded constants.
- Next: Day 44 — start Flutter map integration (Yandex Maps plugin/SDK, map shell, markers, pickup/dropoff selection).
