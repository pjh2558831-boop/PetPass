import { describe, expect, it, vi } from "vitest";
import { createPlaceDiscoveryHandler } from "@/app/api/places/discovery/route";
import {
  BUSAN_DISCOVERY_BOUNDS,
  KAKAO_DISCOVERY_KEYWORDS,
  KAKAO_DISCOVERY_LIMITS,
  discoverKakaoPlaces,
  rectangleFromCenter,
  type KakaoDiscoveryInput,
} from "@/lib/kakao/discovery";
import { ConfigurationRequiredError, ProviderResponseError } from "@/lib/shared/errors";
import type { KakaoKeywordSearchInput } from "@/lib/kakao/local";
import type { TourPlaceSummary } from "@/types/place";
import type {
  KakaoDiscoveryCategory,
  KakaoPlaceSearchPage,
  KakaoPlaceSearchResult,
} from "@/types/kakao";

const SUYEONG_CENTER = { latitude: 35.1456, longitude: 129.1131 };
const SUYEONG_RECTANGLE = rectangleFromCenter(SUYEONG_CENTER);
const BASE_INPUT: KakaoDiscoveryInput = {
  category: "food",
  mode: "district",
  rectangle: SUYEONG_RECTANGLE,
  district: { code: "500", name: "수영구" },
};

function allowRateLimit() {
  return {
    allowed: true,
    limit: 3,
    remaining: 2,
    retryAfterSeconds: 1,
  };
}

function place(
  id = "kakao-1",
  overrides: Partial<KakaoPlaceSearchResult> = {},
): KakaoPlaceSearchResult {
  return {
    id,
    name: "광안 반려 카페",
    address: "부산광역시 수영구 광안동 1",
    roadAddress: "부산광역시 수영구 광안해변로 10",
    categoryName: "음식점 > 카페",
    categoryGroupCode: "CE7",
    phone: "051-123-4567",
    placeUrl: `https://place.map.kakao.com/${id}`,
    coordinates: SUYEONG_CENTER,
    ...overrides,
  };
}

function page(
  results: KakaoPlaceSearchResult[],
  overrides: Partial<Omit<KakaoPlaceSearchPage, "results">> = {},
): KakaoPlaceSearchPage {
  return {
    results,
    totalCount: results.length,
    pageableCount: results.length,
    isEnd: true,
    ...overrides,
  };
}

function resultForInput(input: KakaoKeywordSearchInput, id = "shared") {
  const leisure = !input.categoryGroupCode;
  return place(id, {
    categoryGroupCode: input.categoryGroupCode,
    categoryName: leisure ? "여행 > 관광,명소 > 공원" : "음식점 > 카페",
  });
}

function successfulSearch() {
  return vi.fn(async (input: KakaoKeywordSearchInput) =>
    page([resultForInput(input)]),
  );
}

function handler(searchPage = successfulSearch()) {
  return createPlaceDiscoveryHandler({
    searchPage,
    loadExistingPlaces: async () => [],
    rateLimit: allowRateLimit,
    now: () => new Date("2026-08-10T00:00:00.000Z"),
  });
}

