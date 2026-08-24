import {
  isPlaceCategory,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { PublicMapPetAccessVerdict } from "@/types/public-map-place";
import { REGION_IDS, type RegionId } from "@/types/region";

export const HOMEPAGE_INITIAL_VERSION = 1 as const;
export const HOMEPAGE_INITIAL_SCOPES = ["default", "optional"] as const;
export const HOMEPAGE_INITIAL_PROVIDER_SELECTIONS = [
  "default",
  "tour",
  "kakao",
] as const;
export const HOMEPAGE_INITIAL_LAYERS = [
  "tourism",
  "kakao",
  "veterinary",
  "pet_shop",
] as const;

export type HomepageInitialScope = (typeof HOMEPAGE_INITIAL_SCOPES)[number];
export type HomepageInitialProviderSelection =
  (typeof HOMEPAGE_INITIAL_PROVIDER_SELECTIONS)[number];
export type HomepageInitialLayer = (typeof HOMEPAGE_INITIAL_LAYERS)[number];
export type HomepageInitialLayerState =
  | "ready"
  | "empty"
  | "deferred"
  | "unavailable";

export interface HomepageInitialPlacesRequest {
  version: typeof HOMEPAGE_INITIAL_VERSION;
  region: RegionId;
  scope: HomepageInitialScope;
  providers: HomepageInitialProviderSelection;
}

/**
 * Version 1 wire tuple. The fixed order keeps the 680-marker homepage payload
 * compact without weakening the trusted catalog projection.
 * [id, name, layer, category, district, latitude, longitude, verdict, publicLabel]
 */
export type HomepageInitialMarkerV1 = readonly [
  id: string,
  name: string,
  layer: HomepageInitialLayer,
  category: PlaceCategory,
  district: string | null,
  latitude: number,
  longitude: number,
  verdict: PublicMapPetAccessVerdict,
  publicLabel: string,
];

export type HomepageInitialCategoryCountV1 = readonly [
  layer: HomepageInitialLayer,
  category: PlaceCategory,
  count: number,
];

/** Optional-scope card fields, loaded only after a facility filter is requested. */
export type HomepageInitialCardDetailV1 = readonly [
  id: string,
  address: string,
  phone: string | null,
  imageUrl: string | null,
];

export interface HomepageInitialLayerSnapshot {
  state: HomepageInitialLayerState;
  count: number | null;
  markerCount: number | null;
}

export interface HomepageInitialPlacesSnapshot {
  contractVersion: typeof HOMEPAGE_INITIAL_VERSION;
  region: RegionId;
  scope: HomepageInitialScope;
  providers: HomepageInitialProviderSelection;
  generatedAt: string;
  dataVersion: string;
  totalCount: number;
  markerCount: number;
  freshness: {
    status: "fresh" | "stale";
    staleAt?: string;
  };
  layers: Record<HomepageInitialLayer, HomepageInitialLayerSnapshot>;
  categoryCounts: HomepageInitialCategoryCountV1[];
  markers: HomepageInitialMarkerV1[];
  cardDetails: HomepageInitialCardDetailV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isMarker(value: unknown): value is HomepageInitialMarkerV1 {
  if (!Array.isArray(value) || value.length !== 9) return false;
  const [id, name, layer, category, district, latitude, longitude, verdict, publicLabel] = value;
  const layerMatchesId = layer === "tourism"
    ? String(id).startsWith("tour:")
    : String(id).startsWith("kakao:");
  return typeof id === "string" && id.length > 0 &&
    typeof name === "string" && name.length > 0 &&
    HOMEPAGE_INITIAL_LAYERS.includes(layer as HomepageInitialLayer) &&
    typeof category === "string" && isPlaceCategory(category) &&
    (district === null || (typeof district === "string" && district.length > 0)) &&
    typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    ["allowed", "conditional", "not_allowed", "unknown"].includes(String(verdict)) &&
    typeof publicLabel === "string" && publicLabel.length > 0 &&
    layerMatchesId;
}

function isCardDetail(value: unknown): value is HomepageInitialCardDetailV1 {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const [id, address, phone, imageUrl] = value;
  return typeof id === "string" && id.length > 0 &&
    typeof address === "string" && address.length > 0 &&
    (phone === null || (typeof phone === "string" && phone.length > 0)) &&
    (imageUrl === null || (typeof imageUrl === "string" && /^https?:\/\//u.test(imageUrl)));
}

function categoryMatchesLayer(
  layer: HomepageInitialLayer,
  category: PlaceCategory,
): boolean {
  if (layer === "veterinary") return category === "veterinary";
  if (layer === "pet_shop") return category === "pet_shop";
  return category !== "veterinary" && category !== "pet_shop";
}

function layerMatchesProjection(
  layer: HomepageInitialLayer,
  scope: HomepageInitialScope,
  providers: HomepageInitialProviderSelection,
): boolean {
  if (scope === "optional") {
    return providers !== "tour" && (layer === "veterinary" || layer === "pet_shop");
  }
  if (layer !== "tourism" && layer !== "kakao") return false;
  if (providers === "tour") return layer === "tourism";
  if (providers === "kakao") return layer === "kakao";
  return true;
}

export function isHomepageInitialPlacesSnapshot(
  value: unknown,
): value is HomepageInitialPlacesSnapshot {
  if (!isRecord(value) || value.contractVersion !== HOMEPAGE_INITIAL_VERSION) return false;
  if (!REGION_IDS.includes(value.region as RegionId)) return false;
  if (!HOMEPAGE_INITIAL_SCOPES.includes(value.scope as HomepageInitialScope)) return false;
  if (!HOMEPAGE_INITIAL_PROVIDER_SELECTIONS.includes(value.providers as HomepageInitialProviderSelection)) return false;
  const scope = value.scope as HomepageInitialScope;
  const providers = value.providers as HomepageInitialProviderSelection;
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) return false;
  if (typeof value.dataVersion !== "string" || !/^v1-[a-f0-9]{16}$/u.test(value.dataVersion)) return false;
  if (!isCount(value.totalCount) || !isCount(value.markerCount)) return false;
  if (!isRecord(value.freshness) || !["fresh", "stale"].includes(String(value.freshness.status))) return false;
  if (value.freshness.status === "stale" && (
    typeof value.freshness.staleAt !== "string" || !Number.isFinite(Date.parse(value.freshness.staleAt))
  )) return false;
  if (!isRecord(value.layers)) return false;
  const layers = value.layers;
  for (const layer of HOMEPAGE_INITIAL_LAYERS) {
    const entry = layers[layer];
    if (!isRecord(entry) || !["ready", "empty", "deferred", "unavailable"].includes(String(entry.state))) return false;
    if (!(entry.count === null || isCount(entry.count))) return false;
    if (!(entry.markerCount === null || isCount(entry.markerCount))) return false;
  }
  const validatedLayers = layers as unknown as Record<
    HomepageInitialLayer,
    HomepageInitialLayerSnapshot
  >;
  if (!Array.isArray(value.categoryCounts) || !value.categoryCounts.every((entry) =>
    Array.isArray(entry) && entry.length === 3 &&
    HOMEPAGE_INITIAL_LAYERS.includes(entry[0] as HomepageInitialLayer) &&
    typeof entry[1] === "string" && isPlaceCategory(entry[1]) &&
    isCount(entry[2]) &&
    categoryMatchesLayer(entry[0] as HomepageInitialLayer, entry[1]) &&
    layerMatchesProjection(entry[0] as HomepageInitialLayer, scope, providers)
  )) return false;
  if (!Array.isArray(value.markers) || value.markers.length !== value.markerCount) return false;
  const markers = value.markers;
  if (!markers.every(isMarker)) return false;
  if (!markers.every((marker) =>
    categoryMatchesLayer(marker[2], marker[3]) &&
    layerMatchesProjection(marker[2], scope, providers)
  )) return false;
  if (new Set(markers.map((marker) => marker[0])).size !== markers.length) return false;
  if (!Array.isArray(value.cardDetails) || !value.cardDetails.every(isCardDetail)) return false;
  const cardDetails = value.cardDetails;
  if (new Set(cardDetails.map((detail) => detail[0])).size !== cardDetails.length) return false;
  if (scope === "default" && cardDetails.length > 0) return false;
  const markerIds = new Set(markers.map((marker) => marker[0]));
  if (!cardDetails.every((detail) => markerIds.has(detail[0]))) return false;
  const markerLayerCounts: Record<HomepageInitialLayer, number> = {
    tourism: 0,
    kakao: 0,
    veterinary: 0,
    pet_shop: 0,
  };
  for (const marker of markers) markerLayerCounts[marker[2]] += 1;
  return HOMEPAGE_INITIAL_LAYERS.every((layer) => {
    const expected = validatedLayers[layer].markerCount;
    return expected === null || expected === markerLayerCounts[layer];
  });
}
