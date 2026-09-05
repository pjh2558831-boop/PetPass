import "server-only";

import { createHash } from "node:crypto";
import {
  getHomepageCatalogDataset,
  homepageDatasetCacheKey,
} from "@/lib/homepage/catalog-datasets";
import {
  homepageCategoryCounts,
  toHomepageInitialTuple,
} from "@/lib/homepage/homepage-initial";
import type { HomepageTimingObserver } from "@/lib/homepage/performance-timing";
import { mapCatalogPlaceToCategory } from "@/lib/map-places/place-categories";
import { queryPublicMapCatalog } from "@/lib/map-places/public-catalog";
import { getRegionConfig, getRegionDistrict } from "@/lib/regions/config";
import { normalizePublicMapCatalogMarker } from "@/types/public-catalog-place";
import {
  collectTourHomepageOptionalDataset,
  TourHomepageOptionalDatasetError,
} from "@/lib/tour-api/homepage-optional-dataset";
import {
  getDefaultTourService,
  type TourPlaceService,
} from "@/lib/tour-api/service";
import type {
  HomepageInitialCardDetailV1,
  HomepageInitialCategoryCountV1,
  HomepageInitialLayer,
  HomepageInitialLayerSnapshot,
  HomepageInitialMarkerV1,
} from "@/types/homepage-initial";
import type {
  HomepageOptionalRequest,
  HomepageOptionalSnapshot,
} from "@/types/homepage-optional";
import {
  homepageOptionalDataHash,
  isHomepageOptionalSnapshot,
} from "@/types/homepage-optional";
import type { PublicMapPlaceDTO, PublicMapPlacePage } from "@/types/public-map-place";

export const HOMEPAGE_OPTIONAL_FRESH_MS = 300_000;
export const HOMEPAGE_OPTIONAL_STALE_IF_ERROR_MS = 3_600_000;

type CatalogQuery = typeof queryPublicMapCatalog;

function deferredLayers(): Record<HomepageInitialLayer, HomepageInitialLayerSnapshot> {
  return {
    tourism: { state: "deferred", count: null, markerCount: null },
    kakao: { state: "deferred", count: null, markerCount: null },
    veterinary: { state: "deferred", count: null, markerCount: null },
    pet_shop: { state: "deferred", count: null, markerCount: null },
  };
}

async function loadAllPages(
  input: HomepageOptionalRequest,
  descriptor: NonNullable<ReturnType<typeof getHomepageCatalogDataset>>,
  queryCatalog: CatalogQuery,
  observeTiming?: HomepageTimingObserver,
): Promise<{
  items: PublicMapPlaceDTO[];
  nextCursor: number | null;
  pageCount: number;
  retrievedAt: string;
}> {
  let cursor: number | undefined;
  let terminalCursor: number | null = null;
  let expectedTotal: number | null = null;
  let maximumPages = 1;
  const items: PublicMapPlaceDTO[] = [];
  const ids = new Set<string>();
  for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
    const startedAt = performance.now();
    const page: PublicMapPlacePage = await queryCatalog({
      regionId: input.region,
      providers: [descriptor.provider],
      kinds: [descriptor.kind],
      page: 1,
      pageSize: descriptor.pageSize,
      ...(cursor === undefined ? {} : { afterId: cursor }),
    }).finally(() => observeTiming?.({
      name: "supabase_catalog",
      durationMs: performance.now() - startedAt,
    }));
    if (page.region.id !== input.region) throw new Error("Optional dataset crossed region boundary.");
    if (expectedTotal === null) {
      expectedTotal = page.totalCount;
      maximumPages = Math.max(1, Math.ceil(expectedTotal / descriptor.pageSize) + 1);
    } else if (page.totalCount !== expectedTotal) {
      throw new Error("Optional dataset generation changed while paging.");
    }
    for (const item of page.items) {
      if (ids.has(item.id)) throw new Error("Optional dataset returned duplicate stable IDs.");
      ids.add(item.id);
      items.push(item);
    }
    const nextCursor = page.nextCursor ?? null;
    if (!page.hasNext) {
      terminalCursor = nextCursor;
      break;
    }
    if (nextCursor === null || nextCursor === cursor) throw new Error("Optional dataset cursor did not advance.");
    cursor = nextCursor;
  }
  if (expectedTotal === null || items.length !== expectedTotal) {
    throw new Error("Optional dataset ended before its expected count.");
  }
  return {
    items,
    nextCursor: terminalCursor,
    pageCount: Math.max(1, Math.ceil(items.length / descriptor.pageSize)),
    retrievedAt: items.reduce(
      (latest, item) => item.lastSeenAt && item.lastSeenAt > latest ? item.lastSeenAt : latest,
      "",
    ) || new Date(0).toISOString(),
  };
}

