import { getRegionConfig } from "@/lib/regions/config";
import { KAKAO_BUSAN_QUERY_FAMILIES, KAKAO_BUSAN_QUERY_TEMPLATES, type KakaoBusanCollectionQuery } from "./query-registry-v1";

export function capitalRegionQueries(regionId: "gyeonggi" | "incheon" | "gangwon" | "chungbuk" | "chungnam" | "gyeongbuk" | "gyeongnam" | "jeonbuk" | "jeonnam" | "daejeon" | "daegu" | "gwangju" | "ulsan" | "sejong"): KakaoBusanCollectionQuery[] {
  const region = getRegionConfig(regionId);
  // Legacy KTO Cheongwon/Masan/Jinhae codes stay intact; Kakao uses current cities.
  return region.districts.filter(d => (regionId !== "chungbuk" || d.legalDongDistrictCode !== "009") && (regionId !== "gyeongnam" || !["006", "014"].includes(d.legalDongDistrictCode))).flatMap(district => KAKAO_BUSAN_QUERY_FAMILIES.flatMap(family =>
    KAKAO_BUSAN_QUERY_TEMPLATES[family].map((template, templateIndex) => ({
      key: `kakao-${regionId}-v1:${district.legalDongDistrictCode}:${family}:${templateIndex}`,
      registryVersion: `kakao-${regionId}-query-registry-v1`,
      districtCode: district.legalDongDistrictCode, districtName: district.name, family, templateIndex,
      queryText: `${region.displayName}${regionId === "sejong" ? "" : ` ${district.name}`} ${template.suffix}`,
      candidateKind: template.candidateKind, normalizedCategoryHint: template.normalizedCategoryHint,
      ...("categoryGroupCode" in template ? { categoryGroupCode: template.categoryGroupCode } : {}),
    }))));
}
