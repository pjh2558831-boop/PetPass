import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as searchRoute } from "@/app/api/kakao/local/search/route";
import {
  KAKAO_CURRENT_MAP_MAX_RADIUS_METERS,
  KAKAO_MAX_REQUESTS_PER_SEARCH,
  createKakaoSearchPlan,
  deduplicateKakaoPlaces,
} from "@/lib/kakao/search-area";
import {
  BUSAN_REGION_CONFIG,
  JEJU_REGION_CONFIG,
  getEnabledRegionConfigs,
} from "@/lib/regions/config";
import { UNKNOWN_REGION_LABEL, deriveRegionLabel } from "@/lib/regions/label";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

const originalRestKey = process.env.KAKAO_REST_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalRestKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalRestKey;
});

describe("provider-neutral region labels", () => {
  it.each([
    ["350", "부산 · 해운대구"],
    ["500", "부산 · 수영구"],
    ["110", "부산 · 중구"],
  ])("uses normalized Busan district %s", (districtCode, expected) => {
    expect(
      deriveRegionLabel({ regionCode: "26", districtCode }),
    ).toBe(expected);
  });

  it("parses the road address before the lot-number address", () => {
    expect(
      deriveRegionLabel({
        roadAddress: "부산광역시 수영구 광안해변로 1",
        lotNumberAddress: "부산광역시 해운대구 우동 1",
      }),
    ).toBe("부산 · 수영구");
  });

  it("parses a lot-number address when a road address is absent", () => {
    expect(
      deriveRegionLabel({ lotNumberAddress: "부산광역시 중구 남포동 1" }),
    ).toBe("부산 · 중구");
  });

  it("uses city then neutral fallbacks without guessing from coordinates", () => {
    expect(deriveRegionLabel({ regionCode: "26" })).toBe("부산");
    expect(deriveRegionLabel({})).toBe(UNKNOWN_REGION_LABEL);
  });
});

