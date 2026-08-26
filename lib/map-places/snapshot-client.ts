import { isMapPlacesSnapshot, type MapPlacesSnapshot } from "@/types/map-places-snapshot";
import { getRegionConfig } from "@/lib/regions/config";
import { snapshotMarkerMatchesRegion } from "@/lib/map-places/region-contract";
import {
  incrementMapSnapshotRequestCount,
  recordMapExplorerMetric,
  recordMapSnapshotBytes,
} from "@/lib/map-places/browser-performance";
import type { RegionId } from "@/types/region";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSnapshotEnvelope(
  value: unknown,
): value is { ok: true; data: MapPlacesSnapshot } {
  return isRecord(value) && value.ok === true && isMapPlacesSnapshot(value.data);
}

export async function requestMapPlacesSnapshot(
  region: RegionId,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<MapPlacesSnapshot> {
  const requestStartedAt = performance.now();
  incrementMapSnapshotRequestCount();
  const params = new URLSearchParams({ version: "1", region, scope: "default" });
  const response = await request(`/api/map/places/snapshot?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const rawBody = await response.text();
  recordMapExplorerMetric("snapshot_request", requestStartedAt);
  const contentLength = response.headers.get("content-length");
  recordMapSnapshotBytes(
    new TextEncoder().encode(rawBody).byteLength,
    contentLength !== null && Number.isFinite(Number(contentLength))
      ? Number(contentLength)
      : null,
  );
  const parseStartedAt = performance.now();
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    recordMapExplorerMetric("json_parse", parseStartedAt);
    throw new Error("지도 장소 스냅샷 JSON을 확인하지 못했습니다.");
  }
  recordMapExplorerMetric("json_parse", parseStartedAt);
  const validationStartedAt = performance.now();
  const validEnvelope = response.ok && isSnapshotEnvelope(body);
  recordMapExplorerMetric("contract_validation", validationStartedAt);
  if (!validEnvelope || !isSnapshotEnvelope(body)) {
    throw new Error("지도 장소 스냅샷을 확인하지 못했습니다.");
  }
  if (body.data.region !== region) throw new Error("지도 장소 스냅샷 지역이 일치하지 않습니다.");
  const regionConfig = getRegionConfig(region);
  if (body.data.items.some((marker) => !snapshotMarkerMatchesRegion(marker, regionConfig))) {
    throw new Error("지도 장소 스냅샷의 지역 계약이 일치하지 않습니다.");
  }
  recordMapExplorerMetric("complete_snapshot", requestStartedAt);
  return body.data;
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
