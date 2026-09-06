# WEEKENDOG `ui_ver2` Prompt 4 — all-routes design QA

> Current result: **PASS — every verifiable Prompt 4 product, browser, visual, build, and test gate passed.**
>
> This assessment supersedes every historical result below. Reference: `.codex-reference/weekendog-ui-reference.png`. Prompt 4 evidence root: `verification-evidence/weekendog-ui-ver2/remaining-ui/all-routes/`.

## 1. Route inventory summary

Source inventory covers 12 page files, the redirect-only OAuth callback, 20 API Route Handlers, and global loading/error/not-found surfaces. No route groups, intercepting routes, modal routes, or standalone legal/help/contact/password-reset/email-confirmation pages exist. Signup is `/login?mode=signup`; saved itinerary restoration and editing live under `/itinerary`.

| Route or state | Exposure | Auth state | Archetype | Prompt 4 result |
| --- | --- | --- | --- | --- |
| `/` | `ACTIVE_PUBLIC` | Public | Editorial + workbench | Approved upper frozen; lower states retained |
| `/results?tab=catalog` | `ACTIVE_PUBLIC` | Public | Workbench | Connected catalog workbench preserved |
| `/results?...&mode=select` | `ACTIVE_PUBLIC` | Public | Selection workbench | Catalog-first selection; dead actions omitted |
| `/results?tab=recommendations` and `mode=selected` | `ACTIVE_PUBLIC` | Public | Itinerary/result | Direct entry, generating, result/editor preserved |
| `/planner/pet` and `?mode=selected` | `ACTIVE_PUBLIC` | Anonymous allowed | Decision flow | One three-step flow preserved |
| `/planner/trip` | `REDIRECT_ONLY` | Public | None | Redirect to `/planner/pet` preserved |
| `/itinerary` | `ACTIVE_PUBLIC` | Browser storage | Itinerary | Flat restoration/empty/saved document states |
| `/places/[contentId]` | `ACTIVE_PUBLIC` | Public | Information document | Decision → evidence → technical disclosure |
| `/login` and `?mode=signup` | `CONDITIONAL_PUBLIC` | Logged-out page | Authentication | Focused login/signup document |
| `/onboarding` | `AUTH_REQUIRED` | Unauthenticated → `/login` | Authentication/account completion | Logged-out redirect verified; signed-in form not safely verifiable |
| `/account` | `AUTH_REQUIRED` | Unauthenticated → `/login` | Account/settings | Logged-out redirect verified; signed-in page source/unit verified |
| `/account/profile` | `AUTH_REQUIRED` | Unauthenticated → `/login` | Account/settings | Logged-out redirect verified; signed-in form not safely verifiable |
| `/account/pets/new` | `AUTH_REQUIRED` | Unauthenticated → `/login` | Account/settings | Logged-out redirect verified; signed-in form not safely verifiable |
| `/account/pets/[petId]/edit` | `AUTH_REQUIRED` | Ownership required | Account/settings | Logged-out redirect verified; owned-pet form not safely verifiable |
| `/auth/callback` | `REDIRECT_ONLY` | OAuth exchange | None | Existing redirects preserved |
| Global loading/error/not-found | `CONDITIONAL_PUBLIC` | Any | Product state | Compact recovery language |
| `app/api/**` | `API` | Contract-dependent | None | Excluded and unchanged |

`mode=select` forces the catalog even if `tab=recommendations`; `mode=selected` selects the hybrid recommendation state. Invalid public place IDs enter the live-detail failure path and do not necessarily render the global 404.

## 2. Page archetype system

| Archetype | Routes/surfaces | Grammar |
| --- | --- | --- |
| Editorial | Approved homepage upper | Open composition, strong Korean typography, purposeful media, dividers |
| Workbench | Homepage lower, catalog, selection, itinerary maps | One connected frame, toolbar, compact rows, stable map/list geometry |
| Decision flow | Planner automatic/selected | One step system, native controls, inline errors, one next action |
| Itinerary/result | Recommendation states and `/itinerary` | Time/place/dwell/movement/evidence/action rows |
| Information document | Place detail | Decision, evidence, then technical disclosure |
| Account/settings | Account/profile/pet management | Headings, labeled rows, dividers, separate destructive zone |
| Authentication | Login/signup/onboarding | Focused 420–520px form, one primary action, quiet alternatives |
| Product state | Loading, empty, error, not-found | Concise heading, explanation, recovery action |

Redirect-only and API surfaces receive no page archetype.

## 3. Shared visual contract

- Deep green, warm cream, dark Korean body text, quiet neutral lines, and the existing font stack remain the shared language.
- Ordinary controls/surfaces use 6–12px radii and no ordinary content shadow.
- Pills remain only for avatar/account identity, status/provenance, compact selected state, progress markers, and functional map controls.
- Rows, definition lists, and dividers replace universal cards and nested panels.
- Interactive targets are approximately 44px, with visible focus and native semantics.
- `ProductState` owns compact route states, `FormErrorMessage` owns focused form alerts, and query-aware `SiteNavigationLink` owns `aria-current`.
- Unavailable actions and large missing-image placeholders are omitted.
- Transitions remain restrained and reduced-motion-safe.
- Provider configuration, environment-variable names, internal `geometry` terminology, and fabricated values are not exposed.

## 4. Before/after route matrix

| Route family | Before | Prompt 4 treatment |
| --- | --- | --- |
| Global chrome/home | Homepage-only skip target; future/dead navigation; no query-aware current state | Global `#main-content`, live links only, `aria-current`; protected hero/process/course unchanged |
| Catalog/selection | Disabled unsupported-region actions remained visible | Unsupported actions omitted; workbench behavior preserved |
| Planner | Residual radius/focus inconsistency | Existing decision flow retained; controls and focus normalized |
| Recommendation | Surface panels and developer-facing Kakao/`geometry` copy | Compact product states, user language, focusable result heading, separate map-selection controls |
| Saved itinerary | Duplicate progress and card summaries | One itinerary hierarchy with timeline and definition rows |
| Place detail | Live/detail fallback and missing-image branches inconsistent | Document rows, low radii, compact provider states, absent images omitted |
| Login/signup/onboarding | Giant centered surfaces and unavailable provider entry | Open focused auth documents; unavailable Kakao entry omitted |
| Account/pets | Dashboard panels, equal pet cards, large no-image areas | Account document, compact pet rows, shared forms, explicit destructive zone |
| Global states | Generic surface cards and technical copy | Compact `ProductState` loading/error/not-found language |

