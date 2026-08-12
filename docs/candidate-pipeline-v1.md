# Candidate pipeline V1

Status: Stage 2 server-only implementation and production itinerary integration, 2026-08-12

This document defines the bounded candidate pipeline that sits after the
Stage 1 Tourism Service2 visibility join and before any route ordering. It does
not define a Kakao travel-time matrix, final stop order, TSP search, route
quality, exploration, or UI presentation.

The strict Stage 1 decision remains authoritative. A score may choose which
record deserves another provider call or order records that are already
eligible; it cannot make an ineligible record eligible.

## Inputs and source boundary

The pipeline is server-only. Its immutable request context contains:

- the requested Busan region or verified district and departure coordinates;
- day-trip or overnight trip type;
- one versioned trip pace with `minStops` and `maxStops`;
- explicitly selected categories and the separate shopping opt-in;
- travel date, start time, and the bounded proposed visit window used for
  schedule compatibility;
- indoor/outdoor preferences and the explicit pet profile/equipment state; and
- a fixed popularity snapshot or the neutral no-data repository.

The browser cannot override pipeline limits, formula weights, provider
concurrency, or eligibility rules.

Only `KorPetTourService2` list records may enter Stage A. Each record must have:

- an exact current content type;
- a valid title and coordinates;
- an exact geographic-scope match;
- a selected category;
- `showflag=1`, normalized to `providerVisibility: "exposed"`; and
- type `38` only when shopping is both selected and explicitly enabled.

Stored Tourism rows whose visibility is absent, unknown, unavailable, stale, or
not exposed are not a candidate source. Kakao Local records are not a candidate
source. A lightweight record is never described as allowed, pet-friendly, or
route eligible.

The production itinerary path satisfies the freshness boundary by collecting
the catalog through the live-or-server-cache Service2 visibility join. The
pipeline also validates `checkedAt` against its single captured snapshot time
and rejects invalid, future, or older-than-five-minute visibility evidence,
matching the Service2 list/visibility cache contract. Therefore, an old stored
row cannot enter merely because its last stored value was `showflag=1`; stored
Tourism rows remain unusable until a verified visibility-refresh writer exists.

## Versioned limits

All limits come from one server-owned configuration:

| Boundary | Limit |
|---|---:|
| Stage A lightweight candidates | 25 |
| Stage B schedule-aware candidates | 20 |
| Stage C batch size | 5 |
| Stage C detailed evaluations | 20 |
| Final strict-eligible pool | 15 |
| Eligible reserve above pace maximum | 3 |

The eligible-pool target is:

```text
min(10, tripPace.maxStops + 3)
```

This produces targets of six, seven, and eight for relaxed, balanced, and
packed pace respectively. The target controls early stopping; it is not a claim
that provider data contains that many eligible places.

## Stage A: bounded lightweight retrieval

Stage A uses list-level data only and never calls Kakao Mobility. Every feature
is bounded to `[0, 1]` and the weighted result is stably rounded to an integer
from 0 to 1000:

```text
retrievalScoreV1 =
  0.40 * preferenceFit
+ 0.25 * proximity
+ 0.20 * categoryCoverageNeed
+ 0.10 * listDataQuality
+ 0.05 * popularityPrior
```

Haversine distance from the departure point supplies only the proximity signal.
It is not driving distance and must never be labeled as one. Its scale expands
or contracts with the server-owned pace maximum relative to the balanced
four-stop scale, so pace affects Stage A without inventing a place attribute.
The list-level `preferenceFit` uses only explicit facts: selected category
`0.40`, exact requested scope `0.20`, trip-type fit `0.20`, and neutral `0.5`
values for indoor and pet-profile evidence (`0.10` each) that the list response
cannot prove. Accommodation is a full overnight trip-type match and a day-trip
mismatch; non-accommodation is neutral for that subfeature. Detail evidence may
later refine the explicit indoor preference, while canonical pet eligibility
and pet compatibility handle the pet profile without a guessed list signal.
Popularity uses a first-party `popularity-v1` result; an insufficient snapshot
contributes the neutral `0.5` prior and does not create a popular-place label.

