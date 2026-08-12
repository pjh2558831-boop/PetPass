# Route recommendation engine V1: Stage 1 through Stage 4 contracts

Status: deterministic eligibility and candidate-pool boundaries, 2026-08-12

Stage 1 verifies which KTO Service2 places may reach route generation. It does
not define or change candidate-ranking weights, recommendation scores, route
optimization, itinerary diversity, or UI presentation.

## Stage 1 flow

```text
Tourism list
  -> content ID
  -> sync visibility
  -> common / intro / pet details
  -> provider normalization
  -> Phase 3 pet-access assessment
  -> automatic-route eligibility
```

Only a place that passes this complete boundary may be handed to later route
selection. A large catalog, a high popularity value, or a favorable future
score cannot bypass an earlier gate.

## Inputs to the eligibility decision

The server-side decision receives three typed inputs:

- the normalized KTO place, including source identity, content type,
  coordinates, provider-section states, `showflag` result, primary pet-detail
  evidence, Phase 3 result, and optional licensing evidence;
- the pet profile, including species, size, carrier, leash, muzzle, and whether
  an outdoor-only visit is acceptable; and
- the trip request, including geographic scope, requested categories, shopping
  opt-in, visit date/time, and indoor-access preference.

The deterministic result has this shape conceptually:

```ts
type RouteEligibilityResult = {
  eligible: boolean;
  status:
    | "eligible"
    | "ineligible"
    | "verification_required"
    | "provider_unavailable";
  reasonCodes: string[];
  warnings: string[];
  evidenceFieldNames: string[];
};
```

Reason codes identify failed gates. Evidence field names identify actual
`detailPetTour2` fields consumed by Phase 3; they are not inferred keywords.

## Deterministic automatic-route gate

A place is eligible only when every hard requirement passes:

| Gate | Required result |
| --- | --- |
| Source | Exact `areaBasedList2` list record and `detailCommon2` detail record from Korea Tourism Organization `KorPetTourService2`, bound to the same content ID |
| Visibility | `exposed`, confirmed from `petTourSyncList2.showflag` |
| Provider calls | List, common, intro, and pet-detail calls succeeded for every current supported Service2 type |
| Identity | Content ID, current Service2 content type, category, visibility field/value, and source metadata agree across list, detail, normalization, and Phase 3 evidence |
| Coordinates | Finite, valid coordinates in the requested geographic scope |
| Primary pet evidence | At least one meaningful `detailPetTour2` field consumed by Phase 3 |
| Pet access | `allowed`, or `conditional` with every supported mandatory condition satisfied |
| Licensing | No matched record explicitly confirms the business is closed |
| Schedule | No confirmed impossible operating-time conflict for the proposed visit |
| Category | Category is selected and allowed by the request |
| Shopping | Type `38` is both selected and explicitly enabled |

For `conditional` pet access, every machine-checkable requirement must agree
with current user input. Checks include pet species, explicit pet-size wording,
carrier, leash, muzzle, indoor/outdoor scope, and other conditions represented
by the current typed inputs. A false equipment value fails a required-equipment
condition; a missing value does not count as satisfaction. Ambiguous or
unsupported mandatory wording requires verification and cannot enter an
automatic route.

Pet-size compatibility remains separate from the base Phase 3 verdict. An
explicit compatible rule may pass and an explicit mismatch fails. An ambiguous
restriction or an unresolvable numeric limit is `verification_required`, not
invented compatibility.

## Exclusion and uncertainty behavior

These states never enter an automatic route:

- visibility `not_exposed` or `unknown`;
- visibility or another required provider section `provider_unavailable`;
- primary pet evidence `empty`, `absent`, or `provider_unavailable`;
- Phase 3 `not_allowed`, `unknown`, or `not_applicable`;
- an unmet or unverifiable mandatory pet condition;
- missing or invalid required coordinates;
- a matched, explicitly closed business;
- a confirmed impossible visit window;
- a category outside the trip request; or
- shopping without explicit selection and opt-in.

