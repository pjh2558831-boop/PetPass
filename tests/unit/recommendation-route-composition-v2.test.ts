import { describe, expect, it, vi } from "vitest";
import { analyzeRouteFeasibilityV2 } from "@/lib/recommendation/v2/feasibility";
import { optimizeRouteOptionsV2 } from "@/lib/recommendation/v2/route-optimizer";
import { searchRoutesV1 } from "@/lib/recommendation/optimizer/route-search";
import type { RouteOptimizationCandidate, RouteOptimizationInput, RouteVisitRole } from "@/lib/recommendation/types/route-optimizer";
import type { DetailedEligibleCandidate, UsefulTourCategory } from "@/lib/recommendation/types";
import type { OrderedRouteValidationInput, TravelMatrixEdge, TravelMatrixResult, TravelTimeProvider } from "@/lib/travel/types";

function candidate(
  id: string,
  category: UsefulTourCategory = "attraction",
  options: { window?: [number, number]; role?: RouteVisitRole; locked?: boolean } = {},
): RouteOptimizationCandidate {
  return {
    place: {
      source: "tourism_service2",
      assessment: { verdict: "allowed" },
      eligibility: { eligible: true, status: "eligible", reasonCodes: [] },
    } as unknown as DetailedEligibleCandidate,
    node: { id, kind: "place", name: `해운대 ${id}`, latitude: 35.16, longitude: 129.16 },
    placeUtility: {
      version: "place-utility-v1", total: 800, preferenceFit: 1, petCompatibility: 1,
      informationTrust: 0.9, popularity: 0.5, categoryPriority: 1, dataQuality: 1,
      weightedContributions: { preferenceFit: 0, petCompatibility: 0, informationTrust: 0, popularity: 0, categoryPriority: 0, dataQuality: 0 },
      reasonCodes: [], warningCodes: [],
    },
    dwellDurationMinutes: 30,
    dwellDurationSource: "category_default",
    schedule: {
      status: "known",
      windows: [{ startMinutes: options.window?.[0] ?? 0, endMinutes: options.window?.[1] ?? 1_440, finalEntryMinutes: null }],
      mandatoryReservationImpossible: false,
      source: "provider_normalized", warningCodes: [],
    },
    category,
    visitRole: options.role ?? (category === "food" ? "meal" : "activity"),
    highActivity: false,
    popularity: { version: "popularity-v1", score: 0.5, status: "insufficient_data", qualityComponent: 0, trendComponent: 0, sampleWeight: 0 },
    informationTrust: { ruleVersion: "petpass-trust-v1", score: 90, level: "high", evidenceCount: 1, computedAt: "2026-08-15T00:00:00.000Z", components: [], flags: [] },
    exposure: { version: "exposure-v1", status: "not_available", score: null },
    source: "tourism_service2", petAssessment: "allowed", evidenceStatus: "verified",
    locked: options.locked,
    personalization: {
      version: "personalization-v2", total: 800,
      components: { petProfileCompatibility: 1, categoryPreference: 1, tripMood: 1, crowdPreference: 1, travelEfficiency: 1, originAccessibility: 1, scheduleFit: 1, environmentPreference: 1, walkingTolerance: 1, informationTrust: 1, novelty: 1 },
      weightedContributions: { petProfileCompatibility: 0, categoryPreference: 0, tripMood: 0, crowdPreference: 0, travelEfficiency: 0, originAccessibility: 0, scheduleFit: 0, environmentPreference: 0, walkingTolerance: 0, informationTrust: 0, novelty: 0 },
      explanationCodes: [], warningCodes: [],
      styleUtilities: { comfort: 800, preference: 800, efficient: 800 },
    },
  } as RouteOptimizationCandidate;
}

function edge(fromId: string, toId: string, minutes: number): TravelMatrixEdge {
  return {
    fromId, toId, distanceMeters: minutes * 500, durationSeconds: minutes * 60,
    lowerBoundMeters: minutes * 400, status: "resolved", source: "kakao_multi_destination_live",
    confidence: "provider_summary", temporalBasis: "current_traffic",
    distanceFetchedAt: "2026-08-15T00:00:00.000Z", durationFetchedAt: "2026-08-15T00:00:00.000Z", reasonCodes: [],
  };
}

function input(
  candidates: RouteOptimizationCandidate[],
  options: Partial<RouteOptimizationInput["tripRequest"]> = {},
): RouteOptimizationInput {
  const ids = ["departure", ...candidates.map(({ node }) => node.id)];
  const edges: TravelMatrixResult["edges"] = {};
  for (const from of ids) {
    edges[from] = {};
    for (const to of ids) if (from !== to) edges[from]![to] = edge(from, to, 10);
  }
  return {
    departure: { id: "departure", kind: "departure", name: "해운대", latitude: 35.16, longitude: 129.16 },
    candidates,
    matrix: {
      version: "travel-matrix-v1", nodeIds: ids, complete: true, edges,
      diagnostics: { nodeCount: ids.length, expectedDirectedEdges: ids.length * (ids.length - 1), resolvedEdges: ids.length * (ids.length - 1), unresolvedEdges: 0, estimatedLowerBounds: 0, multiDestinationRequests: 1, directionsFallbackRequests: 0, requestCacheHits: 0, persistentCacheHits: 0, providerCalls: 1, retries: 0, timeouts: 0, providerFailures: 0, budgetExceeded: false, deadlineExceeded: false, durationMs: 1 },
    },
    tripRequest: {
      date: "2026-08-15", startTime: "09:00", timezone: "Asia/Seoul", tripType: "day_trip",
      tripPace: "packed", selectedCategories: ["attraction"], roundTrip: false,
      desiredStopCount: 5, durationMinutes: 600, allowReducedStops: true, ...options,
    },
  };
}

