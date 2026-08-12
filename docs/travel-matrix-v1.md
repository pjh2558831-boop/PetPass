# Travel Matrix V1

Status: Stage 3 server-only matrix and final-validation contract, 2026-08-12

`travel-matrix-v1` consumes the departure plus the final Stage 2 strict-eligible
candidate pool. It produces directed Kakao Mobility road edges and validates an
already ordered route. It does not choose stop order, optimize an itinerary,
weaken Stage 1 eligibility, or add Kakao Local candidates.

## Public provider contract

The canonical server-only client uses only these public Kakao Mobility
operations:

| Purpose | Method and path |
|---|---|
| Single directed fallback | `GET /v1/directions` |
| One origin to many destinations | `POST /v1/destinations/directions` |
| Current ordered route and geometry | `POST /v1/waypoints/directions` |
| Future ordered route and geometry | `GET /v1/future/directions` |

The public contract supports at most 30 destinations, a multi-destination
radius no greater than 10,000 metres, at most 30 waypoint records for the
waypoint operation, and at most five waypoints for future directions. PetPass
uses the stricter product limit of five final stops, so a future route has at
most four intermediate waypoints. Coordinates map as `x=longitude` and
`y=latitude`.

Paths containing `/affiliate/`, `directions100`, or an undocumented matrix
operation are not in the allowlist. The repository has no verified affiliate
contract, and no affiliate endpoint is called. The full public contracts are in
the Kakao Mobility [overview](https://developers.kakaomobility.com/guide/navi-api/start.html),
[multi-destination](https://developers.kakaomobility.com/guide/navi-api/destinations.html),
[waypoint](https://developers.kakaomobility.com/guide/navi-api/waypoints), and
[future-directions](https://developers.kakaomobility.com/guide/navi-api/future)
guides.

## Provider-neutral boundary

The recommendation layer depends on `TravelTimeProvider`, not Kakao response
types:

```ts
interface TravelTimeProvider {
  buildMatrix(input: TravelMatrixInput): Promise<TravelMatrixResult>;
  validateOrderedRoute(
    input: OrderedRouteValidationInput,
  ): Promise<OrderedRouteValidationResult>;
}
```

Input validation requires one departure, zero to 15 place candidates, unique
IDs, supported driving options, and finite coordinates inside South Korea's
documented broad bounds. The browser cannot change provider budgets, radius,
concurrency, timeout, coordinate precision, or node limits.

## Directed edge semantics

The node order is departure followed by candidates in stable content-ID order.
Every diagonal edge is a validated, traffic-independent zero. Every other
ordered pair is represented exactly once, so the required edge count is
`nodeCount * (nodeCount - 1)`.

`A -> B` and `B -> A` are resolved independently. A matrix is complete only
when every non-diagonal edge has provider-backed integer road distance and
duration. A missing, timed-out, outside-radius, or budget-blocked edge remains
explicitly unresolved. It never receives an invented road distance or time.

Haversine is stored only as `lowerBoundMeters`. It decides whether a
destination can enter the 10 km multi-destination request and orders bounded
fallback work. It is never returned in `distanceMeters`, marked validated,
used as final geometry, or described as road travel.

## Bounded request strategy

The server-owned configuration is `travel-matrix-v1`:

| Boundary | Value |
|---|---:|
| Candidate/node maximum | 15 / 16 |
| Multi-destination radius | 10,000 m |
| Destinations per request | 30 |
| Multi-destination operations | 16 per matrix |
| Directed fallback operations | 24 per matrix |
| Provider concurrency | 3 |
| Provider timeout | 8 seconds |
| Matrix deadline | 10 seconds |
| Matrix priority | `TIME` |

For each origin, destinations within the Haversine lower-bound radius are sent
in stable batches. Each response entry is normalized independently; a failed or
missing destination does not discard successful entries. Outside-radius and
unresolved pairs use the public single-directions operation in lower-bound/ID
order until the shared fallback budget is exhausted. The matrix stops at its
deadline or budget and reports diagnostics instead of starting an uncontrolled
all-pairs loop.

The request-scope promise memo keys multi-destination work by normalized origin,
destination set, radius, and options, and pair work by normalized directed pair
and options. Concurrent duplicate work shares one promise. A rejected promise
is removed so it does not poison an independent later request.

## Cache policy

`TravelTimeCache` is provider neutral. Its key contains normalized origin and
destination coordinates, route priority, sorted avoid options, driving mode,
the provider contract version, and the traffic-time bucket. It contains no
user ID, place name, credential, Authorization header, keyed URL, or raw
provider response.

Coordinates use four decimal places, roughly 11 metres of latitude in Korea.
Distance is also stored under a traffic-independent key, allowing a fresh road
distance to survive a current-traffic bucket change while duration is
refreshed.

| Value | Maximum reuse |
|---|---:|
| Provider road distance | 7 days |
| Current-traffic duration | 15 minutes |
| Future final-route result | exact requested time, at most 15 minutes |
| Provider failure / negative result | 2 minutes |

Freshness is evaluated independently. A fresh distance with stale duration is
retained while duration is refreshed; the inverse is representable as well.
Neither partial state is marked resolved unless both values are provider-backed
and fresh enough for the operation.

The deployed default is a process-memory implementation plus request-scope
memoization. PetPass has no approved private, authenticated route-cache
persistence boundary, so no Supabase migration was prepared or applied. Vercel
process memory is opportunistic and is not shared or guaranteed across
instances. This limits cross-instance cache efficiency but does not weaken
truthfulness or block Stage 3.

## Temporal behavior and final validation

The multi-destination matrix represents `current_traffic`; it is not claimed to
predict the selected future trip date. Diagonal zeros are
`traffic_independent`. Unknown or failed edges preserve their temporal basis
without inventing a forecast.

Final validation accepts an already ordered route of one to five stops:

- an immediate route uses public `POST /v1/waypoints/directions`;
- a valid future instant uses public `GET /v1/future/directions`;
- an invalid time returns `invalid_route` without a provider call; and
- a valid time that is not in the future deliberately uses current routing and
  records `requested_departure_not_future_current_used`.

The supplied stop order is mapped directly to provider sections. The last stop
is the destination and prior stops are waypoints. No return to the departure is
added. A section-count mismatch, malformed geometry, provider error, or missing
summary returns a typed failure with no demo route or Haversine polyline.
Geometry is built only from validated even-length provider vertex arrays in
`longitude, latitude` pairs.

## Controlled comparison

Run `npm run compare:travel-matrix`. It uses visibly synthetic coordinates and
the production matrix implementation; it never calls a provider or orders
stops. Sanitized deterministic JSON and Markdown are written under the ignored
`verification-evidence/travel-matrix-v1/` directory.

| Scenario | Directed edges / naive calls | Cold calls | Warm calls | Warm hits |
|---|---:|---:|---:|---:|
| 3 candidates | 12 | 4 | 0 | 12 |
| 5 candidates | 30 | 6 | 0 | 30 |
| 6 candidates | 42 | 7 | 0 | 42 |
| 15 candidates | 240 | 16 | 0 | 240 |
| mixed radius | 42 | 31 | 0 | 42 |
| partial multi-destination | 30 | 16 | 0 | 30 |

All six controlled matrices complete without unresolved edges. Every cold
strategy uses fewer calls than naive pairwise directions; every warm replay
uses zero calls and produces deterministic aggregate output.

## Optional bounded live verification

`npm run verify:travel-matrix-live` requires exactly
`RUN_LIVE_TRAVEL_MATRIX_V1=1`, refuses CI, and requires ignored `.env.local`
provider configuration. It naturally runs the production Stage 2 pipeline for
one bounded Busan scenario, then consumes its strict-eligible candidates. No
content ID is hard-coded or boosted.

Tour collection is capped at 120 physical attempts; Kakao work is capped at 84
physical attempts, concurrency three, timeout eight seconds, and one retry.
The verifier performs a cold matrix, warm replay, current ordered validation,
and a valid future validation. Artifacts persist only content IDs, counts,
statuses, category aggregates, cache/provider diagnostics, section counts, and
geometry point counts. They omit names, coordinates, raw payloads, keyed URLs,
and credentials. This command is not part of normal tests or builds and must not
be repeated without diagnosing the first result.

The bounded 2026-08-12 run naturally produced five Stage 2 strict-eligible
candidates (six matrix nodes). It resolved all 30 directed edges using six
multi-destination and ten bounded fallback operations. Warm replay used zero
Kakao calls with 30 edge-cache hits. Current and future five-stop validation
both succeeded with five ordered sections and provider geometry. Total Kakao
traffic was 18/84 physical calls at observed concurrency 3/3; no timeout,
authorization, quota, or provider failure was observed. The sanitized evidence
is stored under `verification-evidence/travel-matrix-v1/` and does not broaden
the Stage 2 candidate-coverage claim.

## Security, quota, and Stage 4 contract

The REST key is read only in server code and sent only as the Kakao
`Authorization` header. No public matrix Route Handler was added. The existing
rate-limited normalized final-directions handler remains the only browser
boundary; Stage 4 calls `TravelTimeProvider` internally and sends only a
validated final route needed for rendering.

Daily quota consumption is driven primarily by one multi-destination operation
per origin on a normal cold matrix. Outside-radius and partial provider results
can add at most 24 logical pair fallbacks. Cache hits consume no provider call.

The Stage 4 optimizer consumes this matrix and avoids unresolved edges. A usable
route additionally requires all selected places to remain
Stage 2 strict-eligible and `validateOrderedRoute(...)` to return `validated`
with every supplied section, total distance/duration, and provider geometry.
Stage 3 still owns no optimizer, objective, search, or route-order selection
logic; those remain isolated in `lib/recommendation/optimizer`. Ordered
validation now also accepts an explicit round-trip flag. In that mode the
departure is the final destination, all selected stops are waypoints, and the
returned sections must include the final return leg. The default remains a
one-way ordered route for backward compatibility.
