# Recommendation Operations V1

## Current default: full public catalog geographic drafts

`full_public_catalog_v1` is the default for automatic generation, rerolls,
direct selection and editing. The regional public catalog RPC is paginated to
completion separately for each enabled dataset/provider. Only published records
enter the pool; detailed KTO responses cannot introduce additional identities.
Strong identity matches retain provider aliases and source-specific policy text.
Every technically routeable, non-excluded canonical entity receives lightweight
scoring. Category/environment are preferences; pet evidence and operating status
remain factual annotations, independent of road feasibility.

The spatial shortlist contains at most six places and keeps the rest as reserves.
A reduced/failed initial search can retain its feasible route and replenish from
reserves. Matrix attempts share the 48 HTTP-call allowance, cache and deadline;
final validation including fallback shares three calls. User selections,
exclusions, time budget, transport and the round-trip return edge remain binding.
Optional detail is not fetched on the generation critical path. Published list
records alone suffice, with unqueried detail explicitly remaining unknown.
Public snapshots reuse the existing five-minute freshness period only while the
publication version matches; unavailable publication checks never serve stale
fallbacks. Diagnostics separate all scored IDs, reserves, evaluated edges and
returned stops. Evidence-gate rejection counts are zero in this policy.

## Environment and release gate

The server feature flag is `ROUTE_ENGINE_V1_ENABLED`. Generation requires the
existing Supabase public-catalog configuration and `KAKAO_REST_API_KEY`.
`NEXT_PUBLIC_KAKAO_MAP_JS_KEY` is display-only. `TOUR_API_SERVICE_KEY` and
`LOCALDATA_SERVICE_KEY` support existing detail/enrichment features but are not
admission prerequisites for catalog routing. Saving remains browser-local.

Before any Vercel Preview, the public-data and Kakao REST credentials must be
rotated if they may have appeared in diagnostics. Confirm only variable names,
non-empty state, target environment, and sensitive/encrypted state. Never print
or compare values. Update local, Preview, and Production targets, then deploy
Preview only. Do not promote or change the Production alias.

The linked project must remain:

- project name: `pet-pass`;
- project ID: `prj_WCTSVmwQdn3VBtKsXFEDAHLcjXU7`;
- Production URL: `https://weekendog.site`.

## Persistence decision

There is no authenticated account itinerary table in the current product.
V2 browser storage keeps one explicitly saved itinerary with at most five stops.
It includes schedule intent and unapplied proposals, stop coordinates, bounded
source excerpts/conditions/retrieval timestamps, exact leg durations/distances,
and at most 512 geometry points for map restoration. The selected departure
coordinate is retained only for this explicit snapshot. Full provider payloads,
edit/confirmation tokens, credentials and user identifiers are never saved.
V1 summaries remain readable. Undated routes and unapplied time proposals save
as drafts. Full-catalog results also save as geographic drafts, including
unanswered or incompatible venue conditions preserved on the affected stop.
They do not claim pet-friendly admission or confirmed opening. Incomplete or
invalid road legs still cannot save.
Malformed, unsupported-version and quota failures preserve existing storage;
a new snapshot replaces the prior one only after a successful write.

No database migration was prepared or applied. Browser persistence requires no
database writes. Cross-device/account persistence needs authenticated server actions,
an ownership column, RLS policies, and an explicit retention policy before a
future migration.

## Analytics and popularity

The repository exposes a strict recommendation-event allowlist, but its sink is
deliberately disabled. The current project has neither authenticated event
ownership nor an abuse-resistant server ingestion boundary. No public event
table or browser insert permission is created, and no migration is applied.
Analytics failure is non-blocking and the popularity repository remains the
neutral no-data adapter. A future implementation must validate server-side,
deduplicate, rate limit, exclude test/bot/provider-refresh traffic, retain only
private aggregates, and deny anonymous/authenticated table access by default.

## Runtime characteristics

Candidate, provider, matrix and solver controls remain in their existing
versioned server configs. The client blocks duplicate submissions; the handler
coalesces identical in-flight normalized requests and does not share completed
personalized responses. Route and manual responses use `Cache-Control: no-store`.
Manual editing uses a 20-minute, integrity-signed stateless token containing
only normalized route-edit inputs and displayed stop metadata. It is valid
across separate Vercel Route Handler instances, is never persisted by browser
storage, and is rejected if expired or modified.

Target measurements are under 3 seconds warm, under 10 seconds cold, solver
under 1.5 seconds, and no more than three final validations. These are targets,
not guarantees; reports must use measured values or say not measured.

## Verification and deployment

Run `npm run typecheck`, `npm run lint`, `npm run test`, relevant Playwright
flows, controlled Stage 4 comparison, `npm run build`, and exact-value source and
client-bundle scans. Live provider tests remain explicitly gated. If rotation is
not confirmed, finish local verification and report
`PREVIEW_BLOCKED_PENDING_CREDENTIAL_ROTATION`; do not invoke a deployment.


## Completion-first V2 request and schedule contract

The existing generation endpoint accepts requestVersion: 2. Date and start time
can independently be null; malformed dates/times are rejected. The browser starts
both blank, restores explicitly saved values, and does not collect equipment or
outdoor consent. Legacy explicit equipment requests retain their compatibility
meaning through normalization. Routine/preparable source instructions remain
visible guidance; vaccination proof, booking and admission-dependent facts need
narrow signed questions. Confirmed prohibitions cannot be acknowledged away.

No date/no time produces a relative road-validated draft. Date-only recommends a
departure; time-only is an illustrative clock with unverified calendar rules.
Fixed date/time is tried first. A feasible changed time remains a proposal until
an explicit Apply action revalidates it on the server. Dates use Asia/Seoul;
today's search starts at the next quarter hour, and never at a past departure.
Overnight means the first day's route ending at accommodation.

Schedule recovery shares the candidate pool, matrix, and request-wide solver
budget. It considers at most 12 departure candidates, prioritizing the closest
same-day time (later on ties) for explicit input, and 09:00–18:00, shorter waits,
then earlier departure for missing time. Matrix HTTP calls, including retries,
are bounded at 48; final routing calls, including prediction fallback, at 3.
Only unsupported future prediction errors may use current road estimates.
Authentication, rate limits and outages retain their own failure statuses.
Kakao documents future departures and up to five waypoints; no undocumented
prediction horizon is assumed: https://developers.kakaomobility.com/guide/navi-api/future

If necessary only engine category-default stays shrink: attraction/culture 60,
festival/leisure 90, accommodation arrival 30, shopping 30, restaurant 45,
café 30 minutes. These are planning defaults, not facility restrictions. Provider
stays, selected stops, exclusions and explicit duration limits remain fixed.
Known closure and last-entry rules apply on every visited calendar day; unknown
hours remain warnings. Relative source text such as “today closed” is tied to its
retrieval date, not every future travel date.

Usable routes/drafts/proposals use HTTP 200; material questions 409; invalid input
400; genuine candidate/time shortage 422; essential supplier outage 503; rate
limits 429. Confirmation tokens expire after 20 minutes and bind questions to
source/profile/route context. Route revisions cannot reuse carried answers.

Production origin verified by HEAD on 2026-09-05: weekendog.site returns 200;
www.weekendog.site returns 308 to the apex. These implementation changes have
not been deployed. No DB migration, external setting or environment file changed.
