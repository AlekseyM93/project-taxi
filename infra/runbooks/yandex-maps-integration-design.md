# Yandex Maps Integration Design (Day 30)

## Scope
- Backend, web, and mobile contract design for Yandex Maps integration.
- Runtime policy for API keys, limits, retries, and degraded fallback.
- Delivery target for implementation block (Days 31-34, 44-48).

## Architecture Decisions
- Backend remains the single map-domain facade; web and mobile do not call Yandex HTTP APIs directly.
- Introduce provider abstraction in backend (`MapProviderAdapter`) with two modes:
  - `YANDEX` (primary);
  - `INTERNAL` (fallback/simulator for degraded mode and local development).
- Normalize all geo responses to shared DTO contracts consumed by both web and mobile.
- Route distance/ETA values used in pricing must come from backend normalized route response.

## Backend Contract (Proposed)
- `POST /geo/suggest`
  - input: `query`, optional `cityCode`, optional `limit`
  - output: `items[]` with `addressText`, `lat`, `lng`, `providerMeta`
- `POST /geo/geocode`
  - input: `addressText`, optional `cityCode`
  - output: `point { lat, lng }`, `normalizedAddress`, `confidence`
- `POST /geo/reverse`
  - input: `lat`, `lng`
  - output: `normalizedAddress`, `components`, `cityCode`
- `POST /geo/route-estimate`
  - input: `from { lat, lng }`, `to { lat, lng }`, optional waypoints
  - output: `distanceKm`, `durationMin`, optional `polyline`, `provider`

## Shared DTO Rules
- Coordinates are decimal degrees, WGS84 (`lat`, `lng`), precision up to 6 decimals.
- Distances are in kilometers (`distanceKm`) with max 2 decimals.
- Duration is minutes (`durationMin`) rounded to integer.
- `provider` field is mandatory in all geo responses (`YANDEX` / `INTERNAL`).
- Error payload standard:
  - `code` (`GEO_TIMEOUT`, `GEO_RATE_LIMIT`, `GEO_PROVIDER_UNAVAILABLE`, `GEO_BAD_INPUT`)
  - `message`
  - `fallbackUsed` (boolean)

## Web Integration Plan
- Passenger flow:
  - replace raw coordinate inputs with map picker + suggest search;
  - show route preview and ETA before order confirmation.
- Driver flow:
  - show pickup/dropoff route and live marker updates in active order card.
- Frontend should never store provider-specific map payloads in local state; only normalized DTOs.

## Mobile Integration Plan
- Mobile receives same normalized DTOs as web for route and geocoding.
- Map plugin/SDK integration must bind to backend contracts only.
- Offline mode behavior:
  - preserve selected coordinates;
  - defer route polyline/ETA refresh until connection is restored.

## Keys and Security Policy
- Required backend env keys:
  - `GEO_PROVIDER=YANDEX|INTERNAL`
  - `YANDEX_MAPS_API_KEY`
  - `GEO_TIMEOUT_MS`
  - `GEO_RETRY_COUNT`
  - `GEO_CACHE_TTL_SEC`
  - `GEO_RATE_LIMIT_RPS`
  - `GEO_FALLBACK_ENABLED=true|false`
- Key management requirements:
  - keys are backend-only secrets;
  - do not embed production keys in frontend/mobile bundles;
  - restrict keys by source where supported;
  - rotate keys via deployment config, not code commits.

## Limits, Reliability, and Fallback
- Timeout baseline: `2s` per provider request, max 1 retry for transient errors.
- Rate protection:
  - backend-side per-route throttle for suggest/geocode endpoints;
  - short-lived cache for repeated suggest/reverse requests.
- Fallback policy:
  - when provider is unavailable and `GEO_FALLBACK_ENABLED=true`, return INTERNAL estimate and set `fallbackUsed=true`;
  - when fallback is disabled, return typed geo error and instruct UI to allow manual coordinate entry.

## Observability Requirements
- Add metrics:
  - `geo_requests_total`, `geo_requests_failed`, `geo_fallback_used`, `geo_timeout_count`.
- Add labels:
  - endpoint, provider, outcome (`ok`/`error`), error code.
- Add dashboard section for map SLA:
  - success rate, timeout rate, fallback rate.

## Day 30 Exit Criteria
- Contract blueprint agreed for backend/web/mobile.
- Env/security/limits/fallback policy documented.
- Implementation backlog for Days 31-34 is unblocked.
