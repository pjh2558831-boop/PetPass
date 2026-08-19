---
name: petpass-project-context
description: Use for any PetPass repository task to establish architecture boundaries, safety rules, data provenance requirements, and the minimum validation expected before changing or reviewing code.
---

# PetPass project context

Use this Skill first for PetPass work. Load a specialized PetPass Skill as well when the task touches its area.

## Start safely

1. Read `AGENTS.md`, `package.json`, and the files and tests closest to the request.
2. Run `git status --short` before editing. Treat existing changes as user-owned and do not overwrite or clean them.
3. Trace existing behavior from UI or Route Handler through provider and domain layers before proposing a change.
4. Make the smallest change that satisfies the request. Do not replace a working provider, framework, or architecture for convenience.
5. Inspect configuration names and callers before changing contracts. Do not rename environment variables unless explicitly required and justified.

## Architecture boundaries

- `app/` and `components/`: presentation, navigation, browser interaction, and Route Handlers.
- `lib/tour-api`, `lib/kakao`, `lib/licenses`: provider-specific clients, schemas, normalization, errors, and caching.
- `lib/pet-access`, `lib/itinerary`, `lib/recommendation`, `lib/travel`: deterministic domain decisions, scheduling, ranking, and route calculations.
- `lib/map-places`, `lib/places`, `lib/homepage`: catalog projections, source linking, and presentation data.
- `lib/storage`: versioned, Zod-validated browser persistence.
- `types/` and `lib/shared/domain-schemas.ts`: shared contracts.
- `supabase/migrations`: versioned map-catalog database changes.
- `fixtures/`: visibly labeled demo data only. Production failures must never fall back to fixtures.

Keep provider response validation and normalization at provider boundaries. Keep deterministic policy and recommendation decisions out of UI components and Route Handlers.

## Shared safety rules

- Preserve existing map, authentication-related infrastructure, API routes, Supabase integration, place data, recommendation behavior, responsive UI, and Vercel compatibility unless the user explicitly requests a change.
- Never expose, log, paste, or commit credentials. Server-only secrets include `TOUR_API_SERVICE_KEY`, `KAKAO_REST_API_KEY`, `LOCALDATA_SERVICE_KEY`, `SUPABASE_SECRET_KEY`, and `ROUTE_EDIT_SESSION_SECRET`.
- Among Kakao credentials, only the JavaScript SDK key may be browser-visible as `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`. Never place REST or service keys in `NEXT_PUBLIC_*` variables.
- Treat environment examples as names and documentation only; never copy live values into repository files or command output.
- Never modify production data, production environment variables, Vercel settings, Kakao configuration, or Supabase project state without explicit authorization.
- Never run destructive database operations or live collection commands automatically. Prefer inspection, plans, dry runs, backups, and reversible migrations.
- Validate every external response before it reaches the domain layer. Do not silently weaken schema validation or error handling.
- Never invent pet-policy permissions, restrictions, weights, sizes, areas, or required items. Missing, ambiguous, or conflicting evidence becomes `NEEDS_CONFIRMATION` or the existing unknown state.
- Preserve original source text, source name, stable source identifier when available, and retrieval timestamp through evidence assessment.
- A missing administrative license match is `NO_MATCH`, not proof that a facility is illegal.
- Kakao-discovered places are candidates. Do not silently treat them as authoritative pet-friendly recommendations.
- Do not hide TypeScript, lint, test, or build errors. Do not change tests merely to make an unintended behavior pass.

## Allowed modifications

Modify only paths necessary for the user's request and only after inspecting their callers, contracts, and tests. Documentation, tests, fixtures, and configuration may be updated when they are part of the requested behavior and preserve the boundaries above.

## Validation

Choose validation in proportion to the change, then report commands and results:

1. `npm run typecheck`
2. `npm run lint`
3. Relevant unit tests with `npm run test -- <test files>` or the full `npm run test`
4. `npm run build`
5. `npm run test:e2e` when navigation, browser storage, map interaction, or itinerary interaction changes
6. `npm run verify` for the full non-browser gate

Do not make live provider calls part of routine validation. Use the repository's explicit live verification scripts only when the user authorizes network access and required credentials are available.

## Specialized Skills

- `tourism-service2`: Korea Tourism Organization KorPetTourService2 and TourAPI.
- `kakao-integrations`: Maps JavaScript SDK, Local Search, geocoding, and Mobility directions.
- `map-catalog-pipeline`: Supabase schema, public map catalog, Kakao collection, deduplication, and provenance.
- `place-evidence-verification`: pet-access evidence and verdicts.
- `facility-licensing`: administrative facility license lookup and matching.
- `recommendation-route-engine`: retrieval, scoring, schedule simulation, route optimization, and itinerary generation.
- `petpass-ui-review`: responsive UI and interactive map review.
- `petpass-vercel-release`: local, preview, and production release safety.
- `regression-check`: Playwright CLI verification for meaningful browser-facing changes.
