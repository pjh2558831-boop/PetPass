import { getHomepageCatalogDataset } from "@/lib/homepage/catalog-datasets";
import { getRegionConfig } from "@/lib/regions/config";
import {
  isHomepageInitialPlacesSnapshot,
  type HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";
import { REGION_IDS, type RegionId } from "@/types/region";

export const HOMEPAGE_OPTIONAL_VERSION = 1 as const;
export const HOMEPAGE_STORED_OPTIONAL_DATASETS = [
  "optional-veterinary",
  "optional-pet-shop",
] as const;
export type HomepageStoredOptionalDatasetId =
  (typeof HOMEPAGE_STORED_OPTIONAL_DATASETS)[number];

export interface HomepageOptionalRequest {
  version: typeof HOMEPAGE_OPTIONAL_VERSION;
  region: RegionId;
  scope: "optional";
  dataset: HomepageStoredOptionalDatasetId;
}

export interface HomepageOptionalSnapshot extends HomepageInitialPlacesSnapshot {
  scope: "optional";
  providers: "kakao";
  dataset: HomepageStoredOptionalDatasetId;
}

export function isHomepageOptionalSnapshot(value: unknown): value is HomepageOptionalSnapshot {
  if (!isHomepageInitialPlacesSnapshot(value) || value.scope !== "optional" || value.providers !== "kakao") return false;
  const datasetId = (value as { dataset?: unknown }).dataset;
  if (typeof datasetId !== "string" ||
    !HOMEPAGE_STORED_OPTIONAL_DATASETS.includes(datasetId as HomepageStoredOptionalDatasetId) ||
    !REGION_IDS.includes(value.region as RegionId)) return false;
  const region = getRegionConfig(value.region);
  const descriptor = region ? getHomepageCatalogDataset(region, datasetId) : null;
  if (!descriptor || descriptor.scope !== "optional") return false;
  const targetLayer = descriptor.layer;
  if (value.continuations.length !== 1 || value.continuations[0].datasetId !== datasetId ||
    !value.continuations[0].complete || value.continuations[0].layer !== targetLayer) return false;
  if (value.markers.some((marker) => marker[2] !== targetLayer)) return false;
  return value.layers[targetLayer].state === (value.totalCount === 0 ? "empty" : "ready") &&
    value.layers[targetLayer].count === value.totalCount &&
    value.layers[targetLayer].markerCount === value.markerCount;
}
