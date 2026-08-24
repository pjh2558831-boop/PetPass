import {
  getHomepageCatalogDataset,
  type HomepageDatasetId,
} from "@/lib/homepage/catalog-datasets";
import { getRegionConfig } from "@/lib/regions/config";
import {
  HOMEPAGE_INITIAL_LAYERS,
  type HomepageInitialCategoryCountV1,
  type HomepageInitialLayer,
  type HomepageInitialMarkerV1,
} from "@/types/homepage-initial";
import { REGION_IDS, type RegionId } from "@/types/region";

export const HOMEPAGE_COMPLETION_VERSION = 1 as const;
export const HOMEPAGE_COMPLETION_DATASET = "default-map" as const;

export interface HomepageDatasetContinuationV1 {
  datasetId: HomepageDatasetId;
  layer: HomepageInitialLayer;
  provider: "tour" | "kakao";
  kind: "tourism_place" | "pet_travel_candidate" | "veterinary" | "pet_shop";
  loadedItemCount: number;
  expectedTotalCount: number;
  nextCursor: number | null;
  complete: boolean;
  generationId: string;
}

export interface HomepageCompletionRequest {
  version: typeof HOMEPAGE_COMPLETION_VERSION;
  region: RegionId;
  scope: "default";
  dataset: typeof HOMEPAGE_COMPLETION_DATASET;
  baseDataVersion: string;
  generationId: string;
  continuations: HomepageDatasetContinuationV1[];
}

export interface HomepageCompletionSnapshot {
  contractVersion: typeof HOMEPAGE_COMPLETION_VERSION;
  region: RegionId;
  scope: "default";
  dataset: typeof HOMEPAGE_COMPLETION_DATASET;
  baseDataVersion: string;
  generationId: string;
  generatedAt: string;
  returnedItemCount: number;
  expectedTotalCount: number;
  complete: boolean;
  freshness: { status: "fresh" | "stale"; staleAt?: string };
  continuations: HomepageDatasetContinuationV1[];
  categoryCounts: HomepageInitialCategoryCountV1[];
  markers: HomepageInitialMarkerV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isHash(value: unknown, prefix: "v1" | "g1"): value is string {
  return typeof value === "string" && new RegExp(`^${prefix}-[a-f0-9]{16}$`, "u").test(value);
}

export function isHomepageDatasetContinuation(
  value: unknown,
  regionId: RegionId,
  scope: "default" | "optional" = "default",
): value is HomepageDatasetContinuationV1 {
  if (!isRecord(value)) return false;
  const region = getRegionConfig(regionId);
  const dataset = region ? getHomepageCatalogDataset(region, String(value.datasetId)) : null;
  return Boolean(
    dataset && dataset.scope === scope &&
    value.layer === dataset.layer &&
    value.provider === dataset.provider &&
    value.kind === dataset.kind &&
    isCount(value.loadedItemCount) &&
    isCount(value.expectedTotalCount) &&
    Number(value.loadedItemCount) <= Number(value.expectedTotalCount) &&
    (value.nextCursor === null || (Number.isInteger(value.nextCursor) && Number(value.nextCursor) > 0)) &&
    typeof value.complete === "boolean" &&
    value.complete === (value.loadedItemCount === value.expectedTotalCount) &&
    (value.complete || value.nextCursor !== null) &&
    isHash(value.generationId, "g1"),
  );
}

function isMarker(value: unknown): value is HomepageInitialMarkerV1 {
  if (!Array.isArray(value) || value.length !== 9) return false;
  const [id, name, layer, category, district, latitude, longitude, verdict, label] = value;
  return typeof id === "string" && id.length > 0 &&
    typeof name === "string" && name.length > 0 &&
    HOMEPAGE_INITIAL_LAYERS.includes(layer as HomepageInitialLayer) &&
    typeof category === "string" &&
    (district === null || typeof district === "string") &&
    typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    ["allowed", "conditional", "not_allowed", "unknown"].includes(String(verdict)) &&
    typeof label === "string" && label.length > 0 &&
    (layer === "tourism" ? id.startsWith("tour:") : id.startsWith("kakao:"));
}

export function isHomepageCompletionSnapshot(value: unknown): value is HomepageCompletionSnapshot {
  if (!isRecord(value) || value.contractVersion !== HOMEPAGE_COMPLETION_VERSION) return false;
  if (!REGION_IDS.includes(value.region as RegionId) || value.scope !== "default" || value.dataset !== HOMEPAGE_COMPLETION_DATASET) return false;
  const region = value.region as RegionId;
  if (!isHash(value.baseDataVersion, "v1") || !isHash(value.generationId, "g1")) return false;
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) return false;
  if (!isCount(value.returnedItemCount) || !isCount(value.expectedTotalCount) || typeof value.complete !== "boolean") return false;
  if (!isRecord(value.freshness) || !["fresh", "stale"].includes(String(value.freshness.status))) return false;
  if (!Array.isArray(value.continuations) || !value.continuations.every((entry) => isHomepageDatasetContinuation(entry, region))) return false;
  if (new Set(value.continuations.map((entry) => entry.datasetId)).size !== value.continuations.length) return false;
  if (!value.continuations.every((entry) => entry.generationId === value.generationId)) return false;
  if (!Array.isArray(value.markers) || !value.markers.every(isMarker) || value.markers.length !== value.returnedItemCount) return false;
  if (new Set(value.markers.map((marker) => marker[0])).size !== value.markers.length) return false;
  const allowedLayers = new Set(value.continuations.map((entry) => entry.layer));
  if (!value.markers.every((marker) => allowedLayers.has(marker[2]))) return false;
  if (!Array.isArray(value.categoryCounts)) return false;
  const expectedTotal = value.continuations.reduce((sum, entry) => sum + entry.expectedTotalCount, 0);
  if (expectedTotal !== value.expectedTotalCount) return false;
  return value.complete === value.continuations.every((entry) => entry.complete);
}
