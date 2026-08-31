import type { PublicCatalogMarker } from "@/types/public-catalog-place";
import {
  mapCatalogPlaceToCategory,
  PLACE_CATEGORY_LABELS,
} from "@/lib/map-places/place-categories";

export function normalizeCatalogSearchQuery(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

export function filterCatalogPlacesByQuery<T extends Pick<
  PublicCatalogMarker,
  "name" | "address" | "districtName" | "category" | "sourceLabel" | "layer"
>>(places: readonly T[], query: string): T[] {
  const normalizedQuery = normalizeCatalogSearchQuery(query);
  if (!normalizedQuery) return [...places];

  return places.filter((place) => normalizeCatalogSearchQuery([
    place.name,
    place.address,
    place.districtName,
    PLACE_CATEGORY_LABELS[mapCatalogPlaceToCategory(place)],
    place.sourceLabel,
  ].filter(Boolean).join(" ")).includes(normalizedQuery));
}
