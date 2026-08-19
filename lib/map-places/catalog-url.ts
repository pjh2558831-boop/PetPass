import {
  BUSAN_REGION_CONFIG,
  getRegionConfig,
  getRegionDistrict,
} from "@/lib/regions/config";
import {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  isPlaceCategory,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { PublicCatalogLayer } from "@/types/public-catalog-place";
import type { ExplorerSort } from "@/lib/map-places/explorer-collections";
import type { RegionId } from "@/types/region";

export const PUBLIC_CATALOG_LAYERS = ["tourism", "kakao", "veterinary", "pet_shop"] as const;
export const PUBLIC_CATALOG_PAGE_SIZE = 12;

export interface PublicCatalogUrlState {
  region: RegionId;
  district: string | "all";
  categories: PlaceCategory[];
  layers: PublicCatalogLayer[];
  page: number;
  sort: ExplorerSort;
}

export function parsePublicCatalogUrlState(
  params: Record<string, string | string[] | undefined>,
): PublicCatalogUrlState {
  const single = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const requestedRegion = getRegionConfig(single(params.region));
  const region = requestedRegion?.mapEnabled ? requestedRegion : BUSAN_REGION_CONFIG;
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
    region: region.id,
    district: districtValue && getRegionDistrict(region, districtValue) ? districtValue : "all",
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

export function getPublicCatalogDistrictName(regionId: RegionId, code: string): string {
  const region = getRegionConfig(regionId);
  return code === "all"
    ? `${region.displayName} 전체`
    : getRegionDistrict(region, code)?.name ?? `${region.displayName} 전체`;
}