An unknown or unavailable licensing match is a warning, not proof that a
business is closed or illegal. Likewise, missing or ambiguous operating hours
do not become confirmed open; they remain warnings unless the scheduling
contract requires a known window for that visit. Only a confirmed impossible
window is the hard schedule exclusion defined in Stage 1.

The result status distinguishes why a record did not pass:

| Status | Use |
| --- | --- |
| `eligible` | Every hard gate passed |
| `ineligible` | A confirmed fact fails a hard gate |
| `verification_required` | Provider data exists but a required meaning or condition cannot be confirmed |
| `provider_unavailable` | A required provider request failed or timed out |

Provider failure does not become `not_allowed`, and uncertainty does not become
confirmed pet friendliness.

## Surface-level fail-closed rules

Provider visibility is checked before user-visible use:

| Visibility | Catalog | Detail | Map | Automatic route | Popularity / route explanation |
| --- | --- | --- | --- | --- | --- |
| `exposed` | May continue | May continue | May continue | Must pass all remaining gates | May continue |
| `not_exposed` | Excluded | Hidden as not found | Excluded | Excluded | Excluded |
| `unknown` | Excluded | Fails closed | Excluded | Excluded | Excluded |
| `provider_unavailable` | Fails closed | Fails closed | Excluded | Excluded | Excluded |

These rules apply even when an older stored map record exists. Diagnostics may
retain a redacted non-exposed row, but user-facing APIs must not return it.
Until a server-side Tourism visibility refresh writer exists, stored Tourism
rows are not served at all; official map markers are derived from the current
visibility-joined Tourism catalog. Expired stored non-Tour rows are also
excluded.

## Independent domain decisions

The following results are deliberately separate:

- provider availability;
- provider visibility;
- pet-evidence availability;
- Phase 3 pet-access verdict;
- pet-condition compatibility;
- licensing status;
- operating-time compatibility;
- information trust;
- place popularity;
- recommendation suitability; and
- future route-optimization score.

Licensing may exclude a confirmed closed place but cannot create or modify a
pet-access verdict. Trust and popularity may describe evidence or later order
already eligible candidates, but cannot override visibility, primary pet
evidence, or an unmet pet condition. Provider failure cannot be rewritten as a
denial. Kakao Local may enrich an exact KTO identity, but Kakao-only discovery
metadata cannot establish pet access and cannot enter an automatic route.

## Stage boundary and evidence

Stage 1 ends at `RouteEligibilityResult`. Ranking and route optimization consume
only eligible records in a later stage; this contract assigns them no weights.
Shopping remains a supported provider category but an explicit trip opt-in.

The bounded live validation is stored under
`verification-evidence/tour-service2-contract/`. Its sanitized rows connect
provider visibility, pet-detail fields, Phase 3 output, and eligibility reason
codes without persisting keys, complete keyed URLs, authorization headers, or
full raw responses. Failure to meet the live-evidence or eligibility gates must
block Stage 2; it must not weaken this contract or substitute fixtures.

## Stage 2: candidate-pool boundary

Stage 2 consumes the visibility-joined Stage 1 catalog and ends with at most 15
strictly eligible, utility-ranked places. It does not order route stops or call
Kakao Mobility.

The current live evidence is intentionally narrow: Stage 1 inspected 49 Busan
detail records and found only seven strict automatic-route-eligible samples.
Stage 2's deterministic fixtures and bounded comparison do not expand or
replace that provider evidence; a broader claim requires the separate,
explicitly opted-in live verifier.

```text
exposed useful Service2 catalog
  -> Stage A: category-aware lightweight retrieval (25)
  -> Stage B: common/intro schedule shortlist (20)
  -> Stage C: adaptive pet-detail eligibility batches (5, up to 20)
  -> place-utility-v1 over strict-eligible records only
  -> final eligible pool (15)
```

The detailed target is `min(10, tripPace.maxStops + 3)`. Stage C may stop after
a complete batch only when it has reached that target and preserved available
activity, selected-food, and selected overnight-accommodation coverage. It
continues beyond the old fixed-12 and the first 15 candidates when necessary,
but never inspects more than 20.

