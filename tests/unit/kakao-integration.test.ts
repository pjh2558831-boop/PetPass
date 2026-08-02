import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as searchRoute } from "@/app/api/kakao/local/search/route";
import {
  geocodeAddress,
  searchKakaoPlaces,
} from "@/lib/kakao/local";
import {
  createKakaoMapController,
  getKakaoMapJavaScriptKey,
} from "@/lib/kakao/maps";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";

const originalRestKey = process.env.KAKAO_REST_API_KEY;
const originalMapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalRestKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalRestKey;
  if (originalMapKey === undefined) {
    delete process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
  } else {
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY = originalMapKey;
  }
  delete window.kakao;
});

describe("Kakao integration boundaries", () => {
  it("returns a clear configuration error when the REST key is missing", () => {
    delete process.env.KAKAO_REST_API_KEY;
    expect(() => getKakaoRestApiKey()).toThrow("KAKAO_REST_API_KEY");
  });

  it("rejects an invalid keyword query before calling Kakao", async () => {
    const response = await searchRoute(
      new Request("http://localhost/api/kakao/local/search?query=x"),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it("normalizes a successful keyword search response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        documents: [
          {
            id: "123",
            place_name: "해운대 반려동물 카페",
            category_name: "음식점 > 카페",
            phone: "051-000-0000",
            address_name: "부산 해운대구 우동 1",
            road_address_name: "부산 해운대구 해운대로 1",
            place_url: "https://place.map.kakao.com/123",
            distance: "820",
            x: "129.1603",
            y: "35.1590",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await searchKakaoPlaces(
      { query: "해운대 카페", page: 1, size: 5 },
      { apiKey: "test-key", fetchImpl },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "123",
        name: "해운대 반려동물 카페",
        distanceMeters: 820,
        coordinates: { latitude: 35.159, longitude: 129.1603 },
      }),
    ]);
  });

  it("normalizes a successful address search response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        documents: [
          {
            address_name: "부산 해운대구 우동 1",
            address_type: "REGION_ADDR",
            x: "129.1603",
            y: "35.1590",
            road_address: { address_name: "부산 해운대구 해운대로 1" },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await geocodeAddress("부산 해운대구", 5, {
      apiKey: "test-key",
      fetchImpl,
    });
    expect(result[0]).toMatchObject({
      address: "부산 해운대구 우동 1",
      roadAddress: "부산 해운대구 해운대로 1",
      coordinates: { latitude: 35.159, longitude: 129.1603 },
    });
  });

  it("sanitizes an upstream failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("upstream details", { status: 503 }),
    ) as unknown as typeof fetch;

    await expect(
      searchKakaoPlaces(
        { query: "해운대 카페", page: 1, size: 5 },
        { apiKey: "test-key", fetchImpl },
      ),
    ).rejects.toThrow("503 상태로 실패했습니다");
  });

  it("reports missing map configuration and SDK failures", () => {
    delete process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
    expect(() => getKakaoMapJavaScriptKey()).toThrow(
      "NEXT_PUBLIC_KAKAO_MAP_JS_KEY",
    );
    expect(() =>
      createKakaoMapController(document.createElement("div"), {
        locations: [],
      }),
    ).toThrow("지도 SDK");
  });
});
