import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

export const BUSAN_COLLECTION_COORDINATE_BOUNDS = {
  west: 128.75,
  south: 34.95,
  east: 129.4,
  north: 35.5,
} as const;

export const KAKAO_COLLECTION_VALIDATION_REASONS = [
  "unknown_district",
  "missing_address",
  "outside_busan",
  "district_mismatch",
  "conflicting_districts",
  "invalid_coordinates",
  "coordinates_outside_busan",
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
): (typeof BUSAN_REGION_CONFIG.districts)[number] | null {
  if (!/^부산(?:광역시)?(?:\s|$)/u.test(address)) return null;
  const tokens = new Set(address.split(" "));
  return (
    BUSAN_REGION_CONFIG.districts.find(({ name }) => tokens.has(name)) ?? null
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

function coordinatesInsideBusan(result: KakaoPlaceSearchResult): boolean {
  const { latitude, longitude } = result.coordinates;
  return (
    longitude >= BUSAN_COLLECTION_COORDINATE_BOUNDS.west &&
    longitude <= BUSAN_COLLECTION_COORDINATE_BOUNDS.east &&
    latitude >= BUSAN_COLLECTION_COORDINATE_BOUNDS.south &&
    latitude <= BUSAN_COLLECTION_COORDINATE_BOUNDS.north
  );
}

export function validateKakaoBusanCollectionResult(
  result: KakaoPlaceSearchResult,
  expectedDistrictCode: string,
): KakaoCollectionValidationResult {
  const expectedDistrict =
    BUSAN_REGION_CONFIG.districts.find(
      ({ code }) => code === expectedDistrictCode,
    ) ?? null;
  const roadAddress = normalizeAddress(result.roadAddress);
  const lotAddress = normalizeAddress(result.address);
  const addresses = [roadAddress, lotAddress].filter(
    (address): address is string => Boolean(address),
  );
  const reasonCodes: KakaoCollectionValidationReason[] = [];

  if (!expectedDistrict) reasonCodes.push("unknown_district");
  if (addresses.length === 0) reasonCodes.push("missing_address");

  const parsedDistricts = addresses.map(addressDistrict);
  const busanDistricts = parsedDistricts.filter(
    (district): district is (typeof BUSAN_REGION_CONFIG.districts)[number] =>
      district !== null,
  );
  if (addresses.length > 0 && busanDistricts.length !== addresses.length) {
    reasonCodes.push("outside_busan");
  }
  const uniqueDistrictCodes = new Set(
    busanDistricts.map(({ code }) => code),
  );
  if (uniqueDistrictCodes.size > 1) {
    reasonCodes.push("conflicting_districts");
  } else if (
    expectedDistrict &&
    busanDistricts.length > 0 &&
    !uniqueDistrictCodes.has(expectedDistrict.code)
  ) {
    reasonCodes.push("district_mismatch");
  }

  if (!validCoordinates(result)) {
    reasonCodes.push("invalid_coordinates");
  } else if (!coordinatesInsideBusan(result)) {
    reasonCodes.push("coordinates_outside_busan");
  }

  return {
    accepted: reasonCodes.length === 0,
    canonicalAddress: roadAddress ?? lotAddress,
    district: expectedDistrict
      ? { code: expectedDistrict.code, name: expectedDistrict.name }
      : null,
    reasonCodes,
  };
}
