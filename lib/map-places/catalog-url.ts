import { BUSAN_DISTRICTS, isBusanDistrictCode, type BusanDistrictCode } from "@/lib/tour-api/catalog";
import { PUBLIC_MAP_PLACE_CATEGORIES, type PublicMapPlaceCategory } from "@/types/public-map-place";
import type { PublicCatalogLayer } from "@/types/public-catalog-place";

export const PUBLIC_CATALOG_LAYERS = ["tourism", "kakao", "veterinary", "pet_shop"] as const;
export const PUBLIC_CATALOG_PAGE_SIZE = 12;

export interface PublicCatalogUrlState {
  district: BusanDistrictCode | "all";
  category: PublicMapPlaceCategory | "all";
  layers: PublicCatalogLayer[];
  page: number;
}

export function parsePublicCatalogUrlState(
  params: Record<string, string | string[] | undefined>,
): PublicCatalogUrlState {
  const single = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
  const districtValue = single(params.district);
  const categoryValue = single(params.category);
  const layersValue = single(params.layers);
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
  return {
    district: districtValue && isBusanDistrictCode(districtValue) ? districtValue : "all",
    category: categoryValue && PUBLIC_MAP_PLACE_CATEGORIES.includes(categoryValue as PublicMapPlaceCategory)
      ? categoryValue as PublicMapPlaceCategory
      : "all",
    layers: allLayersValid ? layers : [...PUBLIC_CATALOG_LAYERS],
    page: Number.isInteger(pageValue) && pageValue > 0 && pageValue <= 100 ? pageValue : 1,
  };
}

export function getPublicCatalogDistrictName(code: string): string {
  return BUSAN_DISTRICTS.find((district) => district.code === code)?.name ?? "부산 전체";
}
