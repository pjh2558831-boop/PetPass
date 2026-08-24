import "server-only";

import { createHash } from "node:crypto";
import { queryPublicMapCatalog, type PublicMapCatalogQuery } from "@/lib/map-places/public-catalog";
import { normalizePublicMapCatalogMarker } from "@/types/public-catalog-place";
import type { PublicMapPlacePage } from "@/types/public-map-place";
import type {
  MapPlacesSnapshot,
  MapPlacesSnapshotMarker,
  MapPlacesSnapshotRequest,
} from "@/types/map-places-snapshot";

export const MAP_SNAPSHOT_PAGE_SIZE = 200;
export const MAP_SNAPSHOT_MAX_PAGES = 10;
export const MAP_SNAPSHOT_FRESH_MS = 300_000;
export const MAP_SNAPSHOT_STALE_IF_ERROR_MS = 3_600_000;

type SnapshotQuery = (input: PublicMapCatalogQuery) => Promise<PublicMapPlacePage>;
type SnapshotAssembler = (input: MapPlacesSnapshotRequest) => Promise<MapPlacesSnapshot>;

function compactMarker(
  place: PublicMapPlacePage["items"][number],
  region: MapPlacesSnapshotRequest["region"],
): MapPlacesSnapshotMarker {
  const marker = normalizePublicMapCatalogMarker(place, region);
  return {
    id: marker.id,
    regionId: marker.regionId,
    providerPlaceId: marker.providerPlaceId,
    name: marker.name,
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

export async function assembleMapPlacesSnapshot(
  input: MapPlacesSnapshotRequest,
  {
    query = queryPublicMapCatalog,
    now = () => new Date(),
  }: {
    query?: SnapshotQuery;
    now?: () => Date;
  } = {},
): Promise<MapPlacesSnapshot> {
  const providers = input.region === "jeju" ? ["tour" as const] : ["tour" as const, "kakao" as const];
  const kinds = input.region === "jeju"
    ? ["tourism_place" as const]
    : ["tourism_place" as const, "pet_travel_candidate" as const];
  const categories = ["attraction", "park_walk", "leisure", "camping", "food", "cafe", "accommodation"] as const;
  const items: MapPlacesSnapshotMarker[] = [];
  let afterId: number | undefined;
  let expectedTotal: number | null = null;
  let hasNext = true;

  for (let pageNumber = 1; hasNext && pageNumber <= MAP_SNAPSHOT_MAX_PAGES; pageNumber += 1) {
    const page = await query({
      regionId: input.region,
      providers: [...providers],
      kinds: [...kinds],
      categories: [...categories],
      page: pageNumber,
      pageSize: MAP_SNAPSHOT_PAGE_SIZE,
      ...(afterId === undefined ? {} : { afterId }),
    });
    if (page.region.id !== input.region) throw new Error("Snapshot region does not match the requested region.");
    if (expectedTotal === null) expectedTotal = page.totalCount;
    if (page.totalCount !== expectedTotal) throw new Error("Snapshot count changed during assembly.");
    if (page.items.some((place) => normalizePublicMapCatalogMarker(place, input.region).regionId !== input.region)) {
      throw new Error("Snapshot item region does not match the requested region.");
    }
    items.push(...page.items.map((place) => compactMarker(place, input.region)));
    hasNext = page.hasNext;
    afterId = page.nextCursor ?? undefined;
    if (hasNext && afterId === undefined) throw new Error("Snapshot cursor is missing before catalog completion.");
  }

  if (hasNext) throw new Error("Snapshot exceeds the bounded page limit.");
  if (items.length !== (expectedTotal ?? 0)) throw new Error("Snapshot partial count does not match the complete catalog count.");
  if (new Set(items.map(({ id }) => id)).size !== items.length) throw new Error("Snapshot contains duplicate place identifiers.");

  const providerCounts = { tour: 0, kakao: 0 };
  const categoryCounts: MapPlacesSnapshot["categoryCounts"] = {};
  for (const item of items) {
    providerCounts[item.layer === "tourism" ? "tour" : "kakao"] += 1;
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
  }
  const dataHash = createHash("sha256");
  dataHash.update(`${input.version}:${input.region}:${input.scope}\n`);
  for (const item of items) dataHash.update(`${JSON.stringify(item)}\n`);
  const generatedAt = now().toISOString();
  return {
    contractVersion: input.version,
    region: input.region,
    scope: input.scope,
    generatedAt,
    dataVersion: `v1-${dataHash.digest("hex").slice(0, 16)}`,
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
  return `${input.version}:${input.region}:${input.scope}`;
}

export function createMapPlacesSnapshotLoader({
  assemble = (input) => assembleMapPlacesSnapshot(input),
  now = Date.now,
  freshMs = MAP_SNAPSHOT_FRESH_MS,
  staleIfErrorMs = MAP_SNAPSHOT_STALE_IF_ERROR_MS,
}: {
  assemble?: SnapshotAssembler;
  now?: () => number;
  freshMs?: number;
  staleIfErrorMs?: number;
} = {}): SnapshotAssembler {
  const entries = new Map<string, SnapshotCacheEntry>();
  return async (input) => {
    const key = snapshotKey(input);
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

    const inFlight = assemble(input).then((value) => {
      entries.set(key, { value, storedAt: now() });
      return value;
    }).catch((error: unknown) => {
      if (entry.value && age <= freshMs + staleIfErrorMs) {
        const stale = {
          ...entry.value,
          freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() },
        };
        entries.set(key, {
          value: entry.value,
          storedAt: entry.storedAt,
          retryAfter: now() + Math.min(freshMs, 60_000),
        });
        return stale;
      }
      entries.delete(key);
      throw error;
    });
    entries.set(key, { ...entry, inFlight });
    return inFlight;
  };
}

export const loadMapPlacesSnapshot = createMapPlacesSnapshotLoader();
