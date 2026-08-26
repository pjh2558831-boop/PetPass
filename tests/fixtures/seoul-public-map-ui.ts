import type {
  PublicMapPetAccessVerdict,
  PublicMapPlaceCategory,
  PublicMapPlaceDTO,
} from "@/types/public-map-place";

// Deterministic browser-test fixture only. It models the Phase 1/2 audited
// accepted-record count and is never used as a runtime or provider fallback.
const SEOUL_DISTRICTS = [
  ["110", "종로구"], ["140", "중구"], ["170", "용산구"], ["200", "성동구"],
  ["215", "광진구"], ["230", "동대문구"], ["260", "중랑구"], ["290", "성북구"],
  ["305", "강북구"], ["320", "도봉구"], ["350", "노원구"], ["380", "은평구"],
  ["410", "서대문구"], ["440", "마포구"], ["470", "양천구"], ["500", "강서구"],
  ["530", "구로구"], ["545", "금천구"], ["560", "영등포구"], ["590", "동작구"],
  ["620", "관악구"], ["650", "서초구"], ["680", "강남구"], ["710", "송파구"],
  ["740", "강동구"],
] as const;

function categoryFor(index: number): {
  category: PublicMapPlaceCategory;
  contentTypeId: "12" | "32" | "38" | "39";
} {
  if (index >= 70) return { category: "shopping", contentTypeId: "38" };
  if (index >= 64) return { category: "accommodation", contentTypeId: "32" };
  if (index >= 56) return { category: "food", contentTypeId: "39" };
  return { category: "attraction", contentTypeId: "12" };
}

const VERDICTS: readonly {
  verdict: PublicMapPetAccessVerdict;
  label: string;
}[] = [
  { verdict: "allowed", label: "반려동물 동반 가능" },
  { verdict: "conditional", label: "동반 조건 확인 필요" },
  { verdict: "unknown", label: "동반 정보 확인 필요" },
  { verdict: "not_allowed", label: "반려동물 동반 불가" },
  { verdict: "unknown", label: "방문 전 확인 필요" },
];

export const SEOUL_PUBLIC_MAP_UI_FIXTURE: readonly PublicMapPlaceDTO[] =
  Array.from({ length: 76 }, (_, index) => {
    const [districtCode, districtName] = SEOUL_DISTRICTS[index % SEOUL_DISTRICTS.length];
    const { category, contentTypeId } = categoryFor(index);
    const { verdict, label } = VERDICTS[index % VERDICTS.length];
    const providerPlaceId = String(6_110_001 + index);
    const districtIndex = index % SEOUL_DISTRICTS.length;
    const latitude = 37.43 + Math.floor(districtIndex / 5) * 0.05 + Math.floor(index / 25) * 0.004;
    const longitude = 126.79 + (districtIndex % 5) * 0.08;
    const hasImage = index % 7 !== 6 && index !== 75;

    return {
      id: `tour:${providerPlaceId}`,
      provider: "tour",
      providerPlaceId,
      name: `서울 UI 검증 장소 ${String(index + 1).padStart(2, "0")}`,
      kind: "tourism_place",
      category,
      district: { code: districtCode, name: districtName },
      address: `서울특별시 ${districtName} 검증로 ${index + 1}`,
      coordinates: { latitude, longitude },
      phone: null,
      imageUrl: hasImage
        ? `https://tong.visitkorea.or.kr/cms/resource/fixture-seoul-${String(index + 1).padStart(2, "0")}.jpg`
        : null,
      contentTypeId,
      placeUrl: `/places/${providerPlaceId}?region=seoul&contentTypeId=${contentTypeId}`,
      source: "kto_official",
      petAccessVerdict: verdict,
      reviewStatus: verdict === "unknown" ? "needs_review" : "confirmed",
      publicLabel: label,
      categoryGroupCode: `fixture-${contentTypeId}`,
      lastSeenAt: "2026-08-26T00:00:00.000Z",
      matchedQueryCount: 0,
      categoryQueryAgreementCount: 0,
    };
  });
