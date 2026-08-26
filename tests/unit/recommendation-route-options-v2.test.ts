import { describe, expect, it } from "vitest";
import {
  selectRouteStyleOptionsV2,
  type RouteStyleSelectionCandidateV2,
} from "@/lib/recommendation/v2/route-options";

const ROUTES: RouteStyleSelectionCandidateV2[] = [
  {
    signature: "a>b>c",
    orderedPlaceIds: ["a", "b", "c"],
    totalDrivingSeconds: 1_800,
    totalDistanceMeters: 12_000,
    maximumLegSeconds: 800,
    categoryCount: 3,
    unknownScheduleCount: 0,
    styleScores: { comfort: 850, preference: 760, efficient: 780 },
  },
  {
    signature: "d>e>f",
    orderedPlaceIds: ["d", "e", "f"],
    totalDrivingSeconds: 2_100,
    totalDistanceMeters: 14_000,
    maximumLegSeconds: 700,
    categoryCount: 3,
    unknownScheduleCount: 0,
    styleScores: { comfort: 920, preference: 710, efficient: 690 },
  },
  {
    signature: "g>h>i",
    orderedPlaceIds: ["g", "h", "i"],
    totalDrivingSeconds: 2_400,
    totalDistanceMeters: 15_000,
    maximumLegSeconds: 900,
    categoryCount: 3,
    unknownScheduleCount: 1,
    styleScores: { comfort: 700, preference: 960, efficient: 620 },
  },
  {
    signature: "a>c>b",
    orderedPlaceIds: ["a", "c", "b"],
    totalDrivingSeconds: 1_900,
    totalDistanceMeters: 12_500,
    maximumLegSeconds: 820,
    categoryCount: 3,
    unknownScheduleCount: 0,
    styleScores: { comfort: 820, preference: 800, efficient: 750 },
  },
];

describe("route options V2", () => {
  it("returns three distinct objective routes when the pool supports them", () => {
    const result = selectRouteStyleOptionsV2({
      routes: ROUTES,
      recentRouteSignatures: [],
      rerollVariant: 0,
    });

    expect(result.options.map(({ style }) => style)).toEqual([
      "comfort",
      "preference",
      "efficient",
    ]);
    expect(new Set(result.options.map(({ route }) => route.signature)).size).toBe(3);
    expect(result.options.find(({ style }) => style === "comfort")?.route.signature).toBe("d>e>f");
    expect(result.options.find(({ style }) => style === "preference")?.route.signature).toBe("g>h>i");
    expect(result.options.find(({ style }) => style === "efficient")?.route.signature).toBe("a>b>c");
    expect(result.alternativeAvailability).toBe("available");
  });

  it("keeps the efficient route at the lowest practical travel cost", () => {
    const result = selectRouteStyleOptionsV2({
      routes: ROUTES,
      recentRouteSignatures: [],
      rerollVariant: 0,
    });
    const efficient = result.options.find(({ style }) => style === "efficient")!;

    expect(efficient.route.totalDrivingSeconds).toBe(
      Math.min(...ROUTES.map(({ totalDrivingSeconds }) => totalDrivingSeconds)),
    );
  });

  it("uses recent signatures to produce a deterministic reroll alternative", () => {
    const first = selectRouteStyleOptionsV2({
      routes: ROUTES,
      recentRouteSignatures: [],
      rerollVariant: 0,
    });
    const reroll = selectRouteStyleOptionsV2({
      routes: ROUTES,
      recentRouteSignatures: first.options.map(({ route }) => route.signature),
      rerollVariant: 1,
    });
    const replay = selectRouteStyleOptionsV2({
      routes: ROUTES,
      recentRouteSignatures: first.options.map(({ route }) => route.signature),
      rerollVariant: 1,
    });

    expect(reroll).toEqual(replay);
    expect(reroll.options.some(({ route }) => route.signature === "a>c>b")).toBe(true);
  });

  it("returns one route and limited metadata instead of duplicate styles", () => {
    const result = selectRouteStyleOptionsV2({
      routes: [ROUTES[0]!],
      recentRouteSignatures: [ROUTES[0]!.signature],
      rerollVariant: 1,
    });

    expect(result.options).toHaveLength(1);
    expect(result.alternativeAvailability).toBe("limited");
  });
});