The `site-header.tsx` exception changes navigation semantics and removes dead public branches only. The homepage hero, hero image, launcher, process, and example-course source files have no Prompt 4 diff.

## 5. Adopted/omitted reference principles

| Principle | Decision |
| --- | --- |
| Deep-green/cream balance, thin dividers, confident Korean hierarchy | Adopted across archetypes |
| Connected map/list workbench | Adopted for exploration and selection |
| Flat schedule and account rows | Adopted |
| Compact truthful loading/error/empty language | Adopted |
| Homepage hero composition on inner pages | Omitted |
| Universal card foundation and nested trust cards | Omitted |
| Dashboard statistic grids and decorative placeholders | Omitted |
| Fake counts/progress and public disabled future actions | Omitted |
| Multiple strong auth CTAs or marketing sidebars | Omitted |

The reference and production-mode `home-1440x1000.png` were reviewed together. The implementation preserves the hierarchy without copying reference data or adding unsupported product claims.

## 6. Accessibility matrix

| Surface | Evidence | Result |
| --- | --- | --- |
| Landmark/skip link | One `main#main-content`; global link targets it; Playwright keyboard contract | Passed in source/unit and browser suite |
| Desktop/mobile navigation | Query-aware `aria-current`; Escape closes menu and restores trigger focus | Passed in production-mode in-app browser |
| Auth/forms | Visible labels; focused `role="alert"` form error | Passed in unit/focused E2E |
| Delete dialog | Native trigger, Escape/cancel focus restoration, existing form action | Passed in unit/E2E |
| Planner | Native controls and programmatic step focus with visible outline | Passed in focused E2E |
| Result/itinerary | Text schedule independent of map; explicit `aria-pressed` map actions | Passed in E2E |
| Product states | Correct `status`/`alert`, labelled heading and description | Passed in unit/E2E |
| Narrow view | 320px/390px control access and no document overflow | Passed in production-mode browser |

## 7. Responsive matrix

| Viewport | Coverage | Result |
| --- | --- | --- |
| 1440 × 1000 | Every active/logged-out route, production-mode screenshots | Passed |
| 1180 × 900 | 17 public/logged-out routes, measured | Passed |
| 1024 × 900 | 10 critical routes, production-mode screenshots | Passed |
| 768 × 1024 | 17 public/logged-out routes, measured | Passed |
| 390 × 844 | Every active/logged-out route, production-mode screenshots | Passed |
| 320 × 720 | 10 critical routes, production-mode screenshots | Passed |

The 68 screenshot measurements and 34 additional responsive measurements found zero horizontal-overflow, failed-image, technical-copy, console-error, or landmark-count failures. See `verification-evidence/weekendog-ui-ver2/remaining-ui/all-routes/final/screenshot-index.md`.

## 8. Data-truthfulness audit

- No scoring, route order, travel time, pet-access verdict, provider record, trust factor, persistence, or account mutation contract changed.
- Missing photos are omitted rather than filled with fake assets. Unavailable regional actions are omitted rather than presented as dead controls.
- Provider errors are mapped to stable public copy while timeout, rate-limit, not-found, and partial-result semantics remain distinct.
- Account success notices are allowlisted by actual action; arbitrary query text is not rendered as success.
- The route watermark says route only for at least two route coordinates; otherwise it identifies actual places.
- Production-mode browser verification exposed no provider key or environment-variable name. The local provider failure remained visible and usable; it was not hidden or replaced with fixture data.

## 9. Immutable-boundary audit

- `git diff --name-only -- app/api lib supabase types` returns no files.
- No API, provider, domain, storage, schema, Supabase, shared-type, recommendation, itinerary, or map-owner contract changed.
- The changed set is limited to presentation components, CSS, route presentation, tests, and this QA document.
- Protected homepage hero/photo/launcher/process/example-course files are unchanged.
- Repeat this audit after the final QA document edit and before staging.

## 10. Remaining `surface-panel`/radius/shadow/pill exceptions

| Pattern | Owner | Classification |
| --- | --- | --- |
| `.surface-card` / `.surface-panel` CSS aliases | Compatibility declarations; now 10px/no shadow | Retained compatibility |
| `surface-panel` JSX | Unimported legacy `PetProfileForm` | `DEAD_OR_UNREACHABLE` |
| Larger radius/shadow grammar | Unreferenced `TripPreferencesForm` and `EmotionalCtaCard` | P3 dead-code cleanup |
| Legacy radius/shadow variables | Older/protected selector families | Retained compatibility; live exceptions audited |
| Circular/pill treatments | Avatars, status/provenance badges, progress markers | Functionally justified |
| Floating shadows/pills | Map controls/markers, menu/dropdown/dialog, selected-place overlay | Functional overlay exception |
| Homepage hero/media/launcher | Approved protected upper | Frozen reference exception |

## 11. P0/P1/P2/P3 findings

- P0: none.
- P1: none. The earlier provider-key artifact is not present in the fresh build or production-mode browser captures.
- P2: none in the verified public/logged-out surface. Signed-in account/profile/pet/onboarding UI is `NOT_VERIFIABLE — no existing safe authenticated fixture/session`, not asserted as browser-verified.
- P3: unreferenced legacy planner/home components and larger compatibility tokens remain optional cleanup. Sparse desktop auth/error documents are deliberate utility-state composition, not a broken hierarchy.
- Evidence limitation: populated catalog/map and the initial successful recommendation result are deterministic Playwright states. The in-app browser truthfully captured direct entry, request-backed generating, recoverable provider failure, and a previously saved result/editor without replacing provider behavior with fixtures.

## 12. Pre-existing baseline blockers

| Prior Prompt 3 observation | Prompt 4 status |
| --- | --- |
| User-visible `geometry`/Kakao engineering prose | Resolved and browser-tested |
| Public unsupported-region `준비 중` actions | Resolved by omitting unavailable actions |
| Planner focused heading removed its outline | Resolved and E2E-tested |
| Skip link worked only on homepage | Resolved with global `#main-content` target |
| Large legacy surface/radius tokens could affect unverified flows | Classified as unreachable, compatibility, functional overlay, or P3 cleanup |

Current verification gates: typecheck passed; lint passed; 139 unit files / 1,328 tests passed; production build passed with 25 generated static pages; the complete default Playwright suite passed with 259 passed / 39 intentional skips / 0 failed. A second no-reuse run started its own fresh development server and completed the same 298 entries with 259 passed / 39 skipped / 0 failed. On Windows, that runner hung only while shutting down its already-completed web server and was terminated after the last test; port 3000 was then confirmed free. This is test-harness teardown behavior, not a product or test failure.

