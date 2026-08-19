# API contracts

## GET `/api/places/[placeId]/location-thumbnail`

- Server-only, feature-flagged Kakao Static Map proxy for a known public Kakao
  place ID such as `kakao:123`.
- Browser-provided coordinates and arbitrary upstream URLs are rejected.
- Fixed 360×220 image, one marker, preserved Kakao CI, bounded response size,
  client rate limit, and cache
  `max-age=86400, s-maxage=604800, stale-while-revalidate=2592000`.
- When disabled, unknown, or upstream-unavailable, cards fall back to their
  local category placeholder.

All JSON Route Handlers use an envelope; the documented image thumbnail route
returns validated image binary on success:

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

The detail boundary independently confirms `petTourSyncList2.showflag=1` before
returning a record. `showflag=0` is hidden as not found; a missing, undocumented,
failed, or timed-out visibility result fails closed and is never treated as
public. The response also distinguishes a usable/partial pet item, a present but
empty item, an absent item, and a pet-detail provider failure.

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

Stage 5 supersedes the legacy contract below. The current endpoint accepts the
strict `RouteRecommendationRequest` and returns the direct, versioned
`route-recommendation-response-v1` union. With
`ROUTE_ENGINE_V1_ENABLED=true`, its only path is canonical Stage 2 candidate
retrieval → Stage 3 asymmetric matrix → Stage 4 optimization → final Kakao
validation. It rejects legacy planning fields and client-owned limits. No
provider failure falls back to fixtures, Kakao discovery candidates, or the old
composer. See `docs/recommendation-api-v1.md` for the authoritative request,
response, failure, and manual revalidation contracts.

### Historical pre-Stage-5 contract (no longer served by the product handler)

The JSON request selects all Busan or one verified district, a validated start
coordinate, travel date and start time, either a duration (120–600 minutes) or
a stop count (1–5), pet species and size, carrier/leash/muzzle availability,
whether an outdoor-only visit is acceptable, indoor-access preference, travel
categories, and `includeShopping` (default `false`). Shopping is queried only
when both selected and explicitly enabled.

The server completes bounded Service2 pagination for every selected category and
joins the cached `petTourSyncList2` visibility list before a record enters the
catalog. Only `showflag=1` records continue. It rejects malformed or unsupported
records, retrieves at most 25 lightweight category-aware candidates, retains at
most 20 after schedule-aware common/intro inspection, and evaluates remaining
pet details adaptively in batches of five up to 20 records. Automatic-route
eligibility then requires successful
required provider sections, valid coordinates, meaningful primary
`detailPetTour2` evidence, an `allowed` verdict or a fully satisfied
`conditional` verdict, no confirmed closed licensing match, no impossible
operating-time conflict, and an allowed requested category. Kakao-only discovery
candidates never enter automatic routes; exact Kakao matches may enrich Tourism
metadata only.

Pet-size compatibility is a separate typed result. It never changes the base
pet-access verdict. Only explicit size wording can be automatically compatible
or incompatible; kg limits and ambiguous size restrictions require verification
and stay out of automatic routes. Missing size wording remains `not_specified`
instead of being invented as compatible.

Licensing, provider availability, provider visibility, pet access, information
trust, and route eligibility remain separate results. A confirmed closed match
can exclude a route candidate but cannot change its pet-access verdict. A
missing, ambiguous, or unavailable licensing match remains a warning, not proof
of closure. Trust or popularity cannot override an unmet pet condition.

The response reports the normalized request, safe exclusion counts, configured
limits, actual call counts, up to three diverse profiles, ordered stops, raw
provider content type plus normalized category, actual Kakao totals, and safe
geometry. Its `candidateFunnel` reconciles the complete catalog, basic filters,
the 25-place Stage A rank, at most 20 Stage B/Stage C assessments, base pet verdicts,
pet-size compatibility, final eligible candidates, and returned routes. It
returns a typed `insufficient_candidates`, `partial`, or `provider_unavailable`
state instead of filling missing routes with demo data.

Per request, the complete matching catalog is ranked locally, Stage A keeps at
most 25, Stage B keeps at most 20, and Stage C performs at most 20 detailed
evaluations with concurrency 3 before exposing at most 15 strict-eligible
candidates to the existing itinerary composer. Six Kakao route proposals may
then be tried. The existing catalog limit of 20 provider pages per selected
content type also applies.

### Stage 2 server-only candidate contract

Stage 2 adds a server-only candidate-pool boundary inside this production Route
Handler; it is not a new public HTTP endpoint and does not redesign the planner
UI. Its limits are Stage A 25,
Stage B 20, adaptive Stage C batches of five with at most 20 detailed
evaluations, and a final strict-eligible pool of 15. It returns typed
`insufficient_eligible_places` diagnostics rather than weakening eligibility.

The response includes a `candidatePipeline` summary with the version, typed
status, eligible-pool target, required minimum, aggregated reasons, and safe
diagnostics. These fields describe candidate discovery. Stage 3 matrix
construction and Stage 4 optimization are server-only modules and do not add
public fields to this endpoint in their current integration state.

### Historical Stage 3 and Stage 4 integration status

There is no public travel-matrix or route-optimizer endpoint. Stage 5 now invokes
both modules through the server-only orchestration service and exposes only the
normalized versioned product response described above.

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

## `GET /api/homepage/places`

This fixed, queryless homepage read returns one `ApiResult<HomepagePlacesSnapshot>`
with compact official and stored-public markers, cards, layer counts, and layer
availability. It composes the current Busan Tourism homepage snapshot with the
sanitized `get_public_map_catalog_v1` RPC. It never invokes Kakao Local live
search, directions, licensing, itinerary generation, recommendation, fixtures,
or direct browser-side Supabase access.

Tourism failure remains a typed provider failure because official counts and
assessments cannot be replaced. Stored Kakao catalog failures are isolated per
layer: official markers/cards remain, affected counts are `null`, and the layer
state is `unavailable` rather than a fabricated zero. Candidate, veterinary,
and pet-shop records expose only public names, categories, district/address,
coordinates, optional phone, Kakao place URL, and safe source/status wording.
Raw review state, evidence JSON, ingest metadata, and credentials are absent.

Responses use `Cache-Control: no-store`, reject query-driven provider controls
by accepting no query fields, and share the homepage's local
30-request/minute client rate limit. The server-side public-RPC adapter uses a
60-second in-process single-flight cache: concurrent identical reads share one
promise, successful pages may be reused briefly, and failures are evicted for
the next request. The HTTP response itself remains uncached so provider status
and the Tourism snapshot are re-evaluated normally.
