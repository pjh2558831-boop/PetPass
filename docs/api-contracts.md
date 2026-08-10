# API contracts

All Route Handlers use an envelope:

```ts
type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: {
        code:
          | "CONFIGURATION_REQUIRED"
          | "UPSTREAM_ERROR"
          | "INVALID_RESPONSE"
          | "INVALID_REQUEST"
          | "RATE_LIMITED";
        message: string;
        retryable: boolean;
      };
      requestId: string;
    };
```

## `GET /api/tour`

Query:

- `operation`: allowlisted KorPetTourService2 operation.
- Remaining query values are forwarded after server-owned `serviceKey`,
  `MobileOS`, `MobileApp`, and `_type` values are added.

The service key is never accepted from or returned to the browser. The upstream
JSON body is validated before success.

## `GET /api/geocode`

Query: `address`. Uses the server-only Kakao REST key and returns validated
address documents with address text, longitude, and latitude.

## `GET /api/kakao/local/search`

Query: `query`, with optional bounded `page`, `size`, enabled `regionId`,
`districtCode`, and explicit current-map parameters. The server uses the
region-aware bounded search plan and keeps REST credentials server-only.

Every result is returned as a `discovery_candidate` with
`verification_required`, a preserved Kakao provider ID/source record, and a
versioned low-baseline trust result. The response never adds `allowed`,
`conditional`, or `not_allowed`. It also reports the active area and whether
the bounded Kakao result was truncated.

## `GET /api/tour/places/[contentId]`

The validated Tourism detail includes the unchanged deterministic pet-access
assessment, separate licensing enrichment, provider source records, and a
versioned information-trust result. Trust components are diagnostic evidence
weights, not probabilities and not inputs to the pet-access verdict.

## `GET /api/kakao/local/geocode`

Query: `address`, with an optional bounded `size`. This is the canonical Kakao
Local geocode endpoint; `/api/geocode` remains a compatibility route.

## `GET /api/directions`

Query: `originLat`, `originLng`, `destinationLat`, `destinationLng`. Coordinates
are range-validated. Kakao Mobility remains responsible for road distance and
duration.

## `POST /api/kakao/directions`

JSON body:

```ts
{
  origin: { name: string; x: number; y: number };
  destination: { name: string; x: number; y: number };
  waypoints: Array<{ name: string; x: number; y: number }>;
}
```

`x` is longitude and `y` is latitude. At most five waypoints are accepted, and
origin and destination must differ. The response contains normalized total
distance and duration, optional fares, per-section summaries, and an ordered
latitude/longitude polyline. The REST key is never accepted from the client.

## `POST /api/itineraries/generate`

The JSON request selects all Busan or one verified district, a validated start
coordinate, travel date and start time, either a duration (120–600 minutes) or
a stop count (1–5), optional existing pet size, indoor-access preference,
travel categories, and `includeShopping` (default `false`). Shopping is queried
only when both selected and explicitly enabled.

The server queries the normalized Service2 catalog, rejects malformed or
unsupported records, shortlists before detail calls, evaluates pet access with
the existing deterministic rules, and routes eligible proposals through Kakao
Mobility. Only `allowed` and `conditional` stops are returned. Conditional
terms and unknown-hours warnings stay attached, and licensing is neither read
nor returned.

The response reports the normalized request, safe exclusion counts, configured
limits, actual call counts, up to three diverse profiles, ordered stops, raw
provider content type plus normalized category, actual Kakao totals, and safe
geometry. It returns a typed `insufficient_candidates`, `partial`, or
`provider_unavailable` state instead of filling missing routes with demo data.

Per request, at most 80 catalog candidates are considered, 12 composite place
details are loaded with concurrency 3, and 6 Kakao route proposals are tried.
The existing catalog limit of 20 provider pages per selected content type also
applies.

## `GET /api/licenses`

Query: `businessName`, `address`, and `category` (`RESTAURANT` or
`ACCOMMODATION`). This boundary returns a configuration error until the exact
administrative dataset and endpoint are selected.

`NO_MATCH` means only that a sufficiently strong match was not found. Clients
must not describe the business as illegal or unlicensed.

## Error behavior

Missing configuration returns 503 and never falls back to demo data. Invalid
input returns 400. Invalid or failing upstream responses return 502 with a
retryable flag. Requests over a Route Handler's small local limit return 429.
