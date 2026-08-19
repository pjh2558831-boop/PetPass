# WEEKENDOG performance plan v1

This plan is derived from `performance-baseline-v1.md` and `cleanup-manifest-v1.md`. It preserves all current place coverage, provider truth, recommendation behavior, authentication state, map interactions, responsive UI, API routes, Supabase integration, and production compatibility. It does not authorize Stage 2 or Stage 3 work.

## Priorities and acceptance principles

- P0 fixes correctness or least-privilege blockers before optimizing speed.
- P1 changes target measured user/database cost. P2 improves bundle/runtime efficiency after the data path is bounded. P3 cleanup follows only after caller proof.
- Every performance comparison must repeat the same dataset, viewport, cache state, provider mode, and build mode.
- Preserve 100% of coordinate-valid records for the active category/source/scope. Never meet a target by hiding optional layers, reducing truthful counts, inventing pet policy, or replacing production failure with fixtures.
- Successful live/Preview metrics are required before claiming provider-facing gains. The degraded local API samples are not acceptance baselines.

## Ordered implementation plan

### 1. P0 — make saved recommendations reachable

| Field | Plan |
| --- | --- |
| Current behavior | “일정 저장” writes a bounded, versioned local snapshot. `/itinerary` and “내 일정” read only in-memory PlannerState, so direct navigation/refresh loses visibility. |
| Evidence | Save E2E proves the key is written; caller audit finds `loadSavedRouteRecommendation` only in unit tests. |
| Expected benefit | Restore the advertised save/read contract, enable meaningful saved-itinerary cold/warm measurement, and avoid users repeating provider work. |
| Risk | Snapshot version migration, stale validity wording, precedence between in-memory and saved state, SSR/hydration mismatch. |
| Files likely affected | `lib/storage/recommendation-storage.ts`, `components/itinerary/itinerary-editor.tsx` or a focused saved-route boundary, `/itinerary` presentation, related types/tests. |
| Tests required | Unit version/migration/expiry/corruption; E2E save → navigate → refresh → load; clear/remove if product defines it; 1440/768/390; no geometry/secrets in storage. |
| Rollback | Revert the read integration while retaining current writer/data; no schema rollback. |
| Database migration | No. |
| Remote approval | No, unless product semantics for remove/expiry need user decision. |
| Acceptance | Saved snapshot renders after direct `/itinerary` navigation and refresh; one lazy parse per hydration; corrupted/expired data fails safely; no provider request or N+1 detail call. |

### 2. P0 — review legacy public database execution surface

| Field | Plan |
| --- | --- |
| Current behavior | Anonymous/authenticated roles can execute current sanitized V2/location functions and older V1/bounds functions. |
| Evidence | Supabase security advisor; runtime caller audit uses V2/location and finds a legacy wrapper for bounds. |
| Expected benefit | Reduce unintended public API surface while retaining intentional sanitized catalog access. |
| Risk | Revoking a function used by an old deployed client or operations script. |
| Files likely affected | A new forward-only Supabase migration only after caller proof; legacy wrapper/tests/docs if retired. |
| Tests required | Anonymous allowed/denied matrix, sanitized-column contract, RLS/fail-closed ingest tables, current homepage/explorer. |
| Rollback | Re-grant exact prior signatures in a reversal migration. |
| Database migration | Yes if grants/functions change. |
| Remote approval | Required before applying remotely. |
| Acceptance | Every public `SECURITY DEFINER` function has an active documented caller and fixed search path; obsolete signatures are no longer executable; V2/location behavior unchanged. |

### 3. P1 — replace explorer full-download/page replay with bounded marker and card contracts

