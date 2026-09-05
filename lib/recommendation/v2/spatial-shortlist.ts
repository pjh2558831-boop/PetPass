import "server-only";

import { haversineKm } from "@/lib/itinerary/optimizer";
import { PERSONALIZATION_V2_CONFIG } from "@/lib/recommendation/config/personalization-v2";
import { ROUTE_OBJECTIVE_V1_CONFIG } from "@/lib/recommendation/config/route-objective-v1";
import type { RouteOptimizationCandidate } from "@/lib/recommendation/types/route-optimizer";
import type { UsefulTourCategory } from "@/lib/recommendation/types";
import { recommendationHistoryContextKeyV2 } from "@/lib/recommendation/v2/novelty-history";

/** Six places plus departure need at most 42 directed pairs, below the 48-call ceiling. */
export const FULL_CATALOG_MATRIX_CANDIDATE_LIMIT = 6;

export function selectSpatialShortlistV2(input: {
  candidates: readonly RouteOptimizationCandidate[];
  departure: { latitude: number; longitude: number };
  lockedPlaceIds?: readonly string[];
  selectedCategories?: readonly UsefulTourCategory[];
  recentlySelectedCandidateIds?: readonly string[];
  seed: string;
  rerollVariant: number;
  limit?: number;
}): { candidates: RouteOptimizationCandidate[]; reserveIds: string[]; scoredIds: string[] } {
  const byId = new Map(input.candidates.map(candidate => [candidate.node.id, candidate]));
  const lockedIds = new Set([
    ...(input.lockedPlaceIds ?? []),
    ...input.candidates.filter(candidate => candidate.locked).map(candidate => candidate.node.id),
  ]);
  if (lockedIds.size > FULL_CATALOG_MATRIX_CANDIDATE_LIMIT) throw new RangeError("Locked places exceed the route node allowance.");
  for (const id of lockedIds) if (!byId.has(id)) throw new TypeError("A locked place is missing from the scoring pool.");
  const selected: RouteOptimizationCandidate[] = [...lockedIds].map(id => ({ ...byId.get(id)!, locked: true }));
  const selectedIds = new Set(lockedIds);
  const limit = Math.max(lockedIds.size, Math.min(FULL_CATALOG_MATRIX_CANDIDATE_LIMIT, Math.max(0, Math.floor(input.limit ?? FULL_CATALOG_MATRIX_CANDIDATE_LIMIT))));
  const preferred = new Set(input.selectedCategories ?? []);
  const recent = new Set(input.recentlySelectedCandidateIds ?? []);
  const ties = new Map([...byId.keys()].map(id => [id, recommendationHistoryContextKeyV2([input.seed, input.rerollVariant, id])]));

  const rank = () => {
    const categories = new Set(selected.map(candidate => candidate.category));
    const hubs = [input.departure, ...selected.map(candidate => candidate.node)];
    return [...byId.values()].filter(candidate => !selectedIds.has(candidate.node.id)).map(candidate => {
      const distanceKm = Math.min(...hubs.map(hub => haversineKm(hub, candidate.node)));
      // Geographic fit only chooses which real roads to query; it is never a road-time estimate.
      const coherence = PERSONALIZATION_V2_CONFIG.scale * PERSONALIZATION_V2_CONFIG.candidateWeights.travelEfficiency / (1 + distanceKm / 8);
      const categoryGap = preferred.has(candidate.category) && !categories.has(candidate.category)
        ? ROUTE_OBJECTIVE_V1_CONFIG.categoryCoveragePerCategory : 0;
      return { candidate, score: candidate.placeUtility.total + coherence + categoryGap };
    }).sort((left, right) =>
      right.score - left.score ||
      Number(recent.has(left.candidate.node.id)) - Number(recent.has(right.candidate.node.id)) ||
      ties.get(left.candidate.node.id)!.localeCompare(ties.get(right.candidate.node.id)!) ||
      left.candidate.node.id.localeCompare(right.candidate.node.id));
  };
  while (selected.length < limit) {
    const next = rank()[0]?.candidate;
    if (!next) break;
    selected.push(next);
    selectedIds.add(next.node.id);
  }
  return {
    candidates: selected,
    reserveIds: rank().map(({ candidate }) => candidate.node.id),
    scoredIds: [...byId.keys()].sort(),
  };
}
