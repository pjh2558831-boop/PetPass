# WEEKENDOG performance baseline v1

Measured on 2026-08-19 (Asia/Seoul) against the existing PetPass repository whose public product brand is WEEKENDOG. This document is a Stage 1 measurement record, not an implementation result. No application source, dependency, Supabase schema/data, Vercel setting, or provider configuration was changed.

## Scope and measurement rules

- The worktree was already materially dirty before this audit. All pre-existing tracked and untracked changes were treated as user-owned and preserved.
- Cold and warm observations are kept separate. Browser figures are local-development measurements and are not presented as production Web Vitals.
- External-provider calls were limited to two requests per inspected endpoint. The environment returned provider/catalog errors, so those timings are availability evidence rather than successful API performance samples.
- Successful full-explorer and recommendation flows use the repository's deterministic Playwright fixtures. The large-map fixture contains 1,824 coordinate-valid records and preserves the same map code path while avoiding provider traffic.
- The Codex in-app browser was attempted first. Its trusted runtime rejected its own bundled `browser-service.mjs`, so a read-only Playwright/Chromium probe was used for browser timing. No temporary instrumentation file was added.
- Read-only Supabase inspection included catalog metadata, advisors, and `EXPLAIN (ANALYZE, BUFFERS)`. No rows, credentials, raw provider payloads, or authorization headers are included here.

## Skills and checklists applied

| Skill | Applied decision |
| --- | --- |
| `using-agent-skills` | Selected the smallest relevant global and project-specific skill set and read referenced material before analysis. |
| `performance-optimization` | Required a measured baseline, separated cold/warm behavior, avoided speculative indexes, and recorded unmeasured fields explicitly. |
| `code-review-and-quality` | Audited callers, route boundaries, data ownership, generated files, and deletion risk instead of equating “not imported” with “unused.” |
| `security-and-hardening` | Kept secrets and raw rows out of output; reviewed public `SECURITY DEFINER` RPC exposure, server-only keys, RLS, cache isolation, and input validation boundaries. |
| `test-driven-development` | Reused the existing proportional test pyramid and deterministic browser fixtures; did not add tests merely to increase coverage. |
| `petpass-project-context` | Preserved provider truth, architecture boundaries, authentication behavior, map behavior, demo labeling, and Vercel compatibility. |
| `kakao-integrations` | Checked one SDK loader/map/clusterer, marker/listener reuse, source images, optional layers, and provider call boundaries. |
| `map-catalog-pipeline` | Traced collection, public catalog RPCs, keyset pagination, source provenance, lifecycle filters, RLS/grants, and collection scripts. |
| `recommendation-route-engine` | Kept Stage 1–5 recommendation and revalidation boundaries intact and used only a bounded deterministic smoke flow. |
| `regression-check` | Ran desktop/mobile Playwright projects and the critical homepage, explorer, planner, recommendation, storage, and navigation coverage. |
| `petpass-ui-review` | Checked 1440, 768, and 390 responsive contracts, loading/error states, overflow assertions, keyboard semantics, and map/list modes. |
| `tourism-service2` | Treated KorPetTourService2 text as authoritative, avoided live-call repetition, and did not substitute fixtures for production failure. |
| `supabase` and `supabase-postgres-best-practices` | Used read-only advisors/plans; checked explicit projections, pagination, exact counts, aggregation, indexes, RLS, and N+1 risks. |
| `vercel-react-best-practices` and `vercel:nextjs` | Audited client boundaries, request waterfalls, bundle manifests, serialized data, image loading, and route/runtime behavior using the installed Next.js 16 guidance. |

Referenced checklists applied: `definition-of-done.md`, `performance-checklist.md`, `security-checklist.md`, `testing-patterns.md`, the PetPass browser matrix, responsive/map checklist, recommendation validation matrix, Kakao Maps/Local/Mobility reference, catalog schema/RLS and collection runbook, and Tourism operations/visibility reference.

## Current architecture summary

- Next.js 16.2.6 App Router, React 19.2.6, TypeScript 5.9.3, Node 24.15.0, npm 11.12.1.
- `app/` owns pages and Route Handlers; `components/` owns interactive presentation; provider adapters are under `lib/tour-api`, `lib/kakao`, and `lib/licenses`; deterministic decisions are under `lib/pet-access` and `lib/itinerary`; browser persistence is under `lib/storage`.
- Public map data is composed from Korea Tourism Organization records and a Supabase-backed Kakao candidate/facility catalog. The browser receives the complete explorer datasets and performs filtering, ranking, counts, sorting, and 12-card pagination locally.
- No implemented sign-in flow, middleware, or authenticated saved-place/favorite data path was found. Supabase Auth is referenced only by reviewer foreign keys in the inspected catalog schema.
- Implemented persistence is versioned browser storage for pet profile, travel preferences, itinerary draft, and a bounded route-recommendation snapshot.

