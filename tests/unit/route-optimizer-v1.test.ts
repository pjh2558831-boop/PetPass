import { describe, expect, it, vi } from "vitest";
import { buildAllGreedyBaselinesV1 } from "@/lib/recommendation/optimizer/baselines";
import { optimizeRouteV1 } from "@/lib/recommendation/optimizer/route-optimizer";
import { compareCompletedRoutes, scoreCompletedRouteV1 } from "@/lib/recommendation/optimizer/route-score";
import { searchRoutesV1 } from "@/lib/recommendation/optimizer/route-search";
import { appendScheduledVisit, tripStartMs } from "@/lib/recommendation/optimizer/schedule-simulator";
import type {
  CompletedRouteCandidate,
  RouteOptimizationCandidate,
  RouteOptimizationInput,
  RouteVisitRole,
  ScheduledRouteVisit,
} from "@/lib/recommendation/types/route-optimizer";
import type { DetailedEligibleCandidate, UsefulTourCategory } from "@/lib/recommendation/types";
import type {
  OrderedRouteValidationInput,
  TravelMatrixEdge,
  TravelMatrixResult,
  TravelTimeProvider,
} from "@/lib/travel/types";

function candidate(
  id: string,
  utility: number,
  options: {
    role?: RouteVisitRole;
    category?: UsefulTourCategory;
    schedule?: "known" | "unknown";
    window?: [number, number];
    dwell?: number;
    popularity?: number;
    trust?: number;
    exposure?: number | null;
    highActivity?: boolean;
    reservationImpossible?: boolean;
  } = {},
): RouteOptimizationCandidate {
  const category = options.category ?? "attraction";
  const role = options.role ?? "activity";
  return {
    place: {
      source: "tourism_service2",
      assessment: { verdict: "allowed" },
      eligibility: { eligible: true, status: "eligible", reasonCodes: [] },
    } as unknown as DetailedEligibleCandidate,
    node: {
      id,
      kind: "place",
      name: `Synthetic ${id}`,
      latitude: 35.1,
      longitude: 129.04,
    },
    placeUtility: {
      version: "place-utility-v1",
      total: utility,
      preferenceFit: 0.8,
      petCompatibility: 1,
      informationTrust: (options.trust ?? 80) / 100,
      popularity: options.popularity ?? 0.5,
      categoryPriority: 0.5,
      dataQuality: 1,
      weightedContributions: {
        preferenceFit: 0,
        petCompatibility: 0,
        informationTrust: 0,
        popularity: 0,
        categoryPriority: 0,
        dataQuality: 0,
      },
      reasonCodes: [],
      warningCodes: [],
    },
    dwellDurationMinutes: options.dwell ?? 30,
    dwellDurationSource: "category_default",
    schedule:
      options.schedule === "unknown"
        ? {
            status: "unknown",
            windows: [],
            mandatoryReservationImpossible: options.reservationImpossible ?? false,
            source: "stage2_unknown",
            warningCodes: ["schedule_unknown"],
          }
        : {
            status: "known",
            windows: [
              {
                startMinutes: options.window?.[0] ?? 0,
                endMinutes: options.window?.[1] ?? 1_200,
                finalEntryMinutes: null,
              },
            ],
            mandatoryReservationImpossible: options.reservationImpossible ?? false,
            source: "provider_normalized",
            warningCodes: [],
          },
    category,
    visitRole: role,
    highActivity: options.highActivity ?? false,
    popularity: {
      score: options.popularity ?? 0.5,
      status: options.popularity === undefined ? "insufficient_data" : "sufficient_data",
      qualityComponent: options.popularity ?? 0.5,
      trendComponent: options.popularity ?? 0.5,
      sampleWeight: options.popularity === undefined ? 0 : 30,
      version: "popularity-v1",
    },
    informationTrust: {
      ruleVersion: "petpass-trust-v1",
      score: options.trust ?? 80,
      level: "high",
      evidenceCount: 1,
      computedAt: "2026-08-12T00:00:00.000Z",
      components: [],
      flags: [],
    },
    exposure:
      options.exposure === null || options.exposure === undefined
        ? { version: "exposure-v1", status: "not_available", score: null }
        : { version: "exposure-v1", status: "sufficient_data", score: options.exposure },
  };
}

