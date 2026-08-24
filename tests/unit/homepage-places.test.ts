import { describe, expect, it, vi } from "vitest";
import { createHomepagePlacesHandler } from "@/app/api/homepage/places/route";
import { collectHomepagePlacesSnapshot } from "@/lib/homepage/homepage-places";
import { createHomepageMapLocations } from "@/lib/homepage/homepage-map-locations";
import { createHomepagePublicCatalogLoader } from "@/lib/homepage/public-catalog-cache";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type { TourHomepageSnapshot } from "@/types/homepage";
import type { HomepagePlacesSnapshot } from "@/types/homepage-places";
import type { TourPlaceSummary } from "@/types/place";
import type { PublicMapPlaceKind, PublicMapPlacePage } from "@/types/public-map-place";

const NOW = "2026-08-15T03:00:00.000Z";
const service = { listPlaces: vi.fn(), getPlaceDetail: vi.fn() } as unknown as TourPlaceService;

function summary(contentId: string, overrides: Partial<TourPlaceSummary> = {}): TourPlaceSummary {
  return {
    contentId,
    contentTypeId: "12",
    providerContentTypeId: "12",
    category: "attraction",
    title: `공식 ${contentId}`,
    address: "부산광역시 해운대구",
    detailAddress: null,
    longitude: 129.16,
    latitude: 35.16,
    phone: "051-000-0000",
    thumbnailUrl: "https://example.com/official.jpg",
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: "26",
    legalDistrictCode: "350",
    classificationCodes: {
      primary: null,
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    providerVisibility: {
      status: "exposed",
      providerField: "showflag",
      providerValue: "1",
      checkedAt: NOW,
      reasonCodes: [],
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: NOW,
    },
    ...overrides,
  };
}

function officialSnapshot(): TourHomepageSnapshot {
  const allowed = summary("allowed");
  const ordinary = summary("ordinary", { longitude: 129.17 });
  const missing = summary("missing", { latitude: null, longitude: null });
  return {
    catalog: {
      places: [allowed, ordinary, missing],
      page: 1,
      pageSize: 3,
      totalCount: 3,
      source: {
        provider: "Korea Tourism Organization",
        operation: "areaBasedList2",
        retrievedAt: NOW,
      },
    },
    featured: {
      state: "ready",
      places: [{
        summary: allowed,
        assessment: {
          rulesetVersion: "1",
          verdict: "allowed",
          evaluationState: "complete",
          confidence: "high",
          reasonCodes: ["explicit_allowance"],
          summary: "동반 가능",
          permittedScopes: ["whole_place"],
          restrictedScopes: [],
          conditions: [],
          evidence: [],
          conflicts: [],
          verificationItems: [],
          evaluatedAt: NOW,
          providerModifiedTime: null,
          sources: [],
          warnings: [],
        },
        source: {
          provider: "Korea Tourism Organization",
          operation: "detailCommon2",
          contentId: "allowed",
          retrievedAt: NOW,
        },
      }],
      assessedCount: 1,
      failedCount: 0,
    },
  };
}

function publicPage(kind: PublicMapPlaceKind, totalCount = 1): PublicMapPlacePage {
  const providerPlaceId = `${kind}-1`;
  return {
    region: { id: "busan", displayName: "부산" },
    items: totalCount === 0 ? [] : [{
      id: `kakao:${providerPlaceId}`,
      providerPlaceId,
      name: `${kind} 장소`,
      kind,
      category: kind === "pet_travel_candidate" ? "cafe" : null,
      district: { code: "350", name: "해운대구" },
      address: "부산광역시 해운대구 테스트로 1",
      coordinates: { latitude: 35.17, longitude: 129.18 },
      phone: kind === "pet_travel_candidate" ? null : "051-123-4567",
      placeUrl: `https://place.map.kakao.com/${kind === "pet_travel_candidate" ? "101" : kind === "veterinary" ? "102" : "103"}`,
      source: "kakao_search_candidate",
      reviewStatus: "unreviewed",
      publicLabel: "방문 전 확인 필요",
    }],
    page: 1,
    pageSize: 200,
    totalCount,
    hasNext: false,
  };
}

describe("provider-neutral homepage place snapshot", () => {
  it("combines official and sanitized stored layers without inventing candidate access", async () => {
    const queryPublicCatalog = vi.fn(async ({ kinds }: { kinds?: PublicMapPlaceKind[] }) =>
      publicPage(kinds?.[0] ?? "pet_travel_candidate"),
    );
    const result = await collectHomepagePlacesSnapshot({
      service,
      collectOfficial: async () => officialSnapshot(),
      queryPublicCatalog,
      includeOptional: true,
    });

    expect(queryPublicCatalog).toHaveBeenCalledTimes(3);
    expect(queryPublicCatalog).toHaveBeenCalledWith(expect.objectContaining({ regionId: "busan" }));
    expect(result.official).toMatchObject({ totalCount: 3, markerCount: 2, omittedCoordinateCount: 1 });
    expect(result.layers).toMatchObject({
      official: { state: "ready", count: 3, enabledByDefault: true },
      kakao_candidate: { state: "ready", count: 1, enabledByDefault: true },
      veterinary: { state: "ready", count: 1, enabledByDefault: false },
      pet_shop: { state: "ready", count: 1, enabledByDefault: false },
    });
    expect(result.cards.find(({ layer }) => layer === "official")).toMatchObject({
      isAllowed: true,
      sourceLabel: "한국관광공사",
      imageUrl: "https://example.com/official.jpg",
    });
    expect(result.cards.filter(({ layer }) => layer !== "official")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layer: "kakao_candidate", isAllowed: false, imageUrl: null, sourceLabel: "카카오 검색 후보" }),
        expect.objectContaining({ layer: "veterinary", isAllowed: false, sourceLabel: "동물병원" }),
        expect.objectContaining({ layer: "pet_shop", isAllowed: false, sourceLabel: "펫샵·용품점" }),
      ]),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("reviewStatus");
    expect(serialized).not.toContain("pet_evidence");
    expect(serialized).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("keeps official places usable and reports null instead of fake zero when stored layers fail", async () => {
    const queryPublicCatalog = vi.fn(async () => { throw new Error("Supabase unavailable"); });
    const result = await collectHomepagePlacesSnapshot({
      service,
      collectOfficial: async () => officialSnapshot(),
      queryPublicCatalog,
    });

    expect(queryPublicCatalog).toHaveBeenCalledTimes(1);
    expect(queryPublicCatalog).toHaveBeenCalledWith(expect.objectContaining({ kinds: ["pet_travel_candidate"] }));
    expect(result.markers.filter(({ layer }) => layer === "official")).toHaveLength(2);
    expect(result.layers.kakao_candidate).toEqual({
      state: "unavailable", count: null, markerCount: null, enabledByDefault: true,
    });
    for (const layer of ["veterinary", "pet_shop"] as const) {
      expect(result.layers[layer]).toEqual({
        state: "deferred", count: null, markerCount: null, enabledByDefault: false,
      });
    }
  });
});

