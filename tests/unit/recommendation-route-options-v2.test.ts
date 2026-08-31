import { describe, expect, it } from "vitest";
import {
  selectRouteStyleOptionsV2,
  type RouteStyleSelectionCandidateV2,
} from "@/lib/recommendation/v2/route-options";

const ROUTES: RouteStyleSelectionCandidateV2[] = [
  {
    signature: "a>b>c", orderedPlaceIds: ["a", "b", "c"], totalDrivingSeconds: 1_800,
    totalDistanceMeters: 12_000, totalWaitSeconds: 600, maximumLegSeconds: 800,
    maximumSingleWaitSeconds: 600, categoryCount: 3,
    categorySignature: "attraction>culture>food", unknownScheduleCount: 0,
    styleScores: { balanced: 850, shortest: 900, relaxed: 760 },
  },
  {
    signature: "d>e>f", orderedPlaceIds: ["d", "e", "f"], totalDrivingSeconds: 2_100,
    totalDistanceMeters: 14_000, totalWaitSeconds: 0, maximumLegSeconds: 700,
    maximumSingleWaitSeconds: 0, categoryCount: 3,
    categorySignature: "culture>leisure>food", unknownScheduleCount: 0,
    styleScores: { balanced: 920, shortest: 690, relaxed: 940 },
  },
  {
    signature: "g>h>i", orderedPlaceIds: ["g", "h", "i"], totalDrivingSeconds: 2_400,
    totalDistanceMeters: 15_000, totalWaitSeconds: 300, maximumLegSeconds: 900,
    maximumSingleWaitSeconds: 300, categoryCount: 3,
    categorySignature: "attraction>leisure>culture", unknownScheduleCount: 0,
    styleScores: { balanced: 960, shortest: 620, relaxed: 780 },
  },
  {
    signature: "j>a>c", orderedPlaceIds: ["j", "a", "c"], totalDrivingSeconds: 1_900,
    totalDistanceMeters: 12_500, totalWaitSeconds: 240, maximumLegSeconds: 820,
    maximumSingleWaitSeconds: 240, categoryCount: 3,
    categorySignature: "food>attraction>culture", unknownScheduleCount: 0,
    styleScores: { balanced: 820, shortest: 750, relaxed: 800 },
  },
];