function edge(fromId: string, toId: string, minutes: number): TravelMatrixEdge {
  return {
    fromId,
    toId,
    distanceMeters: minutes * 500,
    durationSeconds: minutes * 60,
    lowerBoundMeters: minutes * 400,
    status: "resolved",
    source: "kakao_multi_destination_live",
    confidence: "provider_summary",
    temporalBasis: "current_traffic",
    distanceFetchedAt: "2026-08-12T00:00:00.000Z",
    durationFetchedAt: "2026-08-12T00:00:00.000Z",
    reasonCodes: [],
  };
}

function matrix(candidates: RouteOptimizationCandidate[], overrides: Record<string, number | null> = {}): TravelMatrixResult {
  const ids = ["departure", ...candidates.map((item) => item.node.id)];
  const edges: TravelMatrixResult["edges"] = {};
  for (const from of ids) {
    edges[from] = {};
    for (const to of ids) {
      if (from === to) continue;
      const value = overrides[`${from}>${to}`];
      edges[from][to] = value === null
        ? { ...edge(from, to, 10), status: "unresolved", durationSeconds: null, distanceMeters: null, confidence: "estimated_only", source: "haversine_lower_bound" }
        : edge(from, to, value ?? 10);
    }
  }
  return {
    version: "travel-matrix-v1",
    nodeIds: ids,
    edges,
    complete: true,
    diagnostics: {
      nodeCount: ids.length,
      expectedDirectedEdges: ids.length * (ids.length - 1),
      resolvedEdges: ids.length * (ids.length - 1),
      unresolvedEdges: 0,
      estimatedLowerBounds: 0,
      multiDestinationRequests: 0,
      directionsFallbackRequests: 0,
      requestCacheHits: 0,
      persistentCacheHits: 0,
      providerCalls: 0,
      retries: 0,
      timeouts: 0,
      providerFailures: 0,
      budgetExceeded: false,
      deadlineExceeded: false,
      durationMs: 0,
    },
  };
}

function optimization(
  candidates: RouteOptimizationCandidate[],
  options: Partial<RouteOptimizationInput["tripRequest"]> = {},
  overrides: Record<string, number | null> = {},
): RouteOptimizationInput {
  return {
    departure: { id: "departure", kind: "departure", name: "Start", latitude: 35.1, longitude: 129.04 },
    candidates,
    matrix: matrix(candidates, overrides),
    tripRequest: {
      date: "2026-08-12",
      startTime: "09:00",
      timezone: "Asia/Seoul",
      tripType: "day_trip",
      tripPace: "relaxed",
      selectedCategories: ["attraction", "food", "accommodation"],
      roundTrip: false,
      ...options,
    },
  };
}

function provider(input: RouteOptimizationInput, failFirst = 0): TravelTimeProvider {
  let calls = 0;
  return {
    buildMatrix: vi.fn(),
    validateOrderedRoute: vi.fn(async (request: OrderedRouteValidationInput) => {
      calls += 1;
      if (calls <= failFirst) {
        return {
          status: "provider_unavailable" as const,
          temporalBasis: "unknown" as const,
          totalDistanceMeters: null,
          totalDurationSeconds: null,
          sections: [], geometry: [], providerResultCode: null,
          reasonCodes: ["synthetic_failure"],
          diagnostics: { providerOperation: "waypoints" as const, cacheHit: false, providerCalls: 1, durationMs: 1 },
        };
      }
      const chain = [request.departure, ...request.orderedStops, ...(request.roundTrip ? [request.departure] : [])];
      const sections = chain.slice(0, -1).map((node, index) => ({
        fromId: node.id,
        toId: chain[index + 1].id,
        distanceMeters: input.matrix.edges[node.id][chain[index + 1].id].distanceMeters!,
        durationSeconds: input.matrix.edges[node.id][chain[index + 1].id].durationSeconds!,
      }));
      return {
        status: "validated" as const,
        temporalBasis: "current_traffic" as const,
        totalDistanceMeters: sections.reduce((sum, item) => sum + item.distanceMeters, 0),
        totalDurationSeconds: sections.reduce((sum, item) => sum + item.durationSeconds, 0),
        sections,
        geometry: chain.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
        providerResultCode: 0,
        reasonCodes: [],
        diagnostics: { providerOperation: "waypoints" as const, cacheHit: false, providerCalls: 1, durationMs: 1 },
      };
    }),
  };
}

