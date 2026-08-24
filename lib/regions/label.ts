import {
  REGION_CONFIGS,
  getRegionConfig,
  getRegionConfigByService2LegalDongCode,
  getRegionDistrict,
  type RegionConfig,
} from "@/lib/regions/config";

export const UNKNOWN_REGION_LABEL = "위치 정보 확인 필요";

export interface RegionLabelInput {
  regionCode?: string | null;
  districtCode?: string | null;
  city?: string | null;
  district?: string | null;
  roadAddress?: string | null;
  lotNumberAddress?: string | null;
}

const CITY_ALIASES: Readonly<Record<string, string>> = {
  "부산": "busan",
  "부산광역시": "busan",
  "제주": "jeju",
  "제주특별자치도": "jeju",
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/gu, " ");
  return normalized || null;
}

function regionFromCity(city: string | null | undefined): RegionConfig | null {
  const normalized = normalizeText(city);
  if (!normalized) return null;
  const regionId = CITY_ALIASES[normalized];
  return regionId ? getRegionConfig(regionId) : null;
}

function normalizedDistrictName(
  region: RegionConfig,
  district: string | null | undefined,
): string | null {
  const normalized = normalizeText(district);
  if (!normalized) return null;
  return region.districts.find(({ name }) => name === normalized)?.name ?? null;
}

function formatRegionLabel(region: RegionConfig, districtName: string): string {
  return `${region.displayName} · ${districtName}`;
}

function parseAddress(address: string | null | undefined): {
  region: RegionConfig | null;
  districtName: string | null;
} {
  const normalized = normalizeText(address);
  if (!normalized) return { region: null, districtName: null };

  const tokens = normalized.split(" ");
  const region =
    tokens.map(regionFromCity).find((candidate) => candidate !== null) ?? null;
  if (!region) return { region: null, districtName: null };
  const districtName =
    region.districts.find(({ name }) => tokens.includes(name))?.name ?? null;
  return { region, districtName };
}

export function deriveRegionLabel(input: RegionLabelInput): string {
  const normalizedFieldRegion =
    getRegionConfigByService2LegalDongCode(input.regionCode) ??
    regionFromCity(input.city);
  if (normalizedFieldRegion) {
    const districtName =
      getRegionDistrict(normalizedFieldRegion, input.districtCode)?.name ??
      normalizedDistrictName(normalizedFieldRegion, input.district);
    if (districtName) return formatRegionLabel(normalizedFieldRegion, districtName);
  }

  const road = parseAddress(input.roadAddress);
  if (road.region && road.districtName) {
    return formatRegionLabel(road.region, road.districtName);
  }

  const lot = parseAddress(input.lotNumberAddress);
  if (lot.region && lot.districtName) {
    return formatRegionLabel(lot.region, lot.districtName);
  }

  const cityFallback = normalizedFieldRegion ?? road.region ?? lot.region;
  if (cityFallback) return cityFallback.displayName;

  return UNKNOWN_REGION_LABEL;
}

export function getKnownCityNames(): string[] {
  return REGION_CONFIGS.map(({ displayName }) => displayName);
}
