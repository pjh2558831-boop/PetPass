import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import type {
  PetTravelCandidateCategory,
  PlaceCandidateKind,
} from "@/types/place-candidate";

export const KAKAO_BUSAN_QUERY_REGISTRY_VERSION =
  "kakao-busan-query-registry-v1" as const;
export const KAKAO_BUSAN_QUERY_KEY_PREFIX = "kakao-busan-v1" as const;

export const KAKAO_BUSAN_QUERY_FAMILIES = [
  "general",
  "cafe",
  "food",
  "accommodation",
  "outdoor_leisure",
  "veterinary",
  "pet_shop",
] as const;

export type KakaoBusanQueryFamily =
  (typeof KAKAO_BUSAN_QUERY_FAMILIES)[number];

export type KakaoCollectionCategoryGroupCode =
  | "CE7"
  | "FD6"
  | "AD5"
  | "AT4";

interface KakaoBusanQueryTemplate {
  suffix: string;
  candidateKind: PlaceCandidateKind;
  normalizedCategoryHint: PetTravelCandidateCategory | null;
  categoryGroupCode?: KakaoCollectionCategoryGroupCode;
}

const TRAVEL = "pet_travel_candidate" as const;

export const KAKAO_BUSAN_QUERY_TEMPLATES = {
  general: [
    { suffix: "애견동반", candidateKind: TRAVEL, normalizedCategoryHint: "other" },
    { suffix: "반려견 동반", candidateKind: TRAVEL, normalizedCategoryHint: "other" },
    { suffix: "반려동물 동반", candidateKind: TRAVEL, normalizedCategoryHint: "other" },
    { suffix: "강아지 동반", candidateKind: TRAVEL, normalizedCategoryHint: "other" },
    { suffix: "펫프렌들리", candidateKind: TRAVEL, normalizedCategoryHint: "other" },
  ],
  cafe: [
    { suffix: "애견동반 카페", candidateKind: TRAVEL, normalizedCategoryHint: "cafe", categoryGroupCode: "CE7" },
    { suffix: "반려동물 동반 카페", candidateKind: TRAVEL, normalizedCategoryHint: "cafe", categoryGroupCode: "CE7" },
    { suffix: "애견카페", candidateKind: TRAVEL, normalizedCategoryHint: "cafe", categoryGroupCode: "CE7" },
  ],
  food: [
    { suffix: "애견동반 식당", candidateKind: TRAVEL, normalizedCategoryHint: "food", categoryGroupCode: "FD6" },
    { suffix: "반려동물 동반 식당", candidateKind: TRAVEL, normalizedCategoryHint: "food", categoryGroupCode: "FD6" },
    { suffix: "애견동반 음식점", candidateKind: TRAVEL, normalizedCategoryHint: "food", categoryGroupCode: "FD6" },
  ],
  accommodation: [
    { suffix: "애견동반 숙소", candidateKind: TRAVEL, normalizedCategoryHint: "accommodation", categoryGroupCode: "AD5" },
    { suffix: "반려동물 동반 숙소", candidateKind: TRAVEL, normalizedCategoryHint: "accommodation", categoryGroupCode: "AD5" },
    { suffix: "애견펜션", candidateKind: TRAVEL, normalizedCategoryHint: "accommodation", categoryGroupCode: "AD5" },
    { suffix: "애견동반 호텔", candidateKind: TRAVEL, normalizedCategoryHint: "accommodation", categoryGroupCode: "AD5" },
    { suffix: "애견동반 캠핑장", candidateKind: TRAVEL, normalizedCategoryHint: "camping" },
  ],
  outdoor_leisure: [
    { suffix: "애견동반 관광지", candidateKind: TRAVEL, normalizedCategoryHint: "attraction", categoryGroupCode: "AT4" },
    { suffix: "반려견 동반 공원", candidateKind: TRAVEL, normalizedCategoryHint: "park_walk" },
    { suffix: "애견동반 공원", candidateKind: TRAVEL, normalizedCategoryHint: "park_walk" },
    { suffix: "애견동반 해수욕장", candidateKind: TRAVEL, normalizedCategoryHint: "park_walk" },
    { suffix: "반려견 산책", candidateKind: TRAVEL, normalizedCategoryHint: "park_walk" },
    { suffix: "애견동반 레저", candidateKind: TRAVEL, normalizedCategoryHint: "leisure" },
  ],
  veterinary: [
    { suffix: "동물병원", candidateKind: "veterinary", normalizedCategoryHint: null },
    { suffix: "24시 동물병원", candidateKind: "veterinary", normalizedCategoryHint: null },
    { suffix: "동물의료센터", candidateKind: "veterinary", normalizedCategoryHint: null },
    { suffix: "응급 동물병원", candidateKind: "veterinary", normalizedCategoryHint: null },
  ],
  pet_shop: [
    { suffix: "펫샵", candidateKind: "pet_shop", normalizedCategoryHint: null },
    { suffix: "애견용품", candidateKind: "pet_shop", normalizedCategoryHint: null },
    { suffix: "반려동물용품", candidateKind: "pet_shop", normalizedCategoryHint: null },
    { suffix: "펫용품", candidateKind: "pet_shop", normalizedCategoryHint: null },
    { suffix: "애완동물용품", candidateKind: "pet_shop", normalizedCategoryHint: null },
  ],
} as const satisfies Record<
  KakaoBusanQueryFamily,
  readonly KakaoBusanQueryTemplate[]
