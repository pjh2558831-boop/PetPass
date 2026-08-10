import type { TourPlaceSummary } from "@/types/place";

export const CATALOG_PAGE_SIZE = 12;
export const MAX_INTERACTIVE_MAP_MARKERS = 120;

export function deduplicateCatalogPlaces(
  places: TourPlaceSummary[],
): TourPlaceSummary[] {
  const unique = new Map<string, TourPlaceSummary>();
  for (const place of places) {
    if (!unique.has(place.contentId)) unique.set(place.contentId, place);
  }
  return [...unique.values()];
}

export function hasValidCatalogCoordinates(
  place: TourPlaceSummary,
): boolean {
  return Boolean(
    place.latitude !== null &&
      place.longitude !== null &&
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude) &&
      place.latitude >= -90 &&
      place.latitude <= 90 &&
      place.longitude >= -180 &&
      place.longitude <= 180,
  );
}

export function getMapPlaces(
  places: TourPlaceSummary[],
): TourPlaceSummary[] {
  return deduplicateCatalogPlaces(places).filter(hasValidCatalogCoordinates);
}

export function getInteractiveMapPlaceIds(
  mapPlaces: TourPlaceSummary[],
  currentPagePlaces: TourPlaceSummary[],
  maximum = MAX_INTERACTIVE_MAP_MARKERS,
): Set<string> {
  const interactivePlaces =
    mapPlaces.length > maximum ? currentPagePlaces : mapPlaces;
  return new Set(interactivePlaces.map(({ contentId }) => contentId));
}

export function getPaginatedPlaces(
  places: TourPlaceSummary[],
  page: number,
  pageSize = CATALOG_PAGE_SIZE,
): TourPlaceSummary[] {
  const offset = (Math.max(1, page) - 1) * pageSize;
  return places.slice(offset, offset + pageSize);
}

export function getCatalogPageRange(
  totalCount: number,
  page: number,
  pageSize = CATALOG_PAGE_SIZE,
): { start: number; end: number } {
  if (totalCount === 0) return { start: 0, end: 0 };
  const start = (Math.max(1, page) - 1) * pageSize + 1;
  return { start, end: Math.min(totalCount, start + pageSize - 1) };
}
