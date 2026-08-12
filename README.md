# PetPass

PetPass is a map-first, pet-friendly travel planner for South Korea. It compares a
traveler's pet profile with source-backed venue policies, then builds a practical
route with visible evidence, preparation items, operating constraints, and nearby
alternatives.

This foundation ships an explicitly labeled local demo for a one-day Busan trip
with a small dog and a carrier. Live provider failures never fall back to that demo
silently.

## Start

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set the following values in the project-root `.env.local` before starting the
development server:

```dotenv
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=
KAKAO_REST_API_KEY=
TOUR_API_SERVICE_KEY=
LOCALDATA_SERVICE_KEY=
ROUTE_ENGINE_V1_ENABLED=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`NEXT_PUBLIC_KAKAO_MAP_JS_KEY` is intentionally exposed to the browser for the
Kakao Maps JavaScript SDK. `KAKAO_REST_API_KEY` is server-only and must never use
the `NEXT_PUBLIC_` prefix. Kakao Local and Kakao Mobility requests run only through
Next.js Route Handlers. Restart `npm run dev` whenever an environment variable is
added or changed.

`ROUTE_ENGINE_V1_ENABLED=true` enables the server-only Stage 2 → 3 → 4 route
engine at the canonical itinerary-generation endpoint. When disabled, it returns
`route_engine_disabled`; it never falls back to a fixture or legacy fixed route.
The Tourism, Kakao REST, and LocalData keys are server-only.

Open `http://localhost:3000` after the server starts.

The Kakao Developers application must allow the browser origins that load the
JavaScript SDK. Register `http://localhost:3000`, the production origin
`https://pet-pass-two.vercel.app`, and each preview origin used for browser
verification. A REST API key does not replace the JavaScript key or its web-domain
registration.

## Kakao integration

- The browser loads Kakao Maps with `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` and renders
  numbered place markers, a selected-place overlay, and Mobility route geometry.
- `GET /api/places/discovery` finds temporary, verification-required Kakao
  candidates for a supported catalog category in one Busan district or the
  current bounded map viewport. Search keywords and provider controls are
  server-owned; candidates are never recommendation-eligible.
- `GET /api/kakao/local/geocode` resolves an address through Kakao Local.
- `POST /api/kakao/directions` accepts an origin, destination, and at most five
  waypoints. It returns normalized distance, duration, fares, sections, and route
  coordinates.
- All REST and Mobility requests are made by server-only modules using
  `KAKAO_REST_API_KEY`. Provider responses are schema-validated and upstream
  response bodies are not included in user-facing errors or logs.

The Route Handlers apply small in-memory per-instance rate limits. For sustained
multi-region production traffic, replace these with a shared durable limiter.

## Vercel environment variables

Add `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`, `KAKAO_REST_API_KEY`,
`TOUR_API_SERVICE_KEY`, `LOCALDATA_SERVICE_KEY`, `ROUTE_ENGINE_V1_ENABLED`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SECRET_KEY` in the Vercel project's Settings → Environment Variables
for Production, Preview, and Development. Redeploy after changing them. Keep the
Kakao REST key and Supabase secret key server-only and mark them sensitive in
Production and Preview. The linked Vercel project is `pet-pass`, whose production
URL is `https://pet-pass-two.vercel.app`.

Before a Preview deployment, rotate the public-data service key and Kakao REST
key if either may have appeared in diagnostic output, then update their non-empty
values in local, Preview, and Production environments. Verification checks names
and target environments only; values must never be printed.

If the map shows a configuration error, verify that the JavaScript key exists in
the current environment and that the current origin is registered in Kakao
Developers, then restart or redeploy. If Local or Mobility calls return a
configuration error, verify only the server-side `KAKAO_REST_API_KEY`; never move
that key into browser code to work around the error.

## Stored Busan map places

PetPass keeps map discovery data in Supabase instead of asking Kakao Local from
the browser whenever the map moves.

- `public.map_places` stores normalized Tour API and Kakao places with a PostGIS
  point, provider identity, category, evidence status, source URL, and timestamps.
- `public.get_map_places_in_bounds` returns only active places inside the visible
  Busan map bounds. Anonymous clients have read-only access through this function
  and the table RLS policy.
- `public.map_ingest_runs` records sanitized collection counts and failures. It is
  intentionally unavailable to browser clients.
- The map requests `/api/map/places` after the viewport becomes idle and draws
  official records in blue and Kakao candidates in yellow.

Apply the SQL in `supabase/migrations`, then collect and upsert the current Busan
Kakao results from a trusted server environment:

```bash
npm run ingest:kakao-busan
```

The ingestion command requires `KAKAO_REST_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SECRET_KEY`. Never expose the Supabase
secret key to the browser or commit it to the repository. Re-running the command
is safe: places are updated by the unique provider/place identifier and duplicate
Kakao results are removed before the upsert.

## Verify

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

Provider credentials belong in `.env.local`; copy the names from `.env.example`
and never commit real values. `.env.local` is excluded by `.gitignore`.

See `docs/architecture.md` and `docs/api-contracts.md` for system boundaries and
the next integration phase.
