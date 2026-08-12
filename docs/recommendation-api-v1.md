# Recommendation API V1

## Boundary

`POST /api/itineraries/generate` is the sole product route-recommendation
endpoint. It validates a strict `RouteRecommendationRequest`, then invokes the
existing Stage 2 candidate pipeline, Stage 3 asymmetric travel matrix, Stage 4
optimizer, and final Kakao ordered-route validation. There is no browser-side
provider call and no legacy/demo fallback.

The server-only `ROUTE_ENGINE_V1_ENABLED` flag must be exactly `true`. Otherwise
the endpoint returns `route_engine_disabled` with HTTP 503.

## Request

The body contains:

- departure label, coordinate, and one of `kakao_place_search`,
  `address_search`, or `map_selection`;
- Busan region ID, optional official district code, date, start time, day/overnight
  type, `relaxed|balanced|packed`, selected useful categories, and round trip;
- pet name/species/size, three equipment booleans, and outdoor-only acceptance.

The schema is strict. Candidate limits, provider concurrency, timeouts, matrix
budgets, scores, solver controls, TTLs, provider operations, URLs, and old
duration/stop-count parameters are rejected.

## Ready response

`route-recommendation-response-v1` contains engine/objective/solver versions,
an opaque short-lived edit session, normalized request summary, one of:

- `optimal_within_candidate_set_current_matrix`; or
- `best_found_within_time_limit`;

and a final validated route. The route carries final Kakao totals and geometry,
temporal bases, one to five strict Tourism Service2 stops, pet verdict and
conditions, trust, licensing state, operating warnings, evidence, and structured
inclusion/ordering codes. Alternatives are already validated and materially
distinct. Raw provider documents and internal scores are not returned.

## Failure statuses

| Status | HTTP | Meaning |
|---|---:|---|
| `invalid_request` | 400 | strict request/edit validation failed |
| `insufficient_eligible_places` | 422 | strict Tourism pool below the pace minimum |
| `insufficient_feasible_route` | 422 | candidates exist but schedule/route constraints fail |
| `travel_matrix_incomplete` | 422 | a provider-backed directed graph is insufficient |
| `final_route_validation_failed` | 422 | no finalist passed exact final validation |
| `tourism_provider_unavailable` | 503 | Tourism boundary unavailable |
| `licensing_provider_unavailable` | 503 | reserved typed LocalData boundary state |
| `kakao_provider_unavailable` | 503 | Kakao route boundary unavailable |
| `rate_limited` | 429 | local bounded limiter denied the request |
| `route_engine_disabled` | 503 | server feature flag disabled |
| `internal_error` | 500 | safely normalized internal failure |

Every failure has safe Korean `userMessage`, machine `reasonCodes`, and
`retryable`. It never contains keys, keyed URLs, authorization headers, provider
bodies, or stack traces.

## Manual revalidation

`POST /api/itineraries/revalidate` accepts an integrity-signed, short-lived
edit-session token and unique
ordered content IDs. IDs must be a subset of the original strict candidates.
The supplied order is preserved; the optimizer is not rerun. Kakao final route,
sections, totals and geometry must exist, and schedule simulation must still be
feasible. Ready routes have `kind: manual` and label `직접 수정한 일정`.

The token expires after 20 minutes and contains only the normalized candidate
timing inputs and already displayed stop metadata needed for revalidation. It
is not browser-persisted, accepts no arbitrary provider URL or operation, and
remains verifiable when generation and revalidation reach different Vercel
instances. Modified or expired tokens fail closed.

## Request behavior

The client prevents double submission and aborts on unmount. The server
coalesces byte-equivalent parsed requests only while they are concurrently in
flight. It does not cache complete personalized results after completion.
