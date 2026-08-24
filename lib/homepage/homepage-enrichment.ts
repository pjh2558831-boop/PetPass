import "server-only";

import { createHash } from "node:crypto";
import { createOfficialHomepageCard } from "@/lib/homepage/homepage-places";
import type { HomepageTimingObserver } from "@/lib/homepage/performance-timing";
import { collectTourHomepageSnapshot } from "@/lib/tour-api/homepage-catalog";
import { getDefaultTourService, type TourPlaceService } from "@/lib/tour-api/service";
import type { TourHomepageSnapshot } from "@/types/homepage";
import type { HomepageEnrichmentSnapshot } from "@/types/homepage-enrichment";

export const HOMEPAGE_ENRICHMENT_FRESH_MS = 300_000;
export const HOMEPAGE_ENRICHMENT_STALE_IF_ERROR_MS = 3_600_000;

type EnrichmentCollector = (
  observeTiming?: HomepageTimingObserver,
) => Promise<HomepageEnrichmentSnapshot>;

function enrichmentDataVersion(
  snapshot: Pick<HomepageEnrichmentSnapshot, "generatedAt" | "featuredState" | "cards">,
): string {
  const hash = createHash("sha256");
  hash.update(`${snapshot.generatedAt}:${snapshot.featuredState}\n`);
  for (const card of snapshot.cards) hash.update(`${JSON.stringify(card)}\n`);
  return `v1-${hash.digest("hex").slice(0, 16)}`;
}

export async function collectHomepageEnrichment({
  service,
  now,
  collectOfficial = collectTourHomepageSnapshot,
  observeTiming,
}: {
  service: TourPlaceService;
  now?: () => Date;
  collectOfficial?: (input: {
    service: TourPlaceService;
    now?: () => Date;
    observeTiming?: HomepageTimingObserver;
  }) => Promise<TourHomepageSnapshot>;
  observeTiming?: HomepageTimingObserver;
}): Promise<HomepageEnrichmentSnapshot> {
  const official = await collectOfficial({ service, now, observeTiming });
  const mergeStartedAt = performance.now();
  const generatedAt = official.catalog.source.retrievedAt;
  const partial = {
    generatedAt,
    featuredState: official.featured.state,
    cards: official.featured.places.map(({ summary }) =>
      createOfficialHomepageCard(summary, true),
    ),
  };
  const snapshot: HomepageEnrichmentSnapshot = {
    contractVersion: 1,
    region: "busan",
    scope: "featured",
    ...partial,
    dataVersion: enrichmentDataVersion(partial),
    freshness: { status: "fresh" },
  };
  observeTiming?.({ name: "merge", durationMs: performance.now() - mergeStartedAt });
  return snapshot;
}

interface EnrichmentCacheEntry {
  value?: HomepageEnrichmentSnapshot;
  storedAt?: number;
  inFlight?: Promise<HomepageEnrichmentSnapshot>;
  retryAfter?: number;
}

export function createHomepageEnrichmentLoader({
  collect = (observeTiming) => collectHomepageEnrichment({
    service: getDefaultTourService(),
    observeTiming,
  }),
  now = Date.now,
  freshMs = HOMEPAGE_ENRICHMENT_FRESH_MS,
  staleIfErrorMs = HOMEPAGE_ENRICHMENT_STALE_IF_ERROR_MS,
}: {
  collect?: EnrichmentCollector;
  now?: () => number;
  freshMs?: number;
  staleIfErrorMs?: number;
} = {}): EnrichmentCollector {
  const entry: EnrichmentCacheEntry = {};
  return async (observeTiming) => {
    const cacheStartedAt = performance.now();
    const observeCache = (description: "hit" | "miss" | "coalesced" | "stale") => observeTiming?.({
      name: "app_cache",
      durationMs: performance.now() - cacheStartedAt,
      description,
    });
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
    const inFlight = collect(observeTiming).then((value) => {
      entry.value = value;
      entry.storedAt = now();
      entry.inFlight = undefined;
      entry.retryAfter = undefined;
      return value;
    }).catch((error: unknown) => {
      entry.inFlight = undefined;
      if (entry.value && age <= freshMs + staleIfErrorMs) {
        entry.retryAfter = now() + Math.min(freshMs, 60_000);
        return {
          ...entry.value,
          freshness: { status: "stale" as const, staleAt: new Date(now()).toISOString() },
        };
      }
      throw error;
    });
    entry.inFlight = inFlight;
    return inFlight;
  };
}

export const loadHomepageEnrichment = createHomepageEnrichmentLoader();
