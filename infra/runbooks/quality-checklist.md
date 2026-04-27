# Daily Quality Checklist (Taxi Platform)

Use this checklist at the start of each workday and before any release candidate.

## A. Environment Readiness
- [ ] Docker daemon is running.
- [ ] `docker compose up -d` completed successfully from repo root.
- [ ] Postgres and Redis containers are healthy.
- [ ] Backend `.env` is present and points to active DB/Redis.
- [ ] Frontend `.env` has valid `VITE_API_BASE_URL`.
- [ ] (Mobile day) `flutter doctor -v` passes critical checks.

## B. Backend Quality Gates
- [ ] `npm run test:preflight-runtime` passes before backend regression suite.
- [ ] `npm run build` (backend) passes.
- [ ] `npx eslint "{src,apps,libs,test}/**/*.ts"` passes with 0 errors.
- [ ] `npm test -- --runInBand` passes.
- [ ] `npm run test:smoke` passes.
- [ ] `npm run test:offline` passes.
- [ ] `npm run test:driver-phase18` passes.
- [ ] `npm run test:security-authz` passes.

## C. Frontend Quality Gates
- [ ] `npm run lint` (frontend) has 0 errors.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `/` and `/admin` routes return HTTP 200 in local runtime check.

## D. Runtime Health
- [ ] `GET /ops/health/live` returns `ok`.
- [ ] `GET /ops/health/ready` returns `ready=true`.
- [ ] `GET /ops/health/dependencies` returns `healthy=true`.
- [ ] `GET /ops/dashboard/summary?windowMinutes=60` returns expected payload.
- [ ] `GET /ops/dashboard/payments-security?windowMinutes=60` returns valid payload.

## E. Daily Risk Control
- [ ] Any failed check recorded in baseline runbook with timestamp and owner.
- [ ] P0/P1 blockers have action items for next day.
- [ ] No new secret leaks in changeset (`gitleaks`/manual review in CI).

## F. Exit Rule
- [ ] Do not cut release candidate if any P0 check in sections A-D fails.

## G. Client Demo (GitHub Readiness)
- [ ] `stage` environment exists in GitHub with required secrets for release workflow.
- [ ] `Release Stage And Prod` workflow dry-run to `stage` passed in last 24h.
- [ ] Stage URL and `GET /ops/health/ready` are green before client call.
- [ ] Demo admin account is prepared (`node scripts/create-admin.js`).
- [ ] Codespaces fallback was smoke-tested via `scripts/codespaces-demo.sh`.
