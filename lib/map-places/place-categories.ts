import type { PublicCatalogLayer } from "@/types/public-catalog-place";
import type { PublicMapPlaceCategory } from "@/types/public-map-place";
import type { TourPlaceSummary } from "@/types/place";

export const PLACE_CATEGORIES = [
  "attraction",
  "food",
  "cafe",
  "accommodation",
  "shopping",
  "veterinary",
  "pet_shop",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];
export type TourCatalogCategory = Exclude<PlaceCategory, "veterinary" | "pet_shop">;

export const DEFAULT_PLACE_CATEGORIES = [
  "attraction",
  "food",
  "cafe",
  "accommodation",
] as const satisfies readonly PlaceCategory[];

export const OPTIONAL_PLACE_CATEGORIES = [
  "shopping",
  "veterinary",
  "pet_shop",
] as const satisfies readonly PlaceCategory[];
export type OptionalPlaceCategory = (typeof OPTIONAL_PLACE_CATEGORIES)[number];

export function isOptionalPlaceCategory(
  category: PlaceCategory,
): category is OptionalPlaceCategory {
  return (OPTIONAL_PLACE_CATEGORIES as readonly PlaceCategory[]).includes(category);
}

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  attraction: "관광지",
  food: "식당",
  cafe: "카페",
  accommodation: "숙소",
  shopping: "쇼핑",
  veterinary: "동물병원",
  pet_shop: "펫샵·용품점",
};

const KAKAO_CATEGORY_MAP: Record<PublicMapPlaceCategory, PlaceCategory> = {
  cafe: "cafe",
  food: "food",
  accommodation: "accommodation",
  attraction: "attraction",
  park_walk: "attraction",
  leisure: "attraction",
  camping: "attraction",
  shopping: "shopping",
  other: "attraction",
};

export function mapTourSummaryToPlaceCategory(
  place: Pick<TourPlaceSummary, "contentTypeId" | "category">,
): TourCatalogCategory {
  if (place.contentTypeId === "32" || place.category === "accommodation") return "accommodation";
  if (place.contentTypeId === "38" || place.category === "shopping") return "shopping";
  if (place.contentTypeId === "39" || place.category === "food") return "food";
  return "attraction";
}

export function mapCatalogPlaceToCategory(
  place: {
    layer: PublicCatalogLayer;
    category: PublicMapPlaceCategory;
    categoryGroupCode?: string | null;
  },
): PlaceCategory {
  if (place.layer === "veterinary") return "veterinary";
  if (place.layer === "pet_shop") return "pet_shop";
  if (place.categoryGroupCode === "CS2") return "shopping";
  return KAKAO_CATEGORY_MAP[place.category];
}

export function categoryToLayers(category: PlaceCategory): readonly PublicCatalogLayer[] {
  if (category === "veterinary") return ["veterinary"];
  if (category === "pet_shop") return ["pet_shop"];
  return ["tourism", "kakao"];
}

export function isPlaceCategory(value: string): value is PlaceCategory {
  return PLACE_CATEGORIES.includes(value as PlaceCategory);
}