function versionFor(
  input: HomepageOptionalRequest,
  identities: ReadonlyArray<{ id: string; changedAt: string | null }>,
  markers: readonly HomepageInitialMarkerV1[],
): { dataVersion: string; generationId: string } {
  const generation = createHash("sha256");
  generation.update(`${input.version}:${input.region}:${input.scope}:${input.dataset}:${identities.length}\n`);
  for (const item of identities) generation.update(`${item.id}:${item.changedAt ?? "unknown"}\n`);
  const generationId = `g1-${generation.digest("hex").slice(0, 16)}`;
  const data = createHash("sha256");
  data.update(`${generationId}\n`);
  for (const marker of markers) data.update(`${JSON.stringify(marker)}\n`);
  return { generationId, dataVersion: `v1-${data.digest("hex").slice(0, 16)}` };
}

export async function assembleHomepageOptionalDataset(
  input: HomepageOptionalRequest,
  {
    queryCatalog = queryPublicMapCatalog,
    tourService,
    now = () => new Date(),
    observeTiming,
  }: {
    queryCatalog?: CatalogQuery;
    tourService?: TourPlaceService;
    now?: () => Date;
    observeTiming?: HomepageTimingObserver;
  } = {},
): Promise<HomepageOptionalSnapshot> {
  const region = getRegionConfig(input.region);
  const descriptor = region ? getHomepageCatalogDataset(region, input.dataset) : null;
  if (!region?.mapEnabled || !descriptor || descriptor.scope !== "optional") {
    throw new TourHomepageOptionalDatasetError(
      "unavailable",
      "Optional dataset is not enabled for this region.",
    );
  }
  const markers: HomepageInitialMarkerV1[] = [];
  const cardDetails: HomepageInitialCardDetailV1[] = [];
  const categories: Array<{ layer: HomepageInitialLayer; category: HomepageInitialMarkerV1[3] }> = [];
  let itemCount = 0;
  let providerTotalCount = 0;
  let visibilityTotalCount: number | null = null;
  let pageCount = 1;
  let visibilityPageCount: number | null = null;
  let integrityPageSize = descriptor.pageSize;
  let nextCursor: number | null = null;
  let retrievedAt = now().toISOString();
  let identities: Array<{ id: string; changedAt: string | null }> = [];

  if (descriptor.provider === "tour") {
    const loaded = await collectTourHomepageOptionalDataset({
      region,
      descriptor,
      service: tourService ?? getDefaultTourService(),
      observeTiming,
    });
    itemCount = loaded.returnedCount;
    providerTotalCount = loaded.listTotalCount;
    visibilityTotalCount = loaded.visibilityTotalCount;
    pageCount = loaded.listPageCount;
    visibilityPageCount = loaded.visibilityPageCount;
    integrityPageSize = loaded.pageSize;
    retrievedAt = loaded.retrievedAt;
    identities = loaded.places.map((place) => ({
      id: `tour:${place.contentId}`,
      changedAt: place.modifiedTime ?? place.source.retrievedAt,
    }));
    for (const place of loaded.places) {
      const category = descriptor.categories[0];
      const district = getRegionDistrict(region, place.legalDistrictCode);
      const tuple = toHomepageInitialTuple({
        id: `tour:${place.contentId}`,
        name: place.title?.trim() || "이름 확인 필요",
        layer: descriptor.layer,
        category,
        districtName: district?.name ?? null,
        coordinates: place.latitude === null || place.longitude === null
          ? null
          : { latitude: place.latitude, longitude: place.longitude },
        petAccessVerdict: "unknown",
        publicLabel: "반려동물 동반 가능",
      });
      if (!tuple) {
        throw new TourHomepageOptionalDatasetError(
          "partial",
          "Optional KTO marker has no usable coordinates.",
        );
      }
      markers.push(tuple);
      categories.push({ layer: descriptor.layer, category });
    }
  } else {
    if (descriptor.requiresThirdParty) {
      throw new TourHomepageOptionalDatasetError(
        "unavailable",
        "Optional provider configuration is unavailable.",
      );
    }
    const loaded = await loadAllPages(input, descriptor, queryCatalog, observeTiming);
    const items = loaded.items;
    itemCount = items.length;
    providerTotalCount = items.length;
    pageCount = loaded.pageCount;
    nextCursor = loaded.nextCursor;
    retrievedAt = loaded.retrievedAt;
    identities = items.map((item) => ({ id: item.id, changedAt: item.lastSeenAt ?? null }));
    for (const item of items) {
      const normalized = normalizePublicMapCatalogMarker(item, input.region);
      if (normalized.layer !== descriptor.layer) throw new Error("Optional dataset returned an out-of-scope marker.");
      const category = mapCatalogPlaceToCategory({
        layer: descriptor.layer,
        category: normalized.category,
        categoryGroupCode: normalized.categoryGroupCode,
      });
      if (!descriptor.categories.includes(category)) throw new Error("Optional dataset returned an invalid category.");
      const tuple = toHomepageInitialTuple({
        ...normalized,
        layer: descriptor.layer,
        category,
        petAccessVerdict: normalized.petAccessVerdict ?? "unknown",
      });
      if (!tuple) throw new Error("Optional dataset marker has no usable coordinates.");
      markers.push(tuple);
      cardDetails.push([normalized.id, normalized.address, normalized.phone ?? null, normalized.imageUrl ?? null]);
      categories.push({ layer: descriptor.layer, category });
    }
  }
  const { dataVersion, generationId } = versionFor(input, identities, markers);
  const layers = deferredLayers();
  layers[descriptor.layer] = {
    state: markers.length === 0 ? "empty" : "ready",
    count: itemCount,
    markerCount: markers.length,
  };
  const categoryCounts: HomepageInitialCategoryCountV1[] = homepageCategoryCounts(categories);
  const snapshot = {
    contractVersion: 1,
    region: input.region,
    scope: "optional",
    providers: descriptor.provider,
    dataset: input.dataset,
    status: itemCount === 0 ? "complete_empty" : "complete",
    generatedAt: now().toISOString(),
    retrievedAt,
    dataVersion,
    generationId,
    totalCount: itemCount,
    markerCount: markers.length,
    freshness: { status: "fresh" },
    layers,
    categoryCounts,
    markers,
    cardDetails,
    integrity: {
      dataHash: "",
      expectedItemCount: itemCount,
      returnedItemCount: markers.length,
      providerTotalCount,
      visibilityTotalCount,
      pageCount,
      visibilityPageCount,
      pageSize: integrityPageSize,
      nextCursor,
      traversalComplete: true,
    },
    continuations: [{
      datasetId: descriptor.id,
      layer: descriptor.layer,
      provider: descriptor.provider,
      kind: descriptor.kind,
      loadedItemCount: itemCount,
      expectedTotalCount: itemCount,
      nextCursor,
      complete: true,
      generationId,
    }],
  } satisfies HomepageOptionalSnapshot;
  snapshot.integrity.dataHash = homepageOptionalDataHash(snapshot);
  return snapshot;
}