| Field | Plan |
| --- | --- |
| Current behavior | Browser downloads all Tourism pages and all 200-row Kakao pages, holds card-shaped records for every marker, and computes ranking/counts/12-card pagination locally. HTTP page N replays RPC pages 1…N. |
| Evidence | 1,824-place fixture response is 1,463,637 bytes for 12 visible cards; source trace proves O(P²) catalog RPC amplification. |
| Expected benefit | Lower transfer, parse, memory, database, and rerender cost while preserving complete active-marker coverage and truthful counts. |
| Risk | Marker/card sorting drift, missing provider fields, inconsistent totals, lost optional records, cursor bugs. |
| Files likely affected | `app/api/map/places/route.ts`, `app/api/tour/places/route.ts` or a composed explorer route, `lib/map-places/public-catalog.ts`, catalog types/schemas, `components/places/results-explorer.tsx`, card/map adapters. |
| Tests required | Compact marker schema excludes address/phone/image/evidence; cards exactly 12; all active coordinate-valid IDs preserved; stable sort/counts; category/source/district/bounds keys; no page/sort marker refetch; no duplicate request key; provider errors remain errors. |
| Rollback | Keep old route/adapter behind a short-lived local compatibility branch or revert route/client atomically; do not maintain two production truths indefinitely. |
| Database migration | Possibly, but first iteration should use the existing schema/RPC contract where practical. |
| Remote approval | Required only for a migration or remote function/grant change. |
| Acceptance | At least 40% lower marker/catalog JSON than 1,463,637 B on the same 1,824 fixture; 12 card rows; 1,824 active markers; identical category/source totals; page N causes at most one bounded database page operation rather than replay. |

Design direction: a compact marker DTO should contain only stable identity, provider/source kind, category, coordinates, compact assessment state, and scope/district fields actually needed by the map. A separate server-paged card DTO supplies the current 12 cards. Full detail/evidence remains lazy at the detail route. Exact canonical fields must be adapted to existing project types rather than copying a generic schema.

### 4. P1 — optimize `get_public_map_catalog_v2` from plan evidence

| Field | Plan |
| --- | --- |
| Current behavior | 200-row function scan executes in 312.809 ms with 4,976 shared-hit blocks; query aggregates hit keys broadly and computes an exact window count. |
| Evidence | Read-only connected `EXPLAIN (ANALYZE, BUFFERS)` and migration SQL. |
| Expected benefit | Lower warm API latency and database CPU; remove multiplication from client page replay. |
| Risk | Changed ranking/popularity, inaccurate counts, extra write cost from speculative indexes, SQL security regression. |
| Files likely affected | New Supabase migration, generated database types, catalog repository/tests/docs. Do not edit old migrations. |
| Tests required | Result equivalence for IDs/order/counts, lifecycle/public filters, query-hit popularity, keyset boundaries, anonymous grants, search-path security; before/after plans on representative parameters. |
| Rollback | Version a new function or include a reversal migration restoring prior body/grants; keep API adapter rollbackable. |
| Database migration | Yes for function/index changes. |
| Remote approval | Required before applying to connected Supabase. |
| Acceptance | At least 50% lower warm execution than 312.809 ms for the same 200-row plan, no increase in returned columns/rows, no count/ranking drift, no new sequential scan regression on scoped calls. |

Implementation sequence: first obtain plans for the inner filtered relation and hit aggregation; restrict aggregation to candidate IDs in scope or use a pre-aggregated/batched relation where truth is preserved; separate/cached exact count only if it remains truthful; then consider an index only when the revised plan identifies a missing access path. Record index write/storage cost. Do not drop advisor-reported indexes in this change.

### 5. P1 — lazy-load optional homepage layers and separate marker/card payloads

