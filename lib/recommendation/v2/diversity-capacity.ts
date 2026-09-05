import type { UsefulTourCategory } from "@/lib/recommendation/types";

export type DiversityCapacityV2 = "sufficient" | "limited" | "exhausted";

export interface DiversityCapacityResultV2 {
  /** Full scored universe, distinct from the road-known eligible count below. */
  scoredUniqueCandidateCount?: number;
  /** Unseen automatic reserves still needing road validation; not feasible replacements. */
  unqueriedCandidateCount?: number;
  eligibleUniqueCandidateCount: number;
  requestedStopCount: number;
  unseenEligibleCandidateCount: number;
  maximumFeasibleNovelReplacements: number;
  diversityCapacity: DiversityCapacityV2;
  limitingReasonCodes: string[];
}

export function calculateDiversityCapacityV2(input: {
  planningPolicy?: "full_public_catalog_v1";
  /** Caller excludes every node queried by any matrix attempt in this request. */
  unqueriedCandidateIds?: readonly string[];
  candidates: readonly { id: string; category: UsefulTourCategory }[];
  requestedStopCount: number;
  mandatorySelectedPlaceIds: readonly string[];
  seenCandidateIds: readonly string[];
  requiredCategories: readonly UsefulTourCategory[];
  feasibleCandidateIds: readonly string[];
  requiredRoadEdgesResolved: boolean;
  feasibilityReasonCodes?: readonly string[];
}): DiversityCapacityResultV2 {
  const fullCatalog = input.planningPolicy === "full_public_catalog_v1";
  const requestedStopCount = Math.max(1, Math.min(5, Math.floor(input.requestedStopCount)));
  const feasibleIds = new Set(input.feasibleCandidateIds);
  const scoredCandidates = new Map(input.candidates.map(candidate => [candidate.id, candidate]));
  const candidates = [...scoredCandidates.values()].filter(({ id }) => feasibleIds.has(id));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const mandatory = new Set(
    input.mandatorySelectedPlaceIds.filter((id) => fullCatalog ? scoredCandidates.has(id) : candidateById.has(id)),
  );
  const seen = new Set(input.seenCandidateIds);
  const unseen = candidates.filter(({ id }) => !seen.has(id) && !mandatory.has(id));
  const replaceableSlots = Math.max(0, requestedStopCount - mandatory.size);
  const unqueriedCandidateCount = fullCatalog && replaceableSlots > 0
    ? new Set((input.unqueriedCandidateIds ?? []).filter(id =>
        scoredCandidates.has(id) && !feasibleIds.has(id) && !seen.has(id) && !mandatory.has(id),
      )).size
    : 0;
  const mandatoryCategories = new Set(
    [...mandatory].flatMap((id) => {
      const category = candidateById.get(id)?.category;
      return category ? [category] : [];
    }),
  );
  const missingCategories = [...new Set(fullCatalog ? [] : input.requiredCategories)].filter(
    (category) => !mandatoryCategories.has(category),
  );
  let nonNovelRequiredSlots = 0;
  let missingFeasibleCategory = false;
  for (const category of missingCategories) {
    if (unseen.some((candidate) => candidate.category === category)) continue;
    if (candidates.some((candidate) =>
      !mandatory.has(candidate.id) && candidate.category === category
    )) {
      nonNovelRequiredSlots += 1;
    } else {
      missingFeasibleCategory = true;
    }
  }
  const maximumFeasibleNovelReplacements =
    input.requiredRoadEdgesResolved && !missingFeasibleCategory
      ? Math.min(
          unseen.length,
          Math.max(0, replaceableSlots - nonNovelRequiredSlots),
        )
      : 0;
  const diversityCapacity: DiversityCapacityV2 =
    replaceableSlots > 0 &&
    maximumFeasibleNovelReplacements >= replaceableSlots &&
    candidates.length >= requestedStopCount
      ? "sufficient"
      : maximumFeasibleNovelReplacements > 0 || unqueriedCandidateCount > 0
        ? "limited"
        : "exhausted";
  const limitingReasonCodes = [
    ...(candidates.length < requestedStopCount
      ? ["eligible_unique_candidates_below_requested_stops"]
      : []),
    ...(unseen.length < replaceableSlots
      ? ["unseen_eligible_candidates_below_replaceable_stops"]
      : []),
    ...(missingFeasibleCategory
      ? ["required_category_has_no_feasible_candidate"]
      : []),
    ...(!input.requiredRoadEdgesResolved
      ? ["required_road_edges_unresolved"]
      : []),
    ...(replaceableSlots === 0 ? ["all_stops_are_mandatory"] : []),
    ...(unqueriedCandidateCount > 0 ? ["unqueried_candidates_require_road_validation"] : []),
    ...(input.feasibilityReasonCodes ?? []),
  ].filter((value, index, values) => values.indexOf(value) === index).sort();
  return {
    ...(fullCatalog ? { scoredUniqueCandidateCount: scoredCandidates.size, unqueriedCandidateCount } : {}),
    eligibleUniqueCandidateCount: candidates.length,
    requestedStopCount,
    unseenEligibleCandidateCount: unseen.length,
    maximumFeasibleNovelReplacements,
    diversityCapacity,
    limitingReasonCodes,
  };
}
