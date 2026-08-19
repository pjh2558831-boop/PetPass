# WEEKENDOG performance result v1

Date: 2026-08-19 (Asia/Seoul)

## Environment

| Stage | Runtime and provider mode | Cache state | Dataset and viewport |
| --- | --- | --- | --- |
| Stage 1 | Local `next dev`; deterministic provider fixtures for successful full-explorer regression; separate degraded live-provider probe | Cold and same-context warm kept separate | 1,824 coordinate-valid places; 1440/768/390 and 320 overflow check |
| Stage 3 | Playwright controlled production-code path | Deterministic in-process responses | Same 1,824-place fixture, 12-card page, desktop Chromium |
| Stage 4 local | Node 24.15.0, npm 11.12.1, Next.js 16.2.6; clean `next build` followed by `next start -p 3100` | Fresh browser contexts for cold, same contexts for warm | Same fixture for controlled results; real local credentials returned provider/configuration errors and are not treated as success evidence |
| Stage 4 Preview | Vercel Preview deployment `dpl_GZcPs69A8Sq849QsBhSx8Jvor2yW`, iad1, READY | Not measurable | Deployment Protection redirected the Preview before the application; no protected-path result is labelled as application performance |

The Stage 4 controlled run used the unmodified 1,824-record fixture, categories, coordinates, source distribution, page size, browser viewport, and interaction sequence from Stage 1 and Stage 3. The Preview environment-variable gate checked names and targets only. No value, length, hash, authorization header, or raw provider response is retained here.

## Before/after

Environment differences are explicit. `Preview` is unavailable because Deployment Protection prevented an authenticated application request; it is not an error-screen comparison.

| Metric | Stage 1 | Stage 3 controlled | Stage 4 local production | Preview | Change from Stage 1 | Target | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Marker payload | 1,463,637 B legacy combined shape | 841,547 B | 841,547 B controlled | NOT_MEASURABLE | -42.5% | at least -40% | PASS |
| Card payload | included in legacy 1,463,637 B | separate 12-row response | 9,795 B controlled | NOT_MEASURABLE | contract separated | at most 12 rows, details lazy | PASS |
| Total explorer initial payload | 1,463,637 B | 851,342 B controlled | 851,342 B controlled | NOT_MEASURABLE | -41.8% | lower without reducing coverage | PASS |
| Catalog RPC operations | 55 | 10 | 10 controlled | NOT_MEASURABLE | -81.8% | bounded cursor, no replay | PASS |
| Supabase RPC execution, 200 rows | 312.809 ms, 4,976 shared hits | SQL not changed in Stage 3 | 62.498 and 66.494 ms; 5,528 shared hits | NOT_MEASURABLE | 79.4% lower mean execution | at least -50% | PASS |
| Marker objects after OFF→ON | 3,648 | 1,824 | 1,824 | NOT_MEASURABLE | -50%; one per unique ID | no duplicates | PASS |
| Marker update | 16.3 ms | 0.8 ms | 3.3 ms | NOT_MEASURABLE | -79.8% | bounded set-diff | PASS |
| Full cluster rebuild | 3 | 0 | 0 | NOT_MEASURABLE | eliminated | zero for unchanged set | PASS |
| Cluster redraw count | 3 baseline rebuilds | 3 incremental redraws | 3 incremental redraws | NOT_MEASURABLE | semantic change: no full clear | no unchanged-set rebuild | PASS |
| Filter OFF→ON | 220 ms | 152 ms | 181 ms | NOT_MEASURABLE | -17.7% | at least -30% | PARTIAL |
| Page transition | not isolated | controlled and bounded | 144 ms | NOT_MEASURABLE | not comparable | under 1 s and no marker refetch | PASS |
| Page-change marker refetch | 0 | 0 | 0 | NOT_MEASURABLE | unchanged | zero | PASS |
| `/results` initial JS | 240,805 B, 6 chunks | 150,048 B, 4 chunks | 150,048 B, 4 chunks | NOT_MEASURABLE | -37.7% | preserve reduction | PASS |
| `/results` gzip JS | 70,631 B | 46,869 B | 46,869 B | NOT_MEASURABLE | -33.6% | preserve reduction | PASS |
| Homepage LCP | degraded dev probe: 424 ms desktop warm | not comparable | degraded production probe: 504 ms cold, 52 ms warm at 1440 | NOT_MEASURABLE | provider states differ | successful path only | NOT_MEASURABLE |
| Homepage CLS | degraded dev probe: 0.109 desktop warm | not comparable | degraded production probe: 0.109 cold, 0 warm at 1440 | NOT_MEASURABLE | not comparable | no successful-path regression | NOT_MEASURABLE |
| Saved itinerary restore | write existed; read path absent | 0–0.1 ms | 0 ms resolution controlled | NOT_MEASURABLE | correctness restored | one read/parse, zero provider calls | PASS |
| Duplicate marker requests on page change | 0 | 0 | 0 | NOT_MEASURABLE | unchanged | zero | PASS |