Repository inventory at measurement time:

| Path | Files | Bytes |
| --- | ---: | ---: |
| `app` | 25 | 108,176 |
| `components` | 44 | 312,468 |
| `lib` | 146 | 821,023 |
| `types` | 22 | 83,330 |
| `scripts` | 32 | 281,554 |
| `tests` | 88 | 816,697 |
| `public` | 20 | 27,821,427 |
| `docs` | 23 before this Stage 1 deliverable | 158,252 |
| `supabase` | 5 | 103,027 |
| `.agents/skills` | 20 | 49,767 |

## Clean-command baseline

| Command | Result | Measurement / notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | 1.890 s |
| `npm run lint` | PASS | 7.441 s; no reported lint warnings |
| `npm run test` | PASS | 67 files, 826 tests, 0 skipped; Vitest 5.60 s, wall 6.359 s. The first sandboxed launch was denied access to esbuild's parent runtime path; the unchanged command passed outside that sandbox. |
| `npm run test:e2e` | PASS in isolated deterministic environment | 157 passed, 9 intentionally skipped, 87.885 s. An initial attempt reused the user's live port-3000 server and failed fixture expectations; after verifying and temporarily stopping only that server, Playwright owned the port with its configured mock environment and passed. The development server was restored afterward. |
| `npm run build` | PASS | 9.068 s wall; compile 1.520 s, TypeScript 5.2 s, 19 static pages generated in 203 ms. No build warning or TypeScript error. |

The generated route list contains `/`, `/itinerary`, `/planner/pet`, `/planner/trip`, `/results`, `/places/[contentId]`, `_not-found`, and 14 Route Handlers. Next reports each application route as dynamic/server-rendered on demand.

## Browser measurements

These figures are from headless Chromium against `next dev` on localhost after a fresh context (“cold”) and same-context reload (“warm”). The probe waits three seconds to let performance observers settle; that fixed wait is not included in the navigation metrics. The live homepage API returned 502, so the page was exercising its real error state. The values are useful for comparison only when the same environment and failure/success state are repeated.

| Viewport | State | TTFB ms | FCP ms | LCP ms | CLS | Long tasks (total ms) | Resource transfer | JS transfer | Image transfer | Requests | Duplicate URLs | Failed / console errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440×1000 | cold | 100.9 | 196 | 500 | 0.109 | 2 (126) | 1,000,354 B | 813,614 B | 47,888 B | 29 | 0 | 1 / 1 |
| 1440×1000 | warm | 76.1 | 100 | 424 | 0.109 | 0 (0) | 8,582 B | 6,000 B | 1,200 B | 29 | 0 | 1 / 1 |
| 768×1024 | cold | 76.5 | 212 | 280 | 0 | 2 (157) | 1,000,354 B | 813,614 B | 47,888 B | 29 | 0 | 1 / 1 |
| 768×1024 | warm | 75.7 | 96 | 428 | 0 | 0 (0) | 8,582 B | 6,000 B | 1,200 B | 29 | 0 | 1 / 1 |
| 390×844 | cold | 68.9 | 208 | 276 | 0 | 2 (158) | 912,780 B | 813,614 B | 39,820 B | 29 | 0 | 1 / 1 |
| 390×844 | warm | 69.3 | 88 | 400 | 0 | 0 (0) | 8,582 B | 6,000 B | 1,200 B | 29 | 0 | 1 / 1 |

Interpretation:

- The 813,614-byte cold JS value is a development-server transfer and must not be compared directly with production-build manifest bytes.
- Desktop CLS 0.109 requires a successful-provider remeasurement before attributing it to the normal homepage. The failure-state UI and map/data transition are part of this sample.
- The probe observed no repeated identical request URL within a navigation. It did observe the expected failed homepage-data response and corresponding console error.
- INP, hydration duration, heap memory, and reliable SDK-load timing were not measurable with the available in-app-browser runtime. They remain explicit Stage 3/4 measurement tasks.

The deterministic E2E suite passed responsive and no-horizontal-overflow behavior at 1440, 768, and 390; the explorer also asserts 320×720 overflow safety. It covers homepage hero/map/carousel, full explorer map/list modes, source/category filters, card pagination, marker selection, planner, recommendation, manual route editing/revalidation, and browser-storage save behavior.

## API baseline

Bounded local live smoke:

| Endpoint | Cold | Warm | Result | Cache behavior observed |
| --- | ---: | ---: | --- | --- |
| `/api/homepage/places` | 458.0 ms | 24.9 ms | 502 both runs | Error response; not a successful payload/cache sample |
| `/api/tour/places?page=1&pageSize=1000` | 44.2 ms | 23.1 ms | 502 both runs | Error response; successful handler is configured for public 5-minute cache with 60-second stale-while-revalidate |
| `/api/map/places?page=1&pageSize=200` | 28.1 ms | 6.7 ms | 503 both runs | `private, no-store`; error response |
| `/` HTML | 541.8 ms | 86.6 ms | 200; 115,604 UTF-8 bytes | `must-revalidate, no-cache` in development |

