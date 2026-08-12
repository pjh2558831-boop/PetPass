# Popularity V1

Status: Stage 2 first-party popularity foundation, 2026-08-12

Popularity V1 is a deterministic, provider-neutral calculation over first-party
PetPass interactions. Korea Tourism Organization ordering, Kakao Local results,
Kakao/Naver review data, blog counts, place-page HTML, and undocumented provider
metadata are not popularity inputs.

Popularity is independent from visibility, pet access, licensing, information
trust, and automatic-route eligibility. It may order already eligible records
or contribute a small Stage A prior. It can never bypass a hard gate.

## Event contract

| Event | Weight | Component |
|---|---:|---|
| `detail_view` | 1 | trend |
| `favorite` | 4 | quality |
| `itinerary_add` | 5 | quality |
| `route_start` | 6 | trend |
| `route_complete` | 10 | quality |
| `share` | 3 | quality |
| `itinerary_remove` | -2 | quality |

Unit tests, Playwright traffic, provider refreshes, recognized bots, and
repeated abusive requests are excluded before aggregation. Client event
collection and abuse detection are not introduced in Stage 2.

## Decay and saturation

Each accepted event is evaluated relative to an explicit calculation timestamp:

```text
decay = 0.5 ^ (ageDays / halfLifeDays)
```

Quality events use a 90-day half-life. Trend events use a 14-day half-life.
Future or invalid event timestamps are excluded rather than silently treated as
current.

The decayed signed sum for each component is saturated with:

```text
normalized = 1 - exp(-max(0, decayedWeightedSum) / scale)
```

`qualityScale` is 20 and `trendScale` is 10. A negative
`itinerary_remove` can reduce the quality sum, but the value presented to
saturation never falls below zero.

## Smoothing and cold start

The effective sample weight is the sum of decay multipliers for accepted,
de-duplicated events. It is an effective event count, not a sum of event-score
weights. Consequently, two recent `route_complete` events contribute roughly
two samples, not 20 samples, even though their quality score weights are 10 each.
Negative events still contribute positive evidence volume while reducing the
signed quality score.

The observed score is:

```text
observedScore =
  0.70 * qualityComponent
+ 0.30 * trendComponent
```

Bayesian smoothing uses:

```text
smoothed =
  (sampleWeight * observedScore + priorWeight * categoryPrior)
  / (sampleWeight + priorWeight)
```

`priorWeight` is 20. A missing category snapshot uses
`defaultCategoryPrior = 0.5`.

When effective sample weight is below 20, the public result is exactly:

```ts
{
  score: 0.5,
  status: "insufficient_data",
  version: "popularity-v1"
}
```

The diagnostic quality/trend/sample components remain available, but the
product must not call the place popular. At a sample weight of 20 or more, the
smoothed score is returned with `status: "sufficient_data"`. Inputs that must be
normalized are validated in `[0, 1]`, and calculated outputs are stably rounded
according to the versioned configuration.

## Repository and privacy boundary

Stage 2 defines a repository interface for reading a provider-neutral
popularity snapshot and a neutral no-data repository. The current application
has no authenticated interaction analytics boundary, so the no-data repository
is the safe default.

No Supabase migration is applied in this stage. A future migration requires a
separately approved design for privacy-safe aggregation, RLS, trusted event
ingest, test/bot filtering, abuse limits, retention, and daily summary refresh.
The deferred design uses unexposed `private.place_interaction_daily` aggregates
and `private.place_popularity_snapshots`, with forced RLS, no client policies or
grants, and service-role-only workers. It stores accepted de-duplicated human
counts and integer micros, never user/device/IP identifiers, raw searches,
precise location history, or provider payloads. The unapplied Stage 1 provider-
visibility migration remains unrelated and must not make stored Tourism rows
visible without a verified refresh writer.

## Result contract

```ts
type PopularityResult = {
  score: number;
  status: "sufficient_data" | "insufficient_data";
  qualityComponent: number;
  trendComponent: number;
  sampleWeight: number;
  version: "popularity-v1";
};
```

The value is a deterministic utility input, not an AI probability, rating,
review score, or claim of objective popularity.