Stage A removes duplicate content IDs and reserves an opportunity, when data
exists, for:

- every explicitly selected category;
- at least one activity for a day trip;
- food when selected;
- accommodation for an overnight request when selected; and
- shopping only after explicit opt-in.

Unavailable reservations do not leave empty slots. Remaining capacity is
filled by the highest retrieval score.

## Stage B: schedule-aware shortlist

Stage B reuses or loads `detailCommon2` and `detailIntro2`. It must not load
`detailPetTour2` merely to determine schedule compatibility. The normalized
result is one of:

| Result | Meaning and action |
|---|---|
| `compatible` | Fresh, unambiguous provider hours contain at least one dwell-sized interval inside the request's feasible trip window. Retain. |
| `conflict` | A confirmed rest day or fresh, unambiguous hours leave no dwell-sized interval inside the feasible trip window. Exclude. |
| `unknown` | Hours are absent, stale, conflicting, incomplete, or cannot be safely parsed. Retain with a moderate penalty and verification warning. |
| `provider_unavailable` | The required provider section failed or timed out. Preserve this state; never rewrite it as a conflict. Apply the fail-closed product rule without inventing hours. |

The feasible window begins at the requested start time. Its latest departure is
start plus requested duration in duration mode, or end of day in stop-count
mode; category dwell comes from `dwell-duration-v1`. This is an existence test,
not a claimed arrival time or route order, and the later route composer still
checks the actual routed window. Multiple or qualified time ranges, overnight
ranges, reservation text, stale or materially future-skewed timestamps, and
text without a safely parsed range remain unknown. A detail fetched during the
same bounded run may be milliseconds later than the run-start snapshot and is
fresh only while it remains inside the versioned detail-freshness window.
Unknown never means confirmed open. A legacy
injected service without the optional staged schedule method remains `unknown` with
`schedule_staged_adapter_unavailable`; an implemented staged method that fails
produces `provider_unavailable`, is filtered before Stage C, and is not retried
as a composite detail call. An `unknown` result remains eligible for the
shortlist but subtracts 50 points from its Stage A integer score for Stage B
selection and ordering. Stage B carries the Stage A selected-category,
activity, food, and overnight-accommodation opportunities into its own
shortlist, backfills unused reservations by score, and returns at most 20
records.

## Stage C: adaptive detailed evaluation

Stage B records are ordered by Stage A score, schedule result, category coverage
need, and stable content ID. Stage C then evaluates batches of five. For each
record it fetches or reuses the remaining pet detail and the detail/common,
intro, visibility, licensing, Phase 3, and trust information required by the
canonical boundary.

After each complete batch, the pipeline may stop only when both conditions hold:

1. the eligible-pool target has been reached; and
2. reasonable available category coverage has been reached: an activity, food
   when selected and available, and overnight accommodation when selected and
   available.

Otherwise it continues, including beyond the first 15 records, until it reaches
20 detailed evaluations or exhausts Stage B. One candidate failure is recorded
and skipped; successful siblings remain usable.

Only `evaluateAutomaticRouteEligibility(...)` creates an eligible candidate.
The pipeline does not add unknown, not-applicable, not-exposed, provider-
unavailable, Kakao-only, or demo records to compensate for low supply.

Eligible candidates receive `place-utility-v1`, are sorted deterministically,
and are capped at 15. When the final count is below `tripPace.minStops`, the
result is an honest typed `insufficient_eligible_places` value containing the
eligible count, required minimum, and aggregated reason counts.

Utility is computed only after the adaptive strict-eligible pool is collected.
Its category-priority component therefore reflects scarcity in that current
eligible pool, not the earlier Stage B supply. A required indoor preference also
requires positive canonical indoor-scope evidence before the candidate enters
that pool; a preferred indoor setting refines only the explicit indoor
subfeature of preference fit. `dataQuality` combines fresh exposed visibility,
valid coordinates, schedule usability, meaningful normalized pet-field
coverage (without requiring all nine optional fields), and detail retrieval
freshness. Missing, stale, invalid, or materially future-skewed freshness
evidence is penalized without being relabeled as fresh.

## Request control and diagnostics