| Field | Plan |
| --- | --- |
| Current behavior | One browser request is single-flight, but the server always launches three catalog queries plus Tourism; optional veterinary/pet-shop layers are initially disabled. Marker records repeat address/phone/link/image/status fields also present in cards. |
| Evidence | `collectHomepagePlacesSnapshot` and serialized snapshot types/callers. Successful live bytes unavailable because the endpoint returned 502. |
| Expected benefit | Fewer initial DB/provider calls, lower response serialization/transfer, faster usable homepage. |
| Risk | Optional count/marker delay, cache-key mistakes, silently changing public counts. |
| Files likely affected | `lib/homepage/homepage-places.ts`, `/api/homepage/places`, homepage map/carousel components, DTO schemas/tests. |
| Tests required | Default request excludes optional details; first activation loads once; repeat activation is cached by scope; marker/card fields and totals stay truthful; client single-flight remains; public/error cache headers. |
| Rollback | Restore current composed snapshot and eager layer calls. |
| Database migration | No for initial separation/lazy loading. |
| Remote approval | No. |
| Acceptance | On a healthy repeatable environment, at least 30% lower initial homepage JSON and fewer initial catalog calls; optional layers appear on first activation and then reuse cache; duplicate identical active-key requests remain zero. |

### 6. P1 — make marker/cluster updates set-diff based

| Field | Plan |
| --- | --- |
| Current behavior | Registry and singleton objects are good, but each data update clears/adds/redraws the full active set. Category off/on deletes and recreates markers; 1,824 becomes 3,648 created objects. |
| Evidence | Deterministic metrics: 20.5 ms marker, 3.1 ms cluster, 220 ms filter round trip, 3,648 created after off/on; source inspection of `updateData`. |
| Expected benefit | Less allocation/listener churn and lower filter/sort cost at larger live scale. |
| Risk | Stale marker visibility, listener leaks, selected marker inconsistency, cluster membership drift. |
| Files likely affected | `lib/kakao/maps.ts`, `components/map/map-panel.tsx`, map instrumentation/tests. |
| Tests required | Stable-ID diff, MarkerImage reuse, listener add/remove counts, sort/page no reset, optional layer cache, selected image, cluster membership, 1,824 coverage, zoom/pan behavior. |
| Rollback | Revert to current full clear/add/redraw while retaining singleton loader/map/clusterer. |
| Database migration | No. |
| Remote approval | No. |
| Acceptance | At least 30% lower 1,824-place filter round trip than 220 ms on the same fixture; unchanged-set sort/page creates zero markers and performs zero full cluster reset; off/on restores all 1,824 markers with no duplicate listeners. Creation-count target should be set after deciding whether inactive markers are cached or safely disposed. |

### 7. P2 — split the explorer client boundary and measure production transfer/hydration

| Field | Plan |
| --- | --- |
| Current behavior | `/results` references 242,249 uncompressed client-manifest bytes and one client component owns fetching, URL state, ranking, cards, filters, and map orchestration. |
| Evidence | Production client-reference manifest and component audit. |
| Expected benefit | Reduce route JS/hydration and isolate map-only code without delaying critical cards. |
| Risk | Additional waterfalls, Suspense/layout shift, lost state coordination, worse LCP. |
| Files likely affected | `app/results/page.tsx`, `components/places/results-explorer.tsx`, focused server/client subcomponents, map loading boundary. |
| Tests required | Production bundle comparison, no hydration/console error, direct URL/query state, keyboard/accessibility, 1440/768/390/320, map/detail navigation. |
| Rollback | Recombine client boundary; no data migration. |
| Database migration | No. |
| Remote approval | No. |
| Acceptance | Reduce `/results` referenced client bytes by at least 15% from 242,249 B or document an equivalent measured hydration/main-thread gain; no LCP/CLS regression; map SDK remains absent from routes without maps. |

### 8. P2 — optimize local hero source assets without visual/licensing drift

| Field | Plan |
| --- | --- |
| Current behavior | Ten used hero PNGs total about 24.8 MB; Next optimized first-image transfer is about 40–48 KB in the local probe. |
| Evidence | Public file sizes, manifest, and browser resource timing. |
| Expected benefit | Smaller repository/build upload and image optimizer source/decode cost; potentially better cache fill. |
| Risk | Visual artifacts, crop/metadata change, large churn, official asset alteration if scope leaks to partner logos. |
| Files likely affected | Only `public/images/home/hero/*` and manifest if extensions change; never partner logos in this task. |
| Tests required | Pixel/dimension/crop review at three viewports, carousel keyboard/reduced-motion, first-only eager request, build and resource-byte comparison. |
| Rollback | Restore original images by checksum. |
| Database migration | No. |
| Remote approval | No, but visual approval recommended. |
| Acceptance | At least 40% lower total hero source bytes with visually equivalent output; no increase over measured optimized first-image transfer; only first slide eager; no broken URL. |

