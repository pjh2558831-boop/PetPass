import { createKakaoSourceRecord } from "@/lib/places/source-records";
import { computePlaceTrust } from "@/lib/trust/calculator";
import type {
  KakaoDiscoveryCandidate,
  KakaoPlaceSearchResult,
} from "@/types/kakao";

export function createKakaoDiscoveryCandidate(
  result: KakaoPlaceSearchResult,
  retrievedAt: string,
): KakaoDiscoveryCandidate {
  return {
    ...result,
    candidateStatus: "discovery_candidate",
    verificationStatus: "verification_required",
    sourceRecord: createKakaoSourceRecord(result, retrievedAt),
    trust: computePlaceTrust({
      computedAt: retrievedAt,
      hasAnySource: true,
      kakaoDiscoveryOnly: true,
    }),
  };
}
