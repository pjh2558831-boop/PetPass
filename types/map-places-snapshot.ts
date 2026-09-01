import type { PublicCatalogLayer } from "@/types/public-catalog-place";
import type {
  PublicMapPetAccessVerdict,
  PublicMapPlaceCategory,
  PublicMapPlaceProvider,
} from "@/types/public-map-place";
import { REGION_IDS, type RegionId } from "@/types/region";

export const MAP_PLACES_SNAPSHOT_VERSION = 1 as const;
export const MAP_PLACES_SNAPSHOT_SCOPES = ["default"] as const;
export const MAP_PLACES_SNAPSHOT_DATASETS = ["core", "shopping"] as const;
export type MapPlacesSnapshotScope = (typeof MAP_PLACES_SNAPSHOT_SCOPES)[number];
export type MapPlacesSnapshotDataset = (typeof MAP_PLACES_SNAPSHOT_DATASETS)[number];

export interface MapPlacesSnapshotRequest {
  version: typeof MAP_PLACES_SNAPSHOT_VERSION;
  region: RegionId;
  scope: MapPlacesSnapshotScope;
  dataset: MapPlacesSnapshotDataset;
}

export interface MapPlacesSnapshotMarker {
  id: string;
  regionId: RegionId;
  providerPlaceId: string;
  name: string;
  dataset?: MapPlacesSnapshotDataset;
  layer: PublicCatalogLayer;
  category: PublicMapPlaceCategory;
  districtCode: string | null;
  districtName?: string | null;
  address?: string;
  coordinates: { latitude: number; longitude: number } | null;
  lastSeenAt?: string | null;
  matchedQueryCount?: number;
  categoryQueryAgreementCount?: number;
  completeness?: number;
  imageUrl?: string | null;
  placeUrl?: string | null;
  petAccessVerdict: PublicMapPetAccessVerdict;
  petConditions?: string | null;
  verificationRequired?: boolean;
  publicLabel: string;
  sourceLabel: "한국관광공사" | "카카오 검색 후보";
}

export interface MapPlacesSnapshot {
  contractVersion: typeof MAP_PLACES_SNAPSHOT_VERSION;
  region: RegionId;
  scope: MapPlacesSnapshotScope;
  dataset: MapPlacesSnapshotDataset;
  generatedAt: string;
  publicationVersion: `p1-${string}`;
  dataVersion: string;
  totalCount: number;
  providerCounts: Record<PublicMapPlaceProvider, number>;
  categoryCounts: Partial<Record<PublicMapPlaceCategory, number>>;
  freshness: {
    status: "fresh" | "stale";
    staleAt?: string;
  };
  items: MapPlacesSnapshotMarker[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalNonnegativeInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 0);
}