The formulas are versioned and deterministic:

```text
retrieval-score-v1 =
  0.40 preference fit
+ 0.25 Haversine proximity
+ 0.20 category coverage need
+ 0.10 list data quality
+ 0.05 popularity prior

place-utility-v1 =
  0.30 preference fit
+ 0.25 pet compatibility
+ 0.15 canonical information trust
+ 0.12 popularity-v1
+ 0.10 category priority
+ 0.08 data quality
```

Haversine proximity is a retrieval signal, not driving distance. Place utility
is computed only after `evaluateAutomaticRouteEligibility(...)` succeeds.
Allowed pet access contributes `1.0`; a compatible, fully satisfied conditional
result contributes `0.85`. Every other access state is ineligible rather than a
low utility value. Trust comes from `petpass-trust-v1`, and insufficient
popularity contributes the neutral `0.5`; neither can override eligibility.

Stage B distinguishes compatible, unknown, conflict, and provider-unavailable
schedule states. Missing or ambiguous hours stay unknown with a verification
warning and a moderate Stage B penalty. Before route order exists, the feasible
window runs from the request start to start plus the requested duration, or end
of day in stop-count mode. Fresh, unambiguous hours are compatible when they
contain any category-dwell-sized slot in that interval and conflict only when
they clearly contain none; stale, future, qualified, multi-range, reservation-
only, or unsafe-to-parse text remains unknown. The route composer later checks
the actual arrival/departure window. Provider failure is not a conflict or
denial.

If fewer candidates than the pace minimum remain, Stage 2 returns
`insufficient_eligible_places` with the eligible count, required minimum, and
reason counts. It never fills the gap with unknown records, Kakao candidates,
fixtures, or weakened evidence rules.

The complete Stage 2 retrieval, schedule, request-budget, diagnostic, controlled
comparison, and live-verification contract is documented in
`docs/candidate-pipeline-v1.md`. First-party popularity and neutral cold start
are documented in `docs/popularity-v1.md`.

Pipeline provider counters describe logical live operations: a cache miss is
one provider call, and a failure is recorded only after that logical operation
exhausts the provider client's retry policy. Candidate exclusions are reported
separately by reason. The bounded live verifier additionally counts physical
HTTP attempts, including retries, against its hard request cap.

## Stage 2 dwell-duration preparation

Stage 2 prepares these defaults for later scheduling without calculating final
arrival or departure times:

| Type | Default minutes |
|---|---:|
| `12` attraction | 90 |
| `14` culture | 90 |
| `15` festival | 120 |
| `28` leisure | 120 |
| `32` accommodation check-in | 30 |
| `38` shopping | 60 |
| `39` food | 75 |
| supplementary cafe/rest | 60 |

A reliable provider-specific duration may override the default, and the result
must preserve whether the default was used. These values do not invent opening
hours and do not modify the existing route scheduler in Stage 2.

## Stage 2 persistence and deployment status

Popularity is behind a provider-neutral repository interface. Because PetPass
does not yet have an authenticated, abuse-resistant interaction analytics
boundary, the safe runtime default is a neutral no-data repository. No
popularity migration is applied, and the unapplied Stage 1 visibility migration
remains unchanged. Stage 2 performs no deployment and no UI redesign.

The production generator obtains visibility from the live-or-server-cache
Service2 join. The recommendation boundary also compares `checkedAt` with its
captured snapshot time and accepts only evidence within the five-minute
list/visibility freshness window. Invalid, future, or stale timestamps fail
closed. Stored Tourism rows remain excluded until a verified visibility-refresh
writer can re-establish fresh `showflag` state.

## Stage 3: provider-backed travel graph boundary

Stage 3 consumes the departure and at most 15 final Stage 2 strict-eligible
candidates. It does not change candidate eligibility or utility and does not
choose stop order. The output is a provider-neutral, asymmetric directed graph
whose non-diagonal edges are resolved independently through public Kakao
Mobility operations.

