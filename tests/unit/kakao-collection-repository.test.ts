import { describe, expect, it } from "vitest";
import { toKakaoCatalogCandidatePayload } from "@/lib/kakao/collection/supabase-repository";

describe("Kakao collection repository payload", () => {
  it("contains only the sanitized RPC contract and omits review/raw fields", () => {
    const [payload] = toKakaoCatalogCandidatePayload({
      runId: "1",
      query: {
        key: "q1",
        text: "query",
        district: { code: "500", name: "수영구" },
        family: "general",
        candidateKind: "pet_travel_candidate",
        categoryHint: "cafe",
      },
      candidates: [
        {
          page: 2,
          resultRank: 3,
          candidate: {
            providerPlaceId: "123",
            name: "candidate",
            categoryName: "음식점 > 카페",
            categoryGroupCode: "CE7",
            categoryGroupName: "카페",
            normalizedCategory: "cafe",
            candidateKind: "pet_travel_candidate",
            addressName: "부산광역시 수영구 광안동 1",
            roadAddressName: "부산광역시 수영구 광안해변로 1",
            district: { code: "500", name: "수영구" },
            coordinates: { longitude: 129.1, latitude: 35.1 },
            phone: "051-000-0000",
            placeUrl: "https://place.map.kakao.com/123",
          },
        },
      ],
      stats: {
        lastCompletedPage: 2,
        providerCallCount: 2,
        providerResultCount: 1,
        acceptedResultCount: 1,
        rejectedResultCount: 0,
        duplicateResultCount: 0,
        outOfDistrictResultCount: 0,
        invalidCoordinateResultCount: 0,
        classificationRejectionCount: 0,
        provider429Count: 0,
        timeoutCount: 0,
        providerErrorCount: 0,
        saturated: false,
      },
      runProviderCallCount: 2,
      runProvider429Count: 0,
      runTimeoutCount: 0,
      runProviderErrorCount: 0,
      completedAt: "2026-08-15T00:00:00.000Z",
    });

    expect(payload).toEqual({
      provider_place_id: "123",
      name: "candidate",
      category_name: "음식점 > 카페",
      category_group_code: "CE7",
      category_group_name: "카페",
      normalized_category: "cafe",
      candidate_kind: "pet_travel_candidate",
      lot_address: "부산광역시 수영구 광안동 1",
      road_address: "부산광역시 수영구 광안해변로 1",
      district_code: "500",
      district_name: "수영구",
      longitude: 129.1,
      latitude: 35.1,
      phone: "051-000-0000",
      source_url: "https://place.map.kakao.com/123",
      page: 2,
      result_rank: 3,
      discovered_at: "2026-08-15T00:00:00.000Z",
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /review_status|review_note|verification_evidence|raw_payload|authorization/i,
    );
  });
});
