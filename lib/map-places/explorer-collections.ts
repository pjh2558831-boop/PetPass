import { isValidMapCoordinates } from "@/lib/kakao/maps";
import { PUBLIC_CATALOG_PAGE_SIZE } from "@/lib/map-places/catalog-url";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import type { PublicCatalogLayer, PublicCatalogPlace } from "@/types/public-catalog-place";
import type { PublicMapPlaceCategory } from "@/types/public-map-place";

export type ExplorerSort = "source" | "name";

export interface ExplorerCollectionInput {
  places: PublicCatalogPlace[];
  district: string | "all";
  category: PublicMapPlaceCategory | "all";
  layers: PublicCatalogLayer[];
  activeBounds: KakaoCurrentMapSearch["rectangle"] | null;
  page: number;
  sort: ExplorerSort;
}

const SOURCE_ORDER: Record<PublicCatalogLayer, number> = {
  tourism: 0,
  kakao: 1,
  veterinary: 2,
  pet_shop: 3,
};

export function isInsideExplorerBounds(
  place: PublicCatalogPlace,
  bounds: KakaoCurrentMapSearch["rectangle"],
): boolean {
  if (!isValidMapCoordinates(place.coordinates)) return false;
  return place.coordinates.longitude >= bounds.west &&
    place.coordinates.longitude <= bounds.east &&
    place.coordinates.latitude >= bounds.south &&
    place.coordinates.latitude <= bounds.north;
}

export function getExplorerCollections(input: ExplorerCollectionInput): {
  filteredPlaces: PublicCatalogPlace[];
  mapPlaces: PublicCatalogPlace[];
  pagedPlaces: PublicCatalogPlace[];
  currentPage: number;
  totalPages: number;
} {
  const unique = new Map<string, PublicCatalogPlace>();
  for (const place of input.places) {
    if (!unique.has(place.id) && isValidMapCoordinates(place.coordinates)) {
      unique.set(place.id, place);
    }
  }
  const layerSet = new Set(input.layers);
  const filteredPlaces = [...unique.values()]
    .filter((place) => input.district === "all" || place.districtCode === input.district)
    .filter((place) => input.category === "all" || place.layer === "veterinary" || place.layer === "pet_shop" || place.category === input.category)
    .filter((place) => layerSet.has(place.layer))
    .filter((place) => !input.activeBounds || isInsideExplorerBounds(place, input.activeBounds))
    .sort((left, right) => input.sort === "name"
      ? left.name.localeCompare(right.name, "ko")
      : SOURCE_ORDER[left.layer] - SOURCE_ORDER[right.layer] || left.name.localeCompare(right.name, "ko"));
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