No raw error payload was retained. Successful provider/database time, response serialization time, and compression cannot be inferred from these failures.

Request architecture found by inspection:

- Homepage: one browser request protected by a client request ref; server composition starts three public catalog queries in parallel (tourism candidate, veterinary, pet shop) plus the official Tourism snapshot. Optional veterinary/pet-shop layers are loaded even though disabled by default.
- Explorer: the client requests Tourism pages at up to 1,000 rows and Kakao public-catalog pages at 200 rows until both complete. District changes refetch both sources. Category/source toggles and 12-card pagination are then client-side.
- `queryPublicMapCatalog` rebuilds the cursor for requested page N by fetching pages 1…N. A client download of P pages therefore performs 1+2+…+P catalog RPC calls: O(P²) database amplification.
- The homepage marker collection includes address, phone, link, image/status/warning fields while the featured-card collection repeats card data. Marker and card DTOs are not compactly separated.

## Full explorer and map baseline

Deterministic successful-path metrics from the passing Playwright suite:

| Metric | 26-place fixture | 1,824-place fixture |
| --- | ---: | ---: |
| API JSON bytes | Tourism 19,911 + Kakao 1,368 | 1,463,637 |
| Source marker update | 1.0 ms | 20.5 ms |
| Cluster update | 0.1 ms | 3.1 ms |
| Sidebar page switch | 86 ms | 79 ms |
| Category filter | 54 ms | 220 ms round trip |
| Zoom response | 38 ms | 262 ms |
| Final registry / active markers | 26 / 26 | 1,824 / 1,824 |
| Created markers after repeated toggle | 31 | 3,648 after off/on round trip |
| Clusterer instances | 1 | 1 |
| Card DOM rows | 12 | 12 |

Architecture findings:

- One SDK loader, map instance, clusterer instance, and source-marker registry are preserved. Marker images are cached by source, selection swaps an image, and pagination/selection do not recreate markers.
- `updateData` still calls clusterer `clear()`, adds all active markers, and redraws for each map-data change. It also updates every active marker's position/image/title. A sort-only array-order change can therefore reset the clusterer even when the marker set is identical.
- Category removal deletes markers from the registry; restoring the category recreates them. The 1,824-record off/on test therefore reaches 3,648 created marker objects.
- Zoom/pan itself does not clear markers; committed viewport search changes the in-memory scope without an additional catalog request in the current full-dataset design.
- Full detail/card-shaped fields travel with every map record. All coordinate-valid filtered places become markers; only 12 cards render.
- The SDK/map code is route-bound through `MapPanel`, not loaded from the root layout. Non-source departure/route overlays use separate Kakao objects and are not part of the source-marker registry.

Heap memory and listener heap size were not available. Stable registry size, active count, created count, custom-overlay count, and singleton clusterer count are the current observable proxies.

## Supabase baseline

The connected project reported 1,219 `map_places`, 5 ingest runs, 560 query definitions, and 3,596 query-hit rows at inspection time. Counts are dynamic and are not application constants.

The public browser path uses `get_public_map_catalog_v2`, a `SECURITY DEFINER` function with a fixed empty search path and sanitized return columns. Read-only `EXPLAIN (ANALYZE, BUFFERS)` for a 200-row call reported:

- Function Scan startup: 312.442 ms
- Function Scan total: 312.462 ms
- Execution: 312.809 ms
- Rows: 200
- Shared hit blocks: 4,976; no physical reads or temporary spill

The function computes an exact `count(*) over()` and a `hit_counts` CTE that aggregates distinct query keys across `map_place_query_hits` joined to catalog rows before final filtering/slicing. This is the strongest measured database bottleneck. The API's page-replay algorithm magnifies it.

Existing relevant indexes include a partial public-catalog index beginning with candidate kind/district/category/id and a unique hit index beginning with candidate/run/query. Lifecycle predicates are not fully represented in the public-catalog index. No new index is justified until the inner query is separately planned and the aggregation/filter refactor is measured.

Advisor observations:

- Performance advisor: three indexes reported as unused (`map_places_reviewed_by_idx`, `map_places_active_category_idx`, `map_ingest_runs_provider_started_idx`). Advisor statistics can reset and scripts/operations may use them; none is an automatic deletion candidate.
- Security advisor: RLS-enabled ingest tables have no policies, which is consistent with fail-closed private tables. It also reports public execution grants on four `SECURITY DEFINER` functions: `get_map_places_in_bounds`, `get_public_map_catalog_v1`, `get_public_map_catalog_v2`, and `get_public_place_location`. V2/location appear intentional sanitized APIs; the older V1/bounds functions need a caller/grant review.
- Runtime Supabase access uses RPC outputs rather than `select('*')`. The only broad `select('*')` found is the explicit backup script, where a full snapshot and exact count are intentional.

