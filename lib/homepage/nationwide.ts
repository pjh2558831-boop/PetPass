import { projectHomepageMarker } from "@/lib/homepage/homepage-progressive";
import { mapPlacesSnapshotBrowserClient } from "@/lib/map-places/snapshot-client";
import { mapCatalogPlaceToCategory } from "@/lib/map-places/place-categories";
import { getRegionConfig, getRegionDistrict } from "@/lib/regions/config";
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
