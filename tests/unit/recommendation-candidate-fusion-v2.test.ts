import { describe, expect, it } from "vitest";
import { fuseRecommendationCandidatesV2 as fuseRaw } from "@/lib/recommendation/v2/candidate-fusion";
import type { DetailedEligibleCandidate } from "@/lib/recommendation/types";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";

const petProfile = { species: "DOG" as const, size: "SMALL" as const, hasCarrier: true, hasLeash: true, hasMuzzle: true, acceptsOutdoorOnly: true };
const fuse = (overrides: Partial<Omit<Parameters<typeof fuseRaw>[0], "petProfile">> = {}) => fuseRaw({ regionId: "busan", selectedCategories: ["attraction"], ktoCandidates: [], catalogCandidates: [], explicitlyExcludedPlaceIds: [], ...overrides, petProfile });
function marker(overrides: Partial<MapPlacesSnapshotMarker> = {}): MapPlacesSnapshotMarker {
  return { id: "kakao:2001", regionId: "busan", providerPlaceId: "2001", name: "해운대 해수욕장", layer: "kakao", category: "attraction", districtCode: "350", districtName: "해운대구", address: "부산광역시 해운대구 해운대해변로 264", coordinates: { latitude: 35.15962, longitude: 129.16031 }, lastSeenAt: "2026-08-21T00:00:00.000Z", petAccessVerdict: "unknown", publicLabel: "동반 여부 확인 필요", sourceLabel: "카카오 검색 후보", ...overrides };
}
const tourismMarker = (overrides: Partial<MapPlacesSnapshotMarker> = {}) => marker({ id: "tour:1001", providerPlaceId: "1001", layer: "tourism", sourceLabel: "한국관광공사", ...overrides });
function detail(overrides: Partial<DetailedEligibleCandidate> = {}): DetailedEligibleCandidate {
  return { contentId: "1001", title: "해운대 해수욕장", coordinates: { latitude: 35.1596, longitude: 129.1603 }, region: { regionCode: "26", districtCode: "350" }, category: "attraction", source: "tourism_service2", summary: { address: "부산광역시 해운대구 해운대해변로 264", phone: "051", source: { retrievedAt: "2026-08-20T00:00:00.000Z" } }, assessment: { verdict: "allowed", evaluationState: "complete" }, eligibility: { eligible: true, status: "eligible", tier: "verified", reasonCodes: [], warnings: [], evidenceFieldNames: [] }, scheduleCompatibility: { status: "compatible", warningCodes: [], reasonCodes: [] }, trust: { level: "high", score: 90 }, utility: { total: 800 }, ...overrides } as unknown as DetailedEligibleCandidate;
}

