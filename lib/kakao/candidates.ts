import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";
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
  const placeUrl = parseKakaoPlaceUrl(result.placeUrl);
  return {
    id: result.id,
    name: result.name,
    category,
    kakaoCategoryText: result.categoryName ?? "",
    address: result.roadAddress ?? result.address,
    coordinates: result.coordinates,
    ...(result.phone ? { phone: result.phone } : {}),
    ...(placeUrl ? { placeUrl } : {}),
    source: "KAKAO",
    candidateStatus: "discovery_candidate",
    verificationStatus: "verification_required",
    petAccessVerdict: "unknown",
    recommendationEligible: false,
    ...(exactExistingPlaceLink ? { exactExistingPlaceLink } : {}),
  };
}
