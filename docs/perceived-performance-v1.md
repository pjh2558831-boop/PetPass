# WEEKENDOG perceived performance v1

## Scope and baseline

Worktree: `C:/Users/pjh25/Desktop/ui_ver_4`, branch `UI_VER_4`.
Baseline is the working files on entry, including existing image/map/news/detail
changes, not Git HEAD. Historical 25,667/18,853 counts are not current constants.
No scoring, public eligibility/labels, canonical IDs, default/optional categories,
RPC, RLS, grants, indexes, remote data or deployment changes are included.

Read skills: using-agent-skills, context-engineering, petpass-project-context,
performance-optimization, petpass-ui-review and responsive checklist,
kakao-integrations and Maps/Local/Mobility reference, test-driven-development,
regression-check and browser matrix, code-review-and-quality.
Installed Next 16.3.0 documentation was read before edits. Reference guidance:
[React deferred values](https://react.dev/reference/react/useDeferredValue),
[React transitions](https://react.dev/reference/react/useTransition),
[Next prefetch](https://nextjs.org/docs/app/guides/prefetching),
[long tasks](https://web.dev/articles/optimize-long-tasks),
[Kakao SDK](https://apis.map.kakao.com/web/documentation/).
No additional React deferral was added without measured rendering need.
The legacy `mapWarmFilterFeedbackMs` used to run only when filtered rows changed;
retaining rows revealed that it was timing network completion, not acknowledgement.
It now records after the acknowledgement has crossed a paint frame; completed
results are separately recorded as `mapFilterResultsMs`. Do not compare the two
versions of this internal metric as a performance improvement. The controlled
before/after harness keeps its own unchanged painted-feedback measurement.

## Loading dependency / waterfall

```text
navigation -> shell, usable filters
           -> singleton SDK -> real base map -> zoom/pan controls
           -> core regional snapshot (or bounded cursor fallback)
              -> complete membership -> authoritative local rank -> 12 card texts/actions
                                    -> existing 6ms marker registration -> native redraw
                                    -> current card metadata -> lazy card photographs
           -> optional dataset only on category intent
homepage   -> existing independent map/hero/news/events flows (unchanged)
```

Before and after share the complete-snapshot ranking dependency. The baseline
already initialized the map independently and rendered card text before photos;
this patch does not claim to introduce those improvements. The baseline also
already had elapsed-time marker slices and a 60s/128-URL photo failure cache.
New behavior: sort/page no longer enter marker updates, optional-filter changes
retain the prior displayed query, Back restores camera/scroll/search, image
state and retry preserve geometry, and marker registration remains honestly busy.

## State ownership and stale restrictions

`ResultsExplorer` owns requested URL state and a displayed query scoped by region,
district, source layers and committed bounds. Same-scope pending optional queries
keep previous categories/page/sort/search together; rows, total and page numbers
therefore describe one committed query. Different scopes use their own data/local
loading. A first optional request failure produces an error, not infinite loading.

Core and optional effects already guard active generations and abort obsolete
consumers. Snapshot transport keeps other active subscribers alive. Successful
publication changes clear enriched card objects so old policy/name/source fields
cannot shadow the new authoritative marker. Failed requests never become empty
success, new freshness, or new pet-access claims. No new public-data persistence
or offline fallback was introduced.

The source fallback still waits for its independent provider results before
finalizing combined ranking. Failed providers have a visible notice; successful
rows/base map survive. A retry refreshes the failed data operation, not the route.
Mobile map mode now exposes data errors/retry outside its hidden sidebar.

## Marker work, camera and cleanup

Membership calculation is independent of ranking/page. The existing stable-ID
registry, reusable MarkerImages and clusterer remain. Marker creation already
used approximately 6ms slices and setTimeout paint yields, with cancellation and
generation checks. Pending registration is now separate from base-map readiness;
map controls are usable while aria-busy correctly remains true.

User drag/zoom cancels automatic completion fitting; explicit fit controls still
work. Restored initial center/level precede any fit or selection focus. SDK network
failure can retry its failed script without introducing a second active loader.
Inactive marker records are bounded at 2,048, active scope coverage is not capped.
Eviction detaches listeners; off/on after eviction may recreate objects, so total
historical creation count can grow even though live objects remain bounded.

Remaining synchronous work includes coordinate preflight, set operations, route
processing and Kakao-native clustering/redraw. Those are not made preemptible by
React transitions. No marker virtualization, silent coverage reduction or server
aggregation was introduced.

## Images

One shared hook distinguishes missing/loading/loaded/failed. Missing images render
finished text-led cards/category information, never an animated photo skeleton.
A valid pending photo keeps reserved dimensions and metadata/actions. Failed photos
keep dimensions, explain failure and offer an explicit retry without triggering
the parent card link. Homepage CSS collapses only truly missing media, not failed
media. URL changes consult their own failure-cache key.

Failure cache remains tab-local, 60 seconds, 128 URLs. Immediate remount suppresses
repeated broken requests; explicit retry clears it, a different URL is independent,
and remount after expiry can retry. No original-photo download for blur generation,
new proxy, broad image remotePattern, NAVER images, fabricated venue photos or
rights/provenance change. Existing hero behavior remains one active image.

## Cache and prefetch budgets

- Snapshot: existing version/region/dataset/provider/category keys, 5-minute
  freshness, 4 completed scopes / 12,000 marker soft budget. One active large
  scope can exceed that soft budget; never silently truncate coverage.
- Card metadata: 60 seconds / 48 pages, sorted IDs + region + dataset + contract
  and snapshot publication namespace. Full response shape and requested IDs are
  checked before caching. Provider-specific card publication hashes may differ
  from a multi-provider snapshot, so hash equality is not falsely required.
- Prefetch: only next public-catalog card metadata on next-button hover/focus;
  maximum one discretionary request in flight. No optional/nationwide fetch,
  no next-page photograph download, no engagement events.
- Skip while foreground metadata/marker/image work is pending, document hidden,
  Save-Data or very slow connection. No extra route prefetch layer over Next Link.
- Normal navigation joins the same in-flight request. Each caller can abort;
  transport aborts only when the last caller leaves. Old finalizers cannot delete
  replacement requests. Scope/sort/unmount cancels obsolete speculative consumers.

## Detail return

URL convention continues to own region/district/category/source/page/sort.
On remount, parse the actual URL rather than stale props from a cached App Router
tree. View-only tab memory holds search, selected ID, committed bounds, camera,
list scroll, mobile mode and ranking timestamp: 20 scopes / 5 minutes, no place
records, SDK objects, precise-location history, private data or tokens. Matching
content restores scroll after it exists. Existing snapshot/card caches may avoid
provider calls while fresh; expired/missing caches require normal revalidation.
Saved itinerary restoration remains unchanged and provider-free.

## Verification and measurements

Environment: Windows, Node 24.15.0, npm 11.12.1, Next 16.3.0,
React 19.2.6, Chromium Playwright. Production measurement uses separate port3194,
1440x986, new browser contexts, the same synthetic 1,824 records, CPU4x,
metadata2s and images5s delays, 3 samples per version. SDK is mocked: map timing
here is **not live Kakao rendering performance or production INP**.

Baseline `npm run verify`: typecheck PASS, lint PASS with one existing
import/no-anonymous-default-export warning, 170 files / 1,574 unit tests PASS,
production build PASS. Post-implementation first gate: 172 files / 1,585 tests
PASS plus typecheck/lint/build; final gate recorded below after regression fixes.

Production full deterministic suite was attempted but stopped after six failures:
`instrumentation.ts` deliberately disables upstream mocks in production. The
successful controlled production samples use explicit browser routes and remain
valid; the aborted full run is not a completed baseline. Full deterministic E2E
uses separate dev3195, preserving unrelated running processes. There is no complete
pre-patch dev E2E baseline, so unchanged-code failures are classified unresolved,
not automatically asserted to have passed before.

| Metric (ms unless stated) | Before median / worst | After median / worst |
| --- | ---: | ---: |
| usableControlsMs | 474.9 / 484 | 389.2 / 465.3 |
| clickableCardMs | 2770.9 / 2915.5 | 2745.5 / 2759.2 |
| mockedMapControlsMs | 640 / 703.7 | 616.2 / 619.8 |
| paintedInputFeedbackMs | 135 / 147 | 155 / 156 |
| completedFilterMs | 348 / 447 | 244 / 245 |
| paginationMs | 345 / 389 | 295 / 300 |
| compatibleBlankMs | 0 / 0 | 0 / 0 |
| pageLongTaskCount | 11 / 14 | 22 / 23 |
| longestPageLongTaskMs | 145 / 176 | 120 / 126 |
| longestMarkerSliceMs | 2.7 / 3.7 | 1.6 / 1.6 |
| markerUpdateWallMs | 882 / 1166 | 845.5 / 856.1 |
| nativeClusterUpdateMs | 0.4 / 0.6 | 0.4 / 0.5 |
| observedScriptDecodedBytes | 711563 / 711563 | 719939 / 719939 |
| fulfilledMetadataBytes | 1.10226e+06 / 1.11302e+06 | 1.10226e+06 / 1.10226e+06 |
| imagesRequested | 12 / 12 | 12 / 12 |
| imagesCompleted | 0 / 12 | 0 / 0 |
| imagesCompleteAtCardUsability | 0 / 0 | 0 / 0 |
| observedImageTransferBytes | 0 / 0 | 0 / 0 |
| foregroundRequests | 3 / 4 | 3 / 3 |
| exactDuplicateRequests | 0 / 1 | 0 / 0 |
| activeMarkerCount | 1824 / 1824 | 1824 / 1824 |
| uniqueMarkerNames | 1824 / 1824 | 1824 / 1824 |
| markerCacheSize | 1824 / 1824 | 1824 / 1824 |
| createdMarkers | 1824 / 1824 | 1824 / 1824 |
| mapInstanceCount | 1 / 1 | 1 / 1 |
| clustererCount | 1 / 1 | 1 / 1 |

Each stage has n=3; worst is the maximum observed, not a percentile.
Input feedback includes Playwright click actionability plus two animation frames;
it is not isolated event-to-paint latency. It increased135 ->155ms in the4xCPU
comparison, so no blanket responsiveness win is claimed. The normal dev-profile
apply-acknowledgement check passed at37.4ms, but its metric/situation differs and
cannot replace the comparison above. Page-wide long-task count increased11 ->22;
the longest decreased145 ->120ms. These include React and mocked SDK DOM work.
Only the marker creation slice is separately instrumented; the longest total
app-controlled task, live native redraw and live listener count remain unisolated.

The first512-inactive-marker limit caused1824 ->3136 cumulative creations and
1667.6ms median update time. This in-scope regression was corrected to2048 inactive
records, with a failing-then-passing1824 ->1 ->1824 reuse test. Final creation count
is1824, update845.5ms. Intermediate512 evidence is retained separately, not mixed
into final samples. Beyond2048 inactive records, bounded eviction can still cause
recreation; active coverage remains uncapped and evicted listeners are removed.

Observed script bytes increased8,376 (+1.18%); these include interaction-time Link
prefetch chunks, not an isolated initial-route manifest. Metadata median is
unchanged1,102,264 bytes. Routed image transferSize0 is a browser measurement limit,
not proof of zero downloads.12 photos were requested; none had finished at first
card usability in any sample. Sequence-end completions vary with capture time.

Busan comparison scope uses legacy metadata, so discretionary prefetch count0.
Separate production public-catalog intent tests confirm one speculative next-page
request, maximum concurrency1, reuse on navigation (two total card requests for
initial+next page), and SaveData suppression (zero speculative requests). No
next-page images or provider collection are prefetched.

Final production Back checks:1440px36ms,390px30ms, n=1 each (no percentile claim),
restore scroll330, zoom7, page2, popularity sort, search and selected place7012.
Only one initial snapshot request; Back adds zero. The old implementation reset
page/search/camera/scroll, so a comparable successful pre-patch restore time is
unavailable. Existing saved-itinerary direct/refresh provider-free assertions
passed in the full suite.

### Commands actually run

| Check | Result |
| --- | --- |
| Baseline `npm run verify` | PASS: typecheck, lint,1574 unit tests, production build |
| Final2048 `npm run verify` | PASS: typecheck, lint,1585 tests /172 files, production build |
| Lint warning | One unchanged import/no-anonymous-default-export warning in verification-evidence/perceived.config.ts; zero errors |
| Controlled production comparison, each version | PASS3 samples each, after29.3s; metrics above remain mixed |
| `npx playwright test --config=playwright.perceived-dev.config.ts` | FAIL full run:294PASS,44SKIP,92FAIL /430,9.7min, before final in-scope fixes |
| Targeted dev regression rerun | PASS27,SKIP3 mobile-inapplicable,47.8s after in-scope fixes |
| Final2048 targeted production, full-map-explorer, Back/optional/sort/photo/error/prefetch/Gyeonggi selectors | PASS15,SKIP1 mobile-inapplicable,15.6s |
| Full production deterministic suite attempt | NO-GO after6 failures: upstream mocks intentionally disabled in production; not a completed baseline |
| `git diff --check` | PASS; line-ending notices are not errors |
| Client secret-name scan | PASS: no server-key names added to changed client files; no values printed |
| Bounded live local-production probe | NO-GO for successful loading: Seoul snapshot503, SDK uninitialized; failure-state screenshots only |

Full-dev failure evidence is retained in
`verification-evidence/perceived/full-dev-failures.json` and `full-dev.log`.
Groups:auth2(port3000 assertion vs3195),full-map10,homepage-pet12,homepage37,
itinerary10,landing2,planner15,recommendation2,tour-catalog2. In-scope map preview,
Back, first zoom after filtering, cache-bound and feedback assertions were fixed
and rerun; recommendation mocks were corrected to the full existing DTO contract.
Remaining failures involve unchanged homepage/hero/carousel expectations, removed
planner controls and provider502 responses. There is no complete pre-patch dev
baseline; these are unresolved, not all proven pre-existing. The full suite was
not rerun after focused fixes, so92 is the historical run count, not a current
failure count. Release readiness remainsNO-GO.

Browser inspection covered1440/768/390/320, keyboard focus, actual wheel scrolling,
mobile map/list switching, Korean text, no document horizontal overflow, and the
selected preview below/outside the canvas.320px pagination keeps its existing
horizontal scroll and44px buttons. Synthetic map screenshots are layout evidence,
not real Kakao tiles or clustering. Active1824 IDs are unique, map/clusterer1 each;
Gyeonggi2447 and Seoul3090 coverage scenarios also pass focused checks. Native
listener cleanup is unit-tested but not separately counted in a successful live
session. Images404 preserve cards/actions and explicit retry.

### Changed-file inventory for this task

Application files (paths relative to this worktree):
- app/weekendog-globals.css
- components/map/map-panel.tsx
- components/places/results-explorer.tsx
- components/places/place-image.tsx
- components/places/place-card-media.tsx
- lib/kakao/maps.ts
- lib/kakao/sdk-loader.ts
- lib/map-places/browser-performance.ts
- lib/map-places/card-details-client.ts
- lib/map-places/explorer-collections.ts
- lib/map-places/explorer-view-memory.ts
- lib/places/use-place-photo-state.ts

Checks/docs:
- tests/unit/kakao-integration.test.ts
- tests/unit/kakao-sdk-loader.test.ts
- tests/unit/map-card-details-client.test.ts
- tests/unit/explorer-view-memory.test.ts
- tests/unit/place-photo-state.test.ts
- tests/e2e/full-map-explorer.spec.ts
- tests/e2e/recommendation-ui.spec.ts
- playwright.perceived.config.ts
- playwright.perceived-dev.config.ts
- design.md
- docs/perceived-performance-v1.md

Existing user-owned homepage/news/events/detail/source-condition changes and the
photo-failure-cache helper were preserved. Git HEAD diff also includes that work;
it is not all attributable to this patch. Evidence JSON/PNGs/logs live under
verification-evidence/perceived; baseline/final verify logs are in the task TEMP
folder. No new dependencies or unrelated refactoring.

Implementation correctness:focusedPASS. Perceived responsiveness:PARTIAL (mixed
input/long-task results). Live-provider success:NO-GO. Release readiness:NO-GO.
Final status:PERCEIVED_PERFORMANCE_PARTIAL_STRUCTURAL_LIMIT_REMAINS.


## External changes / remaining work

DB/RPC/RLS/grants/index/data writes: none. Vercel/environment changes: none.
No dependency installation/upgrade, commit, push, merge or deployment.
Complete regional ranking and native cluster redraw remain architectural limits;
a separate approved task would be needed for authoritative server-side page
ranking or infrastructure work. This patch does not claim nationwide live speed.
