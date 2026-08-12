# Route optimizer V1

Status: Stage 4 server-only deterministic optimizer contract, 2026-08-12

`petpass-route-engine-v1` consumes only the final Stage 2 strict-eligible Tourism
Service2 pool and the Stage 3 directed provider-backed matrix. It selects and
orders stops, simulates visit times, and asks Stage 3 to validate the best
complete orders. It cannot create eligibility, reinterpret a pet policy, use a
Kakao-only discovery record, or replace an unresolved edge with Haversine time.

This boundary is implemented as server-only modules under
`lib/recommendation/optimizer`. It is not yet wired into the planner's existing
public itinerary Route Handler or UI, so the old itinerary composer remains the
production response path until a later integration stage.

## Previous route behavior

The existing itinerary generator already consumes the Stage 2 strict pool, but
its route proposal path remains a legacy category/role-aware heuristic with
seeded hash tie-breaks and bounded direct directions proposals. It is neither an
exhaustive subset/order solver nor an implementation of this objective. Stage 4
bypasses that behavior behind a new server-only interface rather than silently
changing the current HTTP response.

## Versioned limits

`route-solver-v1` is the single source for optimizer limits:

| Limit | Value |
|---|---:|
| Candidate input | 15 |
| Selected stops | 5 |
| Exact-search wall deadline | 1,000 ms |
| Expanded states | 1,000,000 |
| Beam width after exact-search limit | 256 |
| Internal finalists | 10 |
| Exact Stage 3 validations | 3 |
| Returned alternatives | 2 |
| Unknown-schedule stops | 1 |

Pace contracts are relaxed 2 target / 2–3 stops / 360 minutes, balanced 3 /
3–4 / 480, and packed 5 / 4–5 / 600. A limit hit does not masquerade as an
exact result: deterministic beam fallback is used and optimality becomes
`best_found_within_time_limit`. A completed exact enumeration is reported as
`optimal_within_candidate_set_current_matrix`.

## Candidate and schedule boundary

Each candidate carries the original strict `DetailedEligibleCandidate`,
`place-utility-v1`, provider-backed node, `dwell-duration-v1`, normalized
schedule, canonical travel role, trust, popularity, and optional exposure.
Titles are never parsed to invent a role. The adapter recognizes one
unqualified provider time range; missing, partial, multiple, overnight, or
qualified ranges remain unknown. Unknown schedules incur a penalty and at most
one may enter a route. Confirmed impossible windows and impossible mandatory
reservations are excluded.

Simulation starts from the requested Asia/Seoul date and time. Every directed
edge must be resolved with provider-summary or validated confidence. Arrival,
waiting, dwell, departure, pace duration, final-entry, accommodation, and
optional return-to-start constraints are applied incrementally. Overnight
routes require accommodation last. Day trips do not add accommodation unless
it was explicitly selected.

## Objective

The exact `route-objective-v1` total is:

```text
discounted place utility
+ category coverage
+ category transitions
+ meal alignment
+ rest after high activity
+ final overnight accommodation
+ one sufficient-data popular anchor
+ one sufficient-data low-exposure exploration bonus
- driving time
- waiting after a 15-minute allowance
- consecutive category repetition
- detour above 1.15 of fastest travel for the same selected set
- unknown schedule
- pace target deviation
```

Place utility position discounts are `1, .95, .90, .82, .74`. Coverage is 100
per distinct category capped at 300. Driving costs 5 points/minute; waiting
after 15 minutes costs 2/minute; repetition costs 120; unknown schedule costs
150; pace deviation costs 120/stop. Meal overlap of at least 30 minutes in
11:30–14:00 or 17:30–20:00 earns 100, otherwise a meal costs 80. Rest after a
high-activity stop earns 60 and final overnight accommodation earns 80.

A popularity score earns one 100-point anchor only when its Stage 2 status is
`sufficient_data` and score is at least .7. Exploration earns one 60-point
bonus only when exposure is separately `sufficient_data`, exposure is at most
.3, preference fit is at least .7, and trust is at least 70. Missing exposure
never implies low exposure. The detour penalty is
`min(300, max(0, ratio - 1.15) * 600)`.

All objective components and their exact sum are returned. Ties resolve by
score, fewer warnings, less driving, less waiting, greater trust sum, then the
lexicographic ordered content-ID signature. Input order and asynchronous
completion order are not tie-breakers.

## Search and final validation

Depth-first branch-and-bound enumerates all feasible orders from one through
the pace maximum and retains ten deterministic finalists. Its upper bound is
deliberately optimistic so it cannot prune an optimum. A state or time limit
causes a fresh deterministic width-256 beam traversal; it does not weaken any
hard constraint.

At most three internal finalists are sent to Stage 3 exact route validation.
The provider's ordered section durations are then used to resimulate every
arrival, wait, dwell, window, and return leg. Failed or newly infeasible routes
are discarded. The highest-scoring validated route wins; if none validate, the
typed result is `final_validation_failed` and no approximate route is emitted.
Round trips are explicit: the departure is the final destination and the
provider result must contain the return section.

## Explanations and alternatives

Each selected stop includes provider source, original pet verdict, trust level,
full place utility, arrival/start/departure, dwell source, inclusion reasons,
ordering reasons, and warnings. Up to five high-utility omissions receive one
bounded reason such as window conflict, unresolved edge, pace limit,
accommodation placement, category redundancy, detour, final validation, or
lower route score.

Alternatives are chosen only from already validated finalists: a lower-travel
alternative must retain at least 90% of the main score; a popularity-oriented
alternative must retain at least 85% and contain a valid popular anchor. The
optimizer returns at most two alternatives and never recomputes eligibility.

## Verification

The deterministic suite includes 19 controlled cases and an independent
small-set exhaustive enumeration. It covers asymmetric/missing edges, schedule
conflict and unknown cap, meal alignment, overnight placement, popularity,
exposure non-inference, exact/beam modes, round trip, final-validation recovery,
total failure, deterministic ordering, and all three baselines.

`npm run compare:route-optimizer` runs 12 synthetic scenarios against utility,
nearest-neighbor, and schedule-greedy baselines. It writes sanitized artifacts
under `verification-evidence/route-optimizer-v1/`.

The optional live verifier is:

```powershell
$env:RUN_LIVE_ROUTE_OPTIMIZER_V1='1'
npm.cmd run verify:route-optimizer-live
```

It refuses CI, requires ignored `.env.local`, uses natural current Busan Stage 2
candidates, caps Tourism calls at 120 and Kakao calls at 84, limits concurrency
to 3, uses 8-second provider attempts and the normal one-retry policy, and
persists IDs/counts/scores/statuses only. It contains no hard-coded expected
place IDs and is never part of ordinary tests or deployment.

## Non-goals

Stage 4 adds no public API, UI redesign, LLM/ML scoring, remote migration,
deployment, fixture fallback, live-data pinning, reservation transaction, or
geographic discovery. The existing planner remains unchanged until a later
integration stage deliberately adopts this contract.
