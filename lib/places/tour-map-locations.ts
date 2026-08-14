import {
  isValidMapCoordinates,
  type KakaoMapLocation,
} from "@/lib/kakao/maps";
import type { TourPlaceSummary } from "@/types/place";

export interface OfficialTourMapLocationOptions {
  includeShopping?: boolean;
  requireExposed?: boolean;
}

export function createOfficialTourMapLocations(
  places: readonly TourPlaceSummary[],
  {
    includeShopping = false,
    requireExposed = true,
  }: OfficialTourMapLocationOptions = {},
): KakaoMapLocation[] {
  const seenContentIds = new Set<string>();
  const locations: KakaoMapLocation[] = [];

  for (const place of places) {
    if (seenContentIds.has(place.contentId)) continue;
    if (requireExposed && place.providerVisibility?.status !== "exposed") continue;
    if (!includeShopping && place.category === "shopping") continue;

    const coordinates = {
      latitude: place.latitude ?? Number.NaN,
      longitude: place.longitude ?? Number.NaN,
    };
    if (!isValidMapCoordinates(coordinates)) continue;

    seenContentIds.add(place.contentId);
    locations.push({
      id: place.contentId,
      name: place.title ?? "이름 미확인",
      address:
        [place.address, place.detailAddress].filter(Boolean).join(" ") ||
        "주소 미확인",
      coordinates,
      markerKind: "tourism-official",
      markerLabel: "공",
      sourceLabel: "한국관광공사 제공 장소",
      interactive: true,
      clusterable: true,
    });
  }

  return locations;
}
