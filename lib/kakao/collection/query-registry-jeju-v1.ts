import { JEJU_REGION_CONFIG } from "@/lib/regions/config";
import { KAKAO_BUSAN_QUERY_FAMILIES, KAKAO_BUSAN_QUERY_TEMPLATES, type KakaoBusanCollectionQuery } from "./query-registry-v1";

export const KAKAO_JEJU_QUERY_REGISTRY_VERSION = "kakao-jeju-query-registry-v1";
export const KAKAO_JEJU_COLLECTION_QUERIES: readonly KakaoBusanCollectionQuery[] =
  JEJU_REGION_CONFIG.districts.flatMap((district) =>
    KAKAO_BUSAN_QUERY_FAMILIES.flatMap((family) =>
      KAKAO_BUSAN_QUERY_TEMPLATES[family].map((template, templateIndex) => ({
        key: `kakao-jeju-v1:${district.legalDongDistrictCode}:${family}:${templateIndex}`,
        registryVersion: KAKAO_JEJU_QUERY_REGISTRY_VERSION,
        districtCode: district.legalDongDistrictCode,
        districtName: district.name,
        family,
        templateIndex,
        queryText: `제주 ${district.name} ${template.suffix}`,
        candidateKind: template.candidateKind,
        normalizedCategoryHint: template.normalizedCategoryHint,
        ...("categoryGroupCode" in template ? { categoryGroupCode: template.categoryGroupCode } : {}),
      })),
    ),
  );
