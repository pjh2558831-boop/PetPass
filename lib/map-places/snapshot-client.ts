import {
  MAP_PLACES_SNAPSHOT_VERSION,
  isMapPlacesSnapshot,
  type MapPlacesSnapshot,
  type MapPlacesSnapshotDataset,
} from "@/types/map-places-snapshot";
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
  dataset: MapPlacesSnapshotDataset,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<MapPlacesSnapshot> {
  const requestStartedAt = performance.now();
  incrementMapSnapshotRequestCount();
  const params = new URLSearchParams({
    version: String(MAP_PLACES_SNAPSHOT_VERSION),
    region,
    scope: "default",
    dataset,
  });
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
  if (body.data.dataset !== dataset) throw new Error("지도 장소 스냅샷 데이터셋이 일치하지 않습니다.");
  const regionConfig = getRegionConfig(region);
  if (body.data.items.some((marker) => !snapshotMarkerMatchesRegion(marker, regionConfig))) {
    throw new Error("지도 장소 스냅샷의 지역 계약이 일치하지 않습니다.");
  }
  recordMapExplorerMetric("complete_snapshot", requestStartedAt);
  return body.data;
}

interface BrowserSnapshotEntry {
  value?: MapPlacesSnapshot;
  inFlight?: Promise<MapPlacesSnapshot>;
  controller?: AbortController;
  subscribers: Set<symbol>;
}

function abortError(): Error {
  if (typeof DOMException !== "undefined") return new DOMException("Aborted", "AbortError");
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function browserSnapshotKey(region: RegionId, dataset: MapPlacesSnapshotDataset): string {
  const config = getRegionConfig(region);
  const providers = dataset === "shopping"
    ? "tour"
    : config.allowedMapProviders.join(",");
  const categories = dataset === "shopping"
    ? "shopping"
    : config.mapCatalog.snapshotCategories?.join(",") ?? "all";
  return [
    MAP_PLACES_SNAPSHOT_VERSION,
    region,
    dataset,
    "scope=default",
    `providers=${providers}`,
    `categories=${categories}`,
    `fallback=${config.mapCatalog.fallbackSource}`,
  ].join(":");
}

export function createMapPlacesSnapshotBrowserClient({
  request = fetch,
}: {
  request?: typeof fetch;
} = {}) {
  const entries = new Map<string, BrowserSnapshotEntry>();

  return {
    load(
      region: RegionId,
      dataset: MapPlacesSnapshotDataset,
      signal: AbortSignal,
    ): Promise<MapPlacesSnapshot> {
      if (signal.aborted) return Promise.reject(abortError());
      const config = getRegionConfig(region);
      if (!config.mapCatalog.snapshotDatasets.includes(dataset)) {
        return Promise.reject(new Error("지도 장소 데이터셋이 활성화되지 않았습니다."));
      }
      const key = browserSnapshotKey(region, dataset);
      let entry = entries.get(key);
      if (entry?.value) return Promise.resolve(entry.value);
      if (!entry) {
        entry = { subscribers: new Set<symbol>() };
        const controller = new AbortController();
        entry.controller = controller;
        entries.set(key, entry);
        const current = entry;
        current.inFlight = requestMapPlacesSnapshot(
          region,
          dataset,
          controller.signal,
          request,
        ).then((snapshot) => {
          if (controller.signal.aborted) throw abortError();
          if (entries.get(key) === current) {
            current.value = snapshot;
            current.inFlight = undefined;
            current.controller = undefined;
          }
          return snapshot;
        }).catch((error: unknown) => {
          if (entries.get(key) === current) entries.delete(key);
          throw error;
        });
      }

      const current = entry;
      const token = Symbol(key);
      current.subscribers.add(token);
      return new Promise<MapPlacesSnapshot>((resolve, reject) => {
        let active = true;
        const release = () => {
          current.subscribers.delete(token);
          signal.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          if (!active) return;
          active = false;
          release();
          reject(abortError());
          if (current.subscribers.size === 0 && current.inFlight) {
            current.controller?.abort();
            if (entries.get(key) === current) entries.delete(key);
          }
        };
        signal.addEventListener("abort", onAbort, { once: true });
        current.inFlight!.then((snapshot) => {
          if (!active) return;
          active = false;
          release();
          resolve(snapshot);
        }, (error: unknown) => {
          if (!active) return;
          active = false;
          release();
          reject(error);
        });
      });
    },
  };
}

export const mapPlacesSnapshotBrowserClient = createMapPlacesSnapshotBrowserClient();

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
