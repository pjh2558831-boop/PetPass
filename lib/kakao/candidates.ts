import type {
  KakaoDiscoveryCategory,
  KakaoDiscoveryCandidate,
  KakaoDiscoveryExactExistingPlaceLink,
  KakaoPlaceSearchResult,
} from "@/types/kakao";

export function createKakaoDiscoveryCandidate(
  result: KakaoPlaceSearchResult,
  category: KakaoDiscoveryCategory,
  exactExistingPlaceLink?: KakaoDiscoveryExactExistingPlaceLink,
): KakaoDiscoveryCandidate {
  return {
    id: result.id,
    name: result.name,
    category,
    kakaoCategoryText: result.categoryName ?? "",
    address: result.roadAddress ?? result.address,
    coordinates: result.coordinates,
    ...(result.phone ? { phone: result.phone } : {}),
    ...(result.placeUrl ? { placeUrl: result.placeUrl } : {}),
    source: "KAKAO",
    candidateStatus: "discovery_candidate",
    verificationStatus: "verification_required",
    petAccessVerdict: "unknown",
    recommendationEligible: false,
    ...(exactExistingPlaceLink ? { exactExistingPlaceLink } : {}),
  };
}
