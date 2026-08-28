import {
  coordinatesInRegion,
  getRegionDistrict,
  type RegionConfig,
} from "@/lib/regions/config";
import type {
  PublicMapPlaceCategory,
  PublicMapPlaceDTO,
} from "@/types/public-map-place";
import type { TourContentTypeId } from "@/types/place";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";

const KTO_CONTENT_TYPE_IDS = new Set<TourContentTypeId>([
  "12",
  "14",
  "15",
  "28",
  "32",
  "38",
  "39",
]);

export function isSupportedKtoContentTypeId(
  value: string | null | undefined,
): value is TourContentTypeId {
  return typeof value === "string" && KTO_CONTENT_TYPE_IDS.has(value as TourContentTypeId);
}

export function ktoContentTypeCategory(
  contentTypeId: TourContentTypeId,
): PublicMapPlaceCategory {
  if (contentTypeId === "32") return "accommodation";
  if (contentTypeId === "38") return "shopping";
  if (contentTypeId === "39") return "food";
  return "attraction";
}

export function publicMapPlaceMatchesRegion(
  place: PublicMapPlaceDTO,
  region: RegionConfig,
): boolean {
  if (!region.allowedMapProviders.includes(place.provider ?? "kakao")) return false;
  if (place.id !== `${place.provider}:${place.providerPlaceId}`) return false;
  const district = getRegionDistrict(region, place.district.code);
  if (!district || district.name !== place.district.name) return false;
  if (!coordinatesInRegion(region, place.coordinates)) return false;

  if (place.provider === "tour") {
    if (
      place.kind !== "tourism_place" ||
      place.source !== "kto_official"
    ) return false;
    if (isSupportedKtoContentTypeId(place.contentTypeId)) {
      return place.category === ktoContentTypeCategory(place.contentTypeId);
    }
    return place.category === "other" &&
      place.placeUrl === null &&
      place.petAccessVerdict === "unknown" &&
      place.reviewStatus === "needs_review" &&
      place.publicLabel === "반려동물 동반 정보 확인 필요";
  }

  return place.source === "kakao_search_candidate" &&
    place.kind !== "tourism_place" &&
    place.contentTypeId === null;
}

export function snapshotMarkerMatchesRegion(
  marker: MapPlacesSnapshotMarker,
  region: RegionConfig,
): boolean {
  const provider = marker.layer === "tourism" ? "tour" : "kakao";
  if (!region.allowedMapProviders.includes(provider)) return false;
  if (marker.id !== `${provider}:${marker.providerPlaceId}`) return false;
  if (!marker.coordinates || !coordinatesInRegion(region, marker.coordinates)) return false;
  if (!marker.districtCode || !marker.districtName) return false;
  const district = getRegionDistrict(region, marker.districtCode);
  if (!district || district.name !== marker.districtName) return false;
  if (marker.layer === "tourism") {
    if (marker.category === "shopping" || marker.category === "other") {
      return marker.placeUrl === null &&
        marker.petAccessVerdict === "unknown" &&
        marker.publicLabel === "반려동물 동반 정보 확인 필요";
    }
    if (!marker.placeUrl?.startsWith("/places/")) return false;
    try {
      return new URL(marker.placeUrl, "https://petpass.local").searchParams.get("region") === region.id;
    } catch {
      return false;
    }
  }
  return marker.sourceLabel === "카카오 검색 후보";
}
