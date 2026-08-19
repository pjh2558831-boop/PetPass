import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import type { KakaoBusanCollectionQuery } from "@/lib/kakao/collection/query-registry-v1";

export const KAKAO_BUSAN_DELTA_QUERY_REGISTRY_VERSION =
  "kakao-busan-query-registry-v2" as const;
export const KAKAO_BUSAN_DELTA_QUERY_KEY_PREFIX = "kakao-busan-v2" as const;

const COMPACT_DELTA_TEMPLATES = [
  {
    family: "cafe" as const,
    suffix: "반려동물동반 카페",
    normalizedCategoryHint: "cafe" as const,
    categoryGroupCode: "CE7" as const,
  },
  {
    family: "food" as const,
    suffix: "반려동물동반 식당",
    normalizedCategoryHint: "food" as const,
    categoryGroupCode: "FD6" as const,
  },
] as const;

export const KAKAO_BUSAN_DELTA_QUERIES: readonly KakaoBusanCollectionQuery[] =
  BUSAN_REGION_CONFIG.districts.flatMap((district) =>
    COMPACT_DELTA_TEMPLATES.map((template, templateIndex) => ({
      key: `${KAKAO_BUSAN_DELTA_QUERY_KEY_PREFIX}:${district.code}:${template.family}:0`,
      registryVersion: KAKAO_BUSAN_DELTA_QUERY_REGISTRY_VERSION,
      districtCode: district.code,
      districtName: district.name,
      family: template.family,
      templateIndex,
      queryText: `부산 ${district.name} ${template.suffix}`,
      candidateKind: "pet_travel_candidate" as const,
      normalizedCategoryHint: template.normalizedCategoryHint,
      categoryGroupCode: template.categoryGroupCode,
    })),
  );

export const KAKAO_BUSAN_DELTA_QUERY_COUNT = KAKAO_BUSAN_DELTA_QUERIES.length;