describe("homepage public catalog server cache", () => {
  it("coalesces concurrent calls, reuses a successful value, and retries failures", async () => {
    let currentTime = 0;
    const query = vi
      .fn<({ kinds }: { kinds?: PublicMapPlaceKind[] }) => Promise<PublicMapPlacePage>>()
      .mockResolvedValueOnce(publicPage("veterinary"))
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(publicPage("veterinary", 2));
    const cached = createHomepagePublicCatalogLoader({
      query,
      now: () => currentTime,
      ttlMs: 100,
    });
    const input = { regionId: "busan" as const, kinds: ["veterinary"] as PublicMapPlaceKind[], page: 1, pageSize: 200 };

    const [first, concurrent] = await Promise.all([cached(input), cached(input)]);
    expect(first).toBe(concurrent);
    expect(query).toHaveBeenCalledTimes(1);
    expect(await cached(input)).toBe(first);

    currentTime = 101;
    await expect(cached(input)).rejects.toThrow("temporary");
    await expect(cached(input)).resolves.toMatchObject({ totalCount: 2 });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("never coalesces or reuses cache entries across regions or cursors", async () => {
    const query = vi.fn(async (input: Parameters<ReturnType<typeof createHomepagePublicCatalogLoader>>[0]) => ({
      ...publicPage("pet_travel_candidate"),
      region: {
        id: input.regionId,
        displayName: input.regionId === "busan" ? "부산" : "제주",
      },
    }));
    const cached = createHomepagePublicCatalogLoader({ query });

    const busan = await cached({ regionId: "busan", page: 1, pageSize: 20, afterId: 10 });
    const jeju = await cached({ regionId: "jeju", page: 1, pageSize: 20, afterId: 10 });
    await cached({ regionId: "busan", page: 1, pageSize: 20, afterId: 11 });

    expect(busan.region.id).toBe("busan");
    expect(jeju.region.id).toBe("jeju");
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("does not coalesce otherwise identical catalog queries across providers", async () => {
    const query = vi.fn(async (input: Parameters<ReturnType<typeof createHomepagePublicCatalogLoader>>[0]) => ({
      ...publicPage(input.providers?.[0] === "tour" ? "tourism_place" : "pet_travel_candidate"),
      items: [],
      totalCount: 0,
    }));
    const cached = createHomepagePublicCatalogLoader({ query });
    const input = { regionId: "busan" as const, page: 1, pageSize: 20 };

    await cached({ ...input, providers: ["kakao"] });
    await cached({ ...input, providers: ["tour"] });

    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe("homepage map location transformation", () => {
  it("preserves source marker semantics and drops duplicate ids and invalid coordinates", () => {
    const base = {
      name: "장소",
      category: "attraction",
      categoryLabel: "관광",
      district: "해운대구",
      address: "부산",
      coordinates: { latitude: 35.1, longitude: 129.1 },
      statusLabel: "확인 필요",
      warning: null,
      isAllowed: false,
      href: null,
      external: false,
      imageUrl: null,
      phone: null,
    } as const;
    const locations = createHomepageMapLocations([
      { ...base, id: "tour:1", layer: "official", sourceLabel: "한국관광공사" },
      { ...base, id: "kakao:2", layer: "kakao_candidate", sourceLabel: "카카오 검색 후보" },
      { ...base, id: "vet:3", layer: "veterinary", sourceLabel: "동물병원" },
      { ...base, id: "shop:4", layer: "pet_shop", sourceLabel: "펫샵·용품점" },
      { ...base, id: "tour:1", layer: "official", sourceLabel: "중복" },
      { ...base, id: "bad", layer: "official", sourceLabel: "한국관광공사", coordinates: { latitude: Number.NaN, longitude: 129 } },
    ]);
    expect(locations.map(({ markerKind, markerLabel, sourceLabel }) => ({ markerKind, markerLabel, sourceLabel }))).toEqual([
      { markerKind: "tourism-official", markerLabel: "공", sourceLabel: "한국관광공사" },
      { markerKind: "kakao-candidate", markerLabel: "K", sourceLabel: "카카오 검색 후보" },
      { markerKind: "veterinary", markerLabel: "+", sourceLabel: "동물병원" },
      { markerKind: "pet-shop", markerLabel: "샵", sourceLabel: "펫샵·용품점" },
    ]);
  });
});

describe("GET /api/homepage/places", () => {
  const allow = () => ({ allowed: true, limit: 30, remaining: 29, retryAfterSeconds: 60 });
  const emptySnapshot: HomepagePlacesSnapshot = {
    official: { totalCount: 0, markerCount: 0, omittedCoordinateCount: 0, categoryCounts: [], featuredState: "empty", retrievedAt: NOW },
    layers: {
      official: { state: "empty", count: 0, markerCount: 0, enabledByDefault: true },
      kakao_candidate: { state: "empty", count: 0, markerCount: 0, enabledByDefault: true },
      veterinary: { state: "empty", count: 0, markerCount: 0, enabledByDefault: false },
      pet_shop: { state: "empty", count: 0, markerCount: 0, enabledByDefault: false },
    },
    markers: [],
    cards: [],
  };

  it("returns public shared-cache headers, rejects query parameters, and forwards only server dependencies", async () => {
    const loadSnapshot = vi.fn(async () => emptySnapshot);
    const handler = createHomepagePlacesHandler({ service, rateLimit: allow, loadSnapshot });
    const ok = await handler(new Request("http://localhost/api/homepage/places"));
    const invalid = await handler(new Request("http://localhost/api/homepage/places?kind=veterinary"));

    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("public");
    expect(ok.headers.get("cdn-cache-control")).toContain("stale-while-revalidate");
    expect(ok.headers.get("vercel-cdn-cache-control")).toContain("max-age=300");
    expect(await ok.json()).toMatchObject({ ok: true, data: emptySnapshot });
    expect(invalid.status).toBe(400);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith(expect.objectContaining({ service }));
  });

  it("coalesces identical generation and serves the last valid snapshot after a refresh failure", async () => {
    let cacheTime = 0;
    const loadSnapshot = vi.fn()
      .mockResolvedValueOnce(emptySnapshot)
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValueOnce(emptySnapshot);
    const handler = createHomepagePlacesHandler({
      service,
      rateLimit: allow,
      loadSnapshot,
      cacheNow: () => cacheTime,
      cacheFreshMs: 100,
      cacheStaleIfErrorMs: 1_000,
    });
    const request = () => new Request("http://localhost/api/homepage/places");

    const [first, concurrent] = await Promise.all([handler(request()), handler(request())]);
    expect(first.status).toBe(200);
    expect(concurrent.status).toBe(200);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    cacheTime = 101;
    const stale = await handler(request());
    expect(stale.status).toBe(200);
    await expect(stale.json()).resolves.toMatchObject({ data: emptySnapshot });
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect((await handler(request())).status).toBe(200);
    expect(loadSnapshot).toHaveBeenCalledTimes(2);

    await handler(new Request("http://localhost/api/homepage/places?includeOptional=true"));
    expect(loadSnapshot).toHaveBeenCalledTimes(3);
  });
});