## Stage 4 controlled details

- Marker response status: 200.
- Active markers and registry: 1,824 / 1,824; card DOM: 12.
- Warm JSON serialization median in this run: 3.882 ms legacy, 2.217 ms marker response.
- Marker and cluster initialization: 3.3 ms and 0.1 ms.
- Zoom response: 71 ms; page transition: 144 ms; filter OFF→ON: 181 ms.
- Created markers after the round trip: 1,824; clusterer instances: 1; SDK scripts: 1.
- Cluster redraws: 3 incremental redraws; full `clear()` rebuilds: 0.
- Saved snapshot: 1,221 B; one storage read and one parse per hydration; measured parse resolution 0 ms; provider restoration requests 0; N+1 requests 0.
- `/results` production manifest: 4 chunks, 150,048 uncompressed bytes, 46,869 gzip bytes.

The 181 ms filter sample is 19.1% slower than the Stage 3 sample but remains 17.7% faster than Stage 1. This misses the original 154 ms acceptance threshold, so it is `PARTIAL`; correctness, coverage, object reuse, and the no-full-clear invariant all passed. One wall-clock UI sample is insufficient to classify the difference as a runtime defect.

## Real local production probe

The local server ran the canonical production build on port 3100. Document responses were 200 and no horizontal overflow occurred at 1440, 768, or 390. The actual APIs were not a successful provider path: `/api/homepage/places` returned 502, `/api/tour/places` returned 502, and `/api/map/places` returned 503. Consequently, API end-to-end time, map-ready time, optional-layer success time, and route-engine smoke time are `NOT_MEASURABLE` locally and are not compared with fixture results.

For diagnostic context only, the degraded desktop homepage cold/warm TTFB was 68.7/14.3 ms, FCP 184/52 ms, LCP 504/52 ms, and CLS 0.109/0. The degraded desktop explorer cold/warm TTFB was 18.1/8.1 ms, FCP 96/44 ms, LCP 408/60 ms, and CLS 0.0281/0.0109. These numbers describe error-state rendering, not successful application performance.

## Preview

The Preview was created explicitly with the CLI preview target. It reached READY with no alias assignment. Vercel reports 19 seconds for the build and 31.198 seconds from deployment creation to READY. A request to the Preview received a 302 to Vercel SSO because Deployment Protection is enabled. Codex browser startup then failed its trusted-runtime check, so the protected application was not opened and no authenticated Preview performance claim is made. Runtime application-log counts were empty because the protected request did not reach a function.

## Targets

### PASS

- Complete 1,824-marker coverage and 12-card paging.
- Marker/card DTO separation and 41.8% lower combined controlled initial payload.
- Bounded cursor behavior: 55 to 10 operations, with zero marker refetch on card pagination.
- One marker per unique ID, one clusterer, one SDK script, no duplicate listeners, and no full cluster clear/rebuild.
- `/results` bundle reduction retained.
- Saved-itinerary one-read/one-parse restoration with zero provider requests.
- Typecheck, lint, 836 unit tests, 160 Playwright tests plus 10 intentional skips, and production build.
- Read-only Supabase analysis; no RPC, index, RLS, grant, policy, or data change.

### PARTIAL

- Filter OFF→ON was 181 ms: improved from 220 ms but short of the 30% target and slower than the Stage 3 single sample.

### NOT_MEASURABLE

- Successful real local provider/API, optional-layer, homepage Web Vitals, and route smoke because the local real-provider path returned errors.
- Preview homepage, explorer, saved itinerary, route smoke, responsive QA, browser network, console, and successful-path performance because Deployment Protection required authentication and the Codex browser runtime could not initialize.

## Remaining bottleneck

The most important measured remaining cost is repeated catalog RPC work. A 200-row call now meets the original improvement target at roughly 62–66 ms, but the 1,824-row controlled load still represents 10 physical operations. The comparable inner plan spends about 43.7 ms scanning eligible `map_places` rows and 10.5 ms globally aggregating query hits. See [Supabase catalog RPC optimization proposal v1](./supabase-catalog-rpc-optimization-proposal-v1.md). Any implementation requires a separate database approval and before/after equivalence proof.

The final Stage 4 decision is `PREVIEW_BLOCKED_BY_DEPLOYMENT_PROTECTION`. This is a QA-access blocker, not a failed build or proven application regression. Production was not promoted or modified.