>;

export interface KakaoBusanCollectionQuery {
  key: string;
  registryVersion: typeof KAKAO_BUSAN_QUERY_REGISTRY_VERSION;
  districtCode: (typeof BUSAN_REGION_CONFIG.districts)[number]["code"];
  districtName: (typeof BUSAN_REGION_CONFIG.districts)[number]["name"];
  family: KakaoBusanQueryFamily;
  templateIndex: number;
  queryText: string;
  candidateKind: PlaceCandidateKind;
  normalizedCategoryHint: PetTravelCandidateCategory | null;
  categoryGroupCode?: KakaoCollectionCategoryGroupCode;
}

export const KAKAO_BUSAN_COLLECTION_QUERIES: readonly KakaoBusanCollectionQuery[] =
  BUSAN_REGION_CONFIG.districts.flatMap((district) =>
    KAKAO_BUSAN_QUERY_FAMILIES.flatMap((family) =>
      KAKAO_BUSAN_QUERY_TEMPLATES[family].map((template, templateIndex) => ({
        key: `${KAKAO_BUSAN_QUERY_KEY_PREFIX}:${district.code}:${family}:${templateIndex}`,
        registryVersion: KAKAO_BUSAN_QUERY_REGISTRY_VERSION,
        districtCode: district.code,
        districtName: district.name,
        family,
        templateIndex,
        queryText: `부산 ${district.name} ${template.suffix}`,
        candidateKind: template.candidateKind,
        normalizedCategoryHint: template.normalizedCategoryHint,
        ...("categoryGroupCode" in template
          ? { categoryGroupCode: template.categoryGroupCode }
          : {}),
      })),
    ),
  );

export const KAKAO_BUSAN_QUERY_COUNT =
  KAKAO_BUSAN_COLLECTION_QUERIES.length;
export const KAKAO_BUSAN_MAX_PAGES_PER_QUERY = 3;
export const KAKAO_BUSAN_THEORETICAL_MAX_PROVIDER_CALLS =
  KAKAO_BUSAN_QUERY_COUNT * KAKAO_BUSAN_MAX_PAGES_PER_QUERY;

export function getKakaoBusanCollectionQueries(input: {
  districtCode?: string;
  candidateKind?: PlaceCandidateKind;
} = {}): KakaoBusanCollectionQuery[] {
  return KAKAO_BUSAN_COLLECTION_QUERIES.filter(
    (query) =>
      (!input.districtCode || query.districtCode === input.districtCode) &&
      (!input.candidateKind || query.candidateKind === input.candidateKind),
  );
}
