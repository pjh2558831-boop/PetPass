import { describe, expect, it, vi } from "vitest";
import { createHomepageInitialPlacesHandler } from "@/app/api/homepage/places/initial/handler";
import {
  assembleHomepageInitialPlaces,
  createHomepageInitialPlacesLoader,
  homepageInitialCacheKey,
} from "@/lib/homepage/homepage-initial";
import {
  HOMEPAGE_INITIAL_VERSION,
  isHomepageInitialPlacesSnapshot,
  type HomepageInitialPlacesRequest,
  type HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";
import type {
  PublicMapPlaceKind,
  PublicMapPlacePage,
  PublicMapPlaceProvider,
} from "@/types/public-map-place";
import type { RegionId } from "@/types/region";

const NOW = "2026-08-24T03:00:00.000Z";

function request(
  overrides: Partial<HomepageInitialPlacesRequest> = {},
): HomepageInitialPlacesRequest {
  return {
    version: HOMEPAGE_INITIAL_VERSION,
    region: "busan",
    scope: "default",
    providers: "default",
    ...overrides,
  };
}

interface TestCatalogQueryInput {
  regionId: RegionId;
  providers: PublicMapPlaceProvider[];
  kinds: PublicMapPlaceKind[];
  page: number;
  pageSize: number;
}

function catalogPage(
  region: "busan" | "jeju",
  provider: PublicMapPlaceProvider,
  count = 1,
): PublicMapPlacePage {
  const tour = provider === "tour";
  return {
    region: { id: region, displayName: region === "jeju" ? "제주" : "부산" },
    page: 1,
    pageSize: 200,
    totalCount: count,
    hasNext: false,
    items: Array.from({ length: count }, (_, index) => ({
      id: `${provider}:${region}-${provider}-${index}`,
      provider,
      providerPlaceId: `${region}-${provider}-${index}`,
      name: `${region} ${provider} 장소 ${index}`,
      kind: tour ? "tourism_place" as const : "pet_travel_candidate" as const,
      category: tour ? "attraction" as const : "cafe" as const,
      district: { code: "110", name: region === "jeju" ? "제주시" : "중구" },
      address: `${region}의 길이가 긴 전체 주소 ${index}`,
      coordinates: {
        latitude: (tour ? 35.1 : 35.2) + index * 0.0001,
        longitude: (tour ? 129.1 : 129.2) + index * 0.0001,
      },
      phone: "051-000-0000",
      imageUrl: tour ? `https://example.com/${index}.jpg` : null,
      contentTypeId: tour ? "12" : null,
      placeUrl: tour ? `/places/${region}-${index}` : `https://place.map.kakao.com/${index}`,
      source: tour ? "kto_official" as const : "kakao_search_candidate" as const,
      petAccessVerdict: tour && index % 4 === 0 ? "allowed" as const : "unknown" as const,
      reviewStatus: "confirmed" as const,
      publicLabel: tour && index % 4 === 0 ? "동반 가능" : "방문 전 확인 필요",
      categoryGroupCode: null,
      lastSeenAt: NOW,
      matchedQueryCount: tour ? 0 : 2,
      categoryQueryAgreementCount: tour ? 0 : 2,
    })),
  };
}

function catalogQuery(region: "busan" | "jeju", count = 1) {
  return vi.fn(async (input: TestCatalogQueryInput) =>
    catalogPage(region, input.providers[0], count));
}

describe("homepage initial compact projection", () => {
  it("serves a bounded carousel with photos in one response instead of the full map page", async () => {
    const query = vi.fn(async (input: TestCatalogQueryInput) => ({
      ...catalogPage("busan", input.providers[0], input.pageSize),
      totalCount: 200,
      hasNext: input.pageSize < 200,
      nextCursor: input.pageSize < 200 ? input.pageSize : null,
    }));
    const full = await assembleHomepageInitialPlaces(request(), { queryPublicCatalog: query });
    query.mockClear();
    const cards = await assembleHomepageInitialPlaces(request({ scope: "cards" }), { queryPublicCatalog: query });
    expect(query.mock.calls.every(([input]) => input.pageSize === 12)).toBe(true);
    expect(cards.markers).toHaveLength(24);
    expect(cards.cardDetails).toHaveLength(24);
    expect(cards.cardDetails[0][3]).toBe("https://example.com/0.jpg");
    expect(cards.totalCount).toBe(full.totalCount);
    expect(cards.continuations.every(({ complete }) => !complete)).toBe(true);
    expect(isHomepageInitialPlacesSnapshot(cards)).toBe(true);
    expect(isHomepageInitialPlacesSnapshot({ ...cards, scope: "default" })).toBe(false);
    expect(homepageInitialCacheKey(request({ scope: "cards" }))).not.toBe(homepageInitialCacheKey(request()));
    const response = await createHomepageInitialPlacesHandler({ loadInitial: async () => cards })(
      new Request("http://localhost/api/homepage/places/initial?version=1&region=busan&scope=cards&providers=default"),
    );
    expect(response.status).toBe(200);
    const sizes = [full, cards].map(value => Buffer.byteLength(JSON.stringify(value), "utf8"));
    expect(sizes[1]).toBeLessThan(sizes[0] * 0.2);
    console.log(JSON.stringify({ fullMapBytes: sizes[0], carouselBytes: sizes[1], fullMapRows: 400, carouselRows: 24 }));
  });

  it("projects bounded trusted catalog pages without KTO services or card-only fields", async () => {
    const queryPublicCatalog = catalogQuery("busan");
    const result = await assembleHomepageInitialPlaces(request(), {
      queryPublicCatalog,
      now: () => new Date(NOW),
    });

    expect(queryPublicCatalog).toHaveBeenCalledTimes(2);
    expect(queryPublicCatalog).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "busan",
      providers: ["tour"],
      kinds: ["tourism_place"],
      page: 1,
      pageSize: 200,
    }));
    expect(queryPublicCatalog).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "busan",
      providers: ["kakao"],
      kinds: ["pet_travel_candidate"],
      page: 1,
      pageSize: 200,
    }));
    expect(result).toMatchObject({
      contractVersion: 1,
      region: "busan",
      scope: "default",
      providers: "default",
      totalCount: 2,
      markerCount: 2,
      freshness: { status: "fresh" },
    });
    expect(result.markers[0]).toHaveLength(9);
    expect(result.cardDetails).toEqual([]);
    expect(isHomepageInitialPlacesSnapshot(result)).toBe(true);
    const serialized = JSON.stringify(result);
    for (const forbidden of ["phone", "imageUrl", "placeUrl", "address", "user", "session", "SUPABASE_SECRET_KEY"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps the bounded 400-marker initial DTO below 150 KB raw", async () => {
    const queryPublicCatalog = catalogQuery("busan", 200);
    const result = await assembleHomepageInitialPlaces(request(), {
      queryPublicCatalog,
      now: () => new Date(NOW),
    });

    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThan(150_000);
    expect(result.markerCount).toBe(400);
  });

  it("never lets Busan and Jeju records cross regions", async () => {
    await expect(assembleHomepageInitialPlaces(request({ region: "jeju" }), {
      queryPublicCatalog: catalogQuery("busan"),
    })).rejects.toThrow(/region|지역/iu);

    const queryPublicCatalog = catalogQuery("jeju");
    const jeju = await assembleHomepageInitialPlaces(request({ region: "jeju" }), {
      queryPublicCatalog,
      now: () => new Date(NOW),
    });
    expect(queryPublicCatalog).toHaveBeenCalledOnce();
    expect(jeju.region).toBe("jeju");
    expect(jeju.markers.every((marker) => marker[0].startsWith("tour:"))).toBe(true);
  });

  it("loads facility card details only in the optional scope and keeps partial success", async () => {
    const queryPublicCatalog = vi.fn(async (input: {
      kinds: PublicMapPlaceKind[];
    }): Promise<PublicMapPlacePage> => {
      const kind = input.kinds[0];
      if (kind === "pet_shop") throw new Error("pet shop temporarily unavailable");
      return {
        region: { id: "busan", displayName: "부산" },
        page: 1,
        pageSize: 200,
        totalCount: 1,
        hasNext: false,
        items: [{
          id: "kakao:veterinary-1",
          provider: "kakao",
          providerPlaceId: "veterinary-1",
          name: "부산 동물병원",
          kind: "veterinary",
          category: "other",
          district: { code: "26350", name: "해운대구" },
          address: "부산광역시 해운대구 병원로 1",
          coordinates: { latitude: 35.16, longitude: 129.16 },
          phone: "051-123-4567",
          imageUrl: null,
          contentTypeId: null,
          placeUrl: "https://place.map.kakao.com/veterinary-1",
          source: "kakao_search_candidate",
          petAccessVerdict: "unknown",
          reviewStatus: "unreviewed",
          publicLabel: "반려동물 편의시설",
          categoryGroupCode: "HP8",
          lastSeenAt: NOW,
          matchedQueryCount: 1,
          categoryQueryAgreementCount: 1,
        }],
      };
    });
    const result = await assembleHomepageInitialPlaces(request({
      scope: "optional",
      providers: "kakao",
    }), { queryPublicCatalog, now: () => new Date(NOW) });

    expect(queryPublicCatalog).toHaveBeenCalledTimes(2);
    expect(result.layers.veterinary).toMatchObject({ state: "ready", count: 1, markerCount: 1 });
    expect(result.layers.pet_shop).toEqual({ state: "unavailable", count: null, markerCount: null });
    expect(result.markers[0][3]).toBe("veterinary");
    expect(result.cardDetails).toEqual([[
      "kakao:veterinary-1",
      "부산광역시 해운대구 병원로 1",
      "051-123-4567",
      null,
    ]]);
    expect(isHomepageInitialPlacesSnapshot(result)).toBe(true);
  });
});

