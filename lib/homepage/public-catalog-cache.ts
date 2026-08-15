import "server-only";

import {
  queryPublicMapCatalog,
  type PublicMapCatalogQuery,
} from "@/lib/map-places/public-catalog";
import type { PublicMapPlacePage } from "@/types/public-map-place";

export const HOMEPAGE_PUBLIC_CATALOG_CACHE_MS = 60_000;

type CatalogLoader = (
  input: PublicMapCatalogQuery,
) => Promise<PublicMapPlacePage>;

interface CacheEntry {
  expiresAt: number;
  promise: Promise<PublicMapPlacePage>;
}

function cacheKey(input: PublicMapCatalogQuery): string {
  return JSON.stringify({
    districtCodes: [...(input.districtCodes ?? [])].sort(),
    kinds: [...(input.kinds ?? [])].sort(),
    category: input.category ?? null,
    page: input.page,
    pageSize: input.pageSize,
  });
}

export function createHomepagePublicCatalogLoader({
  query = queryPublicMapCatalog,
  now = Date.now,
  ttlMs = HOMEPAGE_PUBLIC_CATALOG_CACHE_MS,
}: {
  query?: CatalogLoader;
  now?: () => number;
  ttlMs?: number;
} = {}): CatalogLoader {
  const entries = new Map<string, CacheEntry>();

  return (input) => {
    const key = cacheKey(input);
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now()) return cached.promise;

    const promise = query(input);
    const entry = { expiresAt: now() + ttlMs, promise };
    entries.set(key, entry);
    void promise.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return promise;
  };
}

export const queryCachedHomepagePublicCatalog =
  createHomepagePublicCatalogLoader();
