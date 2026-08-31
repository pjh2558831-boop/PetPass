import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KAKAO_CURRENT_MAP_MAX_RADIUS_METERS,
  KAKAO_MAX_REQUESTS_PER_SEARCH,
  createKakaoSearchPlan,
  deduplicateKakaoPlaces,
} from "@/lib/kakao/search-area";
import {
  BUSAN_REGION_CONFIG,
  JEJU_REGION_CONFIG,
  coordinatesInRegion,
  getItineraryEnabledRegionConfigs,
  getKakaoDiscoveryEnabledRegionConfigs,
  getMapEnabledRegionConfigs,
  getRegionConfig,
  getRegionConfigByService2LegalDongCode,
  REGION_CONFIGS,
} from "@/lib/regions/config";
import { UNKNOWN_REGION_LABEL, deriveRegionLabel } from "@/lib/regions/label";
import { normalizeRecommendationRequest } from "@/lib/recommendation/recommendation-request";
import type { KakaoPlaceSearchResult } from "@/types/kakao";
import type { RouteRecommendationRequest } from "@/types/recommendation";

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
  it("supports direct selected-place routing in all 17 regions without overstating automatic capability", () => {
    expect(REGION_CONFIGS).toHaveLength(17);
    expect(REGION_CONFIGS.every(({ routeCapabilities }) =>
      routeCapabilities.selectedPlaceRouting)).toBe(true);
    expect(BUSAN_REGION_CONFIG.routeCapabilities).toEqual({
      selectedPlaceRouting: true,
      automaticFill: true,
      fullyAutomaticRecommendation: true,
    });
    expect(JEJU_REGION_CONFIG.routeCapabilities).toEqual({
      selectedPlaceRouting: true,
      automaticFill: false,
      fullyAutomaticRecommendation: false,
    });
  });

  it.each(REGION_CONFIGS)("normalizes a locked selected-place route for $displayName", (region) => {
    const request: RouteRecommendationRequest = {
      departure: {
        label: `${region.displayName} 출발지`,
        latitude: region.defaultMapCenter.latitude,
        longitude: region.defaultMapCenter.longitude,
        source: "map_selection",
      },
      trip: {
        regionId: region.id,
        districtId: null,
        date: "2026-09-12",
        startTime: "10:00",
        tripType: "day_trip",
        tripPace: "balanced",
        selectedCategories: ["attraction"],
        roundTrip: false,
      },
      pet: {
        name: "까꿍",
        species: "DOG",
        size: "SMALL",
        availableEquipment: { carrier: false, leash: true, muzzle: false },
        acceptsOutdoorOnlyPlaces: false,
      },
      selectedPlaceIds: ["tour:101"],
      selectedPlaceReferences: [{ placeId: "tour:101", regionId: region.id }],
      autoFill: false,
    };

    expect(normalizeRecommendationRequest(request).scope.regionCode).toBe(
      region.providerCodes.korPetTourService2.legalDongRegionCode,
    );
  });

  it("separates map, itinerary, and Kakao discovery capabilities", () => {
    expect(
      getMapEnabledRegionConfigs([BUSAN_REGION_CONFIG, JEJU_REGION_CONFIG]).map(
        ({ id }) => id,
      ),
    ).toEqual(["busan", "jeju"]);
    expect(
      getItineraryEnabledRegionConfigs([BUSAN_REGION_CONFIG, JEJU_REGION_CONFIG]).map(
        ({ id }) => id,
      ),
    ).toEqual(["busan"]);
    expect(
      getKakaoDiscoveryEnabledRegionConfigs([BUSAN_REGION_CONFIG, JEJU_REGION_CONFIG]).map(
        ({ id }) => id,
      ),
    ).toEqual(["busan"]);
    expect(BUSAN_REGION_CONFIG).toMatchObject({
      mapEnabled: true,
      itineraryEnabled: true,
      kakaoDiscoveryEnabled: true,
    });
    expect(JEJU_REGION_CONFIG).toMatchObject({
      mapEnabled: true,
      itineraryEnabled: false,
      kakaoDiscoveryEnabled: false,
    });
  });

  it("keeps Service2 legal-dong codes separate from legacy tourism area codes", () => {
    expect(BUSAN_REGION_CONFIG.providerCodes.korPetTourService2.legalDongRegionCode).toBe("26");
    expect(JEJU_REGION_CONFIG.providerCodes).toEqual({
      korPetTourService2: { areaCode: "39", legalDongRegionCode: "50" },
      legacyTourismAreaCode: "39",
    });
    expect(JEJU_REGION_CONFIG.districts.map(({ legalDongDistrictCode, name }) => ({
      legalDongDistrictCode,
      name,
    }))).toEqual([
      { legalDongDistrictCode: "110", name: "제주시" },
      { legalDongDistrictCode: "130", name: "서귀포시" },
    ]);
    expect(getRegionConfig("26")).toBeNull();
    expect(getRegionConfigByService2LegalDongCode("26")?.id).toBe("busan");
    expect(getRegionConfigByService2LegalDongCode("50")?.id).toBe("jeju");
  });

  it("validates coordinates against the selected region bounds", () => {
    expect(coordinatesInRegion(BUSAN_REGION_CONFIG, { latitude: 35.18, longitude: 129.08 })).toBe(true);
    expect(coordinatesInRegion(BUSAN_REGION_CONFIG, { latitude: 33.5, longitude: 126.53 })).toBe(false);
    expect(coordinatesInRegion(JEJU_REGION_CONFIG, { latitude: 33.5, longitude: 126.53 })).toBe(true);
    expect(coordinatesInRegion(JEJU_REGION_CONFIG, { latitude: 35.18, longitude: 129.08 })).toBe(false);
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
      ({ legalDongDistrictCode }) => legalDongDistrictCode === "350",
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
      rectangle: {
        west: 129.05,
        south: 35.08,
        east: 129.17,
        north: 35.21,
      },
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

});
