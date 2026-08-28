import "server-only";

import { createHash } from "node:crypto";
import { queryPublicMapCatalog, type PublicMapCatalogQuery } from "@/lib/map-places/public-catalog";
import {
  publicationInputForSnapshot,
  resolveMapCatalogPublicationVersion,
  type MapCatalogPublicationVersion,
} from "@/lib/map-places/publication-version";
import { normalizePublicMapCatalogMarker } from "@/types/public-catalog-place";
import { getRegionConfig } from "@/lib/regions/config";
import { publicMapPlaceMatchesRegion } from "@/lib/map-places/region-contract";
import { queryPublicShoppingCatalogSnapshot } from "@/lib/map-places/shopping-catalog";
import type { PublicMapPlacePage } from "@/types/public-map-place";
import type {
  MapPlacesSnapshot,
  MapPlacesSnapshotMarker,
  MapPlacesSnapshotRequest,
} from "@/types/map-places-snapshot";

export const MAP_SNAPSHOT_PAGE_SIZE = 200;
export const MAP_SNAPSHOT_FRESH_MS = 300_000;
export const MAP_SNAPSHOT_STALE_IF_ERROR_MS = 3_600_000;

type SnapshotQuery = (input: PublicMapCatalogQuery) => Promise<PublicMapPlacePage>;
type ShoppingSnapshotQuery = (input: {
  regionId: MapPlacesSnapshotRequest["region"];
  providers: readonly ["tour"];
  kinds: readonly ["tourism_place"];
  categories: readonly ["shopping"];
  dataset: "shopping";
}) => Promise<PublicMapPlacePage>;
type SnapshotAssembler = (
  input: MapPlacesSnapshotRequest,
  publicationVersion: MapCatalogPublicationVersion,
) => Promise<MapPlacesSnapshot>;
type SnapshotLoader = (input: MapPlacesSnapshotRequest) => Promise<MapPlacesSnapshot>;
type PublicationResolver = (
  input: MapPlacesSnapshotRequest,
) => Promise<MapCatalogPublicationVersion>;

function compactMarker(
  place: PublicMapPlacePage["items"][number],
  region: MapPlacesSnapshotRequest["region"],
  inputDataset: MapPlacesSnapshotRequest["dataset"],
): MapPlacesSnapshotMarker {
  const marker = normalizePublicMapCatalogMarker(place, region);
  return {
    id: marker.id,
    regionId: marker.regionId,
    providerPlaceId: marker.providerPlaceId,
    name: marker.name,
    dataset: inputDataset,
    layer: marker.layer,
    category: marker.category,
    districtCode: marker.districtCode,
    districtName: marker.districtName,
    address: marker.address,
    coordinates: marker.coordinates,
    lastSeenAt: marker.lastSeenAt ?? null,
    matchedQueryCount: marker.matchedQueryCount ?? 0,
    categoryQueryAgreementCount: marker.categoryQueryAgreementCount ?? 0,
    completeness: marker.completeness,
    imageUrl: marker.imageUrl ?? null,
    placeUrl: marker.placeUrl ?? null,
    petAccessVerdict: marker.petAccessVerdict ?? "unknown",
    publicLabel: marker.publicLabel,
    sourceLabel: marker.sourceLabel === "한국관광공사" ? "한국관광공사" : "카카오 검색 후보",
  };
}

export interface MapPlacesSnapshotWireMarker {
  id: string;
  name: string;
  layer: MapPlacesSnapshotMarker["layer"];
  category: MapPlacesSnapshotMarker["category"];
  districtCode: string | null;
  coordinates: MapPlacesSnapshotMarker["coordinates"];
  lastSeenAt?: string | null;
  matchedQueryCount?: number;
  categoryQueryAgreementCount?: number;
  completeness?: number;
  petAccessVerdict: MapPlacesSnapshotMarker["petAccessVerdict"];
  publicLabel: string;
}

function lightweightMarker(
  marker: MapPlacesSnapshotMarker,
): MapPlacesSnapshotWireMarker {
  return {
    id: marker.id,
    name: marker.name,
    layer: marker.layer,
    category: marker.category,
    districtCode: marker.districtCode,
    coordinates: marker.coordinates,
    lastSeenAt: marker.lastSeenAt,
    ...(marker.matchedQueryCount ? { matchedQueryCount: marker.matchedQueryCount } : {}),
    ...(marker.categoryQueryAgreementCount
      ? { categoryQueryAgreementCount: marker.categoryQueryAgreementCount }
      : {}),
    ...(marker.completeness === undefined ? {} : { completeness: marker.completeness }),
    petAccessVerdict: marker.petAccessVerdict,
    publicLabel: marker.publicLabel,
  };
}

export function lightweightMapPlacesSnapshot(
  snapshot: MapPlacesSnapshot,
): Omit<MapPlacesSnapshot, "items"> & { items: MapPlacesSnapshotWireMarker[] } {
  return { ...snapshot, items: snapshot.items.map(lightweightMarker) };
}