final result: passed

---

# Historical: WEEKENDOG `ui_ver2` remaining UI Prompt 3 — final design QA

This section is historical and does not override the Prompt 4 assessment above.

## Reference and final evidence

- Historical detail reference: Browser Comment 2 supplied in this conversation, showing the former narrow `PET ACCESS ASSESSMENT` panel and its long unused left column. The maintained repository now also contains `.codex-reference/weekendog-ui-reference.png`.
- Cross-page comparison baseline: the approved Prompt 1/2 implementation and its final captures in this evidence set; Prompt 3 does not reinterpret or restyle the approved homepage upper section.
- Final evidence directory: `verification-evidence/weekendog-ui-ver2/remaining-ui/final/`.
- Place detail: `place-detail-1440x1000.png`, `place-detail-1024x900.png`, `place-detail-390x844.png`, `place-detail-320x720.png`.
- Cross-page normal states: `homepage-948x1660.png`, `catalog-1440x1000.png`, `catalog-390x844.png`, `planner-1440x1000.png`, `planner-390x844.png`.
- Recommendation states: `direct-entry-1440x1000.png`, `direct-entry-390x844.png`, `generating-1440x1000.png`, `generating-390x844.png`, `result-1440x1000.png`, `result-390x844.png`.
- Static audit report: `premium-audit.json` (`strict`, 0 findings).

## Adopted and omitted reference elements

| Reference or target element | Decision | Final treatment |
| --- | --- | --- |
| Strong first-view visit decision | Adopted | Verdict, one concise explanation, at most three key conditions, and essential visit facts form the only emphasized summary. |
| Wide detail composition | Adopted | Image and decision/facts share the upper two-column region; introduction and evidence use the full content width below it. |
| Editorial rows and dividers | Adopted | Pet evidence, official source text, source identity, licensing, and report support use flat rows and separators. |
| Korean task headings | Adopted | `반려동물 동반 안내`, `동반 근거와 확인 사항`, `출처와 정보 신뢰도`, and `기술 정보` replace console-like English labels. |
| Technical transparency | Adopted, de-emphasized | Trust score, rule versions, calculation/evaluation time, sub-scores, and provider metadata remain available in two accessible disclosures. |
| Side-by-side mega-cards | Omitted | The former `PET ACCESS ASSESSMENT` and `SOURCE & TRUST` dashboard surfaces are removed. |
| Nested score/source cards and progress styling | Omitted | No nested card grid, score mini-card, progress meter, or ordinary content shadow remains in the changed detail flow. |
| Invented metrics or reference copy | Omitted | No count, score, time, date, distance, condition, or source record was fabricated to fill the layout. |

## Three-layer information architecture

1. **Visit decision:** pet-access verdict, concise explanation, key conditions, address/contact/hours/closing/parking/reservation facts.
2. **Evidence:** place overview, preserved pet-access conditions and scopes, Korean Tourism Organization evidence, limitations/conflicts, source count, provider identity, preserved source URL, licensing and report support.
3. **Technical transparency:** evaluator/provider state, ruleset versions, evaluated/computed timestamps, trust score and all detailed factors in collapsed disclosure regions.

The rendered order is decision → overview → pet evidence → source/trust evidence → technical disclosure. A sole licensing/report support panel spans the full available width, and licensing field groups are flattened to divider rows.

## State matrix

| Surface | Verified states |
| --- | --- |
| Place detail | allowed, conditional, not allowed, insufficient evidence, inquiry-only, conflicting evidence, provider unavailable, partial fallback, legacy fail-closed, spoofed content type, malicious text rendered inert, licensing match/no-match/ambiguous/partial/unavailable, image failure fallback. |
| Homepage | normal populated, search, ordered selection, loading, partial failure, total failure, Kakao map failure with usable list, retry, pagination, mobile list/map. |
| Catalog | loading, normal, search/clear/zero, category and source filters, sorting, pagination, list/map, marker-row selection, map/provider failure fallback. |
| Planner | neutral entry, step validation, back/next persistence, departure search, map-picked and current-location departure, stale/failed search protection, final submit. |
| Recommendation | direct entry, request-backed generating, provider result, recoverable failure, reroll, stale-request protection, manual edit/revalidate/restore, save/refresh restoration. |

## Responsive matrix

| Width | Result |
| ---: | --- |
| 1440 × 1000 | Wide image/decision split, full-width evidence sequence, no blank support column, no horizontal overflow. |
| 1024 × 900 | Stable tablet two-column upper region and readable evidence transition. |
| 948 × 1660 | Approved homepage upper hierarchy remains unchanged; normal lower workbench evidence is preserved. |
| 768 px | Existing home/catalog/planner transformations retain their actions and scroll ownership. |
| 390 × 844 | Single-column detail, reachable 44 px disclosure triggers, list/map controls, no document overflow. |
| 320 × 720 | Long Korean copy wraps, facts and source rows collapse to one column, disclosure labels remain usable, no document overflow. |

## Accessibility and interaction

- Disclosure triggers are native buttons with `aria-expanded`, stable `aria-controls`, textual `펼치기`/`접기` state, visible `:focus-visible`, Enter/Space behavior, and focus retention after activation.
- Collapsed technical panels use the native hidden contract; content becomes visible and available when expanded.
- Disclosure icon rotation is removed under `prefers-reduced-motion: reduce`.
- The upper facts use valid `dl` → grouping `div` → `dt`/`dd` semantics. Headings and regions expose the visual hierarchy to assistive technology.
- External source links retain descriptive Korean labels, open in a new tab with `rel="noreferrer"`, and no icon is the sole carrier of meaning.
- Browser measurement reported 0 px horizontal document overflow at 390 and 320 px. Automated keyboard and narrow-viewport assertions pass in both configured browser projects.

## Data truthfulness and immutable contracts

- Pet-access verdicts, evidence text, conditions, allowed/denied scopes, conflicts, warnings, provider records, source URLs, timestamps, rule versions, trust score, and trust factors are passed through unchanged.
- Trust score remains explicitly labeled as evidence confidence rather than a probability or access verdict.
- No API, schema, shared domain type, provider normalization, source-preservation, trust-calculation, pet-access evaluation, recommendation, route, or map owner changed.
- Existing provider failure and missing-image states remain truthful; fixtures are used only by deterministic tests and captures.

