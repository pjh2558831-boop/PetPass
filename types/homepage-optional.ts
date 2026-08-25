import { getHomepageCatalogDataset } from "@/lib/homepage/catalog-datasets";
import { getRegionConfig } from "@/lib/regions/config";
import {
  isHomepageInitialPlacesSnapshot,
  type HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";
import { REGION_IDS, type RegionId } from "@/types/region";

export const HOMEPAGE_OPTIONAL_VERSION = 1 as const;
export const HOMEPAGE_OPTIONAL_DATASETS = [
  "optional-kto-shopping",
  "optional-veterinary",
  "optional-pet-shop",
] as const;
export const HOMEPAGE_STORED_OPTIONAL_DATASETS = [
  "optional-veterinary",
  "optional-pet-shop",
] as const;
export type HomepageOptionalDatasetId =
  (typeof HOMEPAGE_OPTIONAL_DATASETS)[number];
export type HomepageStoredOptionalDatasetId =
  (typeof HOMEPAGE_STORED_OPTIONAL_DATASETS)[number];

export type HomepageOptionalDatasetStatus =
  | "complete"
  | "complete_empty"
  | "stale";

export interface HomepageOptionalIntegrity {
  dataHash: string;
  expectedItemCount: number;
  returnedItemCount: number;
  providerTotalCount: number;
  visibilityTotalCount: number | null;
  pageCount: number;
  visibilityPageCount: number | null;
  pageSize: number;
  nextCursor: number | null;
  traversalComplete: boolean;
}

export function homepageOptionalDataHash(input: Pick<
  HomepageOptionalSnapshot,
  "region" | "dataset" | "providers" | "markers"
>): string {
  const value = `${input.region}:${input.dataset}:${input.providers}:${JSON.stringify(input.markers)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `h1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export interface HomepageOptionalRequest {
  version: typeof HOMEPAGE_OPTIONAL_VERSION;
  region: RegionId;
  scope: "optional";
  dataset: HomepageOptionalDatasetId;
}

export interface HomepageOptionalSnapshot extends HomepageInitialPlacesSnapshot {
  scope: "optional";
  providers: "tour" | "kakao";
  dataset: HomepageOptionalDatasetId;
  status: HomepageOptionalDatasetStatus;
  retrievedAt: string;
  integrity: HomepageOptionalIntegrity;
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isHomepageOptionalSnapshot(value: unknown): value is HomepageOptionalSnapshot {
  if (!isHomepageInitialPlacesSnapshot(value) || value.scope !== "optional" ||
    !["tour", "kakao"].includes(value.providers)) return false;
  const datasetId = (value as { dataset?: unknown }).dataset;
  if (typeof datasetId !== "string" ||
    !HOMEPAGE_OPTIONAL_DATASETS.includes(datasetId as HomepageOptionalDatasetId) ||
    !REGION_IDS.includes(value.region as RegionId)) return false;
  const region = getRegionConfig(value.region);
  const descriptor = region ? getHomepageCatalogDataset(region, datasetId) : null;
  if (!descriptor || descriptor.scope !== "optional") return false;
  if (value.providers !== descriptor.provider) return false;
  const candidate = value as HomepageOptionalSnapshot;
  if (!["complete", "complete_empty", "stale"].includes(candidate.status)) return false;
  if (typeof candidate.retrievedAt !== "string" || !Number.isFinite(Date.parse(candidate.retrievedAt))) return false;
  if (candidate.status === "stale" ? candidate.freshness.status !== "stale" : candidate.freshness.status !== "fresh") return false;
  if (candidate.status === "complete_empty" ? candidate.totalCount !== 0 :
    candidate.status === "complete" && candidate.totalCount === 0) return false;
  if (!isRecord(candidate.integrity) ||
    candidate.integrity.dataHash !== homepageOptionalDataHash(candidate) ||
    !isCount(candidate.integrity.expectedItemCount) || !isCount(candidate.integrity.returnedItemCount) ||
    !isCount(candidate.integrity.providerTotalCount) ||
    !(candidate.integrity.visibilityTotalCount === null || isCount(candidate.integrity.visibilityTotalCount)) ||
    !isCount(candidate.integrity.pageCount) || candidate.integrity.pageCount < 1 ||
    !(candidate.integrity.visibilityPageCount === null ||
      (isCount(candidate.integrity.visibilityPageCount) && candidate.integrity.visibilityPageCount >= 1)) ||
    !isCount(candidate.integrity.pageSize) || candidate.integrity.pageSize < 1 ||
    candidate.integrity.nextCursor !== null ||
    candidate.integrity.traversalComplete !== true ||
    candidate.integrity.expectedItemCount !== candidate.totalCount ||
    candidate.integrity.returnedItemCount !== candidate.totalCount ||
    candidate.markerCount !== candidate.totalCount ||
    candidate.integrity.providerTotalCount < candidate.integrity.returnedItemCount ||
    ((candidate.integrity.visibilityTotalCount === null) !==
      (candidate.integrity.visibilityPageCount === null)) ||
    (candidate.integrity.visibilityTotalCount !== null &&
      candidate.integrity.visibilityTotalCount < candidate.integrity.returnedItemCount) ||
    candidate.integrity.pageCount !== Math.max(
      1,
      Math.ceil(candidate.integrity.providerTotalCount / candidate.integrity.pageSize),
    ) ||
    (candidate.integrity.visibilityTotalCount !== null &&
      candidate.integrity.visibilityPageCount !== Math.max(
        1,
        Math.ceil(candidate.integrity.visibilityTotalCount / candidate.integrity.pageSize),
      ))) return false;
  const targetLayer = descriptor.layer;
  if (value.continuations.length !== 1 || value.continuations[0].datasetId !== datasetId ||
    !value.continuations[0].complete || value.continuations[0].layer !== targetLayer ||
    value.continuations[0].provider !== descriptor.provider ||
    value.continuations[0].kind !== descriptor.kind ||
    value.continuations[0].nextCursor !== candidate.integrity.nextCursor) return false;
  if (value.markers.some((marker) => marker[2] !== targetLayer ||
    !descriptor.categories.includes(marker[3]))) return false;
  if (value.categoryCounts.reduce((total, [layer, category, count]) =>
    total + (layer === targetLayer && descriptor.categories.includes(category) ? count : 0), 0) !==
    value.totalCount) return false;
  if (Object.entries(value.layers).some(([layer, state]) =>
    layer !== targetLayer &&
    (state.state !== "deferred" || state.count !== null || state.markerCount !== null))) return false;
  return value.layers[targetLayer].state === (value.totalCount === 0 ? "empty" : "ready") &&
    value.layers[targetLayer].count === value.totalCount &&
    value.layers[targetLayer].markerCount === value.markerCount;
}
