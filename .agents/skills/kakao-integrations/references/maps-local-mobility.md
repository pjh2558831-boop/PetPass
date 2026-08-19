# Kakao service boundaries

## Maps JavaScript SDK

- Browser-visible key: `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` only.
- Loader: `lib/kakao/sdk-loader.ts`.
- Primary UI: `components/map/map-panel.tsx` and planner map components.
- Preserve required SDK libraries, one-time loading, cleanup, marker identity, cluster behavior, selection state, and bounds fitting.

## Local Search and geocoding

- Server-only REST key: `KAKAO_REST_API_KEY`.
- Provider code: `lib/kakao/local.ts`, `lib/kakao/discovery.ts`, `lib/kakao/departure.ts`, and related Route Handlers.
- Results are discovered candidates or coordinate lookups, not pet-access proof.

## Mobility directions

- Server-only requests through `lib/kakao/directions.ts`, `directions-client.ts`, and travel-time adapters.
- Preserve travel mode, waypoint limits, timeout/error semantics, and deterministic fallback behavior already encoded in the caller.
- A missing route is not permission to fabricate distance or duration.
