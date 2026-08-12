import { describe, expect, it, vi } from "vitest";
import {
  generateRouteRecommendation,
  validateManualRoute,
} from "@/lib/recommendation/recommendation-service";
import type {
  CandidatePipelineDiagnostics,
  CandidatePipelineResult,
  DetailedEligibleCandidate,
} from "@/lib/recommendation/types";
import type {
  RouteOptimizationResult,
  RecommendedRouteStop,
} from "@/lib/recommendation/types/route-optimizer";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type { TravelMatrixResult, TravelTimeProvider } from "@/lib/travel/types";
import type { RouteRecommendationRequest } from "@/types/recommendation";

const REQUEST: RouteRecommendationRequest = {
  departure: { label: "부산역", latitude: 35.115, longitude: 129.04, source: "kakao_place_search" },
  trip: {
    regionId: "busan",
    districtId: null,
    date: "2026-08-15",
    startTime: "10:00",
    tripType: "day_trip",
    tripPace: "relaxed",
    selectedCategories: ["attraction"],
    roundTrip: false,
  },
  pet: {
    name: "보리",
    species: "DOG",
    size: "SMALL",
    availableEquipment: { carrier: true, leash: true, muzzle: false },
    acceptsOutdoorOnlyPlaces: true,
  },
};

const diagnostics: CandidatePipelineDiagnostics = {
  version: "candidate-pipeline-v1",
  initialCatalogCount: 1,
  exposedCount: 1,
  coordinateValidCount: 1,
  categoryAcceptedCount: 1,
  stageACount: 1,
  stageBCount: 1,
  detailedEvaluationCount: 1,
  detailedBatchCount: 1,
  eligibleCount: 1,
  finalEligibleCount: 1,
  cacheHits: 0,
  providerCalls: 0,
  providerFailures: 0,
  providerUnavailableCandidates: 0,
  skippedCandidates: 0,
  detailCallsByOperation: {},
  excludedByReason: {},
  warningsByReason: {},
  categoryDistribution: { attraction: 1 },
};

const CANDIDATE = {
  contentId: "1001",
  contentTypeId: "12",
  title: "공식 관광지",
  coordinates: { latitude: 35.16, longitude: 129.16 },
  region: { regionCode: "26", districtCode: null },
  providerVisibility: "exposed",
  source: "tourism_service2",
  category: "attraction",
  summary: { address: "부산광역시" },
  travelSuitability: { travelRole: "general_attraction" },
  scheduleDetail: { operatingInformation: "09:00-20:00" },
  scheduleCompatibility: { status: "compatible", warningCodes: [], reasonCodes: [] },
  assessment: {
    verdict: "allowed",
    conditions: [],
    evidence: [
      { field: "etcAcmpyInfo", fieldLabel: "기타 동반 정보", originalText: "동반 가능" },
    ],
  },
  licensing: null,
  eligibility: { status: "eligible", eligible: true, reasonCodes: [], warnings: [] },
  trust: {
    ruleVersion: "petpass-trust-v1",
    score: 90,
    level: "high",
    evidenceCount: 1,
    computedAt: "2026-08-15T00:00:00.000Z",
    components: [],
    flags: [],
  },
  popularity: {
    version: "popularity-v1",
    score: 0.5,
    status: "insufficient_data",
    qualityComponent: 0.5,
    trendComponent: 0.5,
    sampleWeight: 0,
  },
  utility: {
    version: "place-utility-v1",
    total: 800,
    preferenceFit: 1,
    petCompatibility: 1,
    informationTrust: 0.9,
    popularity: 0.5,
    categoryPriority: 1,
    dataQuality: 1,
    weightedContributions: {
      preferenceFit: 300,
      petCompatibility: 250,
      informationTrust: 135,
      popularity: 40,
      categoryPriority: 100,
      dataQuality: 80,
    },
    reasonCodes: [],
    warningCodes: ["popularity_insufficient_data"],
  },
} as unknown as DetailedEligibleCandidate;

const MATRIX: TravelMatrixResult = {
  version: "travel-matrix-v1",
  nodeIds: ["departure", "1001"],
  complete: true,
  edges: {
    departure: {
      "1001": {
        fromId: "departure",
        toId: "1001",
        distanceMeters: 12_340,
        durationSeconds: 1_800,
        lowerBoundMeters: 10_000,
        status: "resolved",
        source: "kakao_multi_destination_live",
        confidence: "provider_summary",
        temporalBasis: "traffic_independent",
        distanceFetchedAt: "2026-08-15T00:00:00.000Z",
        durationFetchedAt: "2026-08-15T00:00:00.000Z",
        reasonCodes: [],
      },
    },
    "1001": {},
  },
  diagnostics: {
    nodeCount: 2,
    expectedDirectedEdges: 2,
    resolvedEdges: 2,
    unresolvedEdges: 0,
    estimatedLowerBounds: 0,
    multiDestinationRequests: 1,
    directionsFallbackRequests: 0,
    requestCacheHits: 0,
    persistentCacheHits: 0,
    providerCalls: 1,
    retries: 0,
    timeouts: 0,
    providerFailures: 0,
    budgetExceeded: false,
    deadlineExceeded: false,
    durationMs: 5,
  },
};