describe("region configuration and bounded Kakao search", () => {
  it("keeps future disabled regions out of enabled UI data", () => {
    expect(
      getEnabledRegionConfigs([BUSAN_REGION_CONFIG, JEJU_REGION_CONFIG]).map(
        ({ id }) => id,
      ),
    ).toEqual(["busan"]);
  });

  it("changes the search center with the selected district", () => {
    const suyeong = createKakaoSearchPlan({
      regionId: "busan",
      districtCode: "500",
    });
    const jung = createKakaoSearchPlan({
      regionId: "busan",
      districtCode: "110",
    });

    expect(suyeong.area.label).toBe("부산 · 수영구 중심");
    expect(jung.area.label).toBe("부산 · 중구 중심");
    expect(suyeong.centers[0].coordinates).not.toEqual(
      jung.centers[0].coordinates,
    );
  });

  it("uses the Busan city plan rather than a hidden Haeundae default", () => {
    const plan = createKakaoSearchPlan({ regionId: "busan" });
    const haeundae = BUSAN_REGION_CONFIG.districts.find(
      ({ code }) => code === "350",
    );

    expect(plan.area.mode).toBe("region");
    expect(plan.centers[0].coordinates).toEqual(
      BUSAN_REGION_CONFIG.defaultMapCenter,
    );
    expect(plan.centers[0].coordinates).not.toEqual(haeundae?.searchCenter);
    expect(plan.centers).toHaveLength(KAKAO_MAX_REQUESTS_PER_SEARCH);
    expect(
      plan.centers.every(({ radiusMeters }) => radiusMeters <= 20_000),
    ).toBe(true);
  });

  it("uses a current map center only after the explicit action", () => {
    const currentMap = {
      center: { latitude: 35.145, longitude: 129.11 },
      radiusMeters: 50_000,
    };
    const passivePlan = createKakaoSearchPlan({
      regionId: "busan",
      currentMap,
    });
    const explicitPlan = createKakaoSearchPlan({
      regionId: "busan",
      currentMap,
      explicitMode: "current-map",
    });

    expect(passivePlan.area.mode).toBe("region");
    expect(explicitPlan.area.mode).toBe("current-map");
    expect(explicitPlan.centers[0].radiusMeters).toBe(
      KAKAO_CURRENT_MAP_MAX_RADIUS_METERS,
    );
  });

  it("deduplicates Kakao place IDs while preserving first-seen order", () => {
    const place = (id: string, name: string): KakaoPlaceSearchResult => ({
      id,
      name,
      address: "부산",
      coordinates: { latitude: 35.18, longitude: 129.08 },
    });
    expect(
      deduplicateKakaoPlaces([
        [place("1", "첫 결과"), place("2", "둘째")],
        [place("1", "중복"), place("3", "셋째")],
      ]).map(({ name }) => name),
    ).toEqual(["첫 결과", "둘째", "셋째"]);
  });

  it("rejects request sizes and current-map radii above the hard caps", async () => {
    const sizeResponse = await searchRoute(
      new Request(
        "http://localhost/api/kakao/local/search?query=카페&size=11",
      ),
    );
    const radiusResponse = await searchRoute(
      new Request(
        "http://localhost/api/kakao/local/search?query=카페&mode=current-map&longitude=129.1&latitude=35.15&radiusMeters=10001",
      ),
    );
    expect(sizeResponse.status).toBe(400);
    expect(radiusResponse.status).toBe(400);
  });

  it("runs one district request at the selected center", async () => {
    process.env.KAKAO_REST_API_KEY = "test-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return Response.json({
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        documents: [kakaoDocument("suyeong", "수영 카페")],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await searchRoute(
      new Request(
        "http://localhost/api/kakao/local/search?query=카페&regionId=busan&districtCode=500",
      ),
    );
    const body = await response.json();
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl.searchParams.get("x")).toBe("129.1131");
    expect(requestUrl.searchParams.get("y")).toBe("35.1456");
    expect(requestUrl.searchParams.get("radius")).toBe("8000");
    expect(body.data.area.label).toBe("부산 · 수영구 중심");
    expect(body.data.results[0]).toMatchObject({
      candidateStatus: "discovery_candidate",
      verificationStatus: "verification_required",
      trust: { level: "low", ruleVersion: "petpass-trust-v1" },
    });
    expect(body.data.results[0]).not.toHaveProperty("petAccessVerdict");
  });

  it("bounds Busan-wide requests, deduplicates, and reports truncation", async () => {
    process.env.KAKAO_REST_API_KEY = "test-key";
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      return Response.json({
        meta: { total_count: 2, pageable_count: 2, is_end: call !== 2 },
        documents: [
          kakaoDocument("shared", "공통 카페"),
          kakaoDocument(String(call), `지역 카페 ${call}`),
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await searchRoute(
      new Request(
        "http://localhost/api/kakao/local/search?query=카페&regionId=busan",
      ),
    );
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(KAKAO_MAX_REQUESTS_PER_SEARCH);
    expect(body.data.results).toHaveLength(4);
    expect(
      body.data.results.every(
        (result: Record<string, unknown>) =>
          result.candidateStatus === "discovery_candidate" &&
          !("petAccessVerdict" in result),
      ),
    ).toBe(true);
    expect(body.data.truncated).toBe(true);
    expect(body.data.area).toMatchObject({
      mode: "region",
      requestCount: KAKAO_MAX_REQUESTS_PER_SEARCH,
    });
  });
});

function kakaoDocument(id: string, name: string) {
  return {
    id,
    place_name: name,
    category_name: "음식점 > 카페",
    phone: "",
    address_name: "부산광역시 수영구 광안동 1",
    road_address_name: "부산광역시 수영구 광안해변로 1",
    place_url: `https://place.map.kakao.com/${id}`,
    distance: "100",
    x: "129.1131",
    y: "35.1456",
  };
}
