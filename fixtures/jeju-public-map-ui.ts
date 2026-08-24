import type {
  PublicMapPetAccessVerdict,
  PublicMapPlaceCategory,
  PublicMapPlaceDTO,
} from "@/types/public-map-place";

// Deterministic UI/browser fixture only. These synthetic names and image paths
// are never used as a production fallback or written to the provider catalog.
const RETRIEVED_AT = "2026-08-19T04:00:00.000Z";

function fixtureCategory(index: number): {
  category: PublicMapPlaceCategory;
  contentTypeId: string;
} {
  if (index % 12 === 10) return { category: "accommodation", contentTypeId: "32" };
  if (index % 12 === 11) return { category: "food", contentTypeId: "39" };
  return {
    category: "attraction",
    contentTypeId: ["12", "14", "15", "28"][index % 4],
  };
}

function fixturePlace(input: {
  districtCode: "110" | "130";
  districtIndex: number;
  globalIndex: number;
}): PublicMapPlaceDTO {
  const isJejuCity = input.districtCode === "110";
  const districtName = isJejuCity ? "제주시" : "서귀포시";
  const { category, contentTypeId } = fixtureCategory(input.globalIndex);
  const hasImage = input.districtIndex < (isJejuCity ? 23 : 22);
  const verdict: PublicMapPetAccessVerdict = input.districtIndex < (isJejuCity ? 25 : 24)
    ? "conditional"
    : "unknown";
  const providerPlaceId = String(5_010_001 + input.globalIndex);
  const latitude = (isJejuCity ? 33.44 : 33.2) + Math.floor(input.districtIndex / 9) * 0.025;
  const longitude = 126.25 + (input.districtIndex % 9) * 0.06;

  return {
    id: `tour:${providerPlaceId}`,
    provider: "tour",
    providerPlaceId,
    name: `제주 UI 검증 장소 ${String(input.globalIndex + 1).padStart(2, "0")}`,
    kind: "tourism_place",
    category,
    district: { code: input.districtCode, name: districtName },
    address: `제주특별자치도 ${districtName} 검증로 ${input.districtIndex + 1}`,
    coordinates: { latitude, longitude },
    phone: null,
    imageUrl: hasImage
      ? `https://tong.visitkorea.or.kr/cms/resource/fixture-jeju-${String(input.globalIndex + 1).padStart(2, "0")}.jpg`
      : null,
    contentTypeId,
    placeUrl: `/places/${providerPlaceId}?region=jeju&contentTypeId=${contentTypeId}`,
    source: "kto_official",
    petAccessVerdict: verdict,
    reviewStatus: "confirmed",
    publicLabel: verdict === "conditional"
      ? "동반 조건 확인 필요"
      : "동반 정보 확인 필요",
    categoryGroupCode: `fixture-${contentTypeId}`,
    lastSeenAt: RETRIEVED_AT,
    matchedQueryCount: 0,
    categoryQueryAgreementCount: 0,
  };
}

export const JEJU_PUBLIC_MAP_UI_FIXTURE: readonly PublicMapPlaceDTO[] = [
  ...Array.from({ length: 27 }, (_, districtIndex) => fixturePlace({
    districtCode: "110",
    districtIndex,
    globalIndex: districtIndex,
  })),
  ...Array.from({ length: 27 }, (_, districtIndex) => fixturePlace({
    districtCode: "130",
    districtIndex,
    globalIndex: districtIndex + 27,
  })),
];
