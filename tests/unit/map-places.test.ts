import { describe, expect, it, vi } from "vitest";
import { createMapPlacesHandler } from "@/app/api/map/places/route";
import { queryPublicMapCatalog } from "@/lib/map-places/public-catalog";
import {
  deduplicateKakaoMapPlaces,
  normalizeKakaoMapPlace,
} from "@/lib/map-places/kakao-ingest";
import type { KakaoDiscoveryCandidate } from "@/types/kakao";
import type { PublicMapPlaceDTO, PublicMapPlacePage } from "@/types/public-map-place";

const publicPlace: PublicMapPlaceDTO = {
  id: "kakao:123",
  providerPlaceId: "123",
  name: "광안 반려 카페",
  kind: "pet_travel_candidate",
  category: "cafe",
  district: { code: "500", name: "수영구" },
  address: "부산광역시 수영구 광안해변로 10",
  coordinates: { latitude: 35.1456, longitude: 129.1131 },
  phone: null,
  placeUrl: "https://place.map.kakao.com/123",
  source: "kakao_search_candidate",
  reviewStatus: "unreviewed",
  publicLabel: "동반 여부 확인 필요",
};

const resultPage: PublicMapPlacePage = {
  items: [publicPlace],
  page: 1,
  pageSize: 200,
  totalCount: 1,
  hasNext: false,
};

describe("public Kakao map catalog route", () => {
  it("returns only the allowlisted DTO envelope", async () => {
    const query = vi.fn(async () => resultPage);
    const response = await createMapPlacesHandler({ query })(
      new Request("http://localhost/api/map/places?district=500&kinds=pet_travel_candidate,veterinary&category=cafe&page=1&pageSize=200"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.data).toEqual(resultPage);
    expect(Object.keys(body.data.items[0]).sort()).toEqual([
      "address", "category", "coordinates", "district", "id", "kind",
      "name", "phone", "placeUrl", "providerPlaceId", "publicLabel",
      "reviewStatus", "source",
    ].sort());
    expect(query).toHaveBeenCalledWith({
      districtCodes: ["500"],
      kinds: ["pet_travel_candidate", "veterinary"],
      category: "cafe",
      page: 1,
      pageSize: 200,
    });
  });

  it.each([
    "district=99999",
    "kinds=tourism_place",
    "category=shopping",
    "page=0",
    "pageSize=201",
    "query=카페",
    "page=1&page=2",
  ])("rejects an invalid allowlist query: %s", async (parameters) => {
    const query = vi.fn(async () => resultPage);
    const response = await createMapPlacesHandler({ query })(
      new Request(`http://localhost/api/map/places?${parameters}`),
    );
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a client Authorization header", async () => {
    const query = vi.fn(async () => resultPage);
    const response = await createMapPlacesHandler({ query })(
      new Request("http://localhost/api/map/places", {
        headers: { Authorization: "Bearer client-value" },
      }),
    );
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("walks the RPC cursor without leaking database-only fields", async () => {
    const row = {
      id: 10,
      provider_place_id: "123",
      name: "광안 반려 카페",
      candidate_kind: "pet_travel_candidate" as const,
      normalized_category: "cafe" as const,
      district_code: "500",
      district_name: "수영구",
      address: "부산광역시 수영구 광안해변로 10",
      latitude: 35.1456,
      longitude: 129.1131,
      phone: "",
      place_url: "https://place.map.kakao.com/123",
      review_status: "unreviewed" as const,
      public_label: "동반 여부 확인 필요",
      source: "kakao_search_candidate" as const,
      total_count: 3,
      has_more: true,
    };
    const queryPage = vi.fn()
      .mockResolvedValueOnce([{ ...row, id: 1 }])
      .mockResolvedValueOnce([{ ...row, id: 2, has_more: false }]);

    const result = await queryPublicMapCatalog(
      { page: 2, pageSize: 1 },
      { queryPage },
    );

    expect(queryPage).toHaveBeenNthCalledWith(1, expect.anything(), null);
    expect(queryPage).toHaveBeenNthCalledWith(2, expect.anything(), 1);
    expect(result).toEqual({
      items: [{ ...publicPlace, phone: null }],
      page: 2,
      pageSize: 1,
      totalCount: 3,
      hasNext: false,
    });
  });
});

describe("Kakao map place ingestion", () => {
  const candidate: KakaoDiscoveryCandidate = {
    id: "123",
    name: "광안 반려 카페",
    category: "food",
    kakaoCategoryText: "음식점 > 카페",
    address: "부산광역시 수영구 광안동 1",
    coordinates: { latitude: 35.1456, longitude: 129.1131 },
    placeUrl: "https://place.map.kakao.com/123",
    source: "KAKAO",
    candidateStatus: "discovery_candidate",
    verificationStatus: "verification_required",
    petAccessVerdict: "unknown",
    recommendationEligible: false,
  };

  it("forces candidate evidence and preserves provider identity", () => {
    expect(normalizeKakaoMapPlace(candidate, "food", "2026-08-11T00:00:00.000Z"))
      .toMatchObject({
        provider: "kakao",
        provider_place_id: "123",
        district_name: "수영구",
        pet_evidence_status: "search_candidate",
        is_active: true,
      });
  });

  it("deduplicates only by provider and provider place ID", () => {
    const row = normalizeKakaoMapPlace(candidate, "food", "2026-08-11T00:00:00.000Z");
    expect(deduplicateKakaoMapPlaces([row, { ...row, name: "중복" }])).toEqual([row]);
  });
});
