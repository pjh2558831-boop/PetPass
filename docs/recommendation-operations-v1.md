# Recommendation Operations V1

## Environment and release gate

The server feature flag is `ROUTE_ENGINE_V1_ENABLED`. Required provider names
are `TOUR_API_SERVICE_KEY`, `KAKAO_REST_API_KEY`, `LOCALDATA_SERVICE_KEY`, and
the display-only `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`. Supabase variables are optional
for route generation because saving is local-only in this stage.

Before any Vercel Preview, the public-data and Kakao REST credentials must be
rotated if they may have appeared in diagnostics. Confirm only variable names,
non-empty state, target environment, and sensitive/encrypted state. Never print
or compare values. Update local, Preview, and Production targets, then deploy
Preview only. Do not promote or change the Production alias.

The linked project must remain:

- project name: `pet-pass`;
- project ID: `prj_WCTSVmwQdn3VBtKsXFEDAHLcjXU7`;
- Production URL: `https://pet-pass-two.vercel.app`.

## Persistence decision

There is no authenticated account itinerary table in the current product.
Stage 5 reuses the versioned browser storage primitive and saves a bounded
snapshot: engine/objective/solver versions, request summary without precise
coordinates, selected/ordered provider IDs, final totals/times,
temporal bases, warnings, optimality, timestamp, and manual-modification flag.
It omits route geometry, edit-session IDs, provider payloads, keys, URLs,
diagnostics and stacks.
Saving failure does not remove the displayed route.

No database migration was prepared or applied. The route remains usable without
Supabase. Cross-device/account persistence needs authenticated server actions,
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
