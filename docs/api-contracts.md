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

The former generic `GET /api/tour` upstream proxy has been removed. Browser
callers use only the typed catalog and detail routes below, whose request
parameters and normalized response fields are explicitly owned by PetPass.

## `GET /api/geocode`

Query: `address`. Uses the server-only Kakao REST key and returns validated
address documents with address text, longitude, and latitude.

## `GET /api/places/discovery`

Query: one supported catalog `category` and exactly one of a Busan
`districtCode` or a complete `west`/`south`/`east`/`north` viewport. A complete
`centerLongitude`/`centerLatitude` pair is optional. Arbitrary keywords,
provider paths, pagination controls, unknown or duplicate parameters, and
client-supplied authorization are rejected.

The server uses only fixed companion-animal keywords and bounded Kakao Local
searches. Every normalized result is a temporary `discovery_candidate` with
`verification_required`, `petAccessVerdict: "unknown"`, and
`recommendationEligible: false`. Raw Kakao documents and metadata are never
returned. Only an `exact` Tourism catalog source link may be exposed; weaker
matches are discarded. Every response uses `Cache-Control: no-store`.

## `GET /api/tour/places/[contentId]`

The validated Tourism detail includes the unchanged deterministic pet-access
assessment, separate licensing enrichment, provider source records, and a
versioned information-trust result. Trust components are diagnostic evidence
weights, not probabilities and not inputs to the pet-access verdict.

Accommodation (`contentTypeId=32`) returns `checkInTime` and `checkOutTime` as
separate nullable fields. They are never substituted into generic
`operatingInformation`.

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

The server completes bounded Service2 pagination for every selected category,
rejects malformed or unsupported records, ranks the complete matching catalog
by distance from the requested origin, retains at most 80 preliminary
candidates, and loads details for at most the nearest 12. It then evaluates pet
access with the existing deterministic rules and routes eligible proposals
through Kakao Mobility. Only `allowed` and `conditional` stops are returned.
Conditional terms and unknown-hours warnings stay attached, and licensing is
neither read nor returned.

Pet-size compatibility is a separate typed result. It never changes the base
pet-access verdict. Only explicit size wording can be automatically compatible
or incompatible; kg limits and ambiguous size restrictions require verification
and stay out of automatic routes. Missing size wording remains `not_specified`
instead of being invented as compatible.

The response reports the normalized request, safe exclusion counts, configured
limits, actual call counts, up to three diverse profiles, ordered stops, raw
provider content type plus normalized category, actual Kakao totals, and safe
geometry. Its `candidateFunnel` reconciles the complete catalog, basic filters,
80-place preliminary rank, 12-place detail assessment, base pet verdicts,
pet-size compatibility, final eligible candidates, and returned routes. It
returns a typed `insufficient_candidates`, `partial`, or `provider_unavailable`
state instead of filling missing routes with demo data.

Per request, the complete matching catalog is ranked locally, at most 80
candidates survive the preliminary rank, 12 composite place details are loaded
with concurrency 3, and 6 Kakao route proposals are tried. The existing catalog
limit of 20 provider pages per selected content type also applies.

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
