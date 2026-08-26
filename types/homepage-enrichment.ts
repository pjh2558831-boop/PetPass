import { isPlaceCategory } from "@/lib/map-places/place-categories";
import type { HomepageFeaturedState } from "@/types/homepage";
import type { HomepagePlaceCard } from "@/types/homepage-places";

export const HOMEPAGE_ENRICHMENT_VERSION = 1 as const;
export const HOMEPAGE_ENRICHMENT_SCOPE = "featured" as const;

export interface HomepageEnrichmentSnapshot {
  contractVersion: typeof HOMEPAGE_ENRICHMENT_VERSION;
  region: "busan";
  scope: typeof HOMEPAGE_ENRICHMENT_SCOPE;
  generatedAt: string;
  dataVersion: string;
  freshness: {
    status: "fresh" | "stale";
    staleAt?: string;
  };
  featuredState: HomepageFeaturedState;
  cards: HomepagePlaceCard[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isHomepageEnrichmentSnapshot(
  value: unknown,
): value is HomepageEnrichmentSnapshot {
  if (!isRecord(value) || value.contractVersion !== HOMEPAGE_ENRICHMENT_VERSION) return false;
  if (value.region !== "busan" || value.scope !== HOMEPAGE_ENRICHMENT_SCOPE) return false;
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) return false;
  if (typeof value.dataVersion !== "string" || !/^v1-[a-f0-9]{16}$/u.test(value.dataVersion)) return false;
  if (!isRecord(value.freshness) || !["fresh", "stale"].includes(String(value.freshness.status))) return false;
  if (value.freshness.status === "stale" && (
    typeof value.freshness.staleAt !== "string" || !Number.isFinite(Date.parse(value.freshness.staleAt))
  )) return false;
  if (!["ready", "partial", "empty", "unavailable"].includes(String(value.featuredState))) return false;
  if (!Array.isArray(value.cards)) return false;
  return value.cards.every((card) => isRecord(card) &&
    typeof card.id === "string" && card.id.startsWith("tour:") &&
    card.layer === "official" &&
    typeof card.name === "string" && card.name.length > 0 &&
    typeof card.category === "string" && isPlaceCategory(card.category) &&
    typeof card.categoryLabel === "string" && card.categoryLabel.length > 0 &&
    (card.district === null || typeof card.district === "string") &&
    typeof card.address === "string" && card.address.length > 0 &&
    (card.phone === null || typeof card.phone === "string") &&
    typeof card.statusLabel === "string" && card.statusLabel.length > 0 &&
    card.warning === null &&
    card.isAllowed === true &&
    card.sourceLabel === "한국관광공사" &&
    typeof card.href === "string" && card.href.startsWith("/places/") &&
    card.external === false &&
    (card.imageUrl === null || (
      typeof card.imageUrl === "string" && /^https?:\/\//u.test(card.imageUrl)
    )));
}
