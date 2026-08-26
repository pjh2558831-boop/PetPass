import "server-only";

import { createHash } from "node:crypto";
import {
  getHomepageCatalogDatasets,
  homepageDatasetCacheKey,
  type HomepageCatalogDatasetDescriptor,
} from "@/lib/homepage/catalog-datasets";
import type { HomepageTimingObserver } from "@/lib/homepage/performance-timing";
import { mapCatalogPlaceToCategory } from "@/lib/map-places/place-categories";
import { queryPublicMapCatalog } from "@/lib/map-places/public-catalog";
import { normalizePublicMapCatalogMarker } from "@/types/public-catalog-place";
import { getRegionConfig } from "@/lib/regions/config";
import type { HomepageDatasetContinuationV1 } from "@/types/homepage-completion";
import type {
  PublicMapPlaceKind,
  PublicMapPlacePage,
  PublicMapPlaceProvider,
} from "@/types/public-map-place";
import {
  HOMEPAGE_INITIAL_LAYERS,
  type HomepageInitialCardDetailV1,
  type HomepageInitialLayer,
  type HomepageInitialCategoryCountV1,
  type HomepageInitialLayerSnapshot,
  type HomepageInitialMarkerV1,
  type HomepageInitialPlacesRequest,
  type HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";

export const HOMEPAGE_INITIAL_FRESH_MS = 300_000;
export const HOMEPAGE_INITIAL_STALE_IF_ERROR_MS = 3_600_000;

type CatalogQuery = (input: {
  regionId: HomepageInitialPlacesRequest["region"];
  providers: PublicMapPlaceProvider[];
  kinds: PublicMapPlaceKind[];
  page: number;
  pageSize: number;
  afterId?: number;
}) => Promise<PublicMapPlacePage>;
type InitialAssembler = (
  input: HomepageInitialPlacesRequest,
  observeTiming?: HomepageTimingObserver,
) => Promise<HomepageInitialPlacesSnapshot>;

function layerSnapshot(
  state: HomepageInitialLayerSnapshot["state"],
  count: number | null,
  markerCount: number | null,
): HomepageInitialLayerSnapshot {
  return { state, count, markerCount };
}

function emptyLayers(scope: HomepageInitialPlacesRequest["scope"]): Record<HomepageInitialLayer, HomepageInitialLayerSnapshot> {
  return {
    tourism: scope === "default" ? layerSnapshot("empty", 0, 0) : layerSnapshot("deferred", null, null),
    kakao: scope === "default" ? layerSnapshot("empty", 0, 0) : layerSnapshot("deferred", null, null),
    veterinary: scope === "optional" ? layerSnapshot("empty", 0, 0) : layerSnapshot("deferred", null, null),
    pet_shop: scope === "optional" ? layerSnapshot("empty", 0, 0) : layerSnapshot("deferred", null, null),
  };
}

export function toHomepageInitialTuple(marker: {
  id: string;
  name: string;
  layer: HomepageInitialLayer;
  category: HomepageInitialMarkerV1[3];
  districtName: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  petAccessVerdict: HomepageInitialMarkerV1[7];
  publicLabel: string;
}): HomepageInitialMarkerV1 | null {
  if (!marker.coordinates) return null;
  return [
    marker.id,
    marker.name,
    marker.layer,
    marker.category,
    marker.districtName,
    marker.coordinates.latitude,
    marker.coordinates.longitude,
    marker.petAccessVerdict,
    marker.publicLabel,
  ];
}

function dataVersion(
  input: HomepageInitialPlacesRequest,
  generationId: string,
  markers: readonly HomepageInitialMarkerV1[],
  cardDetails: readonly HomepageInitialCardDetailV1[] = [],
): string {
  const hash = createHash("sha256");
  hash.update(`${input.version}:${input.region}:${input.scope}:${input.providers}:${generationId}\n`);
  for (const marker of markers) hash.update(`${JSON.stringify(marker)}\n`);
  for (const detail of cardDetails) hash.update(`${JSON.stringify(detail)}\n`);
  return `v1-${hash.digest("hex").slice(0, 16)}`;
}

function generationId(
  input: HomepageInitialPlacesRequest,
  sources: ReadonlyArray<{
    descriptor: HomepageCatalogDatasetDescriptor;
    page: PublicMapPlacePage;
  }>,
): string {
  const hash = createHash("sha256");
  hash.update(`${input.version}:${input.region}:${input.scope}:${input.providers}\n`);
  for (const { descriptor, page } of sources) {
    const latest = page.items.reduce<string | null>((current, item) =>
      item.lastSeenAt && (!current || item.lastSeenAt > current) ? item.lastSeenAt : current, null);
    hash.update(`${descriptor.id}:${page.totalCount}:${page.nextCursor ?? "end"}:${latest ?? "unknown"}\n`);
  }
  return `g1-${hash.digest("hex").slice(0, 16)}`;
}

function continuationFor(
  descriptor: HomepageCatalogDatasetDescriptor,
  page: PublicMapPlacePage,
  observedGenerationId: string,
): HomepageDatasetContinuationV1 {
  return {
    datasetId: descriptor.id,
    layer: descriptor.layer,
    provider: descriptor.provider,
    kind: descriptor.kind,
    loadedItemCount: page.items.length,
    expectedTotalCount: page.totalCount,
    nextCursor: page.nextCursor ?? null,
    complete: page.items.length === page.totalCount,
    generationId: observedGenerationId,
  };
}

function providerAllowed(
  layer: "tourism" | "kakao",
  providers: HomepageInitialPlacesRequest["providers"],
): boolean {
  return providers === "default" || providers === (layer === "tourism" ? "tour" : "kakao");
}

export function homepageCategoryCounts(
  items: ReadonlyArray<{ layer: HomepageInitialLayer; category: HomepageInitialMarkerV1[3] }>,
): HomepageInitialCategoryCountV1[] {
  const counts = new Map<string, HomepageInitialCategoryCountV1>();
  for (const item of items) {
    const key = `${item.layer}:${item.category}`;
    const current = counts.get(key);
    counts.set(key, [item.layer, item.category, (current?.[2] ?? 0) + 1]);
  }
  return [...counts.values()];
}

async function assembleDefault(
  input: HomepageInitialPlacesRequest,
  queryPublicCatalog: CatalogQuery,
  now: () => Date,
  observeTiming?: HomepageTimingObserver,
): Promise<HomepageInitialPlacesSnapshot> {
  const startedAt = performance.now();
  const region = getRegionConfig(input.region);
  if (!region) throw new Error("Homepage region is unavailable.");
  const requestedSources = getHomepageCatalogDatasets(region, "default").filter(({ layer }) =>
    (layer === "tourism" || layer === "kakao") && providerAllowed(layer, input.providers));
  const results = await Promise.allSettled(requestedSources.map(async (descriptor) => ({
    descriptor,
    page: await queryPublicCatalog({
      regionId: input.region,
      providers: [descriptor.provider],
      kinds: [descriptor.kind],
      page: 1,
      pageSize: descriptor.pageSize,
    }),
  }))).finally(() => observeTiming?.({
      name: "supabase_catalog",
      durationMs: performance.now() - startedAt,
    }));
  if (results.every((result) => result.status === "rejected")) {
    throw new Error("Homepage default catalog is unavailable.");
  }

  const layers = emptyLayers(input.scope);
  const markers: HomepageInitialMarkerV1[] = [];
  const selectedCategories: Array<{
    layer: HomepageInitialLayer;
    category: HomepageInitialMarkerV1[3];
  }> = [];
  const fulfilledSources: Array<{ descriptor: HomepageCatalogDatasetDescriptor; page: PublicMapPlacePage }> = [];
  for (const result of results) {
    if (result.status === "rejected") continue;
    const { descriptor, page } = result.value;
    fulfilledSources.push({ descriptor, page });
    if (page.region.id !== input.region) {
      throw new Error("Homepage default catalog region does not match the request.");
    }
    const seenCoordinates = new Set<string>();
    const tuples = page.items.flatMap((place) => {
      const marker = normalizePublicMapCatalogMarker(place, input.region);
      if (marker.layer !== descriptor.layer) {
        throw new Error("Homepage default catalog provider does not match the requested layer.");
      }
      const category = mapCatalogPlaceToCategory(marker);
      selectedCategories.push({ layer: descriptor.layer, category });
      if (!marker.coordinates) return [];
      const coordinateKey = `${marker.coordinates.latitude.toFixed(6)}:${marker.coordinates.longitude.toFixed(6)}`;
      if (seenCoordinates.has(coordinateKey)) return [];
      seenCoordinates.add(coordinateKey);
      const compact = toHomepageInitialTuple({
        ...marker,
        layer: descriptor.layer,
        category,
        petAccessVerdict: marker.petAccessVerdict ?? "unknown",
      });
      return compact ? [compact] : [];
    });
    layers[descriptor.layer] = layerSnapshot(
      page.totalCount === 0 ? "empty" : "ready",
      page.totalCount,
      tuples.length,
    );
    markers.push(...tuples);
  }
  for (let index = 0; index < results.length; index += 1) {
    if (results[index].status === "fulfilled") continue;
    layers[requestedSources[index].layer] = layerSnapshot("unavailable", null, null);
  }
  const generatedAt = now().toISOString();
  const observedGenerationId = generationId(input, fulfilledSources);
  const continuations = fulfilledSources.map(({ descriptor, page }) =>
    continuationFor(descriptor, page, observedGenerationId));
  const totalCount = HOMEPAGE_INITIAL_LAYERS.reduce(
    (sum, layer) => sum + (layers[layer].count ?? 0),
    0,
  );
  return {
    contractVersion: 1,
    region: input.region,
    scope: input.scope,
    providers: input.providers,
    generatedAt,
    dataVersion: dataVersion(input, observedGenerationId, markers),
    generationId: observedGenerationId,
    totalCount,
    markerCount: markers.length,
    freshness: { status: "fresh" },
    layers,
    categoryCounts: homepageCategoryCounts(selectedCategories),
    markers,
    cardDetails: [],
    continuations,
  };
}

async function assembleOptional(
  input: HomepageInitialPlacesRequest,
  queryPublicCatalog: CatalogQuery,
  now: () => Date,
  observeTiming?: HomepageTimingObserver,
): Promise<HomepageInitialPlacesSnapshot> {
  const startedAt = performance.now();
  const region = getRegionConfig(input.region);
  if (!region) throw new Error("Homepage region is unavailable.");
  const requestedSources = getHomepageCatalogDatasets(region, "optional")
    .filter(({ requiresThirdParty }) => !requiresThirdParty);
  const results = await Promise.allSettled(requestedSources.map(async (descriptor) => ({
    descriptor,
    page: await queryPublicCatalog({
      regionId: input.region,
      providers: [descriptor.provider],
      kinds: [descriptor.kind],
      page: 1,
      pageSize: descriptor.pageSize,
    }),
  }))).finally(() => observeTiming?.({
    name: "supabase_catalog",
    durationMs: performance.now() - startedAt,
  }));
  if (results.every((result) => result.status === "rejected")) {
    throw new Error("Homepage optional catalog is unavailable.");
  }

  const layers = emptyLayers(input.scope);
  const markers: HomepageInitialMarkerV1[] = [];
  const cardDetails: HomepageInitialCardDetailV1[] = [];
  const selectedCategories: Array<{ layer: HomepageInitialLayer; category: HomepageInitialMarkerV1[3] }> = [];
  const fulfilledSources: Array<{ descriptor: HomepageCatalogDatasetDescriptor; page: PublicMapPlacePage }> = [];
  for (const result of results) {
    if (result.status === "rejected") continue;
    const { descriptor, page } = result.value;
    fulfilledSources.push({ descriptor, page });
    if (page.region.id !== input.region) throw new Error("Homepage optional catalog region does not match the request.");
    const layer = descriptor.layer;
    const normalized = page.items.map((place) => {
      const marker = normalizePublicMapCatalogMarker(place, input.region);
      return {
        ...marker,
        layer,
        petAccessVerdict: marker.petAccessVerdict ?? "unknown",
        category: mapCatalogPlaceToCategory({
          layer,
          category: marker.category,
          categoryGroupCode: marker.categoryGroupCode,
        }),
      };
    });
    const tuples = normalized.flatMap((marker) => {
      const compact = toHomepageInitialTuple(marker);
      if (compact) {
        cardDetails.push([
          marker.id,
          marker.address,
          marker.phone ?? null,
          marker.imageUrl ?? null,
        ]);
      }
      return compact ? [compact] : [];
    });
    layers[layer] = layerSnapshot(page.totalCount === 0 ? "empty" : "ready", page.totalCount, tuples.length);
    selectedCategories.push(...page.items.map((place) => ({
      layer,
      category: mapCatalogPlaceToCategory({
        layer,
        category: place.category ?? "other",
        categoryGroupCode: place.categoryGroupCode,
      }),
    })));
    markers.push(...tuples);
  }
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    const index = results.indexOf(result);
    const layer = requestedSources[index].layer;
    layers[layer] = layerSnapshot("unavailable", null, null);
  }
  const generatedAt = now().toISOString();
  const observedGenerationId = generationId(input, fulfilledSources);
  const continuations = fulfilledSources.map(({ descriptor, page }) =>
    continuationFor(descriptor, page, observedGenerationId));
  const totalCount = HOMEPAGE_INITIAL_LAYERS.reduce(
    (sum, layer) => sum + (layers[layer].count ?? 0),
    0,
  );
  return {
    contractVersion: 1,
    region: input.region,
    scope: input.scope,
    providers: input.providers,
    generatedAt,
    dataVersion: dataVersion(input, observedGenerationId, markers, cardDetails),
    generationId: observedGenerationId,
    totalCount,
    markerCount: markers.length,
    freshness: { status: "fresh" },
    layers,
    categoryCounts: homepageCategoryCounts(selectedCategories),
    markers,
    cardDetails,
    continuations,
  };
}

