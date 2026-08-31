import {
  REGION_CONFIGS,
  getRegionConfig,
  getRegionDefaultCatalogCategories,
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
): PublicCatalogUrlState | null {
  const single = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  if (Object.keys(params).some((key) => key !== "region" && key.toLocaleLowerCase("en-US").includes("region"))) {
    return null;
  }
  const rawRegion = params.region;
  const explicitRegion = rawRegion !== undefined;
  const requestedRegion = getRegionConfig(single(rawRegion));
  if (explicitRegion && !requestedRegion?.mapEnabled) return null;
  const region = requestedRegion ?? REGION_CONFIGS[0];
  const defaultCategories = getRegionDefaultCatalogCategories(region) as PlaceCategory[];
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
    : [...defaultCategories];
  const allCategoriesValid = !categoriesValue || categoriesValue === "none" || (
    parsedCategories.length > 0 && categoriesValue.split(",").every(isPlaceCategory)
  );
  return {
    region: region.id,
    district: districtValue && getRegionDistrict(region, districtValue) ? districtValue : "all",
    categories: allCategoriesValid ? parsedCategories : [...defaultCategories],
    layers: allLayersValid ? layers : [...PUBLIC_CATALOG_LAYERS],
    page: Number.isInteger(pageValue) && pageValue > 0 && pageValue <= 100 ? pageValue : 1,
    sort: sortValue === "popularity" ? "popularity" : "recommendation",
  };
}

export function serializePublicCatalogCategories(
  categories: readonly PlaceCategory[],
  defaultCategories: readonly PlaceCategory[] = DEFAULT_PLACE_CATEGORIES,
): string | null {
  const canonical = PLACE_CATEGORIES.filter((category) => categories.includes(category));
  if (canonical.length === 0) return "none";
  return canonical.length === defaultCategories.length &&
    canonical.every((category, index) => category === defaultCategories[index])
    ? null
    : canonical.join(",");
}

function serializePublicCatalogLayers(layers: readonly PublicCatalogLayer[]): string | null {
  const canonical = PUBLIC_CATALOG_LAYERS.filter((layer) => layers.includes(layer));
  if (canonical.length === 0) return "none";
  return canonical.length === PUBLIC_CATALOG_LAYERS.length
    ? null
    : canonical.join(",");
}

export function serializeResultsUrl(
  activeTab: "catalog" | "recommendations",
  state: Omit<PublicCatalogUrlState, "categories" | "layers"> & {
    categories: readonly PlaceCategory[];
    layers: readonly PublicCatalogLayer[];
  },
): string {
  const params = new URLSearchParams();
  params.set("tab", activeTab);
  params.set("region", state.region);
  if (activeTab === "catalog") {
    if (state.district !== "all") params.set("district", state.district);
    const region = getRegionConfig(state.region);
    const categoryState = serializePublicCatalogCategories(
      state.categories,
      getRegionDefaultCatalogCategories(region) as PlaceCategory[],
    );
    if (categoryState) params.set("categories", categoryState);
    const layerState = serializePublicCatalogLayers(state.layers);
    if (layerState) params.set("layers", layerState);
    if (state.sort !== "recommendation") params.set("sort", state.sort);
    params.set("page", String(state.page));
  }
  return `/results?${params.toString()}`;
}

export function getPublicCatalogDistrictName(regionId: RegionId, code: string): string {
  const region = getRegionConfig(regionId);
  return code === "all"
    ? `${region.displayName} 전체`
    : getRegionDistrict(region, code)?.name ?? `${region.displayName} 전체`;
}

export function resolvePublicCatalogDistrictQuery(
  regionId: RegionId,
  query: string,
): string | "all" | null {
  const region = getRegionConfig(regionId);
  const normalized = query.trim();
  if (normalized === "전체" || normalized === `${region.displayName} 전체`) return "all";
  return region.districts.find(({ name }) => name === normalized)
    ?.legalDongDistrictCode ?? null;
}
