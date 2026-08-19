---
name: kakao-integrations
description: Use for PetPass Kakao Maps SDK, map markers and clustering, Local Search or geocoding, place URLs, departure search, Mobility directions, driving routes, or Kakao provider configuration boundaries.
---

# Kakao integrations

Apply [`petpass-project-context`](../petpass-project-context/SKILL.md) first. Pair with `map-catalog-pipeline` for collection or Supabase catalog work and with `petpass-ui-review` for visual map changes.

## Scope and service boundaries

- Maps JavaScript SDK: browser map rendering, markers, clustering, bounds, and selection.
- Kakao Local Search and geocoding: server-side discovery and address lookup.
- Kakao Mobility: server-side directions and travel-time inputs.

Do not treat these as interchangeable services or credentials.

Relevant paths:

- `lib/kakao/` except collection-only concerns handled by `map-catalog-pipeline`
- `components/map/map-panel.tsx`
- `components/places/kakao-place-search.tsx`
- `components/planner/departure-map-picker.tsx`
- `components/planner/departure-search.tsx`
- `app/api/kakao/`, `app/api/geocode/`, `app/api/directions/`
- Kakao-focused unit and e2e tests under `tests/`

## Workflow

1. Identify which Kakao service is involved and inspect its loader/client, Route Handler, types, UI consumer, and tests.
2. Preserve the singleton SDK loading strategy and its required libraries.
3. Preserve map initialization, marker lifecycle, clustering when enabled, category filtering, place selection, sidebar synchronization, bounds behavior, and responsive layout.
4. Validate Local and Mobility responses at server boundaries and maintain typed errors.
5. Keep candidate discovery separate from verified pet-friendly evidence and recommendation eligibility.

## Allowed modifications

Modify relevant Kakao adapters, Route Handlers, map/planner components, types, and focused tests when requested. Change marker assets or UI presentation only with the UI Skill.

## Forbidden modifications

- Never expose or print `KAKAO_REST_API_KEY`; never hardcode either Kakao key.
- Do not move REST API or Mobility calls into the browser.
- Do not rename `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` or alter Kakao console configuration without explicit authorization.
- Do not replace the SDK loader or recreate map instances without tracing current lifecycle behavior.
- Do not call live Kakao services during routine tests.

## Validation

Run `npm run typecheck`, `npm run lint`, relevant `tests/unit/kakao-*.test.ts`, `tests/unit/map-marker-assets.test.ts`, and `npm run build`. For interaction changes, run `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts` and relevant planner tests. Run `npm run verify:kakao-live` only with explicit live-verification authorization.

See [Maps, Local, and Mobility boundaries](references/maps-local-mobility.md).
