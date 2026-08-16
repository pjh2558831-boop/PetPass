# Full map marker lifecycle diagnosis

## Current implementation

- **Marker data source:** `/results?tab=catalog` loads the complete exposed
  Tourism list from `/api/tour/places` and the complete sanitized stored Kakao
  catalog from `/api/map/places`, then combines and filters them in
  `ResultsExplorer`.
- **Visible catalog marker type:** an interactive HTML `button` inside a
  `kakao.maps.CustomOverlay`.
- **Cluster marker type:** a second, transparent `kakao.maps.Marker` at the same
  coordinate. `MarkerClusterer` manages this proxy, not the visible overlay.
- **Selected marker type:** the visible overlay receives an outline and a third
  `CustomOverlay` named `kakao-map-selection` draws two more circular rings.
- **Clusterer lifecycle:** one clusterer is created per map, but every
  `MapPanel.updateData` clears all proxy markers, DOM overlays, listeners, and
  selection before rebuilding them.
- **Zoom behavior:** Kakao clusters only the transparent proxy markers. A
  `clustered` listener separately hides or reveals the unrelated visible DOM
  overlays. No marker registry is authoritative across that boundary.
- **Bounds behavior:** the map `idle` listener reports bounds, but the current
  results explorer does not keep an explicit committed-bounds scope or dirty
  state. It therefore has no user-controlled re-search contract.

## Root causes

1. **Disappearing markers:** `createKakaoMapController` hides DOM overlays when
   their transparent proxy markers are reported inside a cluster. At close zoom
   the proxy becomes an individual but remains visually transparent; visibility
   of the real overlay depends on a separate asynchronous `clustered` event.
   When the event is absent, late, or represents a different rebuild, both the
   cluster and the visible overlay can be absent. The `minLevel: 5` boundary
   makes this split especially fragile when clusters dissolve.
2. **Concentric rings:** `.kakao-map-marker.is-selected` adds an outline while
   `.kakao-map-selection` adds a circular border plus an outer box-shadow ring.
   These surround the white border of the rotated base marker, producing the
   malformed yellow and green concentric visuals.
3. **Duplicate rendering and churn:** one place owns a visible custom overlay,
   a transparent cluster proxy, and on selection a ring overlay. In addition,
   `MapPanel` includes `selectedLocationId` in its data-update effect and uses a
   fresh default `[]` for route coordinates, so selection and ordinary parent
   rerenders can clear and rebuild every marker before selecting again.
4. **Viewport/filter contract:** the explorer has source/category/district
   filters and card pagination, but no separate `filteredPlaces`, `mapPlaces`,
   `pagedPlaces`, committed viewport, or `viewportDirty` state. Page data and
   map data happen to be separate today, but the interaction is not encoded as
   an enforceable architecture contract.

## Responsible code

- `lib/kakao/maps.ts` — `createKakaoMapController`, transparent proxy markers,
  `syncClusteredCatalogOverlays`, `selectionOverlay`, and `clearLayers`.
- `components/map/map-panel.tsx` — the combined data-and-selection effect and
  unstable empty route-coordinate default.
- `app/globals.css` — `.kakao-map-marker.is-selected` and
  `.kakao-map-selection` ring styles.
- `components/places/results-explorer.tsx` — catalog collection derivation,
  pagination, and missing committed-viewport/dirty-state model.

## Repair direction

Use one actual `kakao.maps.Marker` per source place in one canonical registry.
The same object swaps between normal and selected `MarkerImage` instances.
`MarkerClusterer` manages those visible markers directly; no catalog pin uses a
parallel `CustomOverlay`. Data/filter replacement diffs the registry and then
clears/adds/redraws the single clusterer. Zoom and bounds events never perform
that lifecycle. A `CustomOverlay` remains permitted only for information text
and for the existing non-clustered itinerary sequence controls.
