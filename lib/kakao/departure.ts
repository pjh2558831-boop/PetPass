import "server-only";

import { geocodeAddress, searchKakaoPlaces } from "@/lib/kakao/local";
import type {
  KakaoDepartureSearchResult,
  KakaoGeocodeResult,
  KakaoPlaceSearchResult,
} from "@/types/kakao";

interface DepartureSearchDependencies {
  searchPlaces?: typeof searchKakaoPlaces;
  geocode?: typeof geocodeAddress;
}

function coordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
}

function fromPlace(place: KakaoPlaceSearchResult): KakaoDepartureSearchResult {
  return {
    id: `place:${place.id}`,
    kind: "place",
    label: place.name,
    address: place.roadAddress?.trim() || place.address,
    coordinates: place.coordinates,
  };
}

function fromAddress(
  address: KakaoGeocodeResult,
  index: number,
): KakaoDepartureSearchResult {
  return {
    id: `address:${index}:${coordinateKey(
      address.coordinates.latitude,
      address.coordinates.longitude,
    )}`,
    kind: "address",
    label: address.roadAddress?.trim() || address.address,
    address: address.address,
    coordinates: address.coordinates,
  };
}

export async function searchDepartureLocations(
  query: string,
  size = 5,
  dependencies: DepartureSearchDependencies = {},
): Promise<KakaoDepartureSearchResult[]> {
  const searchPlaces = dependencies.searchPlaces ?? searchKakaoPlaces;
  const geocode = dependencies.geocode ?? geocodeAddress;
  const [placesResult, addressesResult] = await Promise.allSettled([
    searchPlaces({ query, page: 1, size }),
    geocode(query, size),
  ]);

  if (placesResult.status === "rejected" && addressesResult.status === "rejected") {
    throw placesResult.reason;
  }

  const combined = [
    ...(placesResult.status === "fulfilled"
      ? placesResult.value.map(fromPlace)
      : []),
    ...(addressesResult.status === "fulfilled"
      ? addressesResult.value.map(fromAddress)
      : []),
  ];
  const seen = new Set<string>();

  return combined.filter((result) => {
    const key = coordinateKey(
      result.coordinates.latitude,
      result.coordinates.longitude,
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, size);
}