The pipeline reuses Stage 1 list, visibility, and detail caches and coalesces an
identical in-flight operation/content-ID request. No detail operation may run
twice for the same content ID inside one pipeline invocation. Provider work uses
bounded concurrency, the existing eight-second timeout, and the existing single
HTTP 5xx retry. Partial failures do not fail unrelated candidates.

Diagnostics use `candidate-pipeline-v1` and contain:

- counts for initial, exposed, coordinate-valid, category-accepted, Stage A,
  Stage B, detailed, eligible, and final-eligible records;
- adaptive batch count;
- cache hits, logical live provider operations, failed logical operations, and
  detail operations by operation name;
- `providerUnavailableCandidates`, separately from failed provider operations;
- skipped/excluded/warning reason counts; and
- final category distribution.

They never contain credentials, Authorization headers, complete keyed URLs,
raw provider payloads, or unnecessary personal data. `providerCalls` increments
once when a cache miss starts a logical provider operation;
`detailCallsByOperation` uses the same logical-operation boundary.
`providerFailures` increments only when such an operation finishes with a
failed outcome after the provider client's normal retry policy is exhausted.
It is not a count of excluded candidates, and an HTTP retry attempt is not a
second logical operation in these pipeline diagnostics. The optional bounded
live verifier separately observes physical HTTP attempts for its request cap.
A logical candidate evaluation is not reported as a live provider call when
every operation was a cache hit. The popularity snapshot uses one captured
`asOf` per pipeline invocation. A popularity-repository failure falls back to
neutral no-data and adds `popularity_provider_unavailable` to warnings; it
cannot fail eligibility or manufacture popularity.

## Determinism

For identical provider data, normalized request, popularity snapshot, and
configuration version, output is identical. Stage 2 uses no random selection or
reroll seed. Stable ordering is:

1. score descending;
2. category priority descending;
3. Haversine distance ascending; and
4. content ID ascending.

All supplied component values are validated in `[0, 1]`; invalid values are
rejected instead of silently coerced. Integer totals use one documented stable
rounding function so platform floating-point differences do not alter a tie.

## Controlled and live verification

`npm run compare:candidate-pipeline` uses the visibly synthetic
`candidate-pipeline-v1-controlled-fixture`. It compares the actual pre-Stage-2
fixed-12 role/category-aware detail ceiling with Stage A/Stage B/adaptive Stage C
under identical data. Older audit prose called the former “nearest 12” because
distance ordered candidates inside each role group; the controlled artifact
uses the more precise name.

The comparison reports eligible discovery, represented categories, provider and
detail calls, duplicate calls, insufficient-route frequency, and deterministic
repeat output. It does not compare final route quality or stop ordering. Its
sanitized JSON and Markdown are written below the ignored
`verification-evidence/candidate-pipeline-v1/` directory. The controlled suite
includes a sparse case that evaluates 17 candidates across four batches,
demonstrating backfill beyond the first 15 through the production pipeline.

`npm run verify:candidate-pipeline-live` is optional and requires exactly
`RUN_LIVE_CANDIDATE_PIPELINE_V1=1`. It refuses CI, requires the ignored local
environment file, uses a 240-attempt request cap, concurrency three, the
production eight-second timeout and single retry, and stores only sanitized
counts/IDs/statuses. The seven Stage 1 IDs are verifier
expectations only; product retrieval does not boost or special-case them.

The known live-data limitation remains: Stage 1 inspected 49 Busan details and
found only seven strict automatic-route-eligible samples. The controlled
comparison proves deterministic pipeline behavior, not broader live-provider
coverage. Until an explicitly opted-in Stage 2 live run reports otherwise,
candidate discovery and category coverage remain limited by that seven-sample
baseline.

## Explicit non-goals and deployment state

Stage 2 does not implement final route ordering, a Kakao travel-time matrix,
branch-and-bound, TSP, OR-Tools, exploration, UI redesign, or deployment. The
existing production itinerary generator now consumes the Stage 2 candidate
pool, while its existing post-candidate route composition remains outside this
stage.
No Supabase migration is applied. Popularity persistence remains behind its
repository interface until a privacy-safe authenticated analytics boundary is
approved.
