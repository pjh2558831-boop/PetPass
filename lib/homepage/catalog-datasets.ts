import type { PlaceCategory } from "@/lib/map-places/place-categories";
import type { RegionConfig } from "@/lib/regions/config";
import type {
  PublicMapPlaceKind,
  PublicMapPlaceProvider,
} from "@/types/public-map-place";
import type { HomepageInitialLayer } from "@/types/homepage-initial";

export const HOMEPAGE_DATASET_CONTRACT_VERSION = 1 as const;
export const HOMEPAGE_CATALOG_PAGE_SIZE = 200;

export type HomepageDatasetId =
  | "default-tour"
  | "default-kakao"
  | "optional-veterinary"
  | "optional-pet-shop";

export interface HomepageCatalogDatasetDescriptor {
  contractVersion: typeof HOMEPAGE_DATASET_CONTRACT_VERSION;
  id: HomepageDatasetId;
  scope: "default" | "optional";
  provider: PublicMapPlaceProvider;
  kind: PublicMapPlaceKind;
  layer: HomepageInitialLayer;
  categories: readonly PlaceCategory[];
  defaultMap: boolean;
  optional: boolean;
  mayPrefetch: boolean;
  requiresThirdParty: boolean;
  freshnessMs: number;
  staleIfErrorMs: number;
  completionStrategy: "cursor";
  pageSize: number;
  capability: "map" | "kakao-discovery";
}

const DATASETS = [
  {
    id: "default-tour",
    scope: "default",
    provider: "tour",
    kind: "tourism_place",
    layer: "tourism",
    categories: [],
    defaultMap: true,
    optional: false,
    mayPrefetch: false,
    requiresThirdParty: false,
    capability: "map",
  },
  {
    id: "default-kakao",
    scope: "default",
    provider: "kakao",
    kind: "pet_travel_candidate",
    layer: "kakao",
    categories: [],
    defaultMap: true,
    optional: false,
    mayPrefetch: false,
    requiresThirdParty: false,
    capability: "kakao-discovery",
  },
  {
    id: "optional-veterinary",
    scope: "optional",
    provider: "kakao",
    kind: "veterinary",
    layer: "veterinary",
    categories: ["veterinary"],
    defaultMap: false,
    optional: true,
    mayPrefetch: true,
    requiresThirdParty: false,
    capability: "kakao-discovery",
  },
  {
    id: "optional-pet-shop",
    scope: "optional",
    provider: "kakao",
    kind: "pet_shop",
    layer: "pet_shop",
    categories: ["pet_shop"],
    defaultMap: false,
    optional: true,
    mayPrefetch: true,
    requiresThirdParty: false,
    capability: "kakao-discovery",
  },
] as const satisfies ReadonlyArray<
  Omit<HomepageCatalogDatasetDescriptor,
    "contractVersion" | "freshnessMs" | "staleIfErrorMs" | "completionStrategy" | "pageSize">
>;

function capabilityEnabled(
  region: RegionConfig<string>,
  capability: HomepageCatalogDatasetDescriptor["capability"],
): boolean {
  return capability === "map" ? region.mapEnabled : region.kakaoDiscoveryEnabled;
}

export function getHomepageCatalogDatasets(
  region: RegionConfig<string>,
  scope?: HomepageCatalogDatasetDescriptor["scope"],
): HomepageCatalogDatasetDescriptor[] {
  return DATASETS
    .filter((dataset) => (!scope || dataset.scope === scope) && capabilityEnabled(region, dataset.capability))
    .map((dataset) => ({
      ...dataset,
      contractVersion: HOMEPAGE_DATASET_CONTRACT_VERSION,
      freshnessMs: 300_000,
      staleIfErrorMs: 3_600_000,
      completionStrategy: "cursor",
      pageSize: HOMEPAGE_CATALOG_PAGE_SIZE,
    }));
}

export function getHomepageCatalogDataset(
  region: RegionConfig<string>,
  datasetId: string,
): HomepageCatalogDatasetDescriptor | null {
  return getHomepageCatalogDatasets(region).find(({ id }) => id === datasetId) ?? null;
}

export function homepageDatasetCacheKey(
  region: RegionConfig<string>,
  dataset: HomepageCatalogDatasetDescriptor,
): string {
  const providers = [dataset.provider].sort().join(",");
  const categories = [...dataset.categories].sort().join(",") || "all";
  return [
    dataset.contractVersion,
    region.id,
    dataset.scope,
    dataset.id,
    providers,
    categories,
  ].join(":");
}