export async function assembleHomepageInitialPlaces(
  input: HomepageInitialPlacesRequest,
  {
    queryPublicCatalog = queryPublicMapCatalog as CatalogQuery,
    now = () => new Date(),
    observeTiming,
  }: {
    queryPublicCatalog?: CatalogQuery;
    now?: () => Date;
    observeTiming?: HomepageTimingObserver;
  } = {},
): Promise<HomepageInitialPlacesSnapshot> {
  return input.scope === "default"
    ? assembleDefault(input, queryPublicCatalog, now, observeTiming)
    : assembleOptional(input, queryPublicCatalog, now, observeTiming);
}

interface InitialCacheEntry {
  value?: HomepageInitialPlacesSnapshot;
  storedAt?: number;
  inFlight?: Promise<HomepageInitialPlacesSnapshot>;
  retryAfter?: number;
}

function hasUnavailableLayer(snapshot: HomepageInitialPlacesSnapshot): boolean {
  return HOMEPAGE_INITIAL_LAYERS.some(
    (layer) => snapshot.layers[layer].state === "unavailable",
  );
}

export function homepageInitialCacheKey(
  input: HomepageInitialPlacesRequest,
): string {
  const region = getRegionConfig(input.region);
  if (!region) return `${input.version}:${input.region}:${input.scope}:unavailable:${input.providers}`;
  const datasets = getHomepageCatalogDatasets(region, input.scope)
    .filter(({ requiresThirdParty }) => !requiresThirdParty)
    .filter(({ layer }) => input.scope === "optional" ||
      ((layer === "tourism" || layer === "kakao") && providerAllowed(layer, input.providers)))
    .map((dataset) => homepageDatasetCacheKey(region, dataset))
    .sort()
    .join("|");
  return `${input.version}:${input.region}:${input.scope}:${datasets}:${input.providers}`;
}

