import type {
  TourContentTypeId,
  TourPlaceCategory,
} from "@/types/place";
import {
  BUSAN_REGION_CONFIG,
  getRegionDistrict,
  type BusanDistrictCode,
} from "@/lib/regions/config";

export const BUSAN_REGION = {
  code: BUSAN_REGION_CONFIG.providerCodes.korPetTourService2.legalDongRegionCode,
  name: BUSAN_REGION_CONFIG.displayName,
} as const;

// Verified against KorPetTourService2 `ldongCode2` on 2026-08-05.
export const BUSAN_DISTRICTS = BUSAN_REGION_CONFIG.districts.map(
  ({ legalDongDistrictCode, name }) => ({ code: legalDongDistrictCode, name }),
);
export type { BusanDistrictCode } from "@/lib/regions/config";

const BUSAN_DISTRICT_CODES = new Set<string>(
  BUSAN_DISTRICTS.map(({ code }) => code),
);

export function isBusanDistrictCode(
  value: string | null | undefined,
): value is BusanDistrictCode {
  return Boolean(value && BUSAN_DISTRICT_CODES.has(value));
}

export function getBusanDistrictName(
  code: BusanDistrictCode | null | undefined,
): string | null {
  return getRegionDistrict(BUSAN_REGION_CONFIG, code)?.name ?? null;
}

// Provider compatibility is defined separately by TOUR_CONTENT_TYPE_IDS.
// Catalog visibility intentionally has its own product allowlists.
export const TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS = [
  "12",
  "14",
  "15",
  "28",
  "32",
  "38",
  "39",
] as const satisfies readonly TourContentTypeId[];

export const TOUR_OPT_IN_CATALOG_CONTENT_TYPE_IDS = [] as const;

// Automatic itinerary eligibility is still gated by request categories and pet access.
// Recommendation eligibility remains a separate boundary from public catalog visibility.
export const TOUR_ITINERARY_ELIGIBLE_CONTENT_TYPE_IDS = [
  "12",
  "14",
  "15",
  "28",
  "32",
  "38",
  "39",
] as const satisfies readonly TourContentTypeId[];

export type TourCatalogCategory = Exclude<
  TourPlaceCategory,
  "transportation" | "unknown"
>;

export type TourCatalogFilter = TourCatalogCategory | "all";

export const TOUR_CATALOG_FILTERS = [
  { value: "all", label: "전체", contentTypeId: null },
  { value: "attraction", label: "관광지", contentTypeId: "12" },
  { value: "culture", label: "문화시설", contentTypeId: "14" },
  { value: "festival", label: "축제·행사", contentTypeId: "15" },
  { value: "leisure", label: "레저", contentTypeId: "28" },
  { value: "accommodation", label: "숙박", contentTypeId: "32" },
  { value: "food", label: "음식점", contentTypeId: "39" },
  { value: "shopping", label: "쇼핑", contentTypeId: "38" },
] as const satisfies readonly {
  value: TourCatalogFilter;
  label: string;
  contentTypeId: TourContentTypeId | null;
}[];

export function getCatalogContentTypeId(
  filter: TourCatalogFilter,
): TourContentTypeId | null {
  return (
    TOUR_CATALOG_FILTERS.find(({ value }) => value === filter)?.contentTypeId ??
    null
  );
}