export function homepageOptionalCacheKey(input: HomepageOptionalRequest): string {
  const region = getRegionConfig(input.region);
  const descriptor = region ? getHomepageCatalogDataset(region, input.dataset) : null;
  if (!region || !descriptor) throw new Error("Optional dataset is unavailable.");
  return homepageDatasetCacheKey(region, descriptor);
}

interface OptionalCacheEntry {
  value?: HomepageOptionalSnapshot;
  storedAt?: number;
  inFlight?: Promise<HomepageOptionalSnapshot>;
  retryAfter?: number;
}

export function createHomepageOptionalLoader({
  assemble = assembleHomepageOptionalDataset,
  now = Date.now,
  freshMs = HOMEPAGE_OPTIONAL_FRESH_MS,
  staleIfErrorMs = HOMEPAGE_OPTIONAL_STALE_IF_ERROR_MS,
}: {
  assemble?: typeof assembleHomepageOptionalDataset;
  now?: () => number;
  freshMs?: number;
  staleIfErrorMs?: number;
} = {}) {
  const entries = new Map<string, OptionalCacheEntry>();
  return async (input: HomepageOptionalRequest, observeTiming?: HomepageTimingObserver) => {
    const cacheStartedAt = performance.now();
    const key = homepageOptionalCacheKey(input);
    const entry = entries.get(key) ?? {};
    const age = entry.storedAt === undefined ? Number.POSITIVE_INFINITY : now() - entry.storedAt;
    const observeCache = (description: "hit" | "miss" | "coalesced" | "stale") => observeTiming?.({
      name: "app_cache",
      durationMs: performance.now() - cacheStartedAt,
      description,
    });
    if (entry.value && age <= freshMs) {
      observeCache("hit");
      return entry.value;
    }
    if (entry.value && entry.retryAfter !== undefined && entry.retryAfter > now()) {
      observeCache("stale");
      return {
        ...entry.value,
        status: "stale" as const,
        freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() },
      };
    }
    if (entry.inFlight) {
      observeCache("coalesced");
      return entry.inFlight;
    }
    observeCache("miss");
    const inFlight = assemble(input, { observeTiming }).then((value) => {
      if (!isHomepageOptionalSnapshot(value) ||
        (value.status !== "complete" && value.status !== "complete_empty")) {
        throw new TourHomepageOptionalDatasetError(
          "partial",
          "Optional dataset generation did not produce a complete cacheable value.",
        );
      }
      entries.set(key, { value, storedAt: now() });
      return value;
    }).catch((error: unknown) => {
      if (entry.value && age <= freshMs + staleIfErrorMs) {
        entries.set(key, { value: entry.value, storedAt: entry.storedAt, retryAfter: now() + 60_000 });
        return {
          ...entry.value,
          status: "stale" as const,
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

export const loadHomepageOptionalDataset = createHomepageOptionalLoader();