describe("homepage initial cache", () => {
  it("keys every representation-changing input", () => {
    const base = request();
    const keys = new Set([
      homepageInitialCacheKey(base),
      homepageInitialCacheKey({ ...base, version: 2 } as unknown as HomepageInitialPlacesRequest),
      homepageInitialCacheKey({ ...base, region: "jeju" }),
      homepageInitialCacheKey({ ...base, scope: "optional" }),
      homepageInitialCacheKey({ ...base, providers: "tour" }),
      homepageInitialCacheKey({ ...base, providers: "kakao" }),
    ]);
    expect(keys.size).toBe(6);
  });

  it("collapses cold generation and explicitly marks stale fallback after refresh failure", async () => {
    let nowMs = 0;
    const fresh = await assembleHomepageInitialPlaces(request(), {
      queryPublicCatalog: catalogQuery("busan"),
      now: () => new Date(NOW),
    });
    const assemble = vi.fn()
      .mockResolvedValueOnce(fresh)
      .mockRejectedValueOnce(new Error("temporary Supabase failure"));
    const load = createHomepageInitialPlacesLoader({
      assemble,
      now: () => nowMs,
      freshMs: 100,
      staleIfErrorMs: 1_000,
    });

    const [first, concurrent] = await Promise.all([load(request()), load(request())]);
    expect(first).toBe(concurrent);
    expect(assemble).toHaveBeenCalledOnce();
    nowMs = 101;
    await expect(load(request())).resolves.toMatchObject({
      dataVersion: first.dataVersion,
      freshness: { status: "stale" },
    });
    expect(assemble).toHaveBeenCalledTimes(2);
  });

  it("does not retain a degraded provider result in the application cache", async () => {
    const full = await assembleHomepageInitialPlaces(request(), {
      queryPublicCatalog: catalogQuery("busan"),
      now: () => new Date(NOW),
    });
    const degraded: HomepageInitialPlacesSnapshot = {
      ...full,
      totalCount: full.layers.tourism.count ?? 0,
      markerCount: full.layers.tourism.markerCount ?? 0,
      layers: {
        ...full.layers,
        kakao: { state: "unavailable", count: null, markerCount: null },
      },
      categoryCounts: full.categoryCounts.filter(([layer]) => layer === "tourism"),
      markers: full.markers.filter(([, , layer]) => layer === "tourism"),
    };
    const assemble = vi.fn()
      .mockResolvedValueOnce(degraded)
      .mockResolvedValueOnce(full);
    const load = createHomepageInitialPlacesLoader({ assemble });

    await expect(load(request())).resolves.toBe(degraded);
    await expect(load(request())).resolves.toBe(full);
    expect(assemble).toHaveBeenCalledTimes(2);
  });

  it("serves the last complete result as explicitly stale when refresh is partial", async () => {
    let nowMs = 0;
    const full = await assembleHomepageInitialPlaces(request(), {
      queryPublicCatalog: catalogQuery("busan"),
      now: () => new Date(NOW),
    });
    const partial: HomepageInitialPlacesSnapshot = {
      ...full,
      layers: {
        ...full.layers,
        kakao: { state: "unavailable", count: null, markerCount: null },
      },
    };
    const assemble = vi.fn()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(partial);
    const load = createHomepageInitialPlacesLoader({
      assemble,
      now: () => nowMs,
      freshMs: 100,
      staleIfErrorMs: 1_000,
    });

    await expect(load(request())).resolves.toBe(full);
    nowMs = 101;
    await expect(load(request())).resolves.toMatchObject({
      layers: { kakao: { state: "ready" } },
      freshness: { status: "stale" },
    });
    expect(assemble).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/homepage/places/initial", () => {
  it("returns a public compact response with bounded timing and no personalization", async () => {
    const snapshot = await assembleHomepageInitialPlaces(request(), {
      queryPublicCatalog: catalogQuery("busan"),
      now: () => new Date(NOW),
    });
    const loadInitial = vi.fn(async () => snapshot);
    const response = await createHomepageInitialPlacesHandler({ loadInitial })(
      new Request("http://localhost/api/homepage/places/initial?version=1&region=busan&scope=default&providers=default"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("cdn-cache-control")).toContain("max-age=300");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain("stale-while-revalidate");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("server-timing")).toMatch(/serialize;dur=/u);
    expect(await response.json()).toMatchObject({ ok: true, data: snapshot });
    expect(loadInitial).toHaveBeenCalledWith(request(), expect.any(Function));
  });

  it.each([
    "region=busan&scope=default&providers=default",
    "version=2&region=busan&scope=default&providers=default",
    "version=1&region=unknown&scope=default&providers=default",
    "version=1&region=busan&scope=unknown&providers=default",
    "version=1&region=busan&scope=default&providers=unknown",
    "version=1&region=busan&scope=default&providers=default&district=110",
    "version=1&version=1&region=busan&scope=default&providers=default",
  ])("rejects invalid query without loading and never caches the error: %s", async (parameters) => {
    const loadInitial = vi.fn();
    const response = await createHomepageInitialPlacesHandler({ loadInitial })(
      new Request(`http://localhost/api/homepage/places/initial?${parameters}`),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadInitial).not.toHaveBeenCalled();
  });

  it("rejects authorization-dependent requests so they cannot enter the shared cache", async () => {
    const loadInitial = vi.fn();
    const response = await createHomepageInitialPlacesHandler({ loadInitial })(
      new Request("http://localhost/api/homepage/places/initial?version=1&region=busan&scope=default&providers=default", {
        headers: { Authorization: "Bearer redacted" },
      }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(loadInitial).not.toHaveBeenCalled();
  });

  it("returns no-store on loader failure", async () => {
    const response = await createHomepageInitialPlacesHandler({
      loadInitial: async () => { throw new Error("Supabase unavailable"); },
    })(new Request("http://localhost/api/homepage/places/initial?version=1&region=busan&scope=default&providers=default"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses a short public TTL for partial provider success", async () => {
    const full = await assembleHomepageInitialPlaces(request(), {
      queryPublicCatalog: catalogQuery("busan"),
      now: () => new Date(NOW),
    });
    const partial: HomepageInitialPlacesSnapshot = {
      ...full,
      layers: {
        ...full.layers,
        kakao: { state: "unavailable", count: null, markerCount: null },
      },
    };
    const response = await createHomepageInitialPlacesHandler({
      loadInitial: async () => partial,
    })(new Request("http://localhost/api/homepage/places/initial?version=1&region=busan&scope=default&providers=default"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=5");
    expect(response.headers.get("cdn-cache-control")).toContain("max-age=30");
  });
});
