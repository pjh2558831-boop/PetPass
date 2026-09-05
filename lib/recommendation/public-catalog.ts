import "server-only";

import { createHash } from "node:crypto";
import { queryPublicMapCatalog } from "@/lib/map-places/public-catalog";
import { getRegionConfig } from "@/lib/regions/config";
import { resolveMapCatalogPublicationVersion } from "@/lib/map-places/publication-version";
import { MAP_SNAPSHOT_FRESH_MS } from "@/lib/map-places/snapshot";
import { normalizePublicMapCatalogMarker } from "@/types/public-catalog-place";
import type { MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { RegionId } from "@/types/region";

export interface RecommendationPublicCatalog {
  items: MapPlacesSnapshotMarker[];
  dataVersion: string;
  pages: number;
  unavailableSources: string[];
}

const cache = new Map<RegionId, { publication: string; loadedAt: number; catalog: RecommendationPublicCatalog }>();

/** Read the published universe, independently per provider; no viewport/category/detail gate. */
export async function loadRecommendationPublicCatalog(
  regionId: RegionId,
  dependencies: { query?: typeof queryPublicMapCatalog; signal?: AbortSignal } = {},
): Promise<RecommendationPublicCatalog> {
  dependencies.signal?.throwIfAborted();
  const region = getRegionConfig(regionId);
  const publication = dependencies.query ? null : (await Promise.all(region.mapCatalog.snapshotDatasets.map(dataset =>
    resolveMapCatalogPublicationVersion({ region: regionId, dataset, providers: dataset === "shopping" ? ["tour"] : region.allowedMapProviders }),
  )).catch(() => [])).join(":");
  dependencies.signal?.throwIfAborted();
  const cached = cache.get(regionId);
  if (publication && cached?.publication === publication && Date.now() - cached.loadedAt < MAP_SNAPSHOT_FRESH_MS) return cached.catalog;
  const query = dependencies.query ?? queryPublicMapCatalog;
  const items: MapPlacesSnapshotMarker[] = [];
  const unavailableSources: string[] = [];
  let pages = 0;
  let successfulSources = 0;
  let firstFailure: unknown;
  for (const dataset of region.mapCatalog.snapshotDatasets) {
    for (const provider of dataset === "shopping" ? ["tour" as const] : region.allowedMapProviders) {
      const sourceItems: MapPlacesSnapshotMarker[] = [];
      let afterId: number | undefined;
      let expectedTotal: number | undefined;
      const identities = new Set<string>();
      try {
        for (let pageNumber = 1; ; pageNumber += 1) {
          dependencies.signal?.throwIfAborted();
          const page = await query({ signal: dependencies.signal, regionId, dataset, providers: [provider], page: pageNumber, pageSize: 200, ...(afterId === undefined ? {} : { afterId }) });
          pages += 1;
          dependencies.signal?.throwIfAborted();
          expectedTotal ??= page.totalCount;
          if (page.totalCount !== expectedTotal || page.region.id !== regionId) throw new Error("public_catalog_changed_during_read");
          for (const place of page.items) {
            if (place.provider !== provider || identities.has(place.id)) throw new Error("public_catalog_identity_mismatch");
            identities.add(place.id);
            const marker = normalizePublicMapCatalogMarker(place, regionId);
            sourceItems.push({ ...marker, dataset, phone: place.phone, contentTypeId: place.contentTypeId, petAccessVerdict: place.petAccessVerdict ?? "unknown", sourceLabel: provider === "tour" ? "한국관광공사" : "카카오 검색 후보" });
          }
          if (!page.hasNext) break;
          if (!page.items.length || page.nextCursor == null || (afterId !== undefined && page.nextCursor <= afterId)) throw new Error("public_catalog_cursor_did_not_advance");
          afterId = page.nextCursor;
        }
        if (sourceItems.length !== expectedTotal) throw new Error("public_catalog_incomplete");
        items.push(...sourceItems);
        successfulSources += 1;
      } catch (error) {
        if (dependencies.signal?.aborted) throw error;
        firstFailure ??= error;
        unavailableSources.push(`${provider}:${dataset}`);
      }
    }
  }
  if (!successfulSources || (!items.length && unavailableSources.length)) throw new Error("public_catalog_unavailable", { cause: firstFailure });
  const catalog = {
    items,
    pages,
    unavailableSources,
    dataVersion: createHash("sha256").update(JSON.stringify(items)).digest("hex"),
  };
  if (publication && !unavailableSources.length) cache.set(regionId, { publication, loadedAt: Date.now(), catalog });
  return catalog;
}
