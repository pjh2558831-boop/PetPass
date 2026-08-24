import { isValidMapCoordinates } from "@/lib/kakao/maps";
import { PUBLIC_CATALOG_PAGE_SIZE } from "@/lib/map-places/catalog-url";
import { rankCatalogPlaces, type CatalogRankingCenter, type CatalogPopularityResult } from "@/lib/map-places/catalog-ranking";
import { mapCatalogPlaceToCategory, type PlaceCategory } from "@/lib/map-places/place-categories";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import type { PublicCatalogLayer, PublicCatalogMarker } from "@/types/public-catalog-place";
import type { RegionId } from "@/types/region";

export type ExplorerSort = "recommendation" | "popularity";

export interface ExplorerCollectionInput {
  places: PublicCatalogMarker[];
  regionId: RegionId;
  district: string | "all";
  categories: PlaceCategory[];
  layers: PublicCatalogLayer[];
  activeBounds: KakaoCurrentMapSearch["rectangle"] | null;
  page: number;
  sort: ExplorerSort;
  rankingAsOf: string;
  rankingCenter?: CatalogRankingCenter | null;
  popularity?: ReadonlyMap<string, CatalogPopularityResult>;
}

export function isInsideExplorerBounds(
  place: PublicCatalogMarker,
  bounds: KakaoCurrentMapSearch["rectangle"],
): boolean {
  if (!isValidMapCoordinates(place.coordinates)) return false;
  return place.coordinates.longitude >= bounds.west &&
    place.coordinates.longitude <= bounds.east &&
    place.coordinates.latitude >= bounds.south &&
    place.coordinates.latitude <= bounds.north;
}

export function getExplorerCollections(input: ExplorerCollectionInput): {
  filteredPlaces: PublicCatalogMarker[];
  mapPlaces: PublicCatalogMarker[];
  pagedPlaces: PublicCatalogMarker[];
  currentPage: number;
  totalPages: number;
} {
  const unique = new Map<string, PublicCatalogMarker>();
  for (const place of input.places) {
    if (!unique.has(place.id) && isValidMapCoordinates(place.coordinates)) {
      unique.set(place.id, place);
    }
  }
  const layerSet = new Set(input.layers);
  const categorySet = new Set(input.categories);
  const matchedPlaces = [...unique.values()]
    .filter((place) => place.regionId === input.regionId)
    .filter((place) => input.district === "all" || place.districtCode === input.district)
    .filter((place) => categorySet.has(mapCatalogPlaceToCategory(place)))
    .filter((place) => layerSet.has(place.layer))
    .filter((place) => !input.activeBounds || isInsideExplorerBounds(place, input.activeBounds));
  const filteredPlaces = rankCatalogPlaces(matchedPlaces, {
    activeCategories: input.categories,
    districtSelected: input.district !== "all",
    committedBoundsSelected: Boolean(input.activeBounds),
    center: input.rankingCenter ?? null,
    asOf: input.rankingAsOf,
    popularity: input.popularity,
  }, input.sort).map((result) => result.place);
  const mapPlaces = filteredPlaces;
  const totalPages = Math.max(1, Math.ceil(filteredPlaces.length / PUBLIC_CATALOG_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, input.page), totalPages);
  const offset = (currentPage - 1) * PUBLIC_CATALOG_PAGE_SIZE;
  const pagedPlaces = filteredPlaces.slice(offset, offset + PUBLIC_CATALOG_PAGE_SIZE);
  return { filteredPlaces, mapPlaces, pagedPlaces, currentPage, totalPages };
}

export function explorerBoundsAreEquivalent(
  left: KakaoCurrentMapSearch["rectangle"] | null,
  right: KakaoCurrentMapSearch["rectangle"] | null,
  tolerance = 0.00015,
): boolean {
  if (!left || !right) return left === right;
  return Math.abs(left.west - right.west) <= tolerance &&
    Math.abs(left.south - right.south) <= tolerance &&
    Math.abs(left.east - right.east) <= tolerance &&
    Math.abs(left.north - right.north) <= tolerance;
}
