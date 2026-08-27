import type { PublicMapPlaceDTO } from "@/types/public-map-place";

// Deterministic browser/performance fixture only. Runtime code never imports it.
// The total mirrors the Phase 1 audited, district-mapped shopping baseline.
export const SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL = 3_090;

const SEOUL_DISTRICTS = [
  ["110", "종로구"], ["140", "중구"], ["170", "용산구"], ["200", "성동구"],
  ["215", "광진구"], ["230", "동대문구"], ["260", "중랑구"], ["290", "성북구"],
  ["305", "강북구"], ["320", "도봉구"], ["350", "노원구"], ["380", "은평구"],
  ["410", "서대문구"], ["440", "마포구"], ["470", "양천구"], ["500", "강서구"],
  ["530", "구로구"], ["545", "금천구"], ["560", "영등포구"], ["590", "동작구"],
  ["620", "관악구"], ["650", "서초구"], ["680", "강남구"], ["710", "송파구"],
  ["740", "강동구"],
] as const;

export const SEOUL_SHOPPING_MAP_UI_FIXTURE: readonly PublicMapPlaceDTO[] =
  Array.from({ length: SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL }, (_, index) => {
    const districtIndex = index % SEOUL_DISTRICTS.length;
    const [districtCode, districtName] = SEOUL_DISTRICTS[districtIndex];
    const providerPlaceId = String(38_200_001 + index);
    return {
      id: `tour:${providerPlaceId}`,
      provider: "tour",
      providerPlaceId,
      name: `서울 쇼핑 검증 장소 ${String(index + 1).padStart(4, "0")}`,
      kind: "tourism_place",
      category: "shopping",
      district: { code: districtCode, name: districtName },
      address: `서울특별시 ${districtName} 쇼핑로 ${index + 1}`,
      coordinates: {
        latitude: 37.43 + Math.floor(districtIndex / 5) * 0.05 + (index % 7) * 0.0003,
        longitude: 126.79 + (districtIndex % 5) * 0.08 + (index % 11) * 0.0002,
      },
      phone: null,
      imageUrl: index % 10 === 0
        ? `https://tong.visitkorea.or.kr/cms/resource/fixture-seoul-shopping-${index + 1}.jpg`
        : null,
      contentTypeId: "38",
      placeUrl: null,
      source: "kto_official",
      petAccessVerdict: "unknown",
      reviewStatus: "needs_review",
      publicLabel: "반려동물 동반 정보 확인 필요",
      categoryGroupCode: "fixture-shopping",
      lastSeenAt: "2026-08-27T00:00:00.000Z",
      matchedQueryCount: 0,
      categoryQueryAgreementCount: 0,
    };
  });
