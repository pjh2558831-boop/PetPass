import { describe, expect, it, vi } from "vitest";
import { createMapPlacesHandler } from "@/app/api/map/places/handler";
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
  provider: "kakao",
  providerPlaceId: "123",
  name: "광안 반려 카페",
  kind: "pet_travel_candidate",
  category: "cafe",
  district: { code: "500", name: "수영구" },
  address: "부산광역시 수영구 광안해변로 10",
  coordinates: { latitude: 35.1456, longitude: 129.1131 },
  phone: null,
  imageUrl: null,
  contentTypeId: null,
  placeUrl: "https://place.map.kakao.com/123",
  source: "kakao_search_candidate",
  petAccessVerdict: "unknown",
  petConditions: null,
  verificationRequired: false,
  reviewStatus: "unreviewed",
  publicLabel: "동반 여부 확인 필요",
  categoryGroupCode: null,
  lastSeenAt: null,
  matchedQueryCount: 0,
  categoryQueryAgreementCount: 0,
};

const resultPage: PublicMapPlacePage = {
  region: { id: "busan", displayName: "부산" },
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
      new Request("http://localhost/api/map/places?region=busan&district=500&kinds=pet_travel_candidate,veterinary&category=cafe&page=1&pageSize=200"),
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
      "provider", "imageUrl", "contentTypeId", "petAccessVerdict",
      "petConditions", "verificationRequired",
    ].sort());
    expect(query).toHaveBeenCalledWith({
      regionId: "busan",
      providers: ["kakao"],
      districtCodes: ["500"],
      kinds: ["pet_travel_candidate", "veterinary"],
      category: "cafe",
      page: 1,
      pageSize: 200,
    });
  });

  it.each([
    "page=1",
    "region=unknown",
    "region=busan&district=99999",
    "region=busan&district=130",
    "region=jeju&district=500",
    "region=busan&kinds=tourism_place",
    "region=busan&category=unknown-category",
    "region=busan&page=0",
    "region=busan&pageSize=201",
    "region=busan&query=카페",
    "region=busan&page=1&page=2",
    "region=busan&region=jeju",
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
      new Request("http://localhost/api/map/places?region=busan", {
        headers: { Authorization: "Bearer client-value" },
      }),
    );
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("resolves district 110 only inside its explicit region", async () => {
    const jungGuPage: PublicMapPlacePage = {
      ...resultPage,
      items: [
        {
          ...publicPlace,
          name: "부산 중구 후보",
          district: { code: "110", name: "중구" },
          address: "부산광역시 중구 중앙대로 1",
        },
      ],
    };
    const query = vi.fn(async () => jungGuPage);
    const busan = await createMapPlacesHandler({ query })(
      new Request("http://localhost/api/map/places?region=busan&district=110"),
    );
    expect(busan.status).toBe(200);
    await expect(busan.json()).resolves.toMatchObject({
      data: {
        region: { id: "busan" },
        items: [
          {
            name: "부산 중구 후보",
            district: { code: "110", name: "중구" },
          },
        ],
      },
    });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "busan",
      districtCodes: ["110"],
    }));

    query.mockClear();
    query.mockResolvedValueOnce({
      ...resultPage,
      region: { id: "jeju", displayName: "제주" },
      items: [{
        ...publicPlace,
        id: "tour:9001",
        providerPlaceId: "9001",
        name: "제주 공식 장소",
        kind: "tourism_place",
        category: "attraction",
        district: { code: "110", name: "제주시" },
        address: "제주특별자치도 제주시 애월읍",
        coordinates: { latitude: 33.46, longitude: 126.32 },
        phone: null,
        imageUrl: null,
        contentTypeId: "12",
        placeUrl: "/places/9001?region=jeju&contentTypeId=12",
        source: "kto_official",
        provider: "tour",
        petAccessVerdict: "conditional",
        publicLabel: "동반 조건 확인 필요",
      } as unknown as PublicMapPlaceDTO],
    });
    const jeju = await createMapPlacesHandler({ query })(
      new Request("http://localhost/api/map/places?region=jeju&district=110&providers=tour&kinds=tourism_place"),
    );
    expect(jeju.status).toBe(200);
    await expect(jeju.json()).resolves.toMatchObject({
      data: {
        region: { id: "jeju" },
        items: [{
          name: "제주 공식 장소",
          district: { code: "110", name: "제주시" },
          source: "kto_official",
          publicLabel: "동반 조건 확인 필요",
        }],
      },
    });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "jeju",
      providers: ["tour"],
      districtCodes: ["110"],
      kinds: ["tourism_place"],
    }));
  });

  it("rejects Kakao catalog access for Jeju before querying Supabase", async () => {
    const query = vi.fn(async () => resultPage);
    const response = await createMapPlacesHandler({ query })(
      new Request("http://localhost/api/map/places?region=jeju&providers=kakao"),
    );
    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("uses Seoul's authoritative district and tour-only catalog contract", async () => {
    const seoulPlace: PublicMapPlaceDTO = {
      ...publicPlace,
      id: "tour:3800001",
      provider: "tour",
      providerPlaceId: "3800001",
      name: "서울 공식 쇼핑 장소",
      kind: "tourism_place",
      category: "shopping",
      district: { code: "110", name: "종로구" },
      address: "서울특별시 종로구",
      coordinates: { latitude: 37.57, longitude: 126.98 },
      contentTypeId: "38",
      placeUrl: "/places/3800001?region=seoul&contentTypeId=38",
      source: "kto_official",
      petAccessVerdict: "unknown",
      reviewStatus: "needs_review",
      publicLabel: "동반 정보 확인 필요",
    };
    const query = vi.fn(async () => ({
      ...resultPage,
      region: { id: "seoul" as const, displayName: "서울" },
      items: [seoulPlace],
    }));
    const handler = createMapPlacesHandler({ query });
    const response = await handler(new Request(
      "http://localhost/api/map/places?region=seoul&district=110&providers=tour&kinds=tourism_place&categories=shopping",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-petpass-region")).toBe("seoul");
    await expect(response.json()).resolves.toMatchObject({
      data: {
        region: { id: "seoul" },
        items: [{
          provider: "tour",
          category: "shopping",
          placeUrl: "/places/3800001?region=seoul&contentTypeId=38",
          petAccessVerdict: "unknown",
        }],
      },
    });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "seoul",
      providers: ["tour"],
      districtCodes: ["110"],
      kinds: ["tourism_place"],
      categories: ["shopping"],
    }));

    query.mockClear();
    const kakao = await handler(new Request("http://localhost/api/map/places?region=seoul&providers=kakao"));
    expect(kakao.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a repository page from a different region", async () => {
    const query = vi.fn(async () => ({
      ...resultPage,
      region: { id: "jeju" as const, displayName: "제주" },
    }));
    const response = await createMapPlacesHandler({ query })(
      new Request("http://localhost/api/map/places?region=busan"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPSTREAM_ERROR" },
    });
  });

  it("uses the supplied cursor for exactly one RPC call without leaking database-only fields", async () => {
    const row = {
      id: 10,
      provider: "kakao" as const,
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
      image_url: null,
      content_type_id: null,
      place_url: "https://place.map.kakao.com/123",
      review_status: "unreviewed" as const,
      public_label: "동반 여부 확인 필요",
      source: "kakao_search_candidate" as const,
      pet_access_verdict: "unknown" as const,
      pet_evidence_status: "search_candidate",
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
      { regionId: "busan", page: 2, pageSize: 1, afterId: 1 },
      { queryPage },
    );

    expect(queryPage).toHaveBeenCalledTimes(1);
    expect(queryPage).toHaveBeenCalledWith(expect.anything(), 1);
    expect(result).toEqual({
      region: { id: "busan", displayName: "부산" },
      items: [{ ...publicPlace, phone: null, lastSeenAt: "2026-08-18T00:00:00.000Z" }],
      page: 2,
      pageSize: 1,
      totalCount: 3,
      hasNext: false,
      nextCursor: 2,
    });
  });

  it("preserves KTO category, evidence label, image, and Jeju detail scope", async () => {
    const queryPage = vi.fn(async () => [{
      id: 50,
      provider: "tour" as const,
      provider_place_id: "5010050",
      name: "제주 공식 숙소",
      candidate_kind: "tourism_place" as const,
      normalized_category: "accommodation" as const,
      content_type_id: 32,
      district_code: "110",
      district_name: "제주시",
      address: "제주특별자치도 제주시",
      latitude: 33.5,
      longitude: 126.53,
      phone: null,
      image_url: "https://tong.visitkorea.or.kr/jeju-official.jpg",
      place_url: null,
      review_status: "confirmed" as const,
      public_label: "동반 조건 확인 필요",
      source: "kto_official" as const,
      pet_access_verdict: "conditional" as const,
      pet_evidence_status: "official_verified",
      category_group_code: "B02",
      last_seen_at: "2026-08-19T00:00:00.000Z",
      matched_query_count: 0,
      category_query_agreement_count: 0,
      total_count: 1,
      has_more: false,
    }]);

    const result = await queryPublicMapCatalog(
      { regionId: "jeju", providers: ["tour"], page: 1, pageSize: 200 },
      { queryPage },
    );

    expect(result.items[0]).toMatchObject({
      provider: "tour",
      category: "accommodation",
      contentTypeId: "32",
      imageUrl: "https://tong.visitkorea.or.kr/jeju-official.jpg",
      petAccessVerdict: "conditional",
      publicLabel: "동반 조건 확인 필요",
      placeUrl: "/places/5010050?region=jeju&contentTypeId=32",
    });
  });

  it("derives Seoul shopping from KTO content type 38 and rejects malformed regional rows", async () => {
    const row = {
      id: 75,
      provider: "tour" as const,
      provider_place_id: "3800075",
      name: "서울 공식 쇼핑 장소",
      candidate_kind: "tourism_place" as const,
      normalized_category: null,
      content_type_id: 38,
      district_code: "110",
      district_name: "종로구",
      address: "서울특별시 종로구",
      latitude: 37.57,
      longitude: 126.98,
      phone: null,
      image_url: null,
      place_url: null,
      review_status: "needs_review" as const,
      public_label: "반려동물 동반 정보 확인 필요",
      source: "kto_official" as const,
      pet_access_verdict: "unknown" as const,
      pet_evidence_status: "official_unknown",
      category_group_code: null,
      last_seen_at: "2026-08-26T00:00:00.000Z",
      matched_query_count: 0,
      category_query_agreement_count: 0,
      total_count: 1,
      has_more: false,
    };
    const result = await queryPublicMapCatalog(
      { regionId: "seoul", dataset: "shopping", providers: ["tour"], categories: ["shopping"], page: 1, pageSize: 200 },
      { queryPage: vi.fn(async () => [row]) },
    );

    expect(result.items[0]).toMatchObject({
      provider: "tour",
      category: "shopping",
      contentTypeId: "38",
      placeUrl: null,
      publicLabel: "반려동물 동반 정보 확인 필요",
      petAccessVerdict: "unknown",
    });

    await expect(queryPublicMapCatalog(
      { regionId: "seoul", dataset: "shopping", providers: ["tour"], categories: ["shopping"], page: 1, pageSize: 200 },
      { queryPage: vi.fn(async () => [{ ...row, district_name: "중구" }]) },
    )).rejects.toThrow(/regional contract/iu);
    await expect(queryPublicMapCatalog(
      { regionId: "seoul", dataset: "shopping", providers: ["tour"], categories: ["shopping"], page: 1, pageSize: 200 },
      { queryPage: vi.fn(async () => [{ ...row, provider: "kakao" as const }]) },
    )).rejects.toThrow(/regional contract/iu);
    await expect(queryPublicMapCatalog(
      { regionId: "seoul", dataset: "shopping", providers: ["tour"], categories: ["shopping"], page: 1, pageSize: 200 },
      { queryPage: vi.fn(async () => [
        { ...row, id: 76, provider_place_id: "3800076", total_count: 2 },
        { ...row, id: 75, total_count: 2 },
      ]) },
    )).rejects.toThrow(/regional contract/iu);
  });

  it("normalizes a conditional Kakao note through the allowlisted DTO without exposing evidence", async () => {
    const queryPage = vi.fn(async () => [{
      id: 11,
      provider: "kakao" as const,
      provider_place_id: "conditional-11",
      name: "조건부 동반 카페",
      candidate_kind: "pet_travel_candidate" as const,
      normalized_category: "cafe" as const,
      content_type_id: null,
      district_code: "500",
      district_name: "수영구",
      address: "부산광역시 수영구 광안해변로 11",
      latitude: 35.1456,
      longitude: 129.1131,
      phone: null,
      image_url: null,
      place_url: "https://place.map.kakao.com/conditional-11",
      review_status: "confirmed" as const,
      public_label: "동반 조건 확인 필요",
      source: "kakao_search_candidate" as const,
      pet_access_verdict: "conditional" as const,
      pet_evidence_status: "search_candidate",
      pet_conditions: "  테라스만 가능 · 이동가방 필수  ",
      verification_required: true,
      category_group_code: "CE7",
      last_seen_at: "2026-08-31T00:00:00.000Z",
      matched_query_count: 1,
      category_query_agreement_count: 1,
      total_count: 1,
      has_more: false,
    }]);

    const result = await queryPublicMapCatalog(
      { regionId: "busan", page: 1, pageSize: 200 },
      { queryPage },
    );

    expect(result.items[0]).toMatchObject({
      providerPlaceId: "conditional-11",
      petAccessVerdict: "conditional",
      petConditions: "테라스만 가능 · 이동가방 필수",
      verificationRequired: true,
    });
    expect(result.items[0]).not.toHaveProperty("pet_notes");
    expect(result.items[0]).not.toHaveProperty("verification_evidence");
  });

  it("normalizes empty condition text to no condition for a plain O place", async () => {
    expect(publicMapPlaceSchema.parse({
      ...publicPlace,
      petConditions: "   ",
      verificationRequired: false,
    })).toMatchObject({ petConditions: null, verificationRequired: false });
  });

  it("keeps an unfamiliar KTO content type visible as verification-required 기타", async () => {
    const result = await queryPublicMapCatalog(
      {
        regionId: "daejeon",
        dataset: "core",
        providers: ["tour"],
        categories: ["other"],
        page: 1,
        pageSize: 200,
      },
      { queryPage: vi.fn(async () => [{
        id: 99,
        provider: "tour" as const,
        provider_place_id: "990099",
        name: "대전 미분류 공식 장소",
        candidate_kind: "tourism_place" as const,
        normalized_category: "other" as const,
        content_type_id: 99,
        district_code: "001",
        district_name: "대덕구",
        address: "대전광역시 대덕구",
        latitude: 36.3504,
        longitude: 127.3845,
        phone: null,
        image_url: null,
        place_url: null,
        review_status: "confirmed" as const,
        public_label: "동반 정보 확인 필요",
        source: "kto_official" as const,
        pet_access_verdict: "unknown" as const,
        pet_evidence_status: "official_unknown",
        category_group_code: null,
        last_seen_at: "2026-08-28T00:00:00.000Z",
        matched_query_count: 0,
        category_query_agreement_count: 0,
        total_count: 1,
        has_more: false,
      }]) },
    );

    expect(result.items[0]).toMatchObject({
      category: "other",
      contentTypeId: "99",
      placeUrl: null,
      reviewStatus: "needs_review",
      publicLabel: "반려동물 동반 정보 확인 필요",
      petAccessVerdict: "unknown",
    });
  });

  it("fetches the same 1,824-row fixture with 10 RPC calls instead of page replay's 55", async () => {
    const rows = Array.from({ length: 1_824 }, (_, index) => ({
      id: index + 1,
      provider: "kakao" as const,
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
      image_url: null,
      content_type_id: null,
      place_url: `https://place.map.kakao.com/${20_000 + index}`,
      review_status: "unreviewed" as const,
      public_label: "동반 여부 확인 필요",
      source: "kakao_search_candidate" as const,
      pet_access_verdict: "unknown" as const,
      pet_evidence_status: "search_candidate",
      category_group_code: null,
      last_seen_at: "2026-08-19T00:00:00.000Z",
      matched_query_count: 1,
      category_query_agreement_count: 1,
      total_count: 1_824,
      has_more: false,
    }));
    const queryPage = vi.fn(async (_input: Parameters<typeof queryPublicMapCatalog>[0], afterId: number | null) => {
      const start = afterId ?? 0;
      const pageRows = rows.slice(start, start + 200);
      const hasMore = start + pageRows.length < rows.length;
      return pageRows.map((row) => ({ ...row, has_more: hasMore }));
    });
    const ids: string[] = [];
    let afterId: number | undefined;
    for (let page = 1; page <= 10; page += 1) {
      const result = await queryPublicMapCatalog(
        { regionId: "busan", page, pageSize: 200, ...(afterId === undefined ? {} : { afterId }) },
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