## Cross-page anti-template gate

- Approved homepage upper section: unchanged by Prompt 3; static hero and one primary CTA remain intact.
- Changed detail flow: no generic English eyebrow, automatic carousel, ordinary shadow, nested card, score grid, repeated round-icon feature grid, fake metric, or duplicate progress system.
- Homepage lower, catalog, planner, direct-entry, generating, result, and detail screenshots were reviewed together. No new P0–P2 visual or interaction issue was found.
- Direct-entry is neutral rather than endlessly loading; generating is request-backed; zero-selection and missing-image states stay bounded; user-facing Kakao failures retain usable content.

## Findings and baseline policy

### Prompt 3 changes

- P0: none.
- P1: none. The former console-like side-by-side mega-card hierarchy and large unused column are resolved.
- P2: none. Technical data order, disclosure semantics, sole-support-panel width, nested licensing rows, and description-list semantics were corrected before final capture.
- P3: long evidence sets still require normal document scrolling; this is truthful content density and not iterated into tabs or truncation.

### Proven pre-existing observations outside Prompt 3 scope

- P2: recommendation and itinerary map explanations expose the developer term `geometry` (`components/itinerary/recommendation-planner.tsx`, `components/itinerary/itinerary-editor.tsx`). These lines predate Prompt 3.
- P2: an unsupported-region catalog tab exposes a disabled public `준비 중` action (`components/places/results-explorer.tsx`), introduced by the already-completed Prompt 2 commit.
- P2: the planner programmatic heading focus style removes its outline without a replacement (`app/weekendog-globals.css`), predating the remaining-UI commits.
- P2: the shared header's skip link is visually enabled only on the homepage, and legacy global surface tokens can still permit softer/larger-radius content outside the verified target flows. Neither was introduced or expanded by this refactor.

These baseline observations do not fail the changed place-detail scope or any automated gate, but they prevent an unqualified repository-wide design PASS under the supplied baseline policy.

## Verification result

- Typecheck: passed.
- Lint: passed.
- Unit: 136 files, 1,309 tests passed.
- Production build: passed; 25 static pages generated and all routes compiled.
- Focused place-detail regression: 82 passed with one worker after isolating a transient parallel test-server provider response.
- Relevant cross-page Playwright: 216 passed, 26 intentional project/evidence skips.
- Complete default Playwright: 242 passed, 38 intentional project/evidence skips, 0 failed.
- In-app Browser: detail requests returned 200, console warning/error count 0, disclosures default-collapsed, and 390 px overflow 0.
- Frontend premium strict audit: 0 findings.

final result: passed with baseline blocker

---

# WEEKENDOG `ui_ver2` homepage feature completion — design QA

## Ground truth and evidence

- Reference: `.codex-reference/weekendog-ui-reference.png` (948 × 1660).
- Deterministic final captures: `verification-evidence/weekendog-ui-ver2/feature-completion/final/`.
- Same-canvas reference comparison: `reference-vs-homepage-948x1660.png` (reference left, implementation right).
- Same-canvas revision comparison: `before-vs-corrected-948x1660.png` (previous implementation left, corrected implementation right).
- Normal viewport evidence: 1440 × 1000, 1024 × 900, 948 × 1660, 768 × 1024, 390 × 844, and 320 × 720.
- Focused state evidence: search, two-place tray, loading, partial failure, total failure, Kakao map failure, 390 px list/map switch, 320 px list, and 390 px stacked tray.

The reference is used for hierarchy, density, alignment, surface treatment, and emphasis. Runtime counts, place names, provider labels, verdicts, and availability remain data-derived.

## Twelve-part scorecard

| Area | Score / 10 | Evidence-based assessment |
| --- | ---: | --- |
| Header | 8.6 | 70 px lightweight desktop header, enlarged WEEKENDOG lockup, preserved navigation and accessible mobile menu. |
| Hero | 9.0 | One static documentary-style Busan photograph, deep-green left copy, no carousel motion or controls, and reliable mobile separation. |
| Utility bar | 9.1 | One compact region control and one primary `여행 만들기` CTA; desktop crossover and mobile stacking are both verified. |
| Process | 8.5 | Exact three-step ordered flow, compact desktop connectors, and readable mobile vertical sequence. |
| Example course | 8.6 | One truthful four-stop editorial course with a 38/62 desktop split and denser single-row timeline details. |
| Map/list workbench | 9.3 | One bounded 500–590 px map/list surface, separated focus and selection, accessible pagination, and usable list during map failure. |
| Search | 9.2 | Real NFKC local search, IME-safe input, Escape/clear behavior, truthful zero/provider states, and synchronized map/list results. |
| Selected-place tray | 9.0 | Existing snapshot contract, real count, first three items, preserved overflow, reorder/remove controls, and exact selected-mode handoff. |
| Discovery | 8.2 | Existing real data and filters remain reusable by keyboard and touch at a compact 5–6-card desktop density. |
| Trust/partners/contact | 8.4 | Flat verification principle, local official marks, small GitHub utility, and homepage-scoped footer hierarchy. |
| Overall density | 8.3 | The final 948 px workbench begins near y=935 after the approved 410 px hero and compact process/course ranges; substantially denser than the prior y≈1204 state. |
| Brand fidelity | 8.6 | Forest/cream palette, low motion, matte surfaces, compact typography, real official marks, and the generated Busan asset form one consistent system. |

Average score: **8.73 / 10**. Every area is at least 7, the workbench is at least 9, and the tray is at least 8.

## Interaction, responsive, and state review

- Search, browse/search tabs, map/list switch, filters, marker/row focus, checkbox-only itinerary selection, removal, reordering, retry, pagination, discovery filters, and all primary links are functional.
- Loading retains the workbench shell and never claims a definitive zero. Partial failure preserves rows/search/selection. Total failure stays compact. Kakao failure keeps the list and itinerary flow usable.
- The generated image and all visible images have `naturalWidth > 0`; fonts finish loading before captures.
- No document horizontal overflow was found at any required viewport. Mobile list/map switching and the stacked selected-place tray have focused captures.
- Touch targets, tab semantics, roving focus, skip link, external-link naming, reduced motion, and dense-list pagination meet the reviewed interface guidance.

## Findings

