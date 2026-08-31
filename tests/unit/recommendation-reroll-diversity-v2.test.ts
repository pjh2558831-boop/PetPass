import { describe, expect, it } from "vitest";
import {
  analyzeRecommendationHistoryV2,
  calculateNoveltyQuotaV2,
  measureRerollDifferenceV2,
} from "@/lib/recommendation/v2/novelty-history";
import {
  selectRouteStyleOptionsV2,
  type RouteStyleSelectionCandidateV2,
} from "@/lib/recommendation/v2/route-options";

function route(ids: string[], score: number): RouteStyleSelectionCandidateV2 {
  return {
    signature: ids.join(">"),
    orderedPlaceIds: ids,
    totalDrivingSeconds: 1_800 + score,
    totalDistanceMeters: 10_000 + score,
    totalWaitSeconds: score % 300,
    maximumLegSeconds: 900,
    maximumSingleWaitSeconds: score % 300,
    categoryCount: 3,
    categorySignature: "attraction>leisure>food",
    unknownScheduleCount: 0,
    styleScores: {
      balanced: 1_000 - score,
      shortest: 1_000 - score,
      relaxed: 1_000 - score,
    },
  };
}

function combinations(values: string[]): string[][] {
  const result: string[][] = [];
  for (let first = 0; first < values.length; first += 1) {
    for (let second = first + 1; second < values.length; second += 1) {
      for (let third = second + 1; third < values.length; third += 1) {
        result.push([values[first]!, values[second]!, values[third]!]);
      }
    }
  }
  return result;
}

