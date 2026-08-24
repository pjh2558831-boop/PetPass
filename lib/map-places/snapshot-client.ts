import { isMapPlacesSnapshot, type MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { RegionId } from "@/types/region";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestMapPlacesSnapshot(
  region: RegionId,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<MapPlacesSnapshotMarker[]> {
  const params = new URLSearchParams({ version: "1", region, scope: "default" });
  const response = await request(`/api/map/places/snapshot?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body) || body.ok !== true || !isMapPlacesSnapshot(body.data)) {
    throw new Error("지도 장소 스냅샷을 확인하지 못했습니다.");
  }
  if (body.data.region !== region) throw new Error("지도 장소 스냅샷 지역이 일치하지 않습니다.");
  return body.data.items;
}

export async function loadSnapshotWithFallback<T>({
  requestSnapshot,
  requestFallback,
}: {
  requestSnapshot: () => Promise<T>;
  requestFallback: () => Promise<T>;
}): Promise<{ source: "snapshot" | "fallback"; items: T }> {
  try {
    return { source: "snapshot", items: await requestSnapshot() };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    return { source: "fallback", items: await requestFallback() };
  }
}
