export type MapExplorerMetric =
  | "snapshot_request"
  | "complete_snapshot"
  | "json_parse"
  | "contract_validation"
  | "index_construction"
  | "react_commit"
  | "first_useful_cards"
  | "warm_filter_feedback"
  | "warm_region_revisit";

function metricAttribute(metric: MapExplorerMetric): string {
  return `map${metric.split("_").map((part) =>
    `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join("")}Ms`;
}

export function recordMapExplorerMetric(
  metric: MapExplorerMetric,
  startedAt: number,
): number {
  const duration = Math.max(0, performance.now() - startedAt);
  if (typeof document !== "undefined") {
    document.documentElement.dataset[metricAttribute(metric)] = duration.toFixed(2);
  }
  try {
    performance.measure(`petpass:map:${metric}`, { start: startedAt, duration });
  } catch {
    // Dataset values remain available when PerformanceMeasure options are unsupported.
  }
  return duration;
}

export function recordMapSnapshotBytes(rawBytes: number, compressedBytes: number | null): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mapSnapshotRawBytes = String(rawBytes);
  if (compressedBytes !== null) {
    document.documentElement.dataset.mapSnapshotCompressedBytes = String(compressedBytes);
  } else {
    delete document.documentElement.dataset.mapSnapshotCompressedBytes;
  }
}

export function incrementMapSnapshotRequestCount(): void {
  if (typeof document === "undefined") return;
  const current = Number(document.documentElement.dataset.mapSnapshotRequestCount ?? "0");
  document.documentElement.dataset.mapSnapshotRequestCount = String(current + 1);
}

export function buildMeasuredMapPlaceIndex<T extends { id: string }>(
  places: readonly T[],
): Map<string, number> {
  const startedAt = performance.now();
  const index = new Map(places.map((place, itemIndex) => [place.id, itemIndex]));
  recordMapExplorerMetric("index_construction", startedAt);
  return index;
}