function isOptionalHttpUrl(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isOptionalPlaceUrl(value: unknown): boolean {
  return value === undefined || value === null || (
    typeof value === "string" && (value.startsWith("/") || isOptionalHttpUrl(value))
  );
}

function isOptionalPetConditions(value: unknown): boolean {
  return value === undefined || value === null || (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

function isSnapshotMarker(value: unknown, region: RegionId): value is MapPlacesSnapshotMarker {
  if (!isRecord(value)) return false;
  const coordinates = value.coordinates;
  const validCoordinates = coordinates === null || (
    isRecord(coordinates) &&
    isFiniteNumber(coordinates.latitude) && coordinates.latitude >= -90 && coordinates.latitude <= 90 &&
    isFiniteNumber(coordinates.longitude) && coordinates.longitude >= -180 && coordinates.longitude <= 180
  );
  const layerAndSourceMatch =
    (value.layer === "tourism" && value.sourceLabel === "한국관광공사" && value.id === `tour:${String(value.providerPlaceId)}`) ||
    (value.layer === "kakao" && value.sourceLabel === "카카오 검색 후보" && value.id === `kakao:${String(value.providerPlaceId)}`);
  return typeof value.id === "string" && value.id.length > 0 &&
    value.regionId === region &&
    typeof value.providerPlaceId === "string" && value.providerPlaceId.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    (value.dataset === undefined || MAP_PLACES_SNAPSHOT_DATASETS.includes(value.dataset as MapPlacesSnapshotDataset)) &&
    ["tourism", "kakao"].includes(String(value.layer)) &&
    ["cafe", "food", "accommodation", "attraction", "park_walk", "leisure", "camping", "shopping", "other"]
      .includes(String(value.category)) &&
    (value.districtCode === null || (typeof value.districtCode === "string" && value.districtCode.length > 0)) &&
    (value.districtName === undefined || value.districtName === null ||
      (typeof value.districtName === "string" && value.districtName.length > 0)) &&
    (value.address === undefined || typeof value.address === "string") &&
    validCoordinates &&
    (value.lastSeenAt === undefined || value.lastSeenAt === null || (
      typeof value.lastSeenAt === "string" && Number.isFinite(Date.parse(value.lastSeenAt))
    )) &&
    isOptionalNonnegativeInteger(value.matchedQueryCount) &&
    isOptionalNonnegativeInteger(value.categoryQueryAgreementCount) &&
    (value.completeness === undefined || (
      isFiniteNumber(value.completeness) && value.completeness >= 0 && value.completeness <= 1
    )) &&
    isOptionalHttpUrl(value.imageUrl) &&
    isOptionalPlaceUrl(value.placeUrl) &&
    ["allowed", "conditional", "not_allowed", "unknown"].includes(String(value.petAccessVerdict)) &&
    isOptionalPetConditions(value.petConditions) &&
    (value.verificationRequired === undefined || typeof value.verificationRequired === "boolean") &&
    typeof value.publicLabel === "string" && value.publicLabel.length > 0 &&
    layerAndSourceMatch;
}

function hasCountRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(
    (count) => Number.isInteger(count) && Number(count) >= 0,
  );
}

export function isMapPlacesSnapshot(value: unknown): value is MapPlacesSnapshot {
  if (!isRecord(value) || value.contractVersion !== MAP_PLACES_SNAPSHOT_VERSION) return false;
  if (
    !REGION_IDS.includes(value.region as RegionId) ||
    value.scope !== "default" ||
    !MAP_PLACES_SNAPSHOT_DATASETS.includes(value.dataset as MapPlacesSnapshotDataset)
  ) return false;
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) return false;
  if (typeof value.publicationVersion !== "string" || !/^p1-[a-f0-9]{16}$/u.test(value.publicationVersion)) return false;
  if (typeof value.dataVersion !== "string" || !/^v1-[a-f0-9]{16}$/u.test(value.dataVersion)) return false;
  if (!Number.isInteger(value.totalCount) || Number(value.totalCount) < 0) return false;
  if (!hasCountRecord(value.providerCounts) || !hasCountRecord(value.categoryCounts)) return false;
  if (Object.keys(value.providerCounts).sort().join(",") !== "kakao,tour") return false;
  if (Object.keys(value.categoryCounts).some((category) =>
    !["cafe", "food", "accommodation", "attraction", "park_walk", "leisure", "camping", "shopping", "other"]
      .includes(category))) return false;
  const snapshotCategoryCounts = value.categoryCounts;
  if (!isRecord(value.freshness) || !["fresh", "stale"].includes(String(value.freshness.status))) return false;
  if (value.freshness.status === "fresh" && value.freshness.staleAt !== undefined) return false;
  if (value.freshness.status === "stale" && (
    typeof value.freshness.staleAt !== "string" || !Number.isFinite(Date.parse(value.freshness.staleAt))
  )) return false;
  if (!Array.isArray(value.items) || value.items.length !== value.totalCount) return false;
  const region = value.region as RegionId;
  if (!value.items.every((item) => isSnapshotMarker(item, region) &&
    (item.dataset === undefined || item.dataset === value.dataset))) return false;
  if (
    value.dataset === "shopping" && value.items.some((item) =>
      item.layer !== "tourism" ||
      item.category !== "shopping" ||
      item.petAccessVerdict !== "unknown" ||
      item.publicLabel !== "반려동물 동반 정보 확인 필요" ||
      (item.placeUrl !== undefined && item.placeUrl !== null))
  ) return false;
  if (value.dataset === "core" && value.items.some((item) => item.category === "shopping")) {
    return false;
  }
  const providers = value.providerCounts;
  const providerCounts = value.items.reduce<Record<PublicMapPlaceProvider, number>>(
    (counts, item) => {
      counts[item.layer === "tourism" ? "tour" : "kakao"] += 1;
      return counts;
    },
    { tour: 0, kakao: 0 },
  );
  if (providers.tour !== providerCounts.tour || providers.kakao !== providerCounts.kakao) return false;
  const categoryCounts = value.items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
  if (Object.values(snapshotCategoryCounts).reduce((sum, count) => sum + count, 0) !== value.totalCount) return false;
  if (Object.entries(categoryCounts).some(([category, count]) => snapshotCategoryCounts[category] !== count)) return false;
  return new Set(value.items.map((item) => item.id)).size === value.items.length;
}
