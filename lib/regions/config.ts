import type { Coordinates } from "@/types/place";

export interface RegionDistrictConfig {
  code: string;
  name: string;
  searchCenter: Coordinates;
}

export interface RegionSearchCenter {
  id: string;
  label: string;
  coordinates: Coordinates;
  radiusMeters: number;
}

export interface RegionConfig {
  id: string;
  displayName: string;
  tourismAreaCode: string;
  enabled: boolean;
  defaultMapCenter: Coordinates;
  districts: readonly RegionDistrictConfig[];
  wideSearchCenters: readonly RegionSearchCenter[];
}

const BUSAN_DISTRICT_CONFIGS = [
  { code: "110", name: "중구", searchCenter: { latitude: 35.1063, longitude: 129.0324 } },
  { code: "140", name: "서구", searchCenter: { latitude: 35.0979, longitude: 129.0242 } },
  { code: "170", name: "동구", searchCenter: { latitude: 35.1293, longitude: 129.0453 } },
  { code: "200", name: "영도구", searchCenter: { latitude: 35.0912, longitude: 129.0679 } },
  { code: "230", name: "부산진구", searchCenter: { latitude: 35.1629, longitude: 129.0532 } },
  { code: "260", name: "동래구", searchCenter: { latitude: 35.2048, longitude: 129.0838 } },
  { code: "290", name: "남구", searchCenter: { latitude: 35.1366, longitude: 129.0842 } },
  { code: "320", name: "북구", searchCenter: { latitude: 35.1972, longitude: 128.9904 } },
  { code: "350", name: "해운대구", searchCenter: { latitude: 35.1631, longitude: 129.1636 } },
  { code: "380", name: "사하구", searchCenter: { latitude: 35.1046, longitude: 128.9747 } },
  { code: "410", name: "금정구", searchCenter: { latitude: 35.243, longitude: 129.0921 } },
  { code: "440", name: "강서구", searchCenter: { latitude: 35.2122, longitude: 128.9807 } },
  { code: "470", name: "연제구", searchCenter: { latitude: 35.1762, longitude: 129.0798 } },
  { code: "500", name: "수영구", searchCenter: { latitude: 35.1456, longitude: 129.1131 } },
  { code: "530", name: "사상구", searchCenter: { latitude: 35.1526, longitude: 128.9912 } },
  { code: "710", name: "기장군", searchCenter: { latitude: 35.2446, longitude: 129.2223 } },
] as const satisfies readonly RegionDistrictConfig[];

export const BUSAN_REGION_CONFIG = {
  id: "busan",
  displayName: "부산",
  tourismAreaCode: "26",
  enabled: true,
  defaultMapCenter: { latitude: 35.1796, longitude: 129.0756 },
  districts: BUSAN_DISTRICT_CONFIGS,
  // A bounded west/central/east plan covers the MVP region without crawling pages.
  wideSearchCenters: [
    {
      id: "busan-central",
      label: "부산 중앙",
      coordinates: { latitude: 35.1796, longitude: 129.0756 },
      radiusMeters: 20_000,
    },
    {
      id: "busan-west",
      label: "부산 서부",
      coordinates: { latitude: 35.1731, longitude: 128.9468 },
      radiusMeters: 16_000,
    },
    {
      id: "busan-east",
      label: "부산 동부",
      coordinates: { latitude: 35.2446, longitude: 129.2223 },
      radiusMeters: 16_000,
    },
  ],
} as const satisfies RegionConfig;

// Kept disabled so the UI and provider routes remain Busan-only in this MVP.
export const JEJU_REGION_CONFIG = {
  id: "jeju",
  displayName: "제주",
  tourismAreaCode: "39",
  enabled: false,
  defaultMapCenter: { latitude: 33.4996, longitude: 126.5312 },
  districts: [],
  wideSearchCenters: [],
} as const satisfies RegionConfig;

export const REGION_CONFIGS = [
  BUSAN_REGION_CONFIG,
  JEJU_REGION_CONFIG,
] as const satisfies readonly RegionConfig[];

export type BusanDistrictCode =
  (typeof BUSAN_REGION_CONFIG.districts)[number]["code"];

export function getEnabledRegionConfigs(
  regions: readonly RegionConfig[] = REGION_CONFIGS,
): RegionConfig[] {
  return regions.filter((region) => region.enabled);
}

export function getRegionConfig(
  regionIdOrAreaCode: string | null | undefined,
): RegionConfig | null {
  if (!regionIdOrAreaCode) return null;
  return (
    REGION_CONFIGS.find(
      (region) =>
        region.id === regionIdOrAreaCode ||
        region.tourismAreaCode === regionIdOrAreaCode,
    ) ?? null
  );
}

export function getEnabledRegionConfig(
  regionIdOrAreaCode: string | null | undefined,
): RegionConfig | null {
  const region = getRegionConfig(regionIdOrAreaCode);
  return region?.enabled ? region : null;
}

export function getRegionDistrict(
  region: RegionConfig,
  districtCode: string | null | undefined,
): RegionDistrictConfig | null {
  if (!districtCode) return null;
  return region.districts.find(({ code }) => code === districtCode) ?? null;
}
