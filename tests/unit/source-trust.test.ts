import { describe, expect, it } from "vitest";
import {
  getInteractiveMapPlaceIds,
  getPaginatedPlaces,
} from "@/components/places/catalog-collections";
import { createKakaoDiscoveryCandidate } from "@/lib/kakao/candidates";
import { applyAdminReview } from "@/lib/place-reports/schema";
import { assessProviderLink } from "@/lib/places/source-linking";
import { computePlaceTrust } from "@/lib/trust/calculator";
import type { TourPlaceSummary } from "@/types/place";
import type { PlaceInformationReport } from "@/types/place-report";
import type { PlaceSourceRecord } from "@/types/place-source";

const NOW = "2026-08-10T00:00:00.000Z";

function source(
  overrides: Partial<PlaceSourceRecord> = {},
): PlaceSourceRecord {
  return {
    recordId: "tourism:1",
    layer: "tourism_official",
    provider: "Korea Tourism Organization",
    providerIds: [{ provider: "Korea Tourism Organization", id: "1" }],
    name: "광안 반려 카페",
    roadAddress: "부산광역시 수영구 광안해변로 10",
    lotNumberAddress: null,
    phone: "051-123-4567",
    coordinates: { latitude: 35.145, longitude: 129.113 },
    retrievedAt: NOW,
    conflicts: [],
    ...overrides,
  };
}

describe("provider-neutral source linking", () => {
  it("classifies exact address and name matches without merging source records", () => {
    const tourism = source();
    const kakao = source({
      recordId: "kakao:99",
      layer: "kakao_discovery",
      provider: "Kakao Local",
      providerIds: [{ provider: "Kakao Local", id: "99" }],
      roadAddress: "부산 수영구 광안해변로 10",
    });
    const link = assessProviderLink(tourism, kakao);

    expect(link.classification).toBe("exact");
    expect(link.requiresReview).toBe(false);
    expect(link.providerIds).toEqual([
      { provider: "Korea Tourism Organization", id: "1" },
      { provider: "Kakao Local", id: "99" },
    ]);
    expect(tourism.providerIds).toHaveLength(1);
    expect(kakao.providerIds).toHaveLength(1);
  });

  it("requires review for probable and possible links", () => {
    const probable = assessProviderLink(
      source(),
      source({
        recordId: "kakao:2",
        providerIds: [{ provider: "Kakao Local", id: "2" }],
        roadAddress: "부산 수영구 다른로 20",
        phone: null,
        coordinates: { latitude: 35.1451, longitude: 129.1131 },
      }),
    );
    const possible = assessProviderLink(
      source({ coordinates: null, phone: null }),
      source({
        recordId: "kakao:3",
        providerIds: [{ provider: "Kakao Local", id: "3" }],
        roadAddress: null,
        phone: null,
        coordinates: null,
      }),
    );

    expect(probable).toMatchObject({ classification: "probable", requiresReview: true });
    expect(possible).toMatchObject({ classification: "possible", requiresReview: true });
  });

  it("does not link on coordinates alone and preserves coordinate conflicts", () => {
    const coordinatesOnly = assessProviderLink(
      source({ name: null, roadAddress: null, phone: null }),
      source({
        recordId: "kakao:4",
        providerIds: [{ provider: "Kakao Local", id: "4" }],
        name: null,
        roadAddress: null,
        phone: null,
      }),
    );
    const conflict = assessProviderLink(
      source(),
      source({
        recordId: "kakao:5",
        providerIds: [{ provider: "Kakao Local", id: "5" }],
        coordinates: { latitude: 35.2, longitude: 129.2 },
      }),
    );

    expect(coordinatesOnly.classification).toBe("unmatched");
    expect(conflict.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "coordinate_conflict" })]),
    );
  });
});

describe("versioned information trust", () => {
  it("rates current Tourism evidence plus business confirmation high", () => {
    const result = computePlaceTrust({
      computedAt: NOW,
      hasAnySource: true,
      tourism: { hasPetSpecificEvidence: true, retrievedAt: NOW },
      businessConfirmation: { verifiedAt: "2026-08-05T00:00:00.000Z" },
    });

    expect(result).toMatchObject({
      ruleVersion: "petpass-trust-v1",
      level: "high",
      evidenceCount: 2,
    });
    expect(result).not.toHaveProperty("verdict");
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "tourism_pet_evidence" }),
        expect.objectContaining({ code: "business_confirmation" }),
      ]),
    );
  });

  it("keeps Kakao-only candidates low and without a pet-access verdict", () => {
    const candidate = createKakaoDiscoveryCandidate(
      {
        id: "kakao-1",
        name: "검색 카페",
        address: "부산 수영구",
        coordinates: { latitude: 35.145, longitude: 129.113 },
      },
      "food",
    );

    expect(candidate).toMatchObject({
      candidateStatus: "discovery_candidate",
      verificationStatus: "verification_required",
      petAccessVerdict: "unknown",
      recommendationEligible: false,
    });
    expect(candidate.source).toBe("KAKAO");
    expect(candidate).not.toHaveProperty("petAccessAssessment");
  });

  it("flags a closed license as an operational conflict, not pet denial", () => {
    const result = computePlaceTrust({
      computedAt: NOW,
      hasAnySource: true,
      tourism: { hasPetSpecificEvidence: true, retrievedAt: NOW },
      licensingOperatingState: "closed",
    });

    expect(result.flags).toContain("operational_status_conflict");
    expect(result).not.toHaveProperty("petAccessVerdict");
  });
});

describe("optional shopping and review preparation", () => {
  it("keeps every valid map place available instead of silently capping markers", () => {
    const places = Array.from({ length: 614 }, (_, index) => ({
      contentId: String(index + 1),
    })) as TourPlaceSummary[];
    const page = getPaginatedPlaces(places, 1);

    expect(page).toHaveLength(12);
    expect(getInteractiveMapPlaceIds(places, page).size).toBe(614);
  });

  it("keeps an approved report separate from pet-access verdict creation", () => {
    const report: PlaceInformationReport = {
      reportId: "report-1",
      placeName: "광안 반려 카페",
      providerIds: [{ provider: "Kakao Local", id: "99" }],
      reportType: "pet_policy_changed",
      details: "현장에서 반려동물 정책 변경 안내문을 직접 확인했습니다.",
      observedAt: NOW,
      createdAt: NOW,
      status: "pending_review",
    };
    const reviewed = applyAdminReview(report, {
      decision: "approve",
      reviewedAt: NOW,
      reviewNote: "제출된 안내문 원문과 관찰 날짜를 확인했습니다.",
      evidenceChecked: true,
    });

    expect(reviewed).toMatchObject({
      report: { status: "approved" },
      createsPetAccessVerdict: false,
    });
  });
});
