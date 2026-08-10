import type { KakaoDiscoveryCandidate, KakaoPlaceSearchResult } from "@/types/kakao";
import type { TourPlaceSummary } from "@/types/place";
import type { PlaceSourceRecord } from "@/types/place-source";

export function createTourismSourceRecord(
  place: TourPlaceSummary,
  evidenceSummary: string | null = null,
): PlaceSourceRecord {
  return {
    recordId: `tourism:${place.contentId}`,
    layer: "tourism_official",
    provider: "Korea Tourism Organization",
    providerIds: [
      { provider: "Korea Tourism Organization", id: place.contentId },
    ],
    name: place.title,
    roadAddress: place.address,
    lotNumberAddress: place.detailAddress,
    phone: place.phone,
    coordinates:
      place.latitude === null || place.longitude === null
        ? null
        : { latitude: place.latitude, longitude: place.longitude },
    retrievedAt: place.source.retrievedAt,
    verifiedAt: null,
    evidenceSummary,
    sourceUrl: null,
    conflicts: [],
  };
}

export function createKakaoSourceRecord(
  place: KakaoPlaceSearchResult,
  retrievedAt: string,
): PlaceSourceRecord {
  return {
    recordId: `kakao:${place.id}`,
    layer: "kakao_discovery",
    provider: "Kakao Local",
    providerIds: [{ provider: "Kakao Local", id: place.id }],
    name: place.name,
    roadAddress: place.roadAddress ?? null,
    lotNumberAddress: place.address || null,
    phone: place.phone ?? null,
    coordinates: place.coordinates,
    retrievedAt,
    verifiedAt: null,
    evidenceSummary: "카카오 키워드 검색 결과이며 반려동물 동반 근거가 아닙니다.",
    sourceUrl: place.placeUrl ?? null,
    conflicts: [],
  };
}

export function isKakaoDiscoveryCandidate(
  value: KakaoPlaceSearchResult | KakaoDiscoveryCandidate,
): value is KakaoDiscoveryCandidate {
  return "candidateStatus" in value && value.candidateStatus === "discovery_candidate";
}
