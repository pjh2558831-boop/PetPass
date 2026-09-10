import type { KakaoCurrentMapSearch } from "@/types/kakao";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import { projectHomepageMarker } from "@/lib/homepage/homepage-progressive";
import { mapPlacesSnapshotBrowserClient } from "@/lib/map-places/snapshot-client";
import { mapCatalogPlaceToCategory } from "@/lib/map-places/place-categories";
import { getRegionConfig, getRegionDistrict, getMapEnabledRegionConfigs } from "@/lib/regions/config";
import type { HomepageMapMarker } from "@/types/homepage-places";
import type { MapPlacesSnapshot, MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { RegionId } from "@/types/region";

export async function loadNationwideSnapshots(
  regions: readonly RegionId[],
  signal: AbortSignal,
  onLoaded: (region: RegionId, snapshot: MapPlacesSnapshot) => void,
  onFailed: (region: RegionId) => void,
  load = (region: RegionId, signal: AbortSignal) => mapPlacesSnapshotBrowserClient.load(region, "core", signal),
): Promise<void> {
  const queue = [...regions];
  const worker = async () => {
    while (queue.length && !signal.aborted) {
      const region = queue.shift()!;
      try {
        const snapshot = await load(region, signal);
        if (!signal.aborted) onLoaded(region, snapshot);
      } catch {
        if (!signal.aborted) onFailed(region);
      }
    }
  };
  await Promise.all([worker(), worker()]);
}

export function projectNationwideMarker(item: MapPlacesSnapshotMarker): HomepageMapMarker | null {
  if (!item.coordinates) return null;
  const region = getRegionConfig(item.regionId);
  const district = item.districtName ?? getRegionDistrict(region, item.districtCode)?.name;
  const marker = projectHomepageMarker([
    item.id, item.name, item.layer, mapCatalogPlaceToCategory(item),
    [region.displayName, district].filter(Boolean).join(" "),
    item.coordinates.latitude, item.coordinates.longitude, item.petAccessVerdict, item.publicLabel,
  ], item.regionId);
  return {
    ...marker,
    regionId: item.regionId,
    address: item.address || marker.address,
    imageUrl: item.imageUrl ?? null,
    isAllowed: item.layer === "tourism" && item.petAccessVerdict === "allowed",
    statusLabel: [item.layer === "kakao"
      ? item.petAccessVerdict === "conditional" ? "조건 확인 필요" : "동반 여부 확인 필요"
      : item.publicLabel, item.petConditions,
      item.layer === "kakao" ? "방문 전 확인 필요" : null].filter(Boolean).join(" · "),
  };
}


export const HOMEPAGE_MAP_REGIONS = getMapEnabledRegionConfigs().filter(region => region.mapCatalog.snapshotDatasets.includes("core"));
export const HOMEPAGE_NATIONWIDE_BOUNDS = { west: 125.5, south: 33.0, east: 130.0, north: 38.6 };
export const HOMEPAGE_REGION_LOCATIONS: KakaoMapLocation[] = HOMEPAGE_MAP_REGIONS.map(region => ({
  id: `region:${region.id}`, name: `${region.displayName} 확대`, address: region.displayName,
  coordinates: region.defaultMapCenter, markerKind: "region", markerLabel: region.displayName,
  sourceLabel: "지역 선택", clusterable: false,
}));

export function homepageRegionForViewport(viewport: KakaoCurrentMapSearch, level?: number): RegionId | null {
  const { center, rectangle } = viewport;
  if (level !== undefined ? level > 11 : Math.max(rectangle.east - rectangle.west, rectangle.north - rectangle.south) > 2.5) return null;
  // ponytail: approximate region rectangles; use administrative polygons if boundary precision is needed.
  // Prefer the nearest configured center in overlaps; explicit region selection remains available.
  const candidates = HOMEPAGE_MAP_REGIONS.filter(({ mapBounds: bounds }) =>
    center.longitude >= bounds.west && center.longitude <= bounds.east && center.latitude >= bounds.south && center.latitude <= bounds.north);
  const distance = (region: typeof candidates[number]) =>
    (region.defaultMapCenter.latitude - center.latitude) ** 2 + (region.defaultMapCenter.longitude - center.longitude) ** 2;
  return candidates.sort((a, b) => distance(a) - distance(b))[0]?.id ?? null;
}