- P0: none.
- P1: none. The former 239-row keyboard trap is resolved with accessible 12-row pagination while all map markers remain available.
- P2: none. Mobile hero collision/contrast, incomplete tabs, inactive loading/error controls, sub-44 px targets, oversized rows, missing skip navigation, and excessive editorial height were corrected and re-captured.
- P3: the official-only discovery filter can leave unused horizontal space when the truthful data set contains only three items; no synthetic cards are added to fill it.

The visual score and local release gate are complete: clean install, dependency audit, typecheck, lint, 1,188 unit tests, production build, the complete 248-case Playwright matrix (216 passed, 32 intentional platform/evidence skips, 0 failed), and the opt-in evidence suite passed. Protected Preview verification is tracked separately in the release report and does not change this deterministic design score.

final result: passed

---

# Historical: WEEKENDOG `ui_ver2` pre-feature-completion design QA

## 1. Reference image

- Authoritative reference: `C:/Users/pjh25/Desktop/PetPass-ui-ver2/.codex-reference/weekendog-ui-reference.png` (948 × 1660).
- It is used only for hierarchy, density, spacing, alignment, section order, surfaces, and emphasis—not as product data.

## 2. Implementation screenshot

- Equivalent implementation: `verification-evidence/weekendog-ui-ver2/final/homepage-948x1660.png`.
- Same-state comparison: `verification-evidence/weekendog-ui-ver2/final/reference-vs-implementation-948x1660.png` (reference left, implementation right).
- Supporting catalog, planner, and schedule captures are in the same final evidence directory.

## 3. Viewports

- Homepage: 1440 × 1000, 948 × 1660, 1024 × 900, 768 × 1024, 390 × 844, 320 × 720.
- Catalog: 1440 × 1000, 1024 × 900, 390 × 844, 320 × 720.
- Planner steps 1–3: 1440 × 1000, 390 × 844, 320 × 720 each.
- Matched schedule: 1440 × 1000, 390 × 844, 320 × 720.

## 4. Stable UI states

- Homepage: 부산 전체, official and Kakao-candidate data ready, static hero, first official place selected, deterministic Kakao canvas.
- Catalog: 부산 전체, default categories, recommendation sort, first page, deterministic provider data and canvas.
- Planner: neutral step 1, completed pet data at step 2, confirmed departure and preferences at step 3.
- Schedule: successful provider-backed mocked recommendation with three stops and deterministic geometry.
- Loading, partial, empty, retry, map-failure, and reduced-motion states are covered by the complete Playwright suite.

## 5. Section comparison

| Reference element | Adopted/Omitted | Implementation evidence | Reason |
| --- | --- | --- | --- |
| Overlay or lightweight homepage header | Adopted | `components/layout/site-header.tsx`, `homepage-948x1660.png` | Lightweight over the hero; mobile menu below 900 px. |
| Static Busan hero image | Adopted | `components/home/hero-photo-carousel.tsx` | One preloaded image; no timer, autoplay, or carousel controls. |
| One strong hero CTA | Adopted | `components/home/hero-planner-launcher.tsx` | One filled `여행 만들기` action in the upper viewport. |
| Compact region utility bar | Adopted | `components/home/hero-planner-launcher.tsx` | Region and submit share one compact surface. |
| Three-step process | Adopted | `components/home/recommendation-process-section.tsx` | Flat numbered row instead of feature cards. |
| Example-course editorial layout | Adopted | `components/home/example-course-card.tsx` | One image-and-timeline editorial story. |
| Two-course layout | Omitted | `components/home/example-course-card.tsx` | The product has one truthful non-personalized example; duplication would add unsupported content. |
| Map/list workbench | Adopted | `components/home/homepage-live-experience.tsx`, `catalog-1440x1000.png` | Map and compact results share one bounded surface. |
| Selected-place tray | Adopted | `.homepage-selected-place` | Existing homepage selection is shown as one compact map overlay. |
| Result-row density | Adopted | `.homepage-workbench-row`, `.catalog-result-card` | Source, status, location, and actions stay compact without nested cards. |
| Supporting discovery row | Adopted | `components/home/official-place-carousel.tsx` | Data-driven cards follow the workbench; no fixed count is presented. |
| Trust strip | Adopted | `components/home/public-data-trust-card.tsx` | Explains verification principles without a fabricated score. |
| Partner logos | Adopted | `components/home/partner-brand-mark.tsx` | Uses local official assets without placeholders. |
| Contact/footer structure | Adopted | `components/home/contact-card.tsx`, `components/layout/site-footer.tsx` | Contact and safety copy close the page. |

The final density pass reduced desktop hero, process, and editorial heights so the workbench enters the 948 × 1660 comparison frame while retaining the real product's richer information.

## 6. Typography

- Existing Pretendard/system typography and deep-green hierarchy are preserved.
- Hero, process, editorial, workbench, and result headings step down consistently.
- Generic English eyebrow copy was removed from the homepage error state.

## 7. Spacing

- Desktop hero height, process padding, course image height, timeline padding, and lower spacing were tightened after the combined comparison.
- Header, launcher, editorial, workbench, and trust/footer share shell alignment.
- Mobile keeps document-flow hero content and touch-safe spacing.

## 8. Surfaces

- Ordinary content cards use radii at or below 12 px and no content shadow.
- Shadow is limited to floating/popover affordances.
- The workbench owns its border and internal scrolling; rows are not nested cards.
- `ui_ver2` tokens remain scoped; legacy global tokens were not broadly replaced.

## 9. Data truthfulness

- Counts, distances, times, retrieval dates, and verdicts remain provider or response derived.
- No reference-image number was copied into runtime UI and no trust score was invented.

## 10. Interaction fidelity

- Navigation, region choice, map/list, filters, row/marker selection, planner steps, alternatives, save, edit, and retry remain functional.
- `currentStep` is UI-only; existing form state preserves values when moving backward.
- No provider, request, map, recommendation, or persisted-flow owner was added or moved.

## 11. Loading/error fidelity

- Initial loading never shows `총 0곳` or simultaneous empty state.
- Public map failures use nontechnical copy and keep lists usable.
- Partial and retryable failures stay explicitly labeled; strict frontend audit findings are zero.

## 12. Responsive behavior

- Desktop navigation begins at 900 px; narrower layouts use the accessible menu.
- Mobile catalog owns list/map switching and no requested viewport widens the document.
- Lower content remains scrollable; the document scrollbar is not hidden.

## 13. Accessibility

- Landmarks, headings, labels, tabs, progress, status/alert regions, and focus-visible styles remain intact.
- Escape/focus restoration, current-step validation focus, reduced motion, and 320 px overflow are covered by Playwright.
- Server-owned forms declare `noValidate` while retaining their Zod validation.

