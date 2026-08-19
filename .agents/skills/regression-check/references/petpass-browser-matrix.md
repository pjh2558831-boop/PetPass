# PetPass browser matrix

Use only the rows affected by the change. Reconfirm paths and behavior from the current repository before running a pass.

| Area | Current implementation paths | Browser checks |
| --- | --- | --- |
| Home and navigation | `app/page.tsx`, `components/home/`, `components/layout/`, `tests/e2e/homepage.spec.ts`, `landing-navigation.spec.ts` | Page content, primary links, navigation, loading/error state, desktop/mobile |
| Public catalog | `app/results/page.tsx`, `components/places/results-explorer.tsx`, `public-catalog-card.tsx`, `place-card-media.tsx` | Cards render, image/placeholder, category labels, pagination, selection, empty results |
| Kakao map and markers | `components/map/map-panel.tsx`, `lib/kakao/sdk-loader.ts`, `maps.ts`, `marker-assets.ts`, `tests/e2e/full-map-explorer.spec.ts` | SDK/canvas, non-zero map size, markers, cluster behavior, marker click, selected state, console/network |
| Filters and sidebar | `components/places/results-explorer.tsx`, `lib/map-places/explorer-collections.ts`, `place-categories.ts` | Primary/optional categories, result counts, visible markers/cards, URL/filter persistence, sidebar scrolling and synchronization |
| Place detail and evidence | `app/places/[contentId]/page.tsx`, `components/places/live-place-detail.tsx`, evidence/license/source panels | Detail load, missing fields, images/placeholders, source and pet-access wording, visible provider failure |
| Planner | `app/planner/pet/page.tsx`, `app/planner/trip/page.tsx`, `components/planner/`, `lib/storage/` | Form validation, navigation, persisted profile/trip state, departure search/map, mobile controls |
| Recommendation | `app/results/page.tsx`, `components/itinerary/recommendation-planner.tsx`, `lib/recommendation/`, `app/api/itineraries/generate/route.ts`, `tests/e2e/recommendation-ui.spec.ts` | Success and existing empty/failure state, selectable results, explanations, request failure handling |
| Itinerary and route editing | `app/itinerary/page.tsx`, `components/itinerary/itinerary-editor.tsx`, `route-stop-card.tsx`, `app/api/itineraries/revalidate/route.ts` | Generated route display, editing/revalidation, route error, storage, navigation back to recommendations |
| Kakao directions | `lib/kakao/directions.ts`, `directions-client.ts`, `use-driving-route.ts`, `app/api/directions/route.ts`, `app/api/kakao/directions/route.ts` | Route request, visible route state, origin/destination continuity, error handling, map layout |
| Responsive UI | `app/globals.css`, `design.md`, layout and changed components | Desktop plus mobile; overflow, clipping, map/sidebar proportions, touch targets, fixed navigation overlap |
| Authentication | No user sign-in routes, middleware, or Supabase auth client currently exist; `auth.users` appears only as reviewer metadata in a migration | Not applicable unless repository inspection later finds an implemented auth flow |

## Scope examples

- Place-card CSS: open the catalog, inspect cards, select one, capture desktop evidence, resize to mobile, and recheck card/selection layout.
- Map or selection logic: verify initialization, markers, cluster behavior if visible, marker and card selection, sidebar synchronization, filters, console errors, and feature-related requests.
- Shared planner/recommendation state: verify planner input through recommendation result and itinerary navigation, including an existing failure or empty state when practical.

Use existing mocked `npm run test:e2e` coverage for deterministic upstream behavior when the live local provider state cannot exercise a required branch. Live provider suites remain opt-in.