describe("route options V2", () => {
  it("returns three distinct, uniquely labelled objective routes", () => {
    const result = selectRouteStyleOptionsV2({
      routes: ROUTES, recentRouteSignatures: [], recentlySelectedCandidateIds: [],
      lockedPlaceIds: [], deterministicSeed: "haeundae:base", rerollVariant: 0,
    });

    expect(result.options.map(({ style }) => style)).toEqual(["balanced", "shortest", "relaxed"]);
    expect(new Set(result.options.map(({ route }) => route.signature)).size).toBe(3);
    expect(result.options.find(({ style }) => style === "shortest")?.route.signature).toBe("a>b>c");
    expect(result.alternativeAvailability).toBe("available");
    expect(result.limitedReason).toBeNull();
  });

  it("returns fewer than three options instead of duplicate labels or routes", () => {
    const result = selectRouteStyleOptionsV2({
      routes: [ROUTES[0]!], recentRouteSignatures: [ROUTES[0]!.signature],
      recentlySelectedCandidateIds: ["a", "b", "c"], lockedPlaceIds: [],
      deterministicSeed: "haeundae:limited", rerollVariant: 1,
    });

    expect(result.options).toHaveLength(1);
    expect(result.alternativeAvailability).toBe("limited");
    expect(result.limitedReason).toBe("fewer_than_three_meaningfully_distinct_routes");
  });

  it("returns exactly two non-empty options when only two routes are meaningful", () => {
    const result = selectRouteStyleOptionsV2({
      routes: ROUTES.slice(0, 2),
      recentRouteSignatures: [],
      recentlySelectedCandidateIds: [],
      lockedPlaceIds: [],
      deterministicSeed: "nationwide:two-options",
      rerollVariant: 0,
    });

    expect(result.options).toHaveLength(2);
    expect(result.options.every(({ route }) => route.orderedPlaceIds.length > 0)).toBe(true);
    expect(result.alternativeAvailability).toBe("limited");
  });

  it("deduplicates reordered copies by stable place set as well as ordered signature", () => {
    const result = selectRouteStyleOptionsV2({
      routes: [ROUTES[0]!, { ...ROUTES[0]!, signature: "c>a>b", orderedPlaceIds: ["c", "a", "b"] }],
      recentRouteSignatures: [],
      recentlySelectedCandidateIds: [],
      lockedPlaceIds: [],
      deterministicSeed: "busan:set-dedup",
      rerollVariant: 0,
    });

    expect(result.options).toHaveLength(1);
    expect(result.limitedReason).toBe("fewer_than_three_meaningfully_distinct_routes");
  });

  it("protects mandatory anchors while enforcing feasible automatic replacement quota", () => {
    const result = selectRouteStyleOptionsV2({
      routes: [
        { ...ROUTES[0]!, signature: "locked>a>b", orderedPlaceIds: ["locked", "a", "b"] },
        { ...ROUTES[1]!, signature: "locked>d>e", orderedPlaceIds: ["locked", "d", "e"] },
      ],
      recentRouteSignatures: ["locked>a>b"],
      recentlySelectedCandidateIds: ["a", "b"],
      lockedPlaceIds: ["locked"],
      protectedPlaceIds: ["locked"],
      minimumNewAutomaticPlaces: 2,
      deterministicSeed: "busan:anchor-quota",
      rerollVariant: 1,
    });

    expect(result.options[0]?.route.orderedPlaceIds).toEqual(["locked", "d", "e"]);
    expect(result.options.every(({ route }) => route.orderedPlaceIds.includes("locked"))).toBe(true);
  });

  it("diversifies the first automatic stop on reroll and is deterministic for a seed", () => {
    const first = selectRouteStyleOptionsV2({
      routes: ROUTES, recentRouteSignatures: [], recentlySelectedCandidateIds: [],
      lockedPlaceIds: [], deterministicSeed: "haeundae:reroll", rerollVariant: 0,
    });
    const recent = first.options.map(({ route }) => route.signature);
    const priorFirstStops = new Set(recent.map((signature) => signature.split(">")[0]));
    const rerollInput = {
      routes: ROUTES,
      recentRouteSignatures: recent,
      recentlySelectedCandidateIds: first.options.flatMap(({ route }) => [...route.orderedPlaceIds]),
      lockedPlaceIds: [] as string[], deterministicSeed: "haeundae:reroll", rerollVariant: 1,
    };
    const reroll = selectRouteStyleOptionsV2(rerollInput);
    const replay = selectRouteStyleOptionsV2(rerollInput);

    expect(reroll).toEqual(replay);
    expect(priorFirstStops.has(reroll.options[0]!.route.orderedPlaceIds[0]!)).toBe(false);
  });

  it("uses the reroll index as deterministic controlled exploration when capacity exists", () => {
    const common = {
      routes: ROUTES,
      recentRouteSignatures: [] as string[],
      recentlySelectedCandidateIds: [] as string[],
      lockedPlaceIds: [] as string[],
      deterministicSeed: "busan:variant-control",
    };
    const first = selectRouteStyleOptionsV2({ ...common, rerollVariant: 1 });
    const second = selectRouteStyleOptionsV2({ ...common, rerollVariant: 2 });

    expect(first.options[0]?.route.signature).not.toBe(second.options[0]?.route.signature);
    expect(selectRouteStyleOptionsV2({ ...common, rerollVariant: 2 })).toEqual(second);
  });

  it("does not keep one non-mandatory automatic anchor in all three options when alternatives exist", () => {
    const routes = [
      { ...ROUTES[0]!, signature: "b>a>c", orderedPlaceIds: ["b", "a", "c"] },
      { ...ROUTES[1]!, signature: "d>a>e", orderedPlaceIds: ["d", "a", "e"] },
      { ...ROUTES[2]!, signature: "f>a>g", orderedPlaceIds: ["f", "a", "g"] },
      { ...ROUTES[3]!, signature: "h>i>j", orderedPlaceIds: ["h", "i", "j"] },
    ];
    const result = selectRouteStyleOptionsV2({
      routes,
      recentRouteSignatures: [],
      recentlySelectedCandidateIds: [],
      lockedPlaceIds: [],
      deterministicSeed: "busan:no-common-anchor",
      rerollVariant: 0,
    });
    const common = result.options[0]!.route.orderedPlaceIds.filter((id) =>
      result.options.slice(1).every(({ route }) => route.orderedPlaceIds.includes(id))
    );

    expect(result.options).toHaveLength(3);
    expect(common).toHaveLength(0);
  });
});
