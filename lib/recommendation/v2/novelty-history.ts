import "server-only";

import { createHash } from "node:crypto";

export interface CandidateHistorySignalsV2 {
  recentAppearanceCount: number;
  consecutiveAppearanceCount: number;
  lastAppearancePosition: number | null;
  firstStopAppearances: number;
  coOccurrenceCounts: Record<string, number>;
}

export interface RecommendationHistoryAnalysisV2 {
  routeCount: number;
  byCandidate: Record<string, CandidateHistorySignalsV2>;
  latestOrderedPlaceIds: string[];
  orderedRouteSignatures: string[];
  placeSetSignatures: string[];
}

export interface RerollDifferenceV2 {
  meaningfullyDifferent: boolean;
  newPlaceCount: number;
  sharedPlaceRatio: number;
  placeSetSimilarity: number;
  orderedRouteSimilarity: number;
  samePlaceSet: boolean;
  sameOrder: boolean;
}

function routeIds(signature: string): string[] {
  return [...new Set(signature.split(">").map((id) => id.trim()).filter(Boolean))];
}

export function stablePlaceSetSignatureV2(placeIds: readonly string[]): string {
  return [...new Set(placeIds)].sort().join("|");
}

export function analyzeRecommendationHistoryV2(input: {
  recentRouteSignatures: readonly string[];
  recentlySelectedCandidateIds: readonly string[];
  protectedPlaceIds: readonly string[];
}): RecommendationHistoryAnalysisV2 {
  const routes = input.recentRouteSignatures.map(routeIds).filter((ids) => ids.length > 0);
  const orderedRouteSignatures = routes.map((ids) => ids.join(">"));
  const placeSetSignatures = routes.map(stablePlaceSetSignatureV2);
  const allIds = new Set([
    ...routes.flat(),
    ...input.recentlySelectedCandidateIds,
    ...input.protectedPlaceIds,
  ]);
  const fallbackCounts = input.recentlySelectedCandidateIds.reduce<Record<string, number>>(
    (counts, id) => {
      counts[id] = (counts[id] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const byCandidate: Record<string, CandidateHistorySignalsV2> = {};
  for (const id of allIds) {
    const appearances = routes.filter((route) => route.includes(id)).length;
    let consecutive = 0;
    for (let index = routes.length - 1; index >= 0; index -= 1) {
      if (!routes[index]!.includes(id)) break;
      consecutive += 1;
    }
    const lastIndex = routes.findLastIndex((route) => route.includes(id));
    const coOccurrenceCounts: Record<string, number> = {};
    for (const route of routes) {
      if (!route.includes(id)) continue;
      for (const companion of route) {
        if (companion === id) continue;
        coOccurrenceCounts[companion] = (coOccurrenceCounts[companion] ?? 0) + 1;
      }
    }
    byCandidate[id] = {
      recentAppearanceCount: Math.max(appearances, fallbackCounts[id] ?? 0),
      consecutiveAppearanceCount: consecutive,
      lastAppearancePosition: lastIndex < 0 ? null : routes.length - 1 - lastIndex,
      firstStopAppearances: routes.filter((route) => route[0] === id).length,
      coOccurrenceCounts,
    };
  }
  return {
    routeCount: routes.length,
    byCandidate,
    latestOrderedPlaceIds: routes.at(-1) ?? [],
    orderedRouteSignatures,
    placeSetSignatures,
  };
}

export function calculateNoveltyQuotaV2(input: {
  requestedStopCount: number;
  mandatoryPlaceCount: number;
  maximumFeasibleNovelReplacements: number;
  rerollVariant: number;
}): number {
  if (input.rerollVariant <= 0) return 0;
  const automaticSlots = Math.max(0, input.requestedStopCount - input.mandatoryPlaceCount);
  if (automaticSlots === 0) return 0;
  const desired = input.requestedStopCount === 3
    ? Math.min(2, automaticSlots)
    : Math.max(1, Math.ceil(automaticSlots * 0.6));
  return Math.min(desired, input.maximumFeasibleNovelReplacements);
}

function longestCommonSubsequenceLength(left: readonly string[], right: readonly string[]): number {
  const row = new Array<number>(right.length + 1).fill(0);
  for (const leftId of left) {
    let diagonal = 0;
    for (let index = 1; index <= right.length; index += 1) {
      const prior = row[index]!;
      row[index] = leftId === right[index - 1]
        ? diagonal + 1
        : Math.max(row[index]!, row[index - 1]!);
      diagonal = prior;
    }
  }
  return row[right.length] ?? 0;
}

export function measureRerollDifferenceV2(input: {
  orderedPlaceIds: readonly string[];
  previousOrderedPlaceIds: readonly string[];
  protectedPlaceIds: readonly string[];
  noveltyQuota: number;
}): RerollDifferenceV2 {
  const protectedIds = new Set(input.protectedPlaceIds);
  const current = input.orderedPlaceIds.filter((id) => !protectedIds.has(id));
  const previous = input.previousOrderedPlaceIds.filter((id) => !protectedIds.has(id));
  const previousSet = new Set(previous);
  const shared = current.filter((id) => previousSet.has(id)).length;
  const unionSize = new Set([...current, ...previous]).size;
  const newPlaceCount = current.filter((id) => !previousSet.has(id)).length;
  const samePlaceSet = stablePlaceSetSignatureV2(current) === stablePlaceSetSignatureV2(previous);
  const sameOrder = current.join(">") === previous.join(">");
  const requiredNewPlaces = previous.length >= 3
    ? Math.max(2, input.noveltyQuota)
    : Math.max(1, input.noveltyQuota);
  return {
    meaningfullyDifferent:
      previous.length === 0 ? current.length > 0 : !samePlaceSet && newPlaceCount >= requiredNewPlaces,
    newPlaceCount,
    sharedPlaceRatio: previous.length === 0
      ? 0
      : shared / Math.max(current.length, previous.length),
    placeSetSimilarity: unionSize === 0 ? 1 : shared / unionSize,
    orderedRouteSimilarity: Math.max(current.length, previous.length) === 0
      ? 1
      : longestCommonSubsequenceLength(current, previous) /
        Math.max(current.length, previous.length),
    samePlaceSet,
    sameOrder,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function recommendationHistoryContextKeyV2(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}