```text
departure + Stage 2 strict-eligible pool (maximum 16 nodes)
  -> current multi-destination batches by origin (10 km public radius)
  -> bounded directed single-route fallback (maximum 24)
  -> explicit complete or incomplete asymmetric matrix
  -> Stage 4 deterministic order selection
  -> current/future validation of the supplied final order (maximum 5 stops)
```

Haversine distance remains a lower bound and provider-call planning signal. It
cannot populate road distance/duration, validate a final segment, or create
geometry. Matrix failures, deadline exhaustion, and budget exhaustion preserve
explicit unresolved edges so a later optimizer can avoid them.

The normal matrix has the temporal basis `current_traffic`. Current final
validation uses the public waypoint operation; a valid future instant uses the
public future-directions operation. The last supplied stop is the destination,
prior stops are waypoints, order is unchanged, and no return to the origin is
added. A final route is usable only when provider validation returns totals,
every ordered section, and validated geometry.

Request-scope promise memoization is always present. The runtime persistent
boundary is currently a provider-neutral process-memory cache: seven days for
road distance, 15 minutes for current duration, no more than 15 minutes for an
exact future request, and two minutes for negative results. Process memory is
not guaranteed across Vercel instances; no Supabase migration was prepared or
applied.

The full endpoint allowlist, edge/result contract, cache keys, budgets,
controlled comparison, optional live gate, security rules, and Stage 4 handoff
are documented in `docs/travel-matrix-v1.md`. Stage 3 adds no public matrix API,
UI redesign, deployment, or demo fallback.

## Stage 4: deterministic route selection and scheduling

Stage 4 consumes at most 15 strict Stage 2 candidates and the Stage 3 directed
matrix. An exact depth-first branch-and-bound solver selects and orders at most
five stops while simulating Asia/Seoul arrival, waiting, dwell, operating
windows, pace duration, meal/rest transitions, overnight accommodation, and an
optional return leg. It uses only resolved provider-backed edges. If the
one-second or one-million-state limit is reached, a deterministic width-256
beam fallback preserves every hard constraint and reports limited optimality.

The versioned objective discounts Stage 2 place utility by position and adds
bounded category, transition, schedule, popularity, and exposure terms while
penalizing provider driving time, waiting, repetition, detour, unknown schedule,
and pace deviation. Popularity and exposure apply only with sufficient data;
they never change eligibility. Titles are not used to infer travel roles.

Up to three complete finalists receive exact Stage 3 ordered-route validation.
The solver resimulates from returned provider sections and emits no route when
all validations fail. Stop-level explanations preserve pet verdict, provider
source, trust, place utility, dwell source, and schedule warnings. Two bounded
alternatives may be chosen only from validated finalists.

Full limits, formula, failure states, baselines, controlled comparison, and
optional live gate are in `docs/route-optimizer-v1.md`.

## Stage 5: product integration

The combined planner now submits one strict request to
`POST /api/itineraries/generate`. With the server-only feature flag enabled, the
handler calls Stage 2 → Stage 3 → Stage 4 and normalizes only a finally validated
route into `route-recommendation-response-v1`. The earlier fixed composer is not
a fallback path. Provider failures remain typed and Kakao discovery candidates
never enter automatic routes.

The result surface renders final provider distance, duration and geometry; a
chronological Tourism-source timeline; structured Korean reasons and warnings;
exact or time-limited wording; and a temporal-basis notice when search and final
validation differ. Only optimizer-returned, validated alternatives are shown.
Manual order/removal is not optimizer-selected: it is labeled `직접 수정한 일정`
and must pass a separate ordered-route validation and schedule simulation. The
20-minute edit context is integrity-signed and stateless so separate Vercel
Route Handler instances do not depend on shared process memory.

Browser persistence stores a versioned bounded product snapshot, not provider
payloads, precise request coordinates, keys, URLs, stack traces, diagnostics, or
the temporary edit-session ID. There is no authenticated persistence or safe
analytics ingestion boundary yet, so no Supabase migration is prepared or
applied and popularity stays on its neutral no-data repository. Preview release
is additionally gated on credential rotation. Operational details live in
`docs/recommendation-operations-v1.md`.
