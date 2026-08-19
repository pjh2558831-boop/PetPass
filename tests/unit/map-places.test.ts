import { describe, expect, it, vi } from "vitest";
import { createMapPlacesHandler } from "@/app/api/map/places/route";
import { queryPublicMapCatalog } from "@/lib/map-places/public-catalog";
import {
  deduplicateKakaoMapPlaces,
  normalizeKakaoMapPlace,
} from "@/lib/map-places/kakao-ingest";
import type { KakaoDiscoveryCandidate } from "@/types/kakao";
import {
  publicMapPlaceSchema,
  type PublicMapPlaceDTO,
  type PublicMapPlacePage,
} from "@/types/public-map-place";

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
  categoryGroupCode: null,
  lastSeenAt: null,
  matchedQueryCount: 0,
  categoryQueryAgreementCount: 0,
};

const resultPage: PublicMapPlacePage = {
  items: [publicPlace],
  page: 1,
  pageSize: 200,
  totalCount: 1,
  hasNext: false,
};

describe("public Kakao map catalog route", () => {
  it("accepts the offset timestamp returned by Postgres timestamptz", () => {
    expect(publicMapPlaceSchema.parse({
      ...publicPlace,
      lastSeenAt: "2026-08-14T16:17:56.006+00:00",
    }).lastSeenAt).toBe("2026-08-14T16:17:56.006+00:00");
  });

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
      "reviewStatus", "source", "categoryGroupCode", "lastSeenAt",
      "matchedQueryCount", "categoryQueryAgreementCount",
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
    "category=unknown-category",
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

  it("uses the supplied cursor for exactly one RPC call without leaking database-only fields", async () => {
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
      category_group_code: null,
      last_seen_at: "2026-08-18T00:00:00.000Z",
      matched_query_count: 0,
      category_query_agreement_count: 0,
      total_count: 3,
      has_more: true,
    };
    const queryPage = vi.fn()
      .mockResolvedValueOnce([{ ...row, id: 2, has_more: false }]);

    const result = await queryPublicMapCatalog(
      { page: 2, pageSize: 1, afterId: 1 },
      { queryPage },
    );

    expect(queryPage).toHaveBeenCalledTimes(1);
    expect(queryPage).toHaveBeenCalledWith(expect.anything(), 1);
    expect(result).toEqual({
      items: [{ ...publicPlace, phone: null, lastSeenAt: "2026-08-18T00:00:00.000Z" }],
      page: 2,
      pageSize: 1,
      totalCount: 3,
      hasNext: false,
      nextCursor: 2,
    });
  });

  it("fetches the same 1,824-row fixture with 10 RPC calls instead of page replay's 55", async () => {
    const rows = Array.from({ length: 1_824 }, (_, index) => ({
      id: index + 1,
      provider_place_id: String(20_000 + index),
      name: `장소 ${index + 1}`,
      candidate_kind: "pet_travel_candidate" as const,
      normalized_category: "attraction" as const,
      district_code: "350",
      district_name: "해운대구",
      address: "부산광역시 해운대구",
      latitude: 35.02 + Math.floor(index / 48) * 0.007,
      longitude: 128.9 + (index % 48) * 0.008,
      phone: null,
      place_url: `https://place.map.kakao.com/${20_000 + index}`,
      review_status: "unreviewed" as const,
      public_label: "동반 여부 확인 필요",
      source: "kakao_search_candidate" as const,
      category_group_code: null,
      last_seen_at: "2026-08-19T00:00:00.000Z",
      matched_query_count: 1,
      category_query_agreement_count: 1,
      total_count: 1_824,
      has_more: index < 1_823,
    }));
    const queryPage = vi.fn(async (_input: Parameters<typeof queryPublicMapCatalog>[0], afterId: number | null) => {
      const start = afterId ?? 0;
      return rows.slice(start, start + 200);
    });
    const ids: string[] = [];
    let afterId: number | undefined;
    for (let page = 1; page <= 10; page += 1) {
      const result = await queryPublicMapCatalog(
        { page, pageSize: 200, ...(afterId === undefined ? {} : { afterId }) },
        { queryPage },
      );
      ids.push(...result.items.map(({ providerPlaceId }) => providerPlaceId));
      afterId = result.nextCursor ?? undefined;
    }
    expect(queryPage).toHaveBeenCalledTimes(10);
    expect(ids).toHaveLength(1_824);
    expect(new Set(ids)).toHaveLength(1_824);
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
