import type {
  TourContentTypeId,
  TourPlaceCategory,
} from "@/types/place";

export const BUSAN_REGION = {
  code: "26",
  name: "부산",
} as const;

// Verified against KorPetTourService2 `ldongCode2` on 2026-08-05.
export const BUSAN_DISTRICTS = [
  { code: "110", name: "중구" },
  { code: "140", name: "서구" },
  { code: "170", name: "동구" },
  { code: "200", name: "영도구" },
  { code: "230", name: "부산진구" },
  { code: "260", name: "동래구" },
  { code: "290", name: "남구" },
  { code: "320", name: "북구" },
  { code: "350", name: "해운대구" },
  { code: "380", name: "사하구" },
  { code: "410", name: "금정구" },
  { code: "440", name: "강서구" },
  { code: "470", name: "연제구" },
  { code: "500", name: "수영구" },
  { code: "530", name: "사상구" },
  { code: "710", name: "기장군" },
] as const;

export type BusanDistrictCode = (typeof BUSAN_DISTRICTS)[number]["code"];

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
  return BUSAN_DISTRICTS.find((district) => district.code === code)?.name ?? null;
}

// Provider compatibility is defined separately by TOUR_CONTENT_TYPE_IDS.
// Catalog visibility intentionally has its own product allowlists.
export const TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS = [
  "12",
  "14",
  "15",
  "28",
  "32",
  "39",
] as const satisfies readonly TourContentTypeId[];

export const TOUR_OPT_IN_CATALOG_CONTENT_TYPE_IDS = [
  "38",
] as const satisfies readonly TourContentTypeId[];

// Automatic itinerary eligibility is still gated by request categories and pet access.
// Shopping remains opt-in even though Service2 type 38 is provider-compatible.
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
  { value: "shopping", label: "쇼핑(선택)", contentTypeId: "38" },
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