describe("full public catalog candidate fusion", () => {
  it("honors district scope without applying pet conditions and preserves explicit anchors", () => {
    const outside = marker({ id: "kakao:9", providerPlaceId: "9", districtCode: "110", name: "다른 구" });
    const result = fuse({ districtId: "350", catalogCandidates: [marker({ petAccessVerdict: "not_allowed" }), outside] });
    expect(result.candidates.map(place => place.canonicalId)).toEqual(["kakao:2001"]);
    expect(fuse({ districtId: "350", selectedPlaceIds: [outside.id], catalogCandidates: [outside] }).candidates).toHaveLength(1);
  });
  it.each([
    ["conditional", false],
    ["unknown", true],
    ["not_allowed", true],
  ] as const)("treats a registered Kakao place with legacy %s evidence as usable", (petAccessVerdict, verificationRequired) => {
    const result = fuse({ catalogCandidates: [marker({ petAccessVerdict, verificationRequired })] });
    expect(result.candidates).toEqual([expect.objectContaining({
      canonicalId: "kakao:2001",
      planningPolicy: "full_public_catalog_v1",
      petVerdict: "allowed",
      verificationRequired: false,
      evidenceStatus: "verified",
      eligibilityTier: "verified",
      conditionEligibility: expect.objectContaining({ state: "eligible" }),
      scheduleStatus: "unknown",
    })]);
    expect(result.candidates[0]!.catalogEvidence).toEqual([expect.objectContaining({ provider: "kakao", petAssessment: petAccessVerdict })]);
    expect(result.diagnostics.excludedByReason).toEqual({});
  });

  it("applies the same registered-place eligibility to Korea Tourism Organization data", () => {
    const result = fuse({
      catalogCandidates: [tourismMarker({ petAccessVerdict: "conditional", verificationRequired: true })],
      ktoCandidates: [detail({
        assessment: { verdict: "conditional", evaluationState: "partial", conditions: [] },
        eligibility: { eligible: false, status: "verification_required", tier: "conditional", reasonCodes: [], warnings: [], evidenceFieldNames: [] },
      } as unknown as Partial<DetailedEligibleCandidate>)],
    });

    expect(result.candidates[0]).toMatchObject({
      canonicalId: "tour:1001",
      source: "tourism_service2",
      petVerdict: "allowed",
      verificationRequired: false,
      evidenceStatus: "verified",
      eligibilityTier: "verified",
      conditionEligibility: { state: "eligible" },
    });
    expect(result.candidates[0]!.catalogEvidence).toEqual([
      expect.objectContaining({ provider: "kto", petAssessment: "conditional" }),
    ]);
  });

  it("keeps unknown categories without inventing a known category", () => {
    expect(fuse({ catalogCandidates: [marker({ category: "other" })] }).candidates[0]?.category).toBe("unknown");
  });

  it("preserves cafe as a dining subtype while using the canonical food category", () => {
    expect(fuse({ catalogCandidates: [marker({ category: "cafe" })] }).candidates[0]).toMatchObject({
      category: "food",
      catalogCategory: "cafe",
    });
  });

  it("keeps pet-service places out of automatic candidates", () => {
    const result = fuse({ catalogCandidates: [tourismMarker(),
      marker({ id: "kakao:1", providerPlaceId: "1", name: "공개 병원", layer: "veterinary" }),
      marker({ id: "kakao:2", providerPlaceId: "2", name: "공개 상점", layer: "pet_shop" }),
      marker({ id: "kakao:3", providerPlaceId: "3", name: "공개 카페" }),
    ] });
    expect(result.diagnostics.sourceCounts).toEqual({ kto: 1, kakao: 3 });
    expect(result.diagnostics.identities).toHaveLength(4);
    expect(result.candidates.map(({ canonicalId }) => canonicalId)).toEqual(["kakao:3", "tour:1001"]);
    expect(result.diagnostics.excludedByReason).toEqual({ automatic_itinerary_category_excluded: 2 });
  });

  it("preserves a deliberately selected hospital or pet shop", () => {
    const result = fuse({
      catalogCandidates: [
        marker({ id: "kakao:1", providerPlaceId: "1", name: "공개 병원", layer: "veterinary" }),
        marker({ id: "kakao:2", providerPlaceId: "2", name: "공개 상점", layer: "pet_shop" }),
      ],
      selectedPlaceIds: ["kakao:1", "kakao:2"],
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({ canonicalId: "kakao:1", selectionOrigin: "user_selected" }),
      expect.objectContaining({ canonicalId: "kakao:2", selectionOrigin: "user_selected" }),
    ]);
    expect(result.diagnostics.excludedByReason).toEqual({});
  });

  it("enriches only a published KTO identity and preserves public coordinates", () => {
    const published = tourismMarker();
    const result = fuse({ ktoCandidates: [detail()], catalogCandidates: [published] });
    expect(result.candidates).toEqual([expect.objectContaining({ canonicalId: "tour:1001", source: "tourism_service2", coordinates: published.coordinates, petVerdict: "allowed" })]);
    expect(fuse({ ktoCandidates: [detail()] }).candidates).toEqual([]);
  });

  it("merges a strong alias and preserves conflicting provider facts", () => {
    const result = fuse({ ktoCandidates: [detail()], catalogCandidates: [tourismMarker({ petAccessVerdict: "allowed", petConditions: "동반 가능" }), marker({ petAccessVerdict: "not_allowed", petConditions: "반려동물 동반 불가" })] });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ canonicalId: "tour:1001", petVerdict: "allowed", providerIdentities: [{ provider: "kto", id: "1001" }, { provider: "kakao", id: "2001" }] });
    expect(result.candidates[0]!.catalogEvidence).toEqual([expect.objectContaining({ provider: "kto", petAssessment: "allowed", originalText: "동반 가능" }), expect.objectContaining({ provider: "kakao", petAssessment: "not_allowed", originalText: "반려동물 동반 불가" })]);
  });

  it("does not merge on name alone and excludes a merged place through any alias", () => {
    const far = marker({ id: "kakao:2002", providerPlaceId: "2002", address: "부산광역시 기장군 해맞이로 1", coordinates: { latitude: 35.2446, longitude: 129.2223 } });
    expect(fuse({ catalogCandidates: [tourismMarker(), far] }).candidates.map(({ canonicalId }) => canonicalId)).toEqual(["kakao:2002", "tour:1001"]);
    const excluded = fuse({ catalogCandidates: [tourismMarker(), marker()], explicitlyExcludedPlaceIds: ["kakao:2001"] });
    expect(excluded.candidates).toEqual([]);
    expect(excluded.diagnostics.identities).toEqual(expect.arrayContaining([expect.objectContaining({ rawId: "tour:1001", outcome: "excluded" }), expect.objectContaining({ rawId: "kakao:2001", outcome: "excluded" })]));
  });

  it("retains all 538 KTO and 743 Kakao published records before scoring", () => {
    const tourism = Array.from({ length: 538 }, (_, i) => tourismMarker({ id: `tour:${i + 1}`, providerPlaceId: String(i + 1), name: `관광 ${i}`, address: `부산광역시 공개로 ${i + 1}`, coordinates: { latitude: 35.05 + i % 20 * .001, longitude: 129.01 + Math.floor(i / 20) * .001 } }));
    const kakao = Array.from({ length: 743 }, (_, i) => marker({ id: `kakao:${i + 10000}`, providerPlaceId: String(i + 10000), name: `카카오 ${i}`, category: i % 2 ? "other" : "food", address: `부산광역시 후보로 ${i + 1}`, coordinates: { latitude: 35.1 + i % 20 * .001, longitude: 129.02 + Math.floor(i / 20) * .001 }, petAccessVerdict: i % 3 ? "unknown" : "not_allowed" }));
    const result = fuse({ catalogCandidates: [...tourism, ...kakao] });
    expect(result.candidates).toHaveLength(1281);
    expect(result.diagnostics.stageCounts.providerRawCandidates).toBe(1281);
    expect(result.candidates.filter(({ category }) => category === "unknown")).toHaveLength(371);
  });
});