### 9. P3 — execute only approved cleanup-manifest items

| Field | Plan |
| --- | --- |
| Current behavior | Several legacy/compatibility candidates exist, but none has deletion proof. Generated output and five extraneous node_modules packages are rebuildable. |
| Evidence | Caller/script/route audit and `npm ls --depth=0`. |
| Expected benefit | Lower maintenance ambiguity and clean install state; minimal runtime performance impact. |
| Risk | Breaking an operational script/public route, losing provenance, or overwriting user work. |
| Files likely affected | Only an explicit allowlist from `cleanup-manifest-v1.md`. |
| Tests required | Hash backup, reference scan, typecheck/lint per batch, affected tests, then full unit/E2E/build. |
| Rollback | Restore checksummed backup or revert the small batch. |
| Database migration | Not for file cleanup; RPC/index retirement is a separate approved migration. |
| Remote approval | Required for any Supabase/Vercel state; otherwise user approval of deletion list. |
| Acceptance | Zero route/asset/script/fixture loss; lockfile integrity; no test/build regression; retained manual-review list documented. |

## Measurement work required during implementation

Before and after each applicable batch, capture:

- Production-mode or approved Preview TTFB, FCP, LCP, CLS, long tasks, JS/image transfer, request/duplicate/failure counts at 1440, 768, and 390.
- Homepage and explorer success-path handler time, payload bytes, compression headers, database/provider call counts, cache state, and serialization time using non-secret instrumentation.
- Public catalog inner and outer query plans with buffers; do not expose rows.
- SDK load/map init, source marker update, cluster update/reset, filter, zoom/pan, registry/listener/created counts, and heap where the browser supports it.
- Saved recommendation cold/warm/refresh, parse count, storage bytes, network query count, and corruption/version behavior.
- Route-specific compressed and uncompressed JS from the same production build.

INP should be measured only with a valid interaction sample. Hydration should use framework/browser instrumentation rather than `loadEvent` as a proxy. Serialization time should be instrumented around serialization, not inferred by subtracting unrelated timings.

## Database changes requiring explicit approval

1. Any new/versioned public-catalog RPC or function-body change.
2. Any index creation/drop.
3. Any grant/revoke on `SECURITY DEFINER` functions.
4. Any RLS/policy change.

Prepare forward and reversal SQL locally, show before/after query plans, and stop for approval before applying to connected Supabase. No Vercel configuration or deployment is required for Stage 2/initial code work; Preview deployment remains separately opt-in.

## Global rollback strategy

- Use small commit-sized batches: saved correctness, API/DTO, database function, homepage loading, map diff, client bundle, images, cleanup.
- Keep contract changes atomic across schema/type/route/client tests.
- Record baseline fixture and production-build numbers in each batch.
- Roll back the individual batch when correctness, marker coverage, provider truth, accessibility, cache isolation, or a measured performance target regresses.
- Never roll back by substituting demo fixtures, weakening validation, disabling categories, or exposing an older unsafe RPC.

## Stage 1 exit criteria

- Typecheck, lint, unit, isolated E2E, and build are green.
- A repeatable 1,824-marker successful-path baseline and a connected database plan exist.
- Cleanup candidates are classified without deletion.
- P0–P3 work is ordered with evidence, risks, files, tests, rollback, migration/approval requirements, and measurable targets.
- Missing live-provider/in-app-browser measurements are explicitly deferred to a healthy environment and are not represented as successes.

Stage 1 is ready for user review. No later stage begins without explicit approval.