export function createHomepageInitialPlacesLoader({
  assemble = (input, observeTiming) => assembleHomepageInitialPlaces(input, { observeTiming }),
  now = Date.now,
  freshMs = HOMEPAGE_INITIAL_FRESH_MS,
  staleIfErrorMs = HOMEPAGE_INITIAL_STALE_IF_ERROR_MS,
}: {
  assemble?: InitialAssembler;
  now?: () => number;
  freshMs?: number;
  staleIfErrorMs?: number;
} = {}): InitialAssembler {
  const entries = new Map<string, InitialCacheEntry>();
  return async (input, observeTiming) => {
    const cacheStartedAt = performance.now();
    const observeCache = (description: "hit" | "miss" | "coalesced" | "stale") => observeTiming?.({
      name: "app_cache",
      durationMs: performance.now() - cacheStartedAt,
      description,
    });
    const key = homepageInitialCacheKey(input);
    const entry = entries.get(key) ?? {};
    const age = entry.storedAt === undefined ? Number.POSITIVE_INFINITY : now() - entry.storedAt;
    if (entry.value && age <= freshMs) {
      observeCache("hit");
      return entry.value;
    }
    if (entry.value && entry.retryAfter !== undefined && entry.retryAfter > now()) {
      observeCache("stale");
      return { ...entry.value, freshness: { status: "stale", staleAt: new Date(now()).toISOString() } };
    }
    if (entry.inFlight) {
      observeCache("coalesced");
      return entry.inFlight;
    }
    observeCache("miss");
    const inFlight = assemble(input, observeTiming).then((value) => {
      if (hasUnavailableLayer(value)) {
        if (entry.value && age <= freshMs + staleIfErrorMs) {
          entries.set(key, {
            value: entry.value,
            storedAt: entry.storedAt,
            retryAfter: now() + Math.min(freshMs, 60_000),
          });
          return {
            ...entry.value,
            freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() },
          };
        }
        entries.delete(key);
      } else {
        entries.set(key, { value, storedAt: now() });
      }
      return value;
    }).catch((error: unknown) => {
      if (entry.value && age <= freshMs + staleIfErrorMs) {
        entries.set(key, {
          value: entry.value,
          storedAt: entry.storedAt,
          retryAfter: now() + Math.min(freshMs, 60_000),
        });
        return {
          ...entry.value,
          freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() },
        };
      }
      entries.delete(key);
      throw error;
    });
    entries.set(key, { ...entry, inFlight });
    return inFlight;
  };
}

export const loadHomepageInitialPlaces = createHomepageInitialPlacesLoader();
