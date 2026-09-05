import { describe, expect, it, vi } from "vitest";
import { analyzeRouteFeasibilityV2 } from "@/lib/recommendation/v2/feasibility";
import { optimizeRouteOptionsV2 } from "@/lib/recommendation/v2/route-optimizer";
import { searchRoutesV1 } from "@/lib/recommendation/optimizer/route-search";
import { findFeasibleSchedule } from "@/lib/recommendation/schedule/flexible-schedule";
import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import { selectSpatialShortlistV2 } from "@/lib/recommendation/v2/spatial-shortlist";
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
  it.each([538, 71])("keeps every one of %s scored mixed-source candidates in the shortlist or reserve", (count) => {
    const candidates = Array.from({ length: count }, (_, index) => ({
      ...candidate(`public-${index}`),
      source: index % 2 ? "kakao_catalog" as const : "tourism_service2" as const,
    }));
    const best = candidates[count - 1]!;
    best.placeUtility = { ...best.placeUtility, total: 2_000 };
    const shortlisted = selectSpatialShortlistV2({ candidates, departure: candidates[0].node, seed: "mixed-public", rerollVariant: 0 });
    expect(shortlisted.candidates).toHaveLength(6);
    expect(shortlisted.candidates[0].node.id).toBe(best.node.id);
    expect(shortlisted.scoredIds).toHaveLength(count);
    expect(new Set([...shortlisted.candidates.map(({ node }) => node.id), ...shortlisted.reserveIds])).toEqual(new Set(shortlisted.scoredIds));
    expect(shortlisted.reserveIds).toHaveLength(count - 6);
  });

  it("rotates equally suitable place sets beyond the first shortlist while retaining selected anchors", () => {
    const candidates = Array.from({ length: 40 }, (_, index) => candidate(`public-${index}`));
    const first = selectSpatialShortlistV2({ candidates, departure: candidates[0].node, lockedPlaceIds: ["public-0"], seed: "replay", rerollVariant: 0 });
    const second = selectSpatialShortlistV2({ candidates, departure: candidates[0].node, lockedPlaceIds: ["public-0"], recentlySelectedCandidateIds: first.candidates.map(({ node }) => node.id), seed: "replay", rerollVariant: 1 });
    expect(second.candidates[0]).toMatchObject({ node: { id: "public-0" }, locked: true });
    const firstIds = new Set(first.candidates.map(({ node }) => node.id));
    expect(second.candidates.slice(1).every(({ node }) => !firstIds.has(node.id))).toBe(true);
    expect(selectSpatialShortlistV2({ candidates: [...candidates].reverse(), departure: candidates[0].node, lockedPlaceIds: ["public-0"], seed: "replay", rerollVariant: 0 }).candidates.map(({ node }) => node.id)).toEqual(first.candidates.map(({ node }) => node.id));
  });

  it("builds broad geographic drafts through unknown, closed, and reservation-warning venues without changing their facts", async () => {
    const unknown = candidate("unknown");
    unknown.schedule = { ...unknown.schedule, status: "unknown", windows: [] };
    unknown.eligibilityTier = "unverified";
    unknown.evidenceStatus = "unverified";
    const closed = candidate("closed", "attraction", { window: [0, 1] });
    closed.schedule.restDayInformation = "토요일 휴무";
    closed.schedule.mandatoryReservationImpossible = true;
    const base = input([unknown, closed], {
      planningPolicy: "full_public_catalog_v1", desiredStopCount: 2,
      minimumStopCount: 2, minimumRequestedCategoryCount: 1, requiredPlaceIds: ["unknown", "closed"],
    });
    const before = structuredClone(base.candidates);
    const feasibility = analyzeRouteFeasibilityV2(base);
    expect(feasibility).toMatchObject({ status: "ready", maximumFeasibleStopCount: 2, maximumRequestedCategoryCount: 1 });
    const result = await optimizeRouteOptionsV2(base, { travelTimeProvider: provider(10), recentRouteSignatures: [], rerollVariant: 0 });
    expect(result.status).toBe("ready");
    expect(base.candidates).toEqual(before);
    if (result.status === "ready") {
      expect(result.options[0].route.scoreBreakdown.unknownSchedulePenalty).toBe(0);
      expect(result.options[0].route.visits.find(({ candidate: value }) => value.node.id === "closed")?.candidate.schedule.mandatoryReservationImpossible).toBe(true);
    }
  });

  it("does not make broad category preferences an admission constraint", () => {
    const base = input([candidate("food", "food"), candidate("other", "shopping")], {
      planningPolicy: "full_public_catalog_v1", desiredStopCount: 2,
      selectedCategories: ["attraction"], minimumRequestedCategoryCount: 1,
    });
    expect(searchRoutesV1(base).finalists.length).toBeGreaterThan(0);
  });

  it("reserves the existing request budget for scoring after bounded schedule recovery", async () => {
    let elapsed = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed++);
    try {
      const base = input(Array.from({ length: 15 }, (_, index) => candidate(`p${index}`)), {
        scheduleIntent: { date: "2026-08-15", startTime: null },
      });
      const scheduled = findFeasibleSchedule(base, new Date("2026-08-12T00:00:00Z"));
      expect(scheduled.feasibility.status).toBe("ready");
      expect(scheduled.budget.remainingStates).toBeGreaterThanOrEqual(ROUTE_SOLVER_V1_CONFIG.maxExpandedStates / 2);
      expect(scheduled.budget.deadline - elapsed).toBeGreaterThan(ROUTE_SOLVER_V1_CONFIG.solverDeadlineMs / 2 - 10);
      const result = await optimizeRouteOptionsV2({
        ...scheduled.input,
        tripRequest: { ...scheduled.input.tripRequest, minimumStopCount: 5 },
      }, {
        travelTimeProvider: provider(10), recentRouteSignatures: [], rerollVariant: 0,
        solverDeadlineMs: scheduled.budget.deadline - elapsed,
        maxExpandedStates: scheduled.budget.remainingStates,
      });
      expect(result.status).toBe("ready");
    } finally {
      clock.mockRestore();
    }
  });

  it("stops exactly at the search-state allowance even when every sibling is invalid", () => {
    const base = input(Array.from({ length: 15 }, (_, index) => candidate(`closed${index}`, "attraction", { window: [0, 1] })), {
      scheduleIntent: { date: "2026-08-15", startTime: "09:00" },
    });
    const result = searchRoutesV1(base, { maxStates: 2, deadlineMs: 5_000 });
    expect(result.diagnostics.expandedStates).toBe(2);
    expect(result.diagnostics.stateLimitExceeded).toBe(true);
    expect(result.diagnostics.beamFallbackUsed).toBe(false);
  });

  it("shortens only automatic category defaults and keeps provider and selected stays", () => {
    const fixedProvider = { ...candidate("provider"), dwellDurationMinutes: 90, dwellDurationSource: "provider" as const };
    const locked = { ...candidate("selected", "attraction", { locked: true }), dwellDurationMinutes: 90 };
    const generated = { ...candidate("generated"), dwellDurationMinutes: 90 };
    const base = input([fixedProvider, locked, generated], {
      scheduleIntent: { date: "2026-08-15", startTime: "09:00" },
      desiredStopCount: 3, durationMinutes: 280, requiredPlaceIds: ["provider", "selected"],
    });
    const scheduled = findFeasibleSchedule(base, new Date("2026-08-12T00:00:00Z"));
    expect(scheduled.feasibility.maximumFeasibleStopCount).toBe(3);
    expect(scheduled.adjustedDwell).toBe(true);
    expect(scheduled.input.matrix).toBe(base.matrix);
    expect(scheduled.input.candidates.map(({ dwellDurationMinutes }) => dwellDurationMinutes)).toEqual([90, 90, 60]);
    expect(base.candidates.map(({ dwellDurationMinutes }) => dwellDurationMinutes)).toEqual([90, 90, 90]);
  });

  it("rejects an exact return leg that makes a previously feasible round trip exceed its budget", async () => {
    const base = input([candidate("one")], {
      scheduleIntent: { date: "2026-08-15", startTime: "09:00" },
      desiredStopCount: 1, roundTrip: true, durationMinutes: 60,
    });
    const travelTimeProvider = provider(10);
    travelTimeProvider.validateOrderedRoute = vi.fn(async (request: OrderedRouteValidationInput) => ({
      status: "validated" as const, temporalBasis: "current_traffic" as const, totalDistanceMeters: 20_000,
      totalDurationSeconds: 2_400, providerResultCode: 0, reasonCodes: [], geometry: [],
      sections: [
        { fromId: request.departure.id, toId: "one", distanceMeters: 5_000, durationSeconds: 600 },
        { fromId: "one", toId: request.departure.id, distanceMeters: 15_000, durationSeconds: 1_800 },
      ],
      diagnostics: { providerOperation: "waypoints" as const, cacheHit: false, providerCalls: 1, durationMs: 1 },
    }));
    expect(analyzeRouteFeasibilityV2(base).status).toBe("ready");
    const result = await optimizeRouteOptionsV2(base, { travelTimeProvider, recentRouteSignatures: [], rerollVariant: 0 });
    expect(result.status).toBe("final_validation_failed");
  });

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
