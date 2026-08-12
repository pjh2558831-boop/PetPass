import "server-only";

import type {
  LightweightRouteCandidate,
  UsefulTourCategory,
} from "@/lib/recommendation/types";

const ACTIVITY_CATEGORIES = new Set<UsefulTourCategory>([
  "attraction",
  "culture",
  "festival",
  "leisure",
]);

export interface CategoryReservationV1Input<
  T extends LightweightRouteCandidate = LightweightRouteCandidate,
> {
  candidates: readonly T[];
  limit: number;
  selectedCategories: readonly UsefulTourCategory[];
  tripType: "DAY_TRIP" | "OVERNIGHT";
  compare?: (
    left: T,
    right: T,
  ) => number;
}

function stableOrder(
  left: LightweightRouteCandidate,
  right: LightweightRouteCandidate,
): number {
  return (
    right.retrievalScore.total - left.retrievalScore.total ||
    right.retrievalScore.categoryCoverageNeed -
      left.retrievalScore.categoryCoverageNeed ||
    left.distanceKm - right.distanceKm ||
    left.contentId.localeCompare(right.contentId)
  );
}

export function reserveCandidateCategoriesV1<
  T extends LightweightRouteCandidate,
>(
  input: CategoryReservationV1Input<T>,
): T[] {
  const compare = input.compare ?? stableOrder;
  const ranked = [...input.candidates].sort(compare);
  if (ranked.length <= input.limit) return ranked;

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const addFirst = (
    predicate: (candidate: T) => boolean,
  ): void => {
    const candidate = ranked.find(
      (value) => !selectedIds.has(value.contentId) && predicate(value),
    );
    if (!candidate || selected.length >= input.limit) return;
    selected.push(candidate);
    selectedIds.add(candidate.contentId);
  };

  for (const category of [...new Set(input.selectedCategories)].sort()) {
    addFirst((candidate) => candidate.category === category);
  }
  if (input.tripType === "DAY_TRIP") {
    addFirst((candidate) => ACTIVITY_CATEGORIES.has(candidate.category));
  }
  if (input.selectedCategories.includes("food")) {
    addFirst((candidate) => candidate.category === "food");
  }
  if (
    input.tripType === "OVERNIGHT" &&
    input.selectedCategories.includes("accommodation")
  ) {
    addFirst((candidate) => candidate.category === "accommodation");
  }

  for (const candidate of ranked) {
    if (selected.length >= input.limit) break;
    if (selectedIds.has(candidate.contentId)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.contentId);
  }
  return selected.sort(compare);
}
