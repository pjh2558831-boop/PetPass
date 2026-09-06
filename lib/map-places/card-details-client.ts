import type { ApiResult } from "@/types/api";
import type { MapPlaceCardDetailsPage } from "@/types/map-place-card-details";
import type { MapPlacesSnapshotDataset } from "@/types/map-places-snapshot";
import type { RegionId } from "@/types/region";

export async function requestMapPlaceCardDetails(
  region: RegionId,
  dataset: MapPlacesSnapshotDataset,
  ids: readonly string[],
  signal: AbortSignal,
): Promise<MapPlaceCardDetailsPage> {
  const params = new URLSearchParams({
    version: "1",
    region,
    dataset,
    ids: ids.join(","),
  });
  const response = await fetch(`/api/map/places/cards?${params}`, {
    signal,
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  const body = await response.json() as ApiResult<MapPlaceCardDetailsPage>;
  const responseIds = body.ok ? new Set(body.data.items.map(({ id }) => id)) : null;
  if (!response.ok || !body.ok || body.data.region !== region ||
    body.data.dataset !== dataset || body.data.items.length !== ids.length ||
    ids.some((id) => !responseIds?.has(id))) {
    throw new Error("지도 장소 카드 정보를 확인하지 못했습니다.");
  }
  return body.data;
}