## Saved data and recommendation baseline

- No implemented Supabase saved-place, favorite, saved-itinerary, or user-profile query exists, so there is no saved-data API time, RLS overhead, selected-column count, server payload, or N+1 baseline to report.
- Browser storage is versioned/Zod-validated. The recommendation snapshot is bounded and excludes route geometry.
- The deterministic recommendation E2E proves the save button writes `petpass:saved-route-recommendation` and reports success/failure honestly.
- `loadSavedRouteRecommendation` has unit coverage but no application caller. `/itinerary` renders the in-memory PlannerState `selectedItinerary`; the footer “내 일정” link and a direct refresh do not load the saved recommendation snapshot. Thus the implemented “일정 저장” action is not discoverable through the advertised itinerary destination. This is a correctness gap, not merely a performance issue.
- The planner → recommendation → result smoke is covered once per desktop/mobile deterministic run; provider calls are mocked and contract-validated. No repeated live route/provider smoke was performed.

## Bundle and asset baseline

Production build output contains 21 JS chunks totaling 1,154,110 uncompressed bytes and one global CSS chunk of 85,193 bytes. These totals are build artifacts, not a claim that every route downloads every chunk.

Unique client manifest references by page (uncompressed file bytes, including shared layout/error references):

| Route | JS files | Referenced bytes |
| --- | ---: | ---: |
| `/results` | 6 | 242,249 |
| `/itinerary` | 6 | 214,868 |
| `/places/[contentId]` | 6 | 212,771 |
| `/` | 5 | 146,818 |
| `/planner/pet` | 4 | 130,628 |
| `/planner/trip` | 3 | 76,050 |

The 20 public assets total 27,821,427 bytes. Ten hero PNGs account for approximately 24.8 MB; each is 2.12–2.81 MB. The first source image is 2,564,918 bytes. `next/image` serves responsive optimized derivatives, and only the active/first slide is rendered eagerly, but modern local source formats and generated sizes remain a high-value audit target. The homepage's measured optimized first-image transfer was 47,888 bytes at desktop/tablet and 39,820 bytes at mobile in the degraded development probe.

## Ranked bottlenecks

### P0 — correctness/security blockers

1. Saved route snapshot is written but not consumed by “내 일정” or `/itinerary` after direct navigation/refresh.
2. Public execution grants on legacy `SECURITY DEFINER` map functions need a caller and least-privilege review. This is an exposure-review finding, not a claim that sanitized V2/location functions are exploitable.

### P1 — major user-visible performance

1. Explorer downloads and parses the full Tourism and Kakao datasets, then performs all counts/ranking/sorting/pagination in the browser; the 1,824 fixture is 1,463,637 JSON bytes for 12 visible cards.
2. HTTP page N replays catalog RPC pages 1…N, producing O(P²) database work during a full download.
3. The public catalog V2 call takes 312.809 ms warm with 4,976 shared-hit blocks for 200 rows, with global hit aggregation and exact count as likely hot work.
4. Homepage eagerly queries disabled optional layers and duplicates marker/card fields.
5. Category off/on recreates removed markers; cluster updates clear/add/redraw the entire active set.

### P2 — meaningful efficiency/maintainability

1. `/results` has the largest route manifest at 242,249 uncompressed referenced JS bytes and owns fetch, filtering, ranking, URL state, cards, and map orchestration in one client component.
2. A sort/data-array change can cause a full cluster reset even when stable IDs and coordinates are unchanged.
3. Development cold homepage transfers about 813 KB of JS; production transfer and hydration need a Preview or production-mode local measurement.
4. Hero originals are 2.1–2.8 MB PNGs even though responsive optimized delivery limits the first transfer to roughly 40–48 KB in this probe.
5. Successful live-provider API, serialization, compression, heap, INP, and hydration baselines are unavailable and must be instrumented in a healthy approved environment.

### P3 — optional cleanup

Legacy wrappers/scripts, an older homepage API, documentation duplication, unconsumed storage readers, extraneous generated `node_modules` packages, and original partner JPGs require the classification in `cleanup-manifest-v1.md`; none is approved for deletion by this baseline.

## Baseline verdict

The type/lint/unit/E2E/build baseline is green, map behavior has a repeatable successful-path performance fixture, and the database/explorer bottlenecks are measured strongly enough to form an ordered plan. The in-app browser and live-provider limitations are recorded as measurement gaps, not silently replaced with fabricated data.