function provider(exactMinutes = 13): TravelTimeProvider {
  return {
    buildMatrix: vi.fn(),
    validateOrderedRoute: vi.fn(async (request: OrderedRouteValidationInput) => {
      const chain = [request.departure, ...request.orderedStops];
      const sections = chain.slice(0, -1).map((node, index) => ({
        fromId: node.id, toId: chain[index + 1]!.id,
        distanceMeters: exactMinutes * 500, durationSeconds: exactMinutes * 60,
      }));
      return {
        status: "validated" as const, temporalBasis: "current_traffic" as const,
        totalDistanceMeters: sections.reduce((sum, section) => sum + section.distanceMeters, 0),
        totalDurationSeconds: sections.reduce((sum, section) => sum + section.durationSeconds, 0),
        sections, geometry: chain.map(({ latitude, longitude }) => ({ latitude, longitude })),
        providerResultCode: 0, reasonCodes: [],
        diagnostics: { providerOperation: "waypoints" as const, cacheHit: false, providerCalls: 1, durationMs: 1 },
      };
    }),
  };
}

describe("constraint-aware route composition V2", () => {
  it("reports and enforces five stops when five are feasible", () => {
    const feasibility = analyzeRouteFeasibilityV2(input(["a", "b", "c", "d", "e"].map((id) => candidate(id))));
    expect(feasibility).toMatchObject({ status: "ready", requestedStopCount: 5, maximumFeasibleStopCount: 5, targetStopCount: 5 });
  });

  it("returns the exact honest maximum with limiting factors when five are infeasible", () => {
    const feasibility = analyzeRouteFeasibilityV2(input(
      ["a", "b", "c", "d", "e"].map((id) => candidate(id)), { durationMinutes: 140 },
    ));
    expect(feasibility).toMatchObject({ status: "ready", requestedStopCount: 5, maximumFeasibleStopCount: 3, targetStopCount: 3 });
    expect(feasibility.limitingReasonCodes).toContain("trip_duration_limits_stop_count");
  });

  it("balances a food-heavy pool without imposing a universal percentage cap", () => {
    const base = input([
      ...Array.from({ length: 6 }, (_, index) => candidate(`food-${index + 1}`, "food")),
      candidate("culture-1", "culture"), candidate("culture-2", "culture"),
    ], { selectedCategories: ["food", "culture"] });
    const feasibility = analyzeRouteFeasibilityV2(base);
    expect(feasibility).toMatchObject({ status: "ready", maximumRequestedCategoryCount: 2, requiredRequestedCategoryCount: 2, fullCategoryCoverageFeasible: true });
    if (feasibility.status !== "ready") return;
    const searched = searchRoutesV1({
      ...base,
      tripRequest: {
        ...base.tripRequest,
        desiredStopCount: feasibility.targetStopCount,
        minimumStopCount: feasibility.targetStopCount,
        minimumRequestedCategoryCount: feasibility.requiredRequestedCategoryCount,
      },
    }, { deadlineMs: 5_000, maxStates: 100_000 });
    const categories = searched.finalists[0]!.visitedCategories;
    expect(categories.filter((category) => category === "culture")).toHaveLength(2);
    expect(categories.filter((category) => category === "food")).toHaveLength(3);
  });

  it("does not treat an avoidable 115-minute packed wait as a normal ready route", () => {
    const feasibility = analyzeRouteFeasibilityV2(input(
      [candidate("late", "attraction", { window: [665, 900] })], { desiredStopCount: 1 },
    ));
    expect(feasibility).toMatchObject({ status: "insufficient_feasible_route", maximumFeasibleStopCount: 0 });
    expect(feasibility.limitingReasonCodes).toContain("excessive_wait_for_pace");
  });

  it("keeps selected places in every distinct option and preserves exact segment times", async () => {
    const base = input([
      candidate("selected", "attraction", { locked: true }),
      candidate("food", "food"), candidate("culture", "culture"), candidate("leisure", "leisure"),
    ], {
      tripPace: "balanced", desiredStopCount: 3,
      selectedCategories: ["attraction", "food", "culture", "leisure"],
      requiredPlaceIds: ["selected"], minimumStopCount: 3, minimumRequestedCategoryCount: 3,
    });
    const result = await optimizeRouteOptionsV2(base, {
      travelTimeProvider: provider(13), recentRouteSignatures: [], recentlySelectedCandidateIds: [],
      deterministicSeed: "haeundae:selected", rerollVariant: 0,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.options).toHaveLength(3);
    expect(result.options.every(({ stops }) => stops.some(({ placeId }) => placeId === "selected"))).toBe(true);
    expect(result.options.every(({ stops }) => stops.every(({ driveSecondsFromPrevious }) => driveSecondsFromPrevious === 13 * 60))).toBe(true);
  });
});
