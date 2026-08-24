import "server-only";

import {
  getHomepageCatalogDataset,
  homepageDatasetCacheKey,
  type HomepageCatalogDatasetDescriptor,
} from "@/lib/homepage/catalog-datasets";
import {
  homepageCategoryCounts,
  toHomepageInitialTuple,
} from "@/lib/homepage/homepage-initial";
import type { HomepageTimingObserver } from "@/lib/homepage/performance-timing";
import { mapCatalogPlaceToCategory } from "@/lib/map-places/place-categories";
import { queryPublicMapCatalog } from "@/lib/map-places/public-catalog";
import { getRegionConfig } from "@/lib/regions/config";
import { normalizePublicMapCatalogMarker } from "@/types/public-catalog-place";
import type {
  HomepageCompletionRequest,
  HomepageCompletionSnapshot,
  HomepageDatasetContinuationV1,
} from "@/types/homepage-completion";
import type { HomepageInitialMarkerV1 } from "@/types/homepage-initial";
import type { PublicMapPlacePage } from "@/types/public-map-place";

export const HOMEPAGE_COMPLETION_FRESH_MS = 300_000;
export const HOMEPAGE_COMPLETION_STALE_IF_ERROR_MS = 3_600_000;

type CatalogQuery = typeof queryPublicMapCatalog;

interface DatasetCompletion {
  continuation: HomepageDatasetContinuationV1;
  markers: HomepageInitialMarkerV1[];
  categories: Array<{
    layer: HomepageInitialMarkerV1[2];
    category: HomepageInitialMarkerV1[3];
  }>;
  rpcCount: number;
}

function assertPage(
  input: HomepageCompletionRequest,
  descriptor: HomepageCatalogDatasetDescriptor,
  continuation: HomepageDatasetContinuationV1,
  page: PublicMapPlacePage,
): void {
  if (page.region.id !== input.region) throw new Error("Completion page crossed region boundary.");
  if (page.totalCount !== continuation.expectedTotalCount) {
    throw new Error("Completion catalog generation changed while paging.");
  }
  if (descriptor.provider !== continuation.provider || descriptor.kind !== continuation.kind) {
    throw new Error("Completion provider or kind is out of scope.");
  }
}

async function completeDataset(
  input: HomepageCompletionRequest,
  continuation: HomepageDatasetContinuationV1,
  descriptor: HomepageCatalogDatasetDescriptor,
  queryCatalog: CatalogQuery,
  observeTiming?: HomepageTimingObserver,
): Promise<DatasetCompletion> {
  if (continuation.complete) {
    return { continuation, markers: [], categories: [], rpcCount: 0 };
  }
  const remaining = continuation.expectedTotalCount - continuation.loadedItemCount;
  const maximumPages = Math.ceil(remaining / descriptor.pageSize) + 1;
  let cursor = continuation.nextCursor;
  let loadedItemCount = continuation.loadedItemCount;
  let rpcCount = 0;
  const markers: HomepageInitialMarkerV1[] = [];
  const categories: DatasetCompletion["categories"] = [];
  const ids = new Set<string>();

  for (let pageIndex = 0; pageIndex < maximumPages && loadedItemCount < continuation.expectedTotalCount; pageIndex += 1) {
    if (cursor === null) throw new Error("Completion cursor ended before the expected count.");
    const startedAt = performance.now();
    const page = await queryCatalog({
      regionId: input.region,
      providers: [descriptor.provider],
      kinds: [descriptor.kind],
      page: 1,
      pageSize: descriptor.pageSize,
      afterId: cursor,
    }).finally(() => observeTiming?.({
      name: "supabase_catalog",
      durationMs: performance.now() - startedAt,
    }));
    rpcCount += 1;
    assertPage(input, descriptor, continuation, page);
    if (page.items.length === 0) throw new Error("Completion returned an empty page before completion.");
    const nextCursor = page.nextCursor ?? null;
    if (nextCursor === cursor) throw new Error("Completion cursor did not advance.");
    for (const place of page.items) {
      const normalized = normalizePublicMapCatalogMarker(place, input.region);
      if (normalized.layer !== descriptor.layer || ids.has(normalized.id)) {
        throw new Error("Completion returned a duplicate or out-of-scope marker.");
      }
      ids.add(normalized.id);
      const category = mapCatalogPlaceToCategory(normalized);
      categories.push({ layer: descriptor.layer, category });
      const tuple = toHomepageInitialTuple({
        ...normalized,
        layer: descriptor.layer,
        category,
        petAccessVerdict: normalized.petAccessVerdict ?? "unknown",
      });
      if (!tuple) throw new Error("Completion returned a marker without valid coordinates.");
      markers.push(tuple);
    }
    loadedItemCount += page.items.length;
    if (loadedItemCount > continuation.expectedTotalCount) {
      throw new Error("Completion returned more records than expected.");
    }
    cursor = nextCursor;
  }

  const complete = loadedItemCount === continuation.expectedTotalCount;
  if (!complete) throw new Error("Completion exceeded its bounded page traversal.");
  return {
    continuation: {
      ...continuation,
      loadedItemCount,
      nextCursor: cursor,
      complete,
    },
    markers,
    categories,
    rpcCount,
  };
}