const STOP: RecommendedRouteStop = {
  placeId: "1001",
  sequence: 1,
  arrivalAt: "2026-08-15T01:30:00.000Z",
  visitStartsAt: "2026-08-15T01:30:00.000Z",
  departureAt: "2026-08-15T03:00:00.000Z",
  dwellMinutes: 90,
  driveSecondsFromPrevious: 1_800,
  distanceMetersFromPrevious: 12_340,
  waitSeconds: 0,
  dwellDurationSource: "category_default",
  source: "tourism_service2",
  petAssessment: "allowed",
  informationTrust: "high",
  placeUtility: CANDIDATE.utility,
  inclusionReasonCodes: ["matches_requested_category", "official_pet_evidence"],
  orderingReasonCodes: ["shorter_next_drive"],
  warningCodes: [],
};

const optimizerDiagnostics = {
  candidateCount: 1,
  expandedStates: 1,
  prunedByBound: 0,
  prunedByTimeWindow: 0,
  prunedByDuration: 0,
  prunedByMissingEdge: 0,
  prunedByConstraint: 0,
  completedRoutes: 1,
  exactSearchCompleted: true,
  deadlineExceeded: false,
  stateLimitExceeded: false,
  beamFallbackUsed: false,
  internalFinalists: 1,
  validationAttempts: 1,
  validationFailures: 0,
  validatedRoutes: 1,
  matrixTemporalBasis: "traffic_independent" as const,
  solverDurationMs: 2,
  validationDurationMs: 3,
  totalDurationMs: 5,
};

function readyOptimizer(
  optimality: "optimal_within_candidate_set_current_matrix" | "best_found_within_time_limit" = "optimal_within_candidate_set_current_matrix",
): Extract<RouteOptimizationResult, { status: "ready" }> {
  return {
    status: "ready",
    engineVersion: "petpass-route-engine-v1",
    objectiveVersion: "route-objective-v1",
    solverVersion: "route-solver-v1",
    searchOptimality: optimality,
    validationSelection: "only_validated_candidate",
    score: 800,
    scoreBreakdown: {} as Extract<RouteOptimizationResult, { status: "ready" }>["scoreBreakdown"],
    schedule: {
      startAt: "2026-08-15T01:00:00.000Z",
      endAt: "2026-08-15T03:00:00.000Z",
      matrixTemporalBasis: "traffic_independent",
      finalValidationTemporalBasis: "current_traffic",
      totalDrivingSeconds: 1_800,
      totalVisitSeconds: 5_400,
      totalWaitSeconds: 0,
      totalDistanceMeters: 12_340,
    },
    stops: [STOP],
    geometry: [
      { latitude: 35.115, longitude: 129.04 },
      { latitude: 35.16, longitude: 129.16 },
    ],
    alternatives: [],
    excludedHighlights: [],
    warnings: [],
    diagnostics: { ...optimizerDiagnostics, exactSearchCompleted: optimality.startsWith("optimal") },
  };
}

function pipeline(status: CandidatePipelineResult["status"]): CandidatePipelineResult {
  return {
    status,
    eligibleCount: status === "ready" ? 1 : 0,
    requiredMinimum: 1,
    eligiblePoolTarget: 4,
    reasonCounts: status === "ready" ? {} : { synthetic_pipeline_failure: 1 },
    candidates: status === "ready" ? [CANDIDATE] : [],
    diagnostics: { ...diagnostics, finalEligibleCount: status === "ready" ? 1 : 0 },
  };
}

function dependencies(
  pipelineResult: CandidatePipelineResult,
  optimizerResult: RouteOptimizationResult = readyOptimizer(),
) {
  const travelTimeProvider: TravelTimeProvider = {
    buildMatrix: vi.fn(async () => MATRIX),
    validateOrderedRoute: vi.fn(),
  };
  return {
    tourService: {} as TourPlaceService,
    collectCatalog: vi.fn(async () => ({
      places: [],
      page: 1,
      pageSize: 0,
      totalCount: 0,
      source: {
        provider: "Korea Tourism Organization" as const,
        operation: "areaBasedList2" as const,
        retrievedAt: "2026-08-15T00:00:00.000Z",
      },
    })),
    candidatePipeline: vi.fn(async () => pipelineResult),
    optimizer: vi.fn(async () => optimizerResult),
    travelTimeProvider,
    now: () => new Date("2026-08-15T00:00:00.000Z"),
    editSessionSecret: "unit-test-route-edit-session-secret",
  };
}