## 14. P0 findings

- None.

## 15. P1 findings

- Resolved: the first combined comparison placed the workbench too low. The density pass now brings it into the 948 × 1660 frame and better matches the reference hierarchy.

## 16. P2 findings

- Resolved: three server-action forms did not declare the application validation owner.
- Resolved: one WebKit scrollbar override lacked its standards-based color property.
- Resolved: the homepage provider-error eyebrow used generic English copy.
- Resolved: nonessential `!important` declarations were removed; remaining uses enforce reduced motion or the native hidden contract.
- Resolved: the 948 px state used a mobile header; desktop navigation now remains visible from 900 px.

## 17. P3 findings

- This historical assessment is superseded by the homepage feature-completion scorecard and evidence above.

final result: superseded

---

# WEEKENDOG homepage annotation revision — design QA

- Source visual truth: in-app Browser annotations 1–12 from the 1403 × 986 homepage view, including the Comment 12 partner-strip reference (`browser-comment://comment-12/additional-reference`, 622 × 67 px conversation attachment).
- Implementation screenshots:
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-1403x986.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/trust-strip-1403x986.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-390x844.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/trust-strip-390x844.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-1403x986-fine-tune.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-390x844-fine-tune.png`
- Viewports: desktop 1403 × 986 CSS px and mobile 390 × 844 CSS px; browser captures used device scale factor 1. The narrow 320 × 720 CSS px state was checked for overflow without a comparison capture.
- State: `/` with the live homepage snapshot ready, default 부산 전체 region, the official and Kakao candidate map filters active, and the default official place selected.

## Full-view comparison evidence

The desktop capture confirms the annotated hero and map composition before the final launcher alignment adjustment: the evidence badge and two future planner labels are absent; the single destination heading is enlarged; the former map summary, internal legend, and below-map layer panel are replaced by one functional filter panel; and the selected card remains inside the map while clearing the lower-right Kakao watermark. The final launcher geometry is guarded separately by the 1403 px browser test described in comparison item 6.

The mobile capture confirms the launcher returns to normal document flow rather than inheriting the desktop overlay offset. Browser measurement reported zero horizontal overflow at both 390 px and 320 px.

## Focused region comparison evidence

The Comment 12 reference uses a compact partner strip: a short trust statement on the left, a divider, and evenly spaced official marks without individual provider-card backgrounds. The desktop trust capture follows that structure with the three supported WEEKENDOG sources. The mobile capture intentionally stacks the introductory copy over the same three-mark row to preserve legibility. The supplied transparent 행정안전부 mark received a transparent-canvas-only trim so its visible scale matches 한국관광공사 and 카카오맵; its artwork, colors, and aspect ratio remain unchanged.

## Required fidelity surfaces

- Fonts and typography: existing Pretendard stack and WEEKENDOG weight hierarchy are preserved; the destination prompt is promoted to 15 px/900 and remains readable at 320 px.
- Spacing and layout rhythm: launcher padding and width are reduced; the desktop launcher aligns below the copy at the shell's left edge; mobile positioning resets; map overlays use consistent 24 px insets and the selected card clears the watermark.
- Colors and tokens: existing cream, forest green, white, border, shadow, and state colors are reused without introducing a new palette.
- Image quality and asset fidelity: existing hero photos and official local partner assets are used. No placeholder or code-drawn logo replaces a supplied mark.
- Copy and content: all four requested hero strings and both duplicate map labels are removed. Existing truthful source labels, counts, and provider-unavailable status remain available through the functional filter controls.

## Comparison history

1. P1 — the first mobile pass inherited the desktop `left: 44%` launcher offset and clipped the form. Fixed by resetting `left` and `bottom` at the tablet/mobile breakpoint; the revised 390 px capture has zero overflow.
2. P2 — the first partner-strip pass exposed excessive transparent canvas around the 행정안전부 signature, making it visibly smaller than the neighboring marks. Fixed with a 419 × 108 transparent-canvas-only display copy and verified in desktop/mobile trust captures.
3. P2 — the original carousel controls occupied the same lower image zone as the new launcher overlay. Fixed by moving desktop carousel controls and slide status to the top edge while retaining the existing mobile control position.
4. P2 — the previous map layer fieldset changed the map shell height and allowed the selected card to sit near the canvas boundary. Replacing it with the internal filter panel and setting a 70 px bottom inset keeps the selected card inside the canvas and above the watermark; the geometry assertion passes on desktop.
5. P2 — the follow-up desktop annotation requested a wider, more leftward launcher and a shorter partner strip. At 1403 px the launcher now measures exactly 550 px and begins 4.4 px before the hero media edge; the public-data card measures exactly 200 px. The 1024 px breakpoint keeps those fixed desktop dimensions, while the existing tablet/mobile rules restore full-width launcher flow and content-driven trust-card height. The measured horizontal overflow remains 0 px at 1403, 390, and 320 px.
6. P2 — the next annotation supersedes the partial image overlap from item 5: the 550 px desktop launcher now aligns exactly with the hero shell's left edge and sits below the copy block, fully outside the photo column. Tablet and mobile continue to use the existing document-flow launcher layout.

## Findings

No actionable P0, P1, or P2 differences remain. The launcher no longer covers the hero photograph on desktop, and the responsive launcher remains in normal document flow on tablet and mobile.

## Follow-up polish

- P3: if the hero copy length changes later, recheck the vertical gap above the launcher at 1024–1439 px.

final result: passed

---

# WEEKENDOG homepage map category dropdown — design QA

- User annotation: replace the homepage map's fixed provider-layer panel with the same place-category dropdown used by the full results explorer.
- Verified route: `http://localhost:3000/`.
- Viewports: 1915 × 1272, 390 × 844, and the 320 px overflow regression.

## Final behavior

- The compact `필터` trigger is anchored at the map's top-left on desktop and placed immediately above the map on mobile.
- The dropdown contains only the seven place categories: 관광지, 식당, 카페, 숙소, 쇼핑, 동물병원, 펫샵·용품점.
- 관광지·식당·카페·숙소 are selected by default. Draft choices do not change markers until `적용하기` is pressed.
- `초기화` restores the four default travel categories. Escape closes the dropdown and returns focus to the trigger; clicking outside also closes it.
- Provider identity remains truthful on markers, selected-place cards, and the map watermark; the removed provider controls are not recreated inside the dropdown.

## Responsive evidence