export async function assembleMapPlacesSnapshot(
  input: MapPlacesSnapshotRequest,
  {
    query = queryPublicMapCatalog,
    queryShopping = queryPublicShoppingCatalogSnapshot,
    now = () => new Date(),
    publicationVersion,
  }: {
    query?: SnapshotQuery;
    queryShopping?: ShoppingSnapshotQuery;
    now?: () => Date;
    publicationVersion?: MapCatalogPublicationVersion;
  } = {},
): Promise<MapPlacesSnapshot> {
  const region = getRegionConfig(input.region);
  if (!region.mapEnabled) throw new Error("Snapshot region is not enabled for the public map.");
  if (!region.mapCatalog.snapshotDatasets.includes(input.dataset)) {
    throw new Error("Snapshot dataset is not enabled for the public map region.");
  }
  const providers = input.dataset === "shopping"
    ? ["tour" as const]
    : [...region.allowedMapProviders];
  const kinds = providers.includes("kakao")
    ? ["tourism_place" as const, "pet_travel_candidate" as const]
    : ["tourism_place" as const];
  const categories = input.dataset === "shopping"
    ? ["shopping" as const]
    : region.mapCatalog.snapshotCategories;
  const items: MapPlacesSnapshotMarker[] = [];
  const seenIds = new Set<string>();
  let afterId: number | undefined;
  let expectedTotal: number | null = null;
  let hasNext = true;

  for (let pageNumber = 1; hasNext; pageNumber += 1) {
    const page = input.dataset === "shopping"
      ? await queryShopping({
          regionId: input.region,
          dataset: "shopping",
          providers: ["tour"],
          kinds: ["tourism_place"],
          categories: ["shopping"],
        })
      : await query({
          regionId: input.region,
          dataset: input.dataset,
          providers,
          kinds: [...kinds],
          categories: categories ? [...categories] : undefined,
          page: pageNumber,
          pageSize: MAP_SNAPSHOT_PAGE_SIZE,
          ...(afterId === undefined ? {} : { afterId }),
        });
    if (page.region.id !== input.region) throw new Error("Snapshot region does not match the requested region.");
    if (expectedTotal === null) expectedTotal = page.totalCount;
    if (page.totalCount !== expectedTotal) throw new Error("Snapshot count changed during assembly.");
    if (page.items.some((place) => !publicMapPlaceMatchesRegion(place, region))) {
      throw new Error("Snapshot item region does not match the requested region.");
    }
    if (page.hasNext && page.items.length === 0) {
      throw new Error("Snapshot cursor page is empty before catalog completion.");
    }
    const nextItems = page.items.map((place) => compactMarker(place, input.region, input.dataset));
    if (nextItems.some((item) => seenIds.has(item.id))) {
      throw new Error("Snapshot contains duplicate place identifiers.");
    }
    for (const item of nextItems) seenIds.add(item.id);
    items.push(...nextItems);
    if (items.length > (expectedTotal ?? 0)) {
      throw new Error("Snapshot count exceeds the catalog total.");
    }
    const nextCursor = page.nextCursor ?? undefined;
    if (page.hasNext && nextCursor === undefined) {
      throw new Error("Snapshot cursor is missing before catalog completion.");
    }
    if (page.hasNext && afterId !== undefined && nextCursor !== undefined && nextCursor <= afterId) {
      throw new Error("Snapshot cursor did not advance.");
    }
    hasNext = page.hasNext;
    afterId = nextCursor;
  }

  if (items.length !== (expectedTotal ?? 0)) throw new Error("Snapshot partial count does not match the complete catalog count.");

  const providerCounts = { tour: 0, kakao: 0 };
  const categoryCounts: MapPlacesSnapshot["categoryCounts"] = {};
  for (const item of items) {
    providerCounts[item.layer === "tourism" ? "tour" : "kakao"] += 1;
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
  }
  const dataHash = createHash("sha256");
  dataHash.update(`${input.version}:${input.region}:${input.scope}:${input.dataset}\n`);
  for (const item of items) dataHash.update(`${JSON.stringify(lightweightMarker(item))}\n`);
  const dataVersion = `v1-${dataHash.digest("hex").slice(0, 16)}`;
  const resolvedPublicationVersion = publicationVersion ??
    `p1-${createHash("sha256").update(`${input.region}:${input.dataset}:${dataVersion}`).digest("hex").slice(0, 16)}`;
  const generatedAt = now().toISOString();
  return {
    contractVersion: input.version,
    region: input.region,
    scope: input.scope,
    dataset: input.dataset,
    generatedAt,
    publicationVersion: resolvedPublicationVersion,
    dataVersion,
    totalCount: items.length,
    providerCounts,
    categoryCounts,
    freshness: { status: "fresh" },
    items,
  };
}

