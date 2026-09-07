import {
  BUSAN_REGION_CONFIG,
  coordinatesInRegion,
  type RegionConfig,
} from "@/lib/regions/config";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

export const BUSAN_COLLECTION_COORDINATE_BOUNDS =
  BUSAN_REGION_CONFIG.mapBounds;

export const KAKAO_COLLECTION_VALIDATION_REASONS = [
  "unknown_district",
  "missing_address",
  "outside_busan",
  "district_mismatch",
  "conflicting_districts",
  "invalid_coordinates",
  "coordinates_outside_busan",
  "outside_region",
  "coordinates_outside_region",
] as const;

export type KakaoCollectionValidationReason =
  (typeof KAKAO_COLLECTION_VALIDATION_REASONS)[number];

export interface KakaoCollectionValidationResult {
  accepted: boolean;
  canonicalAddress: string | null;
  district: { code: string; name: string } | null;
  reasonCodes: KakaoCollectionValidationReason[];
}

function normalizeAddress(value: string | undefined): string | null {
  const normalized = value
    ?.normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized || null;
}

function addressDistrict(
  address: string,
  region: RegionConfig,
): RegionConfig["districts"][number] | null {
  const [prefix, districtName] = address.split(" ");
  const prefixes = region.id === "busan" ? ["부산", "부산광역시"] :
    region.id === "seoul" ? ["서울", "서울특별시"] :
    region.id === "jeju" ? ["제주", "제주특별자치도"] : [];
  if (!prefixes.includes(prefix)) return null;
  return (
    region.districts.find(({ name }) => name === districtName) ?? null
  );
}

function validCoordinates(result: KakaoPlaceSearchResult): boolean {
  const { latitude, longitude } = result.coordinates;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export function validateKakaoBusanCollectionResult(
  result: KakaoPlaceSearchResult,
  expectedDistrictCode: string,
  region: RegionConfig = BUSAN_REGION_CONFIG,
): KakaoCollectionValidationResult {
  const expectedDistrict =
    region.districts.find(
      ({ legalDongDistrictCode }) =>
        legalDongDistrictCode === expectedDistrictCode,
    ) ?? null;
  const roadAddress = normalizeAddress(result.roadAddress);
  const lotAddress = normalizeAddress(result.address);
  const addresses = [roadAddress, lotAddress].filter(
    (address): address is string => Boolean(address),
  );
  const reasonCodes: KakaoCollectionValidationReason[] = [];

  if (!expectedDistrict) reasonCodes.push("unknown_district");
  if (addresses.length === 0) reasonCodes.push("missing_address");

  const parsedDistricts = addresses.map((address) => addressDistrict(address, region));
  const busanDistricts = parsedDistricts.filter(
    (district): district is RegionConfig["districts"][number] =>
      district !== null,
  );
  if (addresses.length > 0 && busanDistricts.length !== addresses.length) {
    reasonCodes.push(region.id === "busan" ? "outside_busan" : "outside_region");
  }
  const uniqueDistrictCodes = new Set(
    busanDistricts.map(({ legalDongDistrictCode }) => legalDongDistrictCode),
  );
  if (uniqueDistrictCodes.size > 1) {
    reasonCodes.push("conflicting_districts");
  } else if (
    expectedDistrict &&
    busanDistricts.length > 0 &&
    !uniqueDistrictCodes.has(expectedDistrict.legalDongDistrictCode)
  ) {
    reasonCodes.push("district_mismatch");
  }

  if (!validCoordinates(result)) {
    reasonCodes.push("invalid_coordinates");
  } else if (!coordinatesInRegion(region, result.coordinates)) {
    reasonCodes.push(region.id === "busan" ? "coordinates_outside_busan" : "coordinates_outside_region");
  }

  return {
    accepted: reasonCodes.length === 0,
    canonicalAddress: roadAddress ?? lotAddress,
    district: expectedDistrict
      ? {
          code: expectedDistrict.legalDongDistrictCode,
          name: expectedDistrict.name,
        }
      : null,
    reasonCodes,
  };
}