- Desktop measured trigger: 76 × 44 px. Dropdown: 380 × 447.9 px, fully contained within the 1280 px map shell with no horizontal document overflow.
- Mobile 390 px measured dropdown: 358.4 × 425.6 px with no horizontal document overflow.
- At 320 px the dropdown is 288 px wide, categories use one column, and document overflow remains zero.

## Findings

No actionable P0, P1, or P2 differences remain for the requested homepage dropdown revision.

final result: passed

---

# WEEKENDOG results category dropdown revision — design QA

- User annotation: remove the provider/source filter and replace the centered modal with an anchored dropdown.
- Verified route: `http://localhost:3000/results?tab=catalog&region=busan&page=50`.
- Viewports: 1403 × 986, 390 × 844, and the 320 px overflow regression.

## Superseded behavior

The earlier `results filter popup` modal specification is superseded by this revision. The filter no longer dims or blurs the page, no native `dialog` is mounted, and 한국관광공사/카카오맵 are no longer selectable provider filters. Provider markers remain present and truthfully identified in the map source legend.

## Final behavior

- The results-header `필터` button toggles a dropdown anchored below the button.
- The dropdown contains only the seven place-type controls, plus `초기화` and `적용하기`.
- Draft selections do not change results until `적용하기` is pressed.
- Escape returns focus to the trigger; clicking outside closes the dropdown.
- Desktop measured dropdown: 368.9 × 443.4 px with zero document overflow.
- Mobile 390 px measured dropdown: 349.6 × 425.6 px with zero document overflow.
- At 320 px, categories use one column and document overflow remains zero.

## Findings

No actionable P0, P1, or P2 differences remain for the requested revision.

final result: passed

---

# WEEKENDOG results filter popup — design QA

> Historical record only. The later `results category dropdown revision` above supersedes this centered modal and its provider controls.

- Source visual truth: `C:/Users/pjh25/Downloads/ChatGPT Image 2026년 8월 23일 오후 04_09_37.png` (1536 × 1024 px).
- Implementation screenshots:
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-popup-2026-08-23/results-filter-1403x986.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-popup-2026-08-23/results-filter-390x844.png`
- Combined comparison: `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-popup-2026-08-23/reference-vs-implementation.png`.
- Viewports: desktop 1403 × 986 CSS px and mobile 390 × 844 CSS px, device scale factor 1. The desktop dialog measures 940 px wide; the mobile dialog measures 374.4 × 668.6 px with no document overflow.
- State: `/results?tab=catalog&region=busan&page=1`, 부산 전체, filter dialog open, both data providers and the four default travel categories selected.

## Full-view comparison evidence

The permanent map overlay was removed. The results-header `필터` control now opens a centered modal over the existing map and result cards. The dialog follows the reference sequence: provider source choices, divider, travel-place heading and guidance, four selected travel categories, three optional categories, then reset and apply actions. The live map, result pagination, and district controls remain visible behind a blurred dimmed backdrop.

## Focused region comparison evidence

The reference and implementation were combined into one comparison image. Both use two provider controls, four columns for the selected travel categories, category-colored icons, round check states, subdued unselected controls, and a separated action row. The implementation intentionally uses the project's official transparent 한국관광공사 and 카카오맵 assets and WEEKENDOG tokens. Live counts remain data-driven, so the captured values differ from the illustrative reference.

## Required fidelity surfaces

- Fonts and typography: the existing Pretendard stack, compact 24 px dialog title, 22 px travel-place heading, and 14–15 px control labels preserve the reference hierarchy within the product's denser results view.
- Spacing and layout rhythm: 34 px desktop body padding, 14 px provider gap, 12 px category gap, and a fixed footer create the same grouped rhythm while keeping all actions visible.
- Colors and tokens: WEEKENDOG forest green, soft selected background, neutral line, and existing category colors are reused.
- Image quality and asset fidelity: real local partner logo files and Lucide icons are used; no placeholder, emoji, or handcrafted SVG is introduced.
- Copy and content: `출처 (데이터 제공처)`, `여행 장소`, the supporting sentence, `초기화`, and `적용하기` follow the supplied reference. The bottom legend now labels the yellow provider as `카카오맵`.

## Comparison history

1. P2 — the first popup pass repeated provider names beside logo images whose artwork already contained those names. The duplicate text was removed and the logo/count grid was rebalanced.
2. P1 — opening the dialog directly from the click handler could lose the modal after a concurrent results rerender. Dialog visibility is now synchronized from React state, so pagination and repeated filter cycles remain stable.
3. P2 — the desktop grid would be too dense if carried unchanged to a narrow viewport. The mobile popup uses one provider column and two category columns; the measured 390 px state has no horizontal overflow.

## Findings

No actionable P0, P1, or P2 visual differences remain. Counts differ only because the implementation displays current provider data instead of the reference's illustrative values.

## Follow-up polish

- P3: if longer localized category names are introduced, recheck the 390 px two-column label wrapping.

final result: passed

---

# WEEKENDOG results category-panel redesign — design QA

> Historical record only. The later `results category dropdown revision` above supersedes this permanent map overlay.

- Source visual truth: Browser Comment 1 additional reference (`browser-comment://results-category-panel/comment-1/reference`, 964 × 510 px conversation attachment).
- Implementation screenshot: `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-redesign-2026-08-23/results-filter-1403x986.png`.
- Viewport: 1403 × 986 CSS px, device scale factor 1. The implemented panel measures 720 × 310 px within the existing map canvas.
- State: `/results?tab=catalog&region=busan&page=1`, 부산 전체, default travel categories selected, optional category counts not yet requested.

## Full-view comparison evidence

The reference's white category surface, red location cue, clear title/subtitle hierarchy, three-column button grid, circular selection states, category-colored icons, counts, rounded borders, and soft selected backgrounds are reproduced inside the existing map overlay. The unrelated right results column and live map remain in their established proportions. The duplicate right-side filter disclosure is absent, while the district selector is retained in the top toolbar so functionality is not lost.

## Focused region comparison evidence

The source and implementation were compared at the category-panel level. A focused review was required because icon tone, one-line category labels, check states, and counts are too small to judge from the full-page composition alone. The final 720 px panel keeps `펫샵·용품점` on one line and preserves three equal columns; unavailable optional counts intentionally render as `…` until that provider layer is requested.

## Required fidelity surfaces

