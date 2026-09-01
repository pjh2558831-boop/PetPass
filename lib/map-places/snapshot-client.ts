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

function parseSnapshotEnvelope(
  value: unknown,
): { ok: true; data: MapPlacesSnapshot } | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data) ||
    !Array.isArray(value.data.items)) return null;
  const region = value.data.region;
  const dataset = value.data.dataset;
  const items = value.data.items.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return item;
    const separator = item.id.indexOf(":");
    const providerPlaceId = separator >= 0 ? item.id.slice(separator + 1) : "";
    const petConditions = typeof item.petConditions === "string"
      ? item.petConditions.trim() || null
      : null;
    return {
      ...item,
      regionId: region,
      providerPlaceId,
      dataset,
      sourceLabel: item.layer === "tourism" ? "한국관광공사" : "카카오 검색 후보",
      ...(petConditions ? { petConditions } : {}),
      ...(item.verificationRequired === true ? { verificationRequired: true } : {}),
    };
  });
  const data = { ...value.data, items };
  return isMapPlacesSnapshot(data) ? { ok: true, data } : null;
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
  const envelope = response.ok ? parseSnapshotEnvelope(body) : null;
  recordMapExplorerMetric("contract_validation", validationStartedAt);
  if (!envelope) {
    throw new Error("지도 장소 스냅샷을 확인하지 못했습니다.");
  }
  if (envelope.data.region !== region) throw new Error("지도 장소 스냅샷 지역이 일치하지 않습니다.");
  if (envelope.data.dataset !== dataset) throw new Error("지도 장소 스냅샷 데이터셋이 일치하지 않습니다.");
  const regionConfig = getRegionConfig(region);
  if (envelope.data.items.some((marker) => !snapshotMarkerMatchesRegion(marker, regionConfig))) {
    throw new Error("지도 장소 스냅샷의 지역 계약이 일치하지 않습니다.");
  }
  recordMapExplorerMetric("complete_snapshot", requestStartedAt);
  return envelope.data;
}

interface BrowserSnapshotEntry {
  value?: MapPlacesSnapshot;
  storedAt?: number;
  lastAccessedAt?: number;
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
  now = Date.now,
  freshMs = 300_000,
  maxCompletedEntries = 4,
  maxCachedMarkers = 12_000,
}: {
  request?: typeof fetch;
  now?: () => number;
  freshMs?: number;
  maxCompletedEntries?: number;
  maxCachedMarkers?: number;
} = {}) {
  const entries = new Map<string, BrowserSnapshotEntry>();
  let accessSequence = 0;

  const trimCompletedEntries = () => {
    const completed = [...entries.entries()]
      .filter(([, entry]) => entry.value && !entry.inFlight)
      .sort((left, right) =>
        (left[1].lastAccessedAt ?? left[1].storedAt ?? 0) -
        (right[1].lastAccessedAt ?? right[1].storedAt ?? 0));
    let markerCount = completed.reduce(
      (total, [, entry]) => total + (entry.value?.items.length ?? 0),
      0,
    );
    while (completed.length > 1 && (
      completed.length > Math.max(1, maxCompletedEntries) ||
      markerCount > Math.max(1, maxCachedMarkers)
    )) {
      const oldest = completed.shift();
      if (!oldest) break;
      markerCount -= oldest[1].value?.items.length ?? 0;
      if (entries.get(oldest[0]) === oldest[1]) entries.delete(oldest[0]);
    }
  };

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
      if (entry?.value && entry.storedAt !== undefined && now() - entry.storedAt <= freshMs) {
        entry.lastAccessedAt = ++accessSequence;
        return Promise.resolve(entry.value);
      }
      if (entry?.value && !entry.inFlight) {
        entries.delete(key);
        entry = undefined;
      }
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
            current.storedAt = now();
            current.lastAccessedAt = ++accessSequence;
            current.inFlight = undefined;
            current.controller = undefined;
            trimCompletedEntries();
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
