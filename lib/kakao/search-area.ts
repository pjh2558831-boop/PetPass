import {
  BUSAN_REGION_CONFIG,
  getKakaoDiscoveryEnabledRegionConfig,
  getRegionDistrict,
  type RegionConfig,
  type RegionSearchCenter,
} from "@/lib/regions/config";
import type {
  KakaoCurrentMapSearch,
  KakaoPlaceSearchResult,
  KakaoSearchAreaMode,
  KakaoSearchAreaSummary,
} from "@/types/kakao";
import type { Coordinates } from "@/types/place";

export const KAKAO_DISTRICT_RADIUS_METERS = 8_000;
export const KAKAO_TRIP_ORIGIN_RADIUS_METERS = 8_000;
export const KAKAO_CURRENT_MAP_MAX_RADIUS_METERS = 10_000;
export const KAKAO_MAX_REQUESTS_PER_SEARCH = 3;
export const KAKAO_MAX_RESULTS_PER_REQUEST = 10;

export type KakaoSearchPlanCenter = RegionSearchCenter;

export interface KakaoSearchPlan {
  area: KakaoSearchAreaSummary;
  centers: KakaoSearchPlanCenter[];
}

export interface KakaoSearchAreaInput {
  regionId?: string | null;
  districtCode?: string | null;
  tripOrigin?: (Coordinates & { label?: string }) | null;
  currentMap?: KakaoCurrentMapSearch | null;
  explicitMode?: "configured" | "trip-origin" | "current-map";
}

function kilometers(radiusMeters: number): string {
  const value = radiusMeters / 1_000;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function oneCenterPlan(
  mode: KakaoSearchAreaMode,
  label: string,
  center: Coordinates,
  radiusMeters: number,
  id: string,
): KakaoSearchPlan {
  return {
    area: {
      mode,
      label,
      radiusLabel: `반경 ${kilometers(radiusMeters)}km`,
      requestCount: 1,
    },
    centers: [{ id, label, coordinates: center, radiusMeters }],
  };
}

function regionPlan(region: RegionConfig): KakaoSearchPlan {
  const centers = region.wideSearchCenters.slice(
    0,
    KAKAO_MAX_REQUESTS_PER_SEARCH,
  );
  const maximumRadius = Math.max(
    ...centers.map(({ radiusMeters }) => radiusMeters),
  );
  return {
    area: {
      mode: "region",
      label: `${region.displayName} 전체`,
      radiusLabel: `${centers.length}개 기준점 · 각 최대 ${kilometers(maximumRadius)}km`,
      requestCount: centers.length,
    },
    centers: [...centers],
  };
}

function hasFiniteCoordinates(value: Coordinates | null | undefined): value is Coordinates {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      value.longitude >= -180 &&
      value.longitude <= 180,
  );
}

export function createKakaoSearchPlan(
  input: KakaoSearchAreaInput,
): KakaoSearchPlan {
  const region =
    getKakaoDiscoveryEnabledRegionConfig(input.regionId) ??
    (input.regionId ? null : BUSAN_REGION_CONFIG);

  if (
    input.explicitMode === "current-map" &&
    input.currentMap &&
    hasFiniteCoordinates(input.currentMap.center)
  ) {
    const radiusMeters = Math.min(
      KAKAO_CURRENT_MAP_MAX_RADIUS_METERS,
      Math.max(500, Math.round(input.currentMap.radiusMeters)),
    );
    return oneCenterPlan(
      "current-map",
      "현재 지도 중심",
      input.currentMap.center,
      radiusMeters,
      "current-map",
    );
  }

  if (region) {
    const district = getRegionDistrict(region, input.districtCode);
    if (district) {
      return oneCenterPlan(
        "district",
        `${region.displayName} · ${district.name} 중심`,
        district.searchCenter,
        KAKAO_DISTRICT_RADIUS_METERS,
        `${region.id}-${district.legalDongDistrictCode}`,
      );
    }

    if (
      input.explicitMode === "trip-origin" &&
      hasFiniteCoordinates(input.tripOrigin)
    ) {
      return oneCenterPlan(
        "trip-origin",
        input.tripOrigin.label?.trim() || "선택한 출발지",
        input.tripOrigin,
        KAKAO_TRIP_ORIGIN_RADIUS_METERS,
        "trip-origin",
      );
    }

    if (region.wideSearchCenters.length > 0) return regionPlan(region);
  }

  return {
    ...oneCenterPlan(
      "fallback",
      "부산 안전 기준점",
      BUSAN_REGION_CONFIG.defaultMapCenter,
      KAKAO_DISTRICT_RADIUS_METERS,
      "busan-safe-fallback",
    ),
  };
}

export function deduplicateKakaoPlaces(
  resultGroups: readonly (readonly KakaoPlaceSearchResult[])[],
): KakaoPlaceSearchResult[] {
  const unique = new Map<string, KakaoPlaceSearchResult>();
  for (const results of resultGroups) {
    for (const result of results) {
      if (!unique.has(result.id)) unique.set(result.id, result);
    }
  }
  return [...unique.values()];
}