interface SnapshotCacheEntry {
  value?: MapPlacesSnapshot;
  storedAt?: number;
  inFlight?: Promise<MapPlacesSnapshot>;
  retryAfter?: number;
}

function snapshotKey(input: MapPlacesSnapshotRequest): string {
  const region = getRegionConfig(input.region);
  const providers = input.dataset === "shopping"
    ? "tour"
    : region.allowedMapProviders.join(",");
  const categories = input.dataset === "shopping"
    ? "shopping"
    : region.mapCatalog.snapshotCategories?.join(",") ?? "all";
  return [
    input.version,
    input.region,
    input.scope,
    input.dataset,
    `providers=${providers}`,
    `categories=${categories}`,
    `fallback=${region.mapCatalog.fallbackSource}`,
    "query=markers",
  ].join(":");
}

function fallbackPublicationVersion(input: MapPlacesSnapshotRequest): MapCatalogPublicationVersion {
  return `p1-${createHash("sha256").update(snapshotKey(input)).digest("hex").slice(0, 16)}`;
}

export function createMapPlacesSnapshotLoader({
  assemble = (input, publicationVersion) =>
    assembleMapPlacesSnapshot(input, { publicationVersion }),
  resolvePublicationVersion = async (input) => fallbackPublicationVersion(input),
  now = Date.now,
  freshMs = MAP_SNAPSHOT_FRESH_MS,
  staleIfErrorMs = MAP_SNAPSHOT_STALE_IF_ERROR_MS,
}: {
  assemble?: SnapshotAssembler;
  resolvePublicationVersion?: PublicationResolver;
  now?: () => number;
  freshMs?: number;
  staleIfErrorMs?: number;
} = {}): SnapshotLoader {
  const entries = new Map<string, SnapshotCacheEntry>();
  const activeKeyByBase = new Map<string, string>();
  const publicationInFlight = new Map<string, Promise<MapCatalogPublicationVersion>>();
  const resolvePublication = (input: MapPlacesSnapshotRequest, baseKey: string) => {
    const pending = publicationInFlight.get(baseKey);
    if (pending) return pending;
    const next = resolvePublicationVersion(input).finally(() => {
      if (publicationInFlight.get(baseKey) === next) publicationInFlight.delete(baseKey);
    });
    publicationInFlight.set(baseKey, next);
    return next;
  };
  return async (input) => {
    const baseKey = snapshotKey(input);
    let publicationVersion: MapCatalogPublicationVersion;
    try {
      publicationVersion = await resolvePublication(input, baseKey);
    } catch (error: unknown) {
      const previousKey = activeKeyByBase.get(baseKey);
      const previous = previousKey ? entries.get(previousKey) : undefined;
      const previousAge = previous?.storedAt === undefined
        ? Number.POSITIVE_INFINITY
        : now() - previous.storedAt;
      if (previous?.value && previousAge <= freshMs + staleIfErrorMs) {
        return {
          ...previous.value,
          freshness: { status: "stale", staleAt: new Date(now()).toISOString() },
        };
      }
      throw error;
    }
    const key = `${baseKey}:publication=${publicationVersion}`;
    const previousKey = activeKeyByBase.get(baseKey);
    const previousEntry = previousKey && previousKey !== key
      ? entries.get(previousKey)
      : undefined;
    const entry = entries.get(key) ?? {};
    const age = entry.storedAt === undefined ? Number.POSITIVE_INFINITY : now() - entry.storedAt;
    if (entry.value && age <= freshMs) return entry.value;
    if (entry.value && entry.retryAfter !== undefined && entry.retryAfter > now()) {
      return {
        ...entry.value,
        freshness: { status: "stale", staleAt: new Date(now()).toISOString() },
      };
    }
    if (entry.inFlight) return entry.inFlight;

    const inFlight = assemble(input, publicationVersion).then((value) => {
      entries.set(key, { value, storedAt: now() });
      activeKeyByBase.set(baseKey, key);
      if (previousKey && previousKey !== key) entries.delete(previousKey);
      return value;
    }).catch((error: unknown) => {
      const fallback = entry.value ? entry : previousEntry;
      const fallbackAge = fallback?.storedAt === undefined
        ? Number.POSITIVE_INFINITY
        : now() - fallback.storedAt;
      if (fallback?.value && fallbackAge <= freshMs + staleIfErrorMs) {
        const stale = {
          ...fallback.value,
          freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() },
        };
        if (entry.value) {
          entries.set(key, {
            value: entry.value,
            storedAt: entry.storedAt,
            retryAfter: now() + Math.min(freshMs, 60_000),
          });
        } else {
          entries.delete(key);
        }
        return stale;
      }
      entries.delete(key);
      throw error;
    });
    entries.set(key, { ...entry, inFlight });
    return inFlight;
  };
}

export const loadMapPlacesSnapshot = createMapPlacesSnapshotLoader({
  resolvePublicationVersion: (input) =>
    resolveMapCatalogPublicationVersion(publicationInputForSnapshot(input)),
});
