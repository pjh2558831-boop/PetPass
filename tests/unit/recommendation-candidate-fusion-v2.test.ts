import { describe, expect, it } from "vitest";
import {
  fuseRecommendationCandidatesV2,
  type CanonicalRecommendationCandidateV2,
} from "@/lib/recommendation/v2/candidate-fusion";
import type { DetailedEligibleCandidate } from "@/lib/recommendation/types";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";

function ktoCandidate(overrides: Partial<DetailedEligibleCandidate> = {}): DetailedEligibleCandidate {
  return {
    contentId: "1001",
    title: "해운대 해수욕장",
    coordinates: { latitude: 35.1596, longitude: 129.1603 },
    region: { regionCode: "26", districtCode: "350" },
    category: "attraction",
    source: "tourism_service2",
    summary: {
      address: "부산광역시 해운대구 해운대해변로 264",
      phone: "051-000-0000",
      source: { retrievedAt: "2026-08-20T00:00:00.000Z" },
    },
    assessment: { verdict: "allowed", evaluationState: "complete" },
    eligibility: { eligible: true, status: "eligible", tier: "verified", reasonCodes: [], warnings: [], evidenceFieldNames: [] },
    scheduleCompatibility: { status: "compatible", warningCodes: [], reasonCodes: [] },
    trust: { level: "high", score: 90 },
    utility: { total: 800 },
    ...overrides,
  } as unknown as DetailedEligibleCandidate;
}

function kakaoCandidate(overrides: Partial<MapPlacesSnapshotMarker> = {}): MapPlacesSnapshotMarker {
  return {
    id: "kakao:2001",
    regionId: "busan",
    providerPlaceId: "2001",
    name: "해운대 해수욕장",
    layer: "kakao",
    category: "attraction",
    districtCode: "350",
    districtName: "해운대구",
    address: "부산광역시 해운대구 해운대해변로 264",
    coordinates: { latitude: 35.15962, longitude: 129.16031 },
    lastSeenAt: "2026-08-21T00:00:00.000Z",
    petAccessVerdict: "unknown",
    publicLabel: "동반 여부 확인 필요",
    sourceLabel: "카카오 검색 후보",
    ...overrides,
  };
}

describe("recommendation candidate fusion V2", () => {
  it("keeps a Kakao candidate without pet evidence active but unverified", () => {
    const result = fuseRecommendationCandidatesV2({
      regionId: "busan",
      selectedCategories: ["attraction"],
      ktoCandidates: [],
      catalogCandidates: [kakaoCandidate()],
      explicitlyExcludedPlaceIds: [],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      canonicalId: "kakao:2001",
      eligibilityTier: "unverified",
      petVerdict: "unknown",
      evidenceStatus: "unverified",
      sourceLabel: "카카오 검색 후보",
    } satisfies Partial<CanonicalRecommendationCandidateV2>);
  });

  it("never activates an explicitly not-allowed Kakao candidate", () => {
    const result = fuseRecommendationCandidatesV2({
      regionId: "busan",
      selectedCategories: ["attraction"],
      ktoCandidates: [],
      catalogCandidates: [kakaoCandidate({ petAccessVerdict: "not_allowed" })],
      explicitlyExcludedPlaceIds: [],
    });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics.excludedByReason).toEqual({ explicit_not_allowed: 1 });
  });

  it("merges a safely matched KTO/Kakao duplicate and preserves both identities", () => {
    const result = fuseRecommendationCandidatesV2({
      regionId: "busan",
      selectedCategories: ["attraction"],
      ktoCandidates: [ktoCandidate()],
      catalogCandidates: [kakaoCandidate()],
      explicitlyExcludedPlaceIds: [],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      canonicalId: "tour:1001",
      eligibilityTier: "verified",
      petVerdict: "allowed",
      evidenceStatus: "verified",
      providerIdentities: [
        { provider: "kto", id: "1001" },
        { provider: "kakao", id: "2001" },
      ],
    });
    expect(result.diagnostics.crossProviderDuplicatesMerged).toBe(1);
  });

  it("does not merge on name similarity alone", () => {
    const result = fuseRecommendationCandidatesV2({
      regionId: "busan",
      selectedCategories: ["attraction"],
      ktoCandidates: [ktoCandidate()],
      catalogCandidates: [kakaoCandidate({
        id: "kakao:far",
        providerPlaceId: "far",
        address: "부산광역시 기장군 해맞이로 1",
        coordinates: { latitude: 35.2446, longitude: 129.2223 },
      })],
      explicitlyExcludedPlaceIds: [],
    });

    expect(result.candidates.map(({ canonicalId }) => canonicalId).sort()).toEqual([
      "kakao:far",
      "tour:1001",
    ]);
  });
});
