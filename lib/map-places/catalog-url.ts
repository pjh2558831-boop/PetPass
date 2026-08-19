import { BUSAN_DISTRICTS, isBusanDistrictCode, type BusanDistrictCode } from "@/lib/tour-api/catalog";
import {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  isPlaceCategory,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { PublicCatalogLayer } from "@/types/public-catalog-place";
import type { ExplorerSort } from "@/lib/map-places/explorer-collections";

export const PUBLIC_CATALOG_LAYERS = ["tourism", "kakao", "veterinary", "pet_shop"] as const;
export const PUBLIC_CATALOG_PAGE_SIZE = 12;

export interface PublicCatalogUrlState {
  district: BusanDistrictCode | "all";
  categories: PlaceCategory[];
  layers: PublicCatalogLayer[];
  page: number;
  sort: ExplorerSort;
}

export function parsePublicCatalogUrlState(
  params: Record<string, string | string[] | undefined>,
): PublicCatalogUrlState {
  const single = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const districtValue = single(params.district);
  const categoriesValue = single(params.categories);
  const legacyCategoryValue = single(params.category);
  const layersValue = single(params.layers);
  const sortValue = single(params.sort);
  const pageValue = Number(single(params.page));
  const layers = layersValue === "none"
    ? []
    : layersValue
    ? [...new Set(layersValue.split(","))].filter(
        (value): value is PublicCatalogLayer => PUBLIC_CATALOG_LAYERS.includes(value as PublicCatalogLayer),
      )
    : [...PUBLIC_CATALOG_LAYERS];
  const allLayersValid = !layersValue || layersValue === "none" || (
    layers.length > 0 && layersValue.split(",").every((value) => PUBLIC_CATALOG_LAYERS.includes(value as PublicCatalogLayer))
  );
  const parsedCategories = categoriesValue === "none"
    ? []
    : categoriesValue
    ? [...new Set(categoriesValue.split(","))].filter(isPlaceCategory)
    : legacyCategoryValue && isPlaceCategory(legacyCategoryValue)
      ? [legacyCategoryValue]
      : [...DEFAULT_PLACE_CATEGORIES];
  const allCategoriesValid = !categoriesValue || categoriesValue === "none" || (
    parsedCategories.length > 0 && categoriesValue.split(",").every(isPlaceCategory)
  );
  return {
    district: districtValue && isBusanDistrictCode(districtValue) ? districtValue : "all",
    categories: allCategoriesValid ? parsedCategories : [...DEFAULT_PLACE_CATEGORIES],
    layers: allLayersValid ? layers : [...PUBLIC_CATALOG_LAYERS],
    page: Number.isInteger(pageValue) && pageValue > 0 && pageValue <= 100 ? pageValue : 1,
    sort: sortValue === "popularity" ? "popularity" : "recommendation",
  };
}

export function serializePublicCatalogCategories(categories: readonly PlaceCategory[]): string | null {
  const canonical = PLACE_CATEGORIES.filter((category) => categories.includes(category));
  if (canonical.length === 0) return "none";
  return canonical.length === DEFAULT_PLACE_CATEGORIES.length &&
    canonical.every((category, index) => category === DEFAULT_PLACE_CATEGORIES[index])
    ? null
    : canonical.join(",");
}

export function getPublicCatalogDistrictName(code: string): string {
  return BUSAN_DISTRICTS.find((district) => district.code === code)?.name ?? "부산 전체";
}