describe("Stage 5 canonical recommendation orchestration", () => {
  it.each([
    ["insufficient_eligible_places" as const, "insufficient_eligible_places"],
    ["provider_unavailable" as const, "tourism_provider_unavailable"],
  ])("maps Stage 2 %s without a legacy or demo fallback", async (pipelineStatus, expected) => {
    const result = await generateRouteRecommendation(REQUEST, dependencies(pipeline(pipelineStatus)));
    expect(result.status).toBe(expected);
    expect(JSON.stringify(result)).not.toMatch(/demo|fixture|kakao-candidate/iu);
  });

  it.each([
    ["matrix_incomplete" as const, "travel_matrix_incomplete"],
    ["insufficient_feasible_route" as const, "insufficient_feasible_route"],
    ["final_validation_failed" as const, "final_route_validation_failed"],
  ])("maps Stage 4 %s distinctly", async (optimizerStatus, expected) => {
    const result = await generateRouteRecommendation(
      REQUEST,
      dependencies(pipeline("ready"), {
        status: optimizerStatus,
        reasonCodes: ["synthetic_optimizer_failure"],
        diagnostics: optimizerDiagnostics,
      }),
    );
    expect(result.status).toBe(expected);
  });

  it.each([
    "optimal_within_candidate_set_current_matrix" as const,
    "best_found_within_time_limit" as const,
  ])("returns a strict, provider-backed %s product result", async (optimality) => {
    const deps = dependencies(pipeline("ready"), readyOptimizer(optimality));
    const result = await generateRouteRecommendation(REQUEST, deps);
    expect(result).toMatchObject({
      status: "ready",
      optimality,
      route: {
        kind: "optimized",
        routeSummary: { totalDistanceMeters: 12_340, totalDrivingSeconds: 1_800 },
        temporalBasis: { searchMatrix: "traffic_independent", finalRoute: "current_traffic" },
        stops: [{ source: "tourism_service2", placeId: "1001" }],
      },
    });
    expect(deps.travelTimeProvider.buildMatrix).toHaveBeenCalledTimes(1);
    expect(deps.optimizer).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/serviceKey|Authorization|rawProvider|kakao-candidate/iu);
  });

  it("does not expose a lower-travel label for an alternative that drives longer", async () => {
    const optimized = readyOptimizer();
    optimized.alternatives = [
      {
        type: "lower_travel",
        score: 790,
        scoreBreakdown: optimized.scoreBreakdown,
        stopIds: ["1001"],
        startAt: optimized.schedule.startAt,
        endAt: optimized.schedule.endAt,
        totalDrivingSeconds: optimized.schedule.totalDrivingSeconds + 1,
        totalVisitSeconds: optimized.schedule.totalVisitSeconds,
        totalWaitSeconds: optimized.schedule.totalWaitSeconds,
        totalDistanceMeters: optimized.schedule.totalDistanceMeters + 1,
        temporalBasis: optimized.schedule.finalValidationTemporalBasis,
        stops: optimized.stops,
        geometry: optimized.geometry,
      },
    ];

    const result = await generateRouteRecommendation(
      REQUEST,
      dependencies(pipeline("ready"), optimized),
    );

    expect(result).toMatchObject({ status: "ready", alternatives: [] });
  });

  it("revalidates a signed edit token across the stateless Route Handler boundary", async () => {
    const deps = dependencies(pipeline("ready"), readyOptimizer());
    const generated = await generateRouteRecommendation(REQUEST, deps);
    expect(generated.status).toBe("ready");
    if (generated.status !== "ready") return;

    const travelTimeProvider: TravelTimeProvider = {
      buildMatrix: vi.fn(),
      validateOrderedRoute: vi.fn(async () => ({
        status: "validated" as const,
        totalDistanceMeters: 12_340,
        totalDurationSeconds: 1_800,
        temporalBasis: "future_departure" as const,
        geometry: [
          { latitude: 35.115, longitude: 129.04 },
          { latitude: 35.16, longitude: 129.16 },
        ],
        sections: [
          {
            fromId: "departure",
            toId: "1001",
            distanceMeters: 12_340,
            durationSeconds: 1_800,
          },
        ],
        providerResultCode: 0,
        reasonCodes: [],
        diagnostics: {
          providerOperation: "future_directions" as const,
          cacheHit: false,
          providerCalls: 1,
          durationMs: 5,
        },
      })),
    };
    const revalidated = await validateManualRoute(
      generated.editSessionId,
      ["1001"],
      {
        travelTimeProvider,
        now: () => new Date("2026-08-15T00:01:00.000Z"),
        editSessionSecret: "unit-test-route-edit-session-secret",
      },
    );

    expect(revalidated).toMatchObject({
      status: "ready",
      route: {
        kind: "manual",
        stops: [{ placeId: "1001", orderingReasonCodes: ["manual_order_preserved"] }],
      },
    });
    expect(
      await validateManualRoute(
        `${generated.editSessionId.slice(0, -1)}x`,
        ["1001"],
        {
          travelTimeProvider,
          now: () => new Date("2026-08-15T00:01:00.000Z"),
          editSessionSecret: "unit-test-route-edit-session-secret",
        },
      ),
    ).toMatchObject({ status: "invalid_request" });
  });
});