function tourPlace(
  overrides: Partial<TourPlaceSummary> = {},
): TourPlaceSummary {
  return {
    contentId: "tour-1",
    contentTypeId: "39",
    providerContentTypeId: "39",
    category: "food",
    title: "광안 반려 카페",
    address: "부산광역시 수영구 광안해변로 10",
    detailAddress: null,
    longitude: 129.1131,
    latitude: 35.1456,
    phone: "051-123-4567",
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: "26",
    legalDistrictCode: "500",
    classificationCodes: {
      primary: null,
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: "2026-08-10T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("place discovery request boundary", () => {
  it("accepts a valid Busan district and server-controlled category", async () => {
    const searchPage = successfulSearch();
    const response = await handler(searchPage)(
      new Request(
        "http://localhost/api/places/discovery?category=food&districtCode=500",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      category: "food",
      district: { code: "500", name: "수영구" },
      searchArea: { mode: "district" },
    });
    expect(searchPage).toHaveBeenCalledTimes(6);
    expect(
      searchPage.mock.calls.every(
        ([input]) =>
          KAKAO_DISCOVERY_KEYWORDS.includes(input.query as never) &&
          input.size === 15 &&
          input.rectangle !== undefined,
      ),
    ).toBe(true);
  });

  it.each([
    ["unsupported district", "category=food&districtCode=999"],
    ["outside Busan", "category=food&west=128&south=35.1&east=128.1&north=35.2"],
    ["oversized viewport", "category=food&west=128.9&south=35.05&east=129.3&north=35.3"],
    ["arbitrary query", "category=food&districtCode=500&query=카페"],
    ["provider path", "category=food&districtCode=500&path=/v2/local/search/keyword.json"],
    ["provider page", "category=food&districtCode=500&page=2"],
    ["provider radius", "category=food&districtCode=500&radius=1000"],
    ["duplicate parameter", "category=food&category=food&districtCode=500"],
    ["NaN", "category=food&west=NaN&south=35.1&east=129.1&north=35.2"],
    ["infinity", "category=food&west=129&south=35.1&east=Infinity&north=35.2"],
    ["reversed bounds", "category=food&west=129.1&south=35.1&east=129&north=35.2"],
    ["partial bounds", "category=food&west=129&south=35.1&east=129.1"],
    ["district and viewport", "category=food&districtCode=500&west=129&south=35.1&east=129.1&north=35.2"],
    ["partial center", "category=food&districtCode=500&centerLongitude=129.1"],
    ["center outside area", "category=food&districtCode=500&centerLongitude=129.35&centerLatitude=35.4"],
    ["unsupported festival", "category=festival&districtCode=500"],
    ["unsupported shopping", "category=shopping&districtCode=500"],
  ])("rejects %s input without an upstream call", async (_label, query) => {
    const searchPage = successfulSearch();
    const response = await handler(searchPage)(
      new Request(`http://localhost/api/places/discovery?${query}`),
    );
    expect(response.status).toBe(400);
    expect(searchPage).not.toHaveBeenCalled();
  });

  it("rejects a client-provided Authorization header", async () => {
    const searchPage = successfulSearch();
    const response = await handler(searchPage)(
      new Request(
        "http://localhost/api/places/discovery?category=food&districtCode=500",
        { headers: { Authorization: "KakaoAK client-value" } },
      ),
    );
    expect(response.status).toBe(400);
    expect(searchPage).not.toHaveBeenCalled();
  });

  it("returns the existing sanitized rate-limit response", async () => {
    const route = createPlaceDiscoveryHandler({
      rateLimit: () => ({
        allowed: false,
        limit: 3,
        remaining: 0,
        retryAfterSeconds: 30,
      }),
    });
    const response = await route(
      new Request(
        "http://localhost/api/places/discovery?category=food&districtCode=500",
      ),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("bounded Kakao discovery search", () => {
  it("stops pagination when every lane reports isEnd", async () => {
    const searchPage = successfulSearch();
    const result = await discoverKakaoPlaces(BASE_INPUT, {
      searchPage,
      loadExistingPlaces: async () => [],
    });
    expect(result.metadata.externalCallCount).toBe(6);
    expect(searchPage).toHaveBeenCalledTimes(6);
  });

  it("continues pagination only to the exposed pageable document limit", async () => {
    const searchPage = vi.fn(async (input: KakaoKeywordSearchInput) =>
      page([resultForInput(input, `${input.query}-${input.page}`)], {
        totalCount: 45,
        pageableCount: 45,
        isEnd: input.page === 3,
      }),
    );
    const result = await discoverKakaoPlaces(
      { ...BASE_INPUT, category: "attraction" },
      { searchPage, loadExistingPlaces: async () => [] },
    );
    expect(result.metadata.saturated).toBe(true);
    expect(result.metadata.externalCallCount).toBeLessThanOrEqual(
      KAKAO_DISCOVERY_LIMITS.maxExternalCalls,
    );
    expect(
      searchPage.mock.calls.every(([input]) => input.page <= 3),
    ).toBe(true);
  });

  it("subdivides only a saturated rectangle", async () => {
    const rectangles = new Set<string>();
    const searchPage = vi.fn(async (input: KakaoKeywordSearchInput) => {
      rectangles.add(JSON.stringify(input.rectangle));
      const root = input.rectangle?.west === SUYEONG_RECTANGLE.west;
      return page([resultForInput(input)], {
        totalCount: root ? 60 : 1,
        pageableCount: root ? 45 : 1,
        isEnd: true,
      });
    });
    const result = await discoverKakaoPlaces(
      { ...BASE_INPUT, category: "attraction" },
      { searchPage, loadExistingPlaces: async () => [] },
    );
    expect(result.metadata.saturated).toBe(true);
    expect(rectangles.size).toBeGreaterThan(1);
  });

  it("reports maximum depth when a depth-two cell remains saturated", async () => {
    const searchPage = vi.fn(async (input: KakaoKeywordSearchInput) =>
      page([resultForInput(input)], {
        totalCount: 60,
        pageableCount: 45,
        isEnd: true,
      }),
    );
    const result = await discoverKakaoPlaces(
      { ...BASE_INPUT, category: "attraction" },
      { searchPage, loadExistingPlaces: async () => [] },
    );
    expect(result.metadata.stoppingReasons).toContain("maximum_depth");
    expect(result.metadata.partial).toBe(true);
  });

  it("enforces the central external-call budget", async () => {
    const searchPage = vi.fn(async (input: KakaoKeywordSearchInput) =>
      page([resultForInput(input, `${input.query}-${input.page}`)], {
        totalCount: 100,
        pageableCount: 45,
        isEnd: false,
      }),
    );
    const result = await discoverKakaoPlaces(
      { ...BASE_INPUT, category: "attraction" },
      { searchPage, loadExistingPlaces: async () => [] },
    );
    expect(result.metadata.externalCallCount).toBe(
      KAKAO_DISCOVERY_LIMITS.maxExternalCalls,
    );
    expect(result.metadata.stoppingReasons).toContain("external_call_budget");
  });

  it("reports the rectangle-count stopping reason deterministically", async () => {
    const searchPage = vi.fn(async (input: KakaoKeywordSearchInput) =>
      page([resultForInput(input)], {
        totalCount: 60,
        pageableCount: 45,
        isEnd: true,
      }),
    );
    const result = await discoverKakaoPlaces(
      { ...BASE_INPUT, category: "attraction" },
      { searchPage, loadExistingPlaces: async () => [] },
    );
    expect(result.metadata.stoppingReasons).toContain("maximum_rectangles");
  });

  it("does not split below the minimum rectangle edge", async () => {
    const tinyInput: KakaoDiscoveryInput = {
      category: "attraction",
      mode: "viewport",
      rectangle: {
        west: 129.11,
        south: 35.14,
        east: 129.116,
        north: 35.145,
      },
    };
    const result = await discoverKakaoPlaces(tinyInput, {
      searchPage: async (input) =>
        page([resultForInput(input)], {
          totalCount: 60,
          pageableCount: 45,
          isEnd: true,
        }),
      loadExistingPlaces: async () => [],
    });
    expect(result.metadata.stoppingReasons).toContain("minimum_rectangle_size");
  });

  it("returns successful partial results when one lane fails", async () => {
    const searchPage = vi.fn(async (input: KakaoKeywordSearchInput) => {
      if (input.query === KAKAO_DISCOVERY_KEYWORDS[0]) {
        throw new ProviderResponseError("provider failed");
      }
      return page([resultForInput(input)]);
    });
    const result = await discoverKakaoPlaces(BASE_INPUT, {
      searchPage,
      loadExistingPlaces: async () => [],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.metadata).toMatchObject({ partial: true });
    expect(result.metadata.stoppingReasons).toContain("provider_partial_failure");
  });

  it("returns 502 when every Kakao call fails", async () => {
    const response = await handler(
      vi.fn(async () => {
        throw new ProviderResponseError("secret upstream details");
      }),
    )(
      new Request(
        "http://localhost/api/places/discovery?category=food&districtCode=500",
      ),
    );
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("stack");
  });

  it("returns 503 when the Kakao server configuration is unavailable", async () => {
    const response = await handler(
      vi.fn(async () => {
        throw new ConfigurationRequiredError(
          "서버 환경변수 KAKAO_REST_API_KEY가 설정되지 않았습니다.",
        );
      }),
    )(
      new Request(
        "http://localhost/api/places/discovery?category=food&districtCode=500",
      ),
    );
    expect(response.status).toBe(503);
  });

  it("does not retry deterministic provider failures", async () => {
    const searchPage = vi.fn(async () => {
      throw new ProviderResponseError("카카오 Local API 요청이 400 상태로 실패했습니다.");
    });
    await expect(
      discoverKakaoPlaces(
        { ...BASE_INPUT, category: "attraction" },
        { searchPage, loadExistingPlaces: async () => [] },
      ),
    ).rejects.toThrow("400 상태");
    expect(searchPage).toHaveBeenCalledTimes(3);
  });

  it("produces deterministic partial metadata for the same responses", async () => {
    const run = () =>
      discoverKakaoPlaces(
        { ...BASE_INPUT, category: "attraction" },
        {
          searchPage: async (input) =>
            page([resultForInput(input)], {
              totalCount: 100,
              pageableCount: 45,
              isEnd: false,
            }),
          loadExistingPlaces: async () => [],
        },
      );
    expect((await run()).metadata).toEqual((await run()).metadata);
  });
});

describe("normalization, filtering, and exact-only source linking", () => {
  async function discoverWithResults(
    results: KakaoPlaceSearchResult[],
    options: {
      category?: KakaoDiscoveryCategory;
      existing?: TourPlaceSummary[];
      input?: Partial<KakaoDiscoveryInput>;
    } = {},
  ) {
    const category = options.category ?? "food";
    return discoverKakaoPlaces(
      { ...BASE_INPUT, ...options.input, category },
      {
        searchPage: async (input) =>
          page(
            results.map((result) => ({
              ...result,
              categoryGroupCode:
                category === "leisure"
                  ? undefined
                  : input.categoryGroupCode,
            })),
          ),
        loadExistingPlaces: async () => options.existing ?? [],
        now: () => new Date("2026-08-10T00:00:00.000Z"),
      },
    );
  }

  it("deduplicates repeated Kakao identifiers and preserves a duplicate count", async () => {
    const result = await discoverWithResults([place("same")]);
    expect(result.candidates).toHaveLength(1);
    expect(result.metadata.duplicateCount).toBe(5);
  });

  it("filters addresses outside Busan", async () => {
    const result = await discoverWithResults([
      place("outside", {
        address: "울산광역시 남구 삼산동 1",
        roadAddress: "울산광역시 남구 삼산로 1",
      }),
    ]);
    expect(result.candidates).toEqual([]);
    expect(result.metadata.outOfRegionRemovalCount).toBe(6);
  });

  it("filters a different Busan district in district mode", async () => {
    const result = await discoverWithResults([
      place("haeundae", {
        address: "부산광역시 해운대구 우동 1",
        roadAddress: "부산광역시 해운대구 해운대로 1",
      }),
    ]);
    expect(result.candidates).toEqual([]);
  });

  it("filters coordinates outside the accepted search rectangle", async () => {
    const result = await discoverWithResults([
      place("coordinates", {
        coordinates: { latitude: 35.3, longitude: 129.3 },
      }),
    ]);
    expect(result.candidates).toEqual([]);
  });

  it.each([
    "동물병원",
    "동물약국",
    "애견미용",
    "반려동물용품",
    "펫샵",
    "편의점",
    "백화점",
  ])("excludes non-travel business category %s", async (categoryName) => {
    const result = await discoverWithResults([
      place(`excluded-${categoryName}`, { categoryName }),
    ]);
    expect(result.candidates).toEqual([]);
    expect(result.metadata.excludedCategoryCount).toBeGreaterThan(0);
  });

  it.each([
    "공원",
    "산책로",
    "둘레길",
    "등산로",
    "해수욕장",
    "캠핑장",
    "오토캠핑장",
    "반려동물놀이터",
  ])("allows narrow leisure category %s", async (categoryName) => {
    const result = await discoverWithResults(
      [place(`leisure-${categoryName}`, { categoryName: `여행 > ${categoryName}` })],
      { category: "leisure" },
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].category).toBe("leisure");
  });

  it("normalizes missing optional phone and falls back to the lot address", async () => {
    const result = await discoverWithResults([
      place("optional", { phone: undefined, roadAddress: undefined }),
    ]);
    expect(result.candidates[0].address).toBe("부산광역시 수영구 광안동 1");
    expect(result.candidates[0]).not.toHaveProperty("phone");
  });

  it("marks every Kakao candidate unknown, unverified, and recommendation-ineligible", async () => {
    const result = await discoverWithResults([place()]);
    expect(result.candidates[0]).toMatchObject({
      source: "KAKAO",
      candidateStatus: "discovery_candidate",
      verificationStatus: "verification_required",
      petAccessVerdict: "unknown",
      recommendationEligible: false,
    });
    expect(result.candidates[0]).not.toHaveProperty("petPolicy");
    expect(result.candidates[0]).not.toHaveProperty("imageUrl");
    expect(result.candidates[0]).not.toHaveProperty("openingHours");
  });

  it("exposes an exact existing Tourism link without merging fields", async () => {
    const existing = tourPlace();
    const result = await discoverWithResults([place()], { existing: [existing] });
    expect(result.candidates[0].exactExistingPlaceLink).toEqual({
      classification: "exact",
      contentId: "tour-1",
      title: "광안 반려 카페",
    });
    expect(result.metadata.exactExistingPlaceLinkCount).toBe(1);
    expect(result.candidates[0].name).toBe("광안 반려 카페");
  });

  it.each([
    ["probable", { address: "부산광역시 수영구 다른로 20", phone: null }],
    ["possible", { address: "부산광역시 수영구 아주다른로 30", phone: null, latitude: 35.2, longitude: 129.2 }],
  ])("does not expose a %s source assessment as a link", async (_kind, values) => {
    const existing = tourPlace({
      address: values.address,
      phone: values.phone,
      latitude: "latitude" in values ? values.latitude : 35.14561,
      longitude: "longitude" in values ? values.longitude : 129.11311,
    });
    const result = await discoverWithResults([place()], { existing: [existing] });
    expect(result.candidates[0]).not.toHaveProperty("exactExistingPlaceLink");
  });

  it("never links on coordinates alone", async () => {
    const existing = tourPlace({
      title: "완전히 다른 장소",
      address: "부산광역시 수영구 다른로 99",
      phone: null,
    });
    const result = await discoverWithResults([place()], { existing: [existing] });
    expect(result.candidates[0]).not.toHaveProperty("exactExistingPlaceLink");
  });

  it("returns candidates as partial when catalog linking is unavailable", async () => {
    const result = await discoverKakaoPlaces(BASE_INPUT, {
      searchPage: async (input) => page([resultForInput(input)]),
      loadExistingPlaces: async () => {
        throw new Error("tour provider unavailable");
      },
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.metadata.stoppingReasons).toContain("catalog_linking_unavailable");
  });

  it("does not leak raw Kakao meta, documents, secrets, or authorization", async () => {
    const result = await discoverWithResults([place()]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("pageable_count");
    expect(serialized).not.toContain("documents");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("KakaoAK");
    expect(serialized).not.toContain("KAKAO_REST_API_KEY");
  });

  it("keeps the configured Busan boundary immutable in a response", async () => {
    const before = { ...BUSAN_DISCOVERY_BOUNDS };
    await discoverWithResults([place()]);
    expect(BUSAN_DISCOVERY_BOUNDS).toEqual(before);
  });
});