export async function assembleHomepageCompletion(
  input: HomepageCompletionRequest,
  {
    queryCatalog = queryPublicMapCatalog,
    now = () => new Date(),
    observeTiming,
  }: {
    queryCatalog?: CatalogQuery;
    now?: () => Date;
    observeTiming?: HomepageTimingObserver;
  } = {},
): Promise<HomepageCompletionSnapshot> {
  const region = getRegionConfig(input.region);
  if (!region?.mapEnabled) throw new Error("Completion region is unavailable.");
  if (input.continuations.length === 0 ||
    input.continuations.some((entry) => entry.generationId !== input.generationId)) {
    throw new Error("Completion generation is invalid.");
  }
  const descriptors = input.continuations.map((continuation) => {
    const descriptor = getHomepageCatalogDataset(region, continuation.datasetId);
    if (!descriptor || descriptor.scope !== "default") {
      throw new Error("Completion dataset is not enabled for the region.");
    }
    return descriptor;
  });
  const outcomes = await Promise.allSettled(input.continuations.map((continuation, index) =>
    completeDataset(input, continuation, descriptors[index], queryCatalog, observeTiming)));
  const completed = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
  if (completed.length === 0) {
    const firstFailure = outcomes.find((outcome) => outcome.status === "rejected");
    if (firstFailure?.status === "rejected" && firstFailure.reason instanceof Error) {
      throw firstFailure.reason;
    }
    throw new Error("Homepage completion is unavailable.");
  }
  const continuations = outcomes.map((outcome, index) =>
    outcome.status === "fulfilled" ? outcome.value.continuation : input.continuations[index]);
  const markers = completed.flatMap(({ markers: values }) => values);
  if (new Set(markers.map((marker) => marker[0])).size !== markers.length) {
    throw new Error("Completion datasets returned duplicate stable IDs.");
  }
  return {
    contractVersion: 1,
    region: input.region,
    scope: "default",
    dataset: "default-map",
    baseDataVersion: input.baseDataVersion,
    generationId: input.generationId,
    generatedAt: now().toISOString(),
    returnedItemCount: markers.length,
    expectedTotalCount: continuations.reduce((sum, entry) => sum + entry.expectedTotalCount, 0),
    complete: continuations.every(({ complete }) => complete),
    freshness: { status: "fresh" },
    continuations,
    categoryCounts: homepageCategoryCounts(completed.flatMap(({ categories: values }) => values)),
    markers,
  };
}

export function homepageCompletionCacheKey(input: HomepageCompletionRequest): string {
  const region = getRegionConfig(input.region);
  if (!region) throw new Error("Completion region is unavailable.");
  const dimensions = input.continuations.map((continuation) => {
    const descriptor = getHomepageCatalogDataset(region, continuation.datasetId);
    if (!descriptor) throw new Error("Completion dataset is unavailable.");
    return `${homepageDatasetCacheKey(region, descriptor)}:${continuation.nextCursor ?? "end"}:${continuation.expectedTotalCount}`;
  }).sort();
  return `${input.version}:${input.region}:${input.scope}:${input.dataset}:${input.baseDataVersion}:${input.generationId}:${dimensions.join("|")}`;
}

interface CompletionCacheEntry {
  value?: HomepageCompletionSnapshot;
  storedAt?: number;
  inFlight?: Promise<HomepageCompletionSnapshot>;
  retryAfter?: number;
}

export function createHomepageCompletionLoader({
  assemble = assembleHomepageCompletion,
  now = Date.now,
  freshMs = HOMEPAGE_COMPLETION_FRESH_MS,
  staleIfErrorMs = HOMEPAGE_COMPLETION_STALE_IF_ERROR_MS,
}: {
  assemble?: typeof assembleHomepageCompletion;
  now?: () => number;
  freshMs?: number;
  staleIfErrorMs?: number;
} = {}) {
  const entries = new Map<string, CompletionCacheEntry>();
  return async (input: HomepageCompletionRequest, observeTiming?: HomepageTimingObserver) => {
    const cacheStartedAt = performance.now();
    const key = homepageCompletionCacheKey(input);
    const entry = entries.get(key) ?? {};
    const age = entry.storedAt === undefined ? Number.POSITIVE_INFINITY : now() - entry.storedAt;
    const cacheObservation = (description: "hit" | "miss" | "coalesced" | "stale") => observeTiming?.({
      name: "app_cache",
      durationMs: performance.now() - cacheStartedAt,
      description,
    });
    if (entry.value && age <= freshMs) {
      cacheObservation("hit");
      return entry.value;
    }
    if (entry.value && entry.retryAfter !== undefined && entry.retryAfter > now()) {
      cacheObservation("stale");
      return { ...entry.value, freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() } };
    }
    if (entry.inFlight) {
      cacheObservation("coalesced");
      return entry.inFlight;
    }
    cacheObservation("miss");
    const inFlight = assemble(input, { observeTiming }).then((value) => {
      if (!value.complete) {
        if (entry.value && age <= freshMs + staleIfErrorMs) {
          const stale = { ...entry.value, freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() } };
          entries.set(key, { value: entry.value, storedAt: entry.storedAt, retryAfter: now() + 60_000 });
          return stale;
        }
        entries.delete(key);
        return value;
      }
      entries.set(key, { value, storedAt: now() });
      return value;
    }).catch((error: unknown) => {
      if (entry.value && age <= freshMs + staleIfErrorMs) {
        entries.set(key, { value: entry.value, storedAt: entry.storedAt, retryAfter: now() + 60_000 });
        return { ...entry.value, freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() } };
      }
      entries.delete(key);
      throw error;
    });
    entries.set(key, { ...entry, inFlight });
    return inFlight;
  };
}

export const loadHomepageCompletion = createHomepageCompletionLoader();