describe("route-solver-v1", () => {
  it("matches an independent exhaustive enumeration on a small controlled set", () => {
    const input = optimization([
      candidate("a", 700), candidate("b", 650, { category: "culture" }), candidate("c", 610, { category: "food", role: "meal" }),
    ]);
    const exact = searchRoutesV1(input);
    const brute: CompletedRouteCandidate[] = [];
    const start = tripStartMs(input.tripRequest);
    const enumerate = (
      visits: ScheduledRouteVisit[],
      remaining: RouteOptimizationCandidate[],
      currentNodeId: string,
      currentTimeMs: number,
    ) => {
      if (visits.length >= 2) {
        brute.push(scoreCompletedRouteV1({ visits, departureId: "departure", serviceDayStartMs: start, matrix: input.matrix, tripRequest: input.tripRequest }));
      }
      if (visits.length === 3) return;
      for (const next of remaining) {
        const appended = appendScheduledVisit({ candidate: next, edge: input.matrix.edges[currentNodeId][next.node.id], currentTimeMs, serviceDayStartMs: start, tripRequest: input.tripRequest });
        if (!appended) continue;
        enumerate([...visits, appended.visit], remaining.filter((item) => item !== next), next.node.id, appended.visit.departureAtMs);
      }
    };
    enumerate([], input.candidates, "departure", start);
    brute.sort(compareCompletedRoutes);
    expect(exact.finalists[0].signature).toBe(brute[0].signature);
    expect(exact.diagnostics.exactSearchCompleted).toBe(true);
  });

  it("is deterministic across reversed candidate input", () => {
    const candidates = [candidate("a", 700), candidate("b", 700), candidate("c", 700)];
    expect(searchRoutesV1(optimization(candidates)).finalists[0].signature).toBe(
      searchRoutesV1(optimization([...candidates].reverse())).finalists[0].signature,
    );
  });

  it("uses deterministic beam fallback when the state limit is reached", () => {
    const result = searchRoutesV1(
      optimization(Array.from({ length: 8 }, (_, index) => candidate(`p${index}`, 800 - index))),
      { maxStates: 2 },
    );
    expect(result.diagnostics).toMatchObject({ stateLimitExceeded: true, beamFallbackUsed: true, exactSearchCompleted: false });
    expect(result.finalists.length).toBeGreaterThan(0);
  });

  it("respects the one-second exact-search deadline on the 15-candidate boundary", () => {
    const input = optimization(
      Array.from({ length: 15 }, (_, index) =>
        candidate(`boundary-${String(index).padStart(2, "0")}`, 900 - index),
      ),
      { tripPace: "packed" },
    );
    const started = performance.now();
    const result = searchRoutesV1(input);
    expect(result.diagnostics.solverDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.deadlineExceeded || result.diagnostics.exactSearchCompleted).toBe(true);
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it("rejects a known schedule conflict", () => {
    const result = searchRoutesV1(optimization([
      candidate("closed", 900, { window: [0, 30] }), candidate("a", 700), candidate("b", 650),
    ]));
    expect(result.finalists.every((route) => !route.orderedPlaceIds.includes("closed"))).toBe(true);
    expect(result.diagnostics.prunedByTimeWindow).toBeGreaterThan(0);
  });

  it("rejects an explicitly impossible mandatory reservation", () => {
    const result = searchRoutesV1(optimization([
      candidate("reservation-blocked", 999, { reservationImpossible: true }),
      candidate("a", 700),
      candidate("b", 690),
    ]));
    expect(result.finalists.every((route) => !route.orderedPlaceIds.includes("reservation-blocked"))).toBe(true);
    expect(result.diagnostics.prunedByConstraint).toBeGreaterThan(0);
  });

  it("never returns a route beyond the configured pace duration", () => {
    const result = searchRoutesV1(optimization(
      [candidate("a", 700), candidate("b", 690)],
      {},
      { "departure>a": 200, "departure>b": 200, "a>b": 200, "b>a": 200 },
    ));
    expect(result.finalists).toHaveLength(0);
    expect(result.diagnostics.prunedByDuration).toBeGreaterThan(0);
  });

  it("caps unknown schedules at one and applies the explicit penalty", () => {
    const result = searchRoutesV1(optimization([
      candidate("u1", 900, { schedule: "unknown" }), candidate("u2", 850, { schedule: "unknown" }), candidate("k", 600),
    ]));
    expect(result.finalists.every((route) => route.unknownScheduleCount <= 1)).toBe(true);
    expect(result.finalists[0].scoreBreakdown.unknownSchedulePenalty).toBe(150);
  });

  it("uses asymmetric directed edges and rejects unresolved estimates", () => {
    const input = optimization([candidate("a", 700), candidate("b", 690)], {}, {
      "a>b": null, "b>a": 4, "departure>a": 2, "departure>b": 20,
    });
    const result = searchRoutesV1(input);
    expect(result.finalists[0].signature).toBe("b>a");
    expect(result.diagnostics.prunedByMissingEdge).toBeGreaterThan(0);
  });

  it("aligns meal dwell to a configured meal window", () => {
    const input = optimization([
      candidate("activity", 700, { highActivity: true, dwell: 120 }),
      candidate("meal", 650, { role: "meal", category: "food", dwell: 60 }),
    ], { startTime: "10:00" });
    const start = tripStartMs(input.tripRequest);
    const first = appendScheduledVisit({ candidate: input.candidates[0], edge: input.matrix.edges.departure.activity, currentTimeMs: start, serviceDayStartMs: start, tripRequest: input.tripRequest })!;
    const second = appendScheduledVisit({ candidate: input.candidates[1], edge: input.matrix.edges.activity.meal, currentTimeMs: first.visit.departureAtMs, serviceDayStartMs: start, tripRequest: input.tripRequest })!;
    const route = scoreCompletedRouteV1({ visits: [first.visit, second.visit], departureId: "departure", serviceDayStartMs: start, matrix: input.matrix, tripRequest: input.tripRequest });
    expect(route.scoreBreakdown.mealAlignmentBonus).toBe(100);
  });

  it("places accommodation last for overnight routes", () => {
    const result = searchRoutesV1(optimization([
      candidate("a", 700), candidate("b", 680), candidate("c", 660),
      candidate("hotel", 650, { role: "accommodation", category: "accommodation" }),
      candidate("extra", 500),
    ], { tripType: "overnight", tripPace: "packed" }));
    expect(result.finalists[0].orderedPlaceIds.at(-1)).toBe("hotel");
    expect(result.finalists[0].scoreBreakdown.accommodationPlacementBonus).toBe(80);
  });

  it("does not infer exploration when exposure data is unavailable", () => {
    const result = searchRoutesV1(optimization([
      candidate("a", 700, { exposure: null }), candidate("b", 690),
    ]));
    expect(result.finalists[0].scoreBreakdown.explorationBonus).toBe(0);
  });

  it("awards a popularity anchor only with sufficient popularity data", () => {
    const result = searchRoutesV1(optimization([
      candidate("popular", 700, { popularity: 0.8 }), candidate("b", 690),
    ]));
    expect(result.finalists[0].scoreBreakdown.popularAnchorBonus).toBe(100);
  });

  it("returns integer objective components whose signed sum exactly equals total", () => {
    const route = searchRoutesV1(optimization([
      candidate("a", 701),
      candidate("meal", 693, { role: "meal", category: "food", popularity: 0.8 }),
    ])).finalists[0];
    const values = Object.entries(route.scoreBreakdown)
      .filter(([name]) => name !== "version")
      .map(([, value]) => value);
    expect(values.every(Number.isInteger)).toBe(true);
    const breakdown = route.scoreBreakdown;
    expect(breakdown.total).toBe(
      breakdown.discountedPlaceUtility +
        breakdown.categoryCoverageBonus +
        breakdown.categoryTransitionBonus +
        breakdown.mealAlignmentBonus +
        breakdown.restAfterActivityBonus +
        breakdown.accommodationPlacementBonus +
        breakdown.popularAnchorBonus +
        breakdown.explorationBonus -
        breakdown.drivingTimePenalty -
        breakdown.waitingPenalty -
        breakdown.repeatedCategoryPenalty -
        breakdown.detourPenalty -
        breakdown.unknownSchedulePenalty -
        breakdown.paceDeviationPenalty,
    );
  });

  it("supports validated round-trip schedules including the return section", async () => {
    const input = optimization([candidate("a", 700), candidate("b", 690)], { roundTrip: true });
    const result = await optimizeRouteV1(input, { travelTimeProvider: provider(input) });
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.schedule.totalDrivingSeconds).toBe(1_800);
  });

  it("tries at most three finalists and can recover after one final validation failure", async () => {
    const input = optimization([candidate("a", 700), candidate("b", 690), candidate("c", 680)]);
    const travel = provider(input, 1);
    const result = await optimizeRouteV1(input, { travelTimeProvider: travel });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.diagnostics.validationAttempts).toBeLessThanOrEqual(3);
      expect(result.diagnostics.validationFailures).toBe(1);
    }
  });

  it("returns a controlled failure when every final route validation fails", async () => {
    const input = optimization([candidate("a", 700), candidate("b", 690)]);
    const result = await optimizeRouteV1(input, { travelTimeProvider: provider(input, 3) });
    expect(result.status).toBe("final_validation_failed");
  });

  it("fails before search for excess or non-strict candidates", async () => {
    const excess = optimization(
      Array.from({ length: 16 }, (_, index) => candidate(`excess-${index}`, 700)),
    );
    const excessResult = await optimizeRouteV1(excess, { travelTimeProvider: provider(excess) });
    expect(excessResult.status).toBe("solver_failed");
    if (excessResult.status === "solver_failed") {
      expect(excessResult.reasonCodes).toContain("candidate_limit_exceeded");
      expect(excessResult.diagnostics.expandedStates).toBe(0);
    }
    const invalidCandidate = candidate("invalid", 700);
    invalidCandidate.place = {
      source: "tourism_service2",
      assessment: { verdict: "unknown" },
      eligibility: { eligible: false, status: "ineligible", reasonCodes: ["pet_access_not_allowed"] },
    } as unknown as DetailedEligibleCandidate;
    const invalid = optimization([invalidCandidate, candidate("valid", 690)]);
    const invalidResult = await optimizeRouteV1(invalid, { travelTimeProvider: provider(invalid) });
    expect(invalidResult.status).toBe("solver_failed");
    if (invalidResult.status === "solver_failed") {
      expect(invalidResult.reasonCodes).toContain("non_strict_candidate_rejected");
    }
  });

  it("keeps all three greedy baselines deterministic and provider-neutral", () => {
    const input = optimization([candidate("a", 700), candidate("b", 690), candidate("c", 680)]);
    const first = buildAllGreedyBaselinesV1(input);
    const second = buildAllGreedyBaselinesV1(input);
    expect(first.map((item) => item.route?.signature)).toEqual(second.map((item) => item.route?.signature));
    expect(first.map((item) => item.name)).toEqual(["nearest_neighbor", "highest_utility_fastest", "category_greedy"]);
  });
});