describe("recommendation reroll history V2", () => {
  it("tracks stable exposure, consecutive use, position, first stop, co-occurrence, and signatures", () => {
    const history = analyzeRecommendationHistoryV2({
      recentRouteSignatures: [
        "tour:1>tour:2>tour:3",
        "tour:4>tour:2>tour:3",
        "tour:2>tour:5>tour:3",
      ],
      recentlySelectedCandidateIds: [
        "tour:1", "tour:2", "tour:3",
        "tour:4", "tour:2", "tour:3",
        "tour:2", "tour:5", "tour:3",
      ],
      protectedPlaceIds: [],
    });

    expect(history.byCandidate["tour:2"]).toMatchObject({
      recentAppearanceCount: 3,
      consecutiveAppearanceCount: 3,
      lastAppearancePosition: 0,
      firstStopAppearances: 1,
    });
    expect(history.byCandidate["tour:3"]?.coOccurrenceCounts["tour:2"]).toBe(3);
    expect(history.orderedRouteSignatures).toEqual([
      "tour:1>tour:2>tour:3",
      "tour:4>tour:2>tour:3",
      "tour:2>tour:5>tour:3",
    ]);
    expect(history.placeSetSignatures).toEqual([
      "tour:1|tour:2|tour:3",
      "tour:2|tour:3|tour:4",
      "tour:2|tour:3|tour:5",
    ]);
  });

  it("requires two replacements for a three-stop reroll when two safe unseen places exist", () => {
    expect(calculateNoveltyQuotaV2({
      requestedStopCount: 3,
      mandatoryPlaceCount: 0,
      maximumFeasibleNovelReplacements: 2,
      rerollVariant: 1,
    })).toBe(2);

    const difference = measureRerollDifferenceV2({
      orderedPlaceIds: ["tour:1", "tour:4", "tour:5"],
      previousOrderedPlaceIds: ["tour:1", "tour:2", "tour:3"],
      protectedPlaceIds: [],
      noveltyQuota: 2,
    });
    expect(difference).toMatchObject({
      meaningfullyDifferent: true,
      newPlaceCount: 2,
      sharedPlaceRatio: 1 / 3,
    });
  });

  it("does not call a reordered place set meaningfully different", () => {
    expect(measureRerollDifferenceV2({
      orderedPlaceIds: ["tour:3", "tour:1", "tour:2"],
      previousOrderedPlaceIds: ["tour:1", "tour:2", "tour:3"],
      protectedPlaceIds: [],
      noveltyQuota: 1,
    })).toMatchObject({
      meaningfullyDifferent: false,
      newPlaceCount: 0,
      sharedPlaceRatio: 1,
      samePlaceSet: true,
      sameOrder: false,
    });
  });

  it("does not call one replacement in an otherwise fixed three-stop set meaningfully new", () => {
    expect(measureRerollDifferenceV2({
      orderedPlaceIds: ["tour:1", "tour:2", "tour:4"],
      previousOrderedPlaceIds: ["tour:1", "tour:2", "tour:3"],
      protectedPlaceIds: [],
      noveltyQuota: 1,
    })).toMatchObject({
      meaningfullyDifferent: false,
      newPlaceCount: 1,
      sharedPlaceRatio: 2 / 3,
    });
  });

  it("keeps candidate-rich exposure at or below 50% across 18 deterministic rerolls", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `tour:${index + 1}`);
    const routes = combinations(ids).map((places, index) => route(places, index));
    const signatures: string[] = [];
    const exposedIds: string[] = [];
    const exposure = new Map<string, number>();
    const firstStops: string[] = [];
    const recommendations: string[][] = [];
    const legacySignatures: string[] = [];
    const legacySeen = new Set<string>();
    const legacyExposure = new Map<string, number>();

    for (let run = 0; run < 18; run += 1) {
      const legacy = [...routes].sort((left, right) => {
        const leftPenalty = (legacySignatures.includes(left.signature) ? 1_200 : 0) +
          left.orderedPlaceIds.filter((id) => legacySeen.has(id)).length * 180;
        const rightPenalty = (legacySignatures.includes(right.signature) ? 1_200 : 0) +
          right.orderedPlaceIds.filter((id) => legacySeen.has(id)).length * 180;
        return (right.styleScores.balanced - rightPenalty) -
          (left.styleScores.balanced - leftPenalty) ||
          left.signature.localeCompare(right.signature);
      })[0]!;
      legacySignatures.push(legacy.signature);
      if (legacySignatures.length > 12) legacySignatures.shift();
      for (const id of legacy.orderedPlaceIds) {
        legacySeen.add(id);
        legacyExposure.set(id, (legacyExposure.get(id) ?? 0) + 1);
      }
    }

    for (let run = 0; run < 18; run += 1) {
      const history = analyzeRecommendationHistoryV2({
        recentRouteSignatures: signatures.slice(-12),
        recentlySelectedCandidateIds: exposedIds.slice(-30),
        protectedPlaceIds: [],
      });
      const unseen = ids.filter((id) => !history.byCandidate[id]);
      const selected = selectRouteStyleOptionsV2({
        routes,
        recentRouteSignatures: signatures.slice(-12),
        recentlySelectedCandidateIds: exposedIds.slice(-30),
        lockedPlaceIds: [],
        protectedPlaceIds: [],
        minimumNewAutomaticPlaces: Math.min(2, unseen.length),
        deterministicSeed: "busan:standardized-18",
        rerollVariant: run,
      });
      const primary = [...selected.options[0]!.route.orderedPlaceIds];
      recommendations.push(primary);
      signatures.push(primary.join(">"));
      exposedIds.push(...primary);
      firstStops.push(primary[0]!);
      for (const id of primary) exposure.set(id, (exposure.get(id) ?? 0) + 1);
    }

    const beforeMaximumExposure = Math.max(...legacyExposure.values());
    const afterMaximumExposure = Math.max(...exposure.values());
    console.log(`REROLL_EXPOSURE ${JSON.stringify({
      runs: 18,
      beforeMaximumExposure,
      afterMaximumExposure,
      beforeRatio: beforeMaximumExposure / 18,
      afterRatio: afterMaximumExposure / 18,
    })}`);
    expect(beforeMaximumExposure).toBeGreaterThan(9);
    expect(afterMaximumExposure).toBeLessThanOrEqual(9);
    expect(new Set(firstStops.slice(0, 4)).size).toBeGreaterThan(1);
    const alwaysPresentFirstFour = ids.filter((id) =>
      recommendations.slice(0, 4).every((places) => places.includes(id))
    );
    expect(alwaysPresentFirstFour).toHaveLength(0);
  });
});