- Fonts and typography: the existing Pretendard stack is retained; 22 px/900 title, 13 px supporting copy, and 14 px category labels reproduce the reference hierarchy without introducing a new font.
- Spacing and layout rhythm: 20 px panel padding, 12 px column gaps, 58 px controls, 18 px radii, and a 3-column grid match the reference density while fitting the existing map.
- Colors and visual tokens: WEEKENDOG white, forest-green selected state, neutral border, and shadow tokens remain intact; the reference's category-specific green, orange, brown, purple, red, and blue icon cues are added.
- Image quality and asset fidelity: the reference contains no raster imagery. All visible symbols use the installed Lucide icon library; no emoji, handcrafted SVG, CSS drawing, or placeholder asset is used.
- Copy and content: `여행 장소` and `반려견과 함께 방문 가능한 장소를 선택해보세요.` match the supplied reference. Existing truthful live counts and loading ellipses remain data-driven.

## Comparison history

1. P2 — the first 620 px implementation forced the longest category label onto two lines. The panel was widened to 720 px; the post-fix screenshot shows a stable one-line label and three equal columns.
2. P2 — removing the right filter disclosure initially risked removing district selection. The district selector was moved into the existing top toolbar and verified for Busan and Jeju states.
3. P2 — the original two visible fieldset labels and reset-button row differed from the compact reference. The categories now share one accessible fieldset with a screen-reader legend, while the visible panel presents only the requested heading, supporting copy, and category controls.

## Findings

No actionable P0, P1, or P2 differences remain. The optional category count ellipsis is an intentional live-data loading state rather than visual drift.

## Follow-up polish

- P3: if category names or localization become longer, revisit the 720 px desktop width and the 359 px single-column breakpoint.

final result: passed

## Map workspace revision — 2026-09-06

Reference: user-supplied ChatGPT Image 2026년 9월 6일 오전 11_23_36.png.
Scope: /results?tab=catalog, existing WEEKENDOG shell and live provider contracts.

- Compared the supplied reference with the actual local IAB render, including
  the selected-place preview. Left rail, edge-to-edge map, photo list, pagination
  and right map controls reproduce the requested structure.
- Mobile preview initially covered zoom controls; reserved a separate right
  control lane and reran both desktop/mobile interaction checks successfully.
- Desktop/map and mobile screenshots: test-results/full-map-explorer-matches--089b5-a-dismissible-place-preview-{chromium,mobile-chrome}/map-redesign.png.
- Final focused browser run: 7 passed, 1 existing desktop-only skip; additional
  Gyeonggi marker/list synchronization rerun passed. Includes map/list switching,
  source/region/filter controls, 320–1024px overflow, popup close, zoom/satellite
  and preservation of marker registry size.
- npm run verify passed (typecheck, lint, 1438 unit tests, production build).
  Final build, lint and targeted browser checks passed after follow-up changes.
- Existing broader-suite limitation: 7 checks expect differentiated pet-access
  labels, while HEAD's selectedItineraryVerdictLabel always returns allowed.
  This pre-existing semantic behavior was not changed by the visual request.
  The eighth initial failure selected the new preview instead of a list card;
  scoping result-list assertions fixed that regression.
- Live local KTO/snapshot requests failed during visual review; the existing
  fallback catalog, map, explicit provider errors and missing-photo behavior
  remained usable. Full official-photo success could not be reverified live.
- No fictional ratings, hours, multi-image galleries, or personal account data
  were added to match the illustration. No production deployment performed.

final result: passed (requested layout and interactions); full release validation
remains limited by the pre-existing access-label checks and live provider failure.


## Map comment fixes — 2026-09-06

- Environment / URL: local Next.js development, /results?tab=catalog&region=busan&page=1.
- Removed the source toolbar row and the application's map watermark on the catalog map; Kakao attribution remains.
- Selection scrolls only the results list; marker selection preserves mobile map mode. The rich preview is rendered through a React portal into the existing Kakao CustomOverlay at the selected coordinates.
- Desktop: real Kakao map, preview selection/dismissal and zoom checked in the in-app browser; document scroll stayed at zero.
- Mobile: existing Pixel 7 Playwright flow passed; preview and close control fit within the map.
- Browser regression: 5 passed, 1 skipped (desktop-only tray test on mobile). Includes source/watermark absence, preview lifecycle, map controls and marker-event document-scroll preservation.
- Console: no errors in the live browser check.
- Network: catalog snapshot returned 503 and the existing compatibility path supplied 538 places; one upstream tourism photo returned 404. These existing provider failures were not changed.
- Screenshots: temporary Playwright map-redesign.png artifacts inspected for desktop/mobile.
- Test mock corrected to honor custom-overlay anchoring; marker-event regression dispatches the SDK click without Playwright auto-scrolling an offscreen mock marker.

## 2026-09-06 — Four supplied page references

Final result: passed for the implemented layouts and preserved flows.

Targets: user references 05_35_48 (place), 05_35_49 (account), 05_35_55 (route result), 05_35_58 (generation).
Implementation: live /places/126078?region=busan, actual AccountPage rendered with an isolated empty-account mock, and recommendation E2E states at desktop/mobile sizes.
Evidence: verification-evidence/account-chromium.png, account-mobile-chrome.png, detail-chromium.png, detail-mobile-chrome.png, recommendation-ui-shows-co-afaa0-ithout-fake-pipeline-stages-*-redesign.png. Account reference and render, and generation reference and render were opened together for comparison. Live detail was separately checked against the supplied place image; provider photographs differ from the reference.

Iteration: shortened the overly tall hero photo to 430px desktop/240px mobile; consolidated loading UI into one panel; added bordered source and condition sections; preserved the mobile single-column arrangement. Account profile/empty-state spacing and mobile wrapping checked. Source order assertions were updated for the intentional sidebar rather than the old full-width document.

Intentional data differences: current brand/header/footer retained; no invented join date, account preferences, fee, image gallery count, or pet policy. No new legal links. Account capture is component-level layout evidence, not a real authenticated account/session test. Route screenshots use the existing provider/map test doubles; optional real tourism photos load through the existing card-details endpoint. Loading presents what is being checked without claiming completed server stages or an invented duration.

Validation: strict TypeScript, lint (clean after removing an unused test parameter), 1439 unit tests and production build passed. Relevant E2E run: 101 passed, 2 intentional skips, 1 obsolete source-order assertion; after adapting that assertion to the requested sidebar, all 6 targeted desktop/mobile checks passed, including itinerary add/remove persistence. Earlier width assertion likewise now checks the actual main column. No production deployment performed.
