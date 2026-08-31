import { describe, expect, it, vi } from "vitest";
import { generateRouteRecommendation } from "@/lib/recommendation/recommendation-service";
import { routeRecommendationResponseSchema } from "@/lib/recommendation/recommendation-response";
import type {
  CandidatePipelineDiagnostics,
  CandidatePipelineResult,
  DetailedEligibleCandidate,
} from "@/lib/recommendation/types";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type { TravelMatrixResult, TravelTimeProvider } from "@/lib/travel/types";
import type { MapPlacesSnapshot, MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { RouteRecommendationRequest } from "@/types/recommendation";

const REQUEST: RouteRecommendationRequest = {
  departure: { label: "부산역", latitude: 35.115, longitude: 129.04, source: "kakao_place_search" },
  trip: {
    regionId: "busan",
    districtId: null,
    date: "2026-08-15",
    startTime: "10:00",
    tripType: "day_trip",
    tripPace: "balanced",
    selectedCategories: ["attraction"],
    roundTrip: false,
    environmentPreference: "any",
  },
  pet: {
    name: "보리",
    species: "DOG",
    size: "SMALL",
    availableEquipment: { carrier: true, leash: true, muzzle: false },
    acceptsOutdoorOnlyPlaces: false,
  },
  personalization: {
    petCount: 1,
    petActivityLevel: "moderate",
    walkingTolerance: "moderate",
    crowdPreference: "any",
    tripMood: "balanced",
    categoryPriorities: { attraction: 1 },
    recentRouteSignatures: [],
    recentlySelectedCandidateIds: [],
    explicitlyExcludedPlaceIds: [],
    rerollVariant: 0,
  },
};

function ktoCandidate(id: string, offset: number): DetailedEligibleCandidate {
  return {
    contentId: id,
    contentTypeId: "12",
    title: `공식 장소 ${id}`,
    coordinates: { latitude: 35.15 + offset, longitude: 129.08 + offset },
    region: { regionCode: "26", districtCode: null },
    providerVisibility: "exposed",
    source: "tourism_service2",
    category: "attraction",
    summary: {
      contentId: id,
      contentTypeId: "12",
      title: `공식 장소 ${id}`,
      address: "부산광역시 테스트로 1",
      phone: null,
      thumbnailUrl: null,
      imageUrl: null,
      coordinates: { latitude: 35.15 + offset, longitude: 129.08 + offset },
      source: {
        provider: "Korea Tourism Organization",
        operation: "areaBasedList2",
        retrievedAt: "2026-08-15T00:00:00.000Z",
      },
    },
    travelSuitability: { travelRole: "general_attraction" },
    scheduleDetail: { operatingInformation: "09:00-20:00" },
    scheduleCompatibility: { status: "compatible", warningCodes: [], reasonCodes: [] },
    assessment: {
      verdict: "allowed",
      evaluationState: "evaluated",
      permittedScopes: ["whole_place"],
      restrictedScopes: [],
      conditions: [],
      evidence: [],
    },
    licensing: null,
    eligibility: { status: "eligible", eligible: true, tier: "verified", reasonCodes: [], warnings: [] },
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
      qualityComponent: 0,
      trendComponent: 0,
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
  } as unknown as DetailedEligibleCandidate;
}

const baseDiagnostics: CandidatePipelineDiagnostics = {
  version: "candidate-pipeline-v1",
  initialCatalogCount: 0,
  exposedCount: 0,
  coordinateValidCount: 0,
  categoryAcceptedCount: 0,
  stageACount: 0,
  stageBCount: 0,
  detailedEvaluationCount: 0,
  detailedBatchCount: 0,
  eligibleCount: 0,
  finalEligibleCount: 0,
  cacheHits: 0,
  providerCalls: 0,
  providerFailures: 0,
  providerUnavailableCandidates: 0,
  skippedCandidates: 0,
  detailCallsByOperation: {},
  excludedByReason: {},
  warningsByReason: {},
  categoryDistribution: {},
};

function pipeline(candidates: DetailedEligibleCandidate[]): CandidatePipelineResult {
  return {
    status: candidates.length ? "ready" : "insufficient_eligible_places",
    eligibleCount: candidates.length,
    requiredMinimum: 1,
    eligiblePoolTarget: 8,
    reasonCounts: {},
    candidates,
    diagnostics: { ...baseDiagnostics, finalEligibleCount: candidates.length },
  };
}

function kakaoMarker(id: string, offset: number): MapPlacesSnapshotMarker {
  return {
    id: `kakao:${id}`,
    regionId: "busan",
    providerPlaceId: id,
    name: `카카오 후보 ${id}`,
    layer: "kakao",
    category: "attraction",
    districtCode: null,
    districtName: null,
    address: `부산광역시 후보로 ${id}`,
    coordinates: { latitude: 35.2 + offset, longitude: 129.12 + offset },
    lastSeenAt: "2026-08-15T00:00:00.000Z",
    completeness: 0.7,
    petAccessVerdict: "unknown",
    publicLabel: "반려동물 동반 여부 확인 필요",
    sourceLabel: "카카오 검색 후보",
  };
}

function snapshot(items: MapPlacesSnapshotMarker[]): MapPlacesSnapshot {
  return {
    contractVersion: 1,
    region: "busan",
    scope: "default",
    dataset: "core",
    generatedAt: "2026-08-15T00:00:00.000Z",
    publicationVersion: "p1-0123456789abcdef",
    dataVersion: "v1-0123456789abcdef",
    totalCount: items.length,
    providerCounts: { tour: 0, kakao: items.length },
    categoryCounts: { attraction: items.length },
    freshness: { status: "fresh" },
    items,
  };
}

function travelProvider() {
  const buildMatrix = vi.fn(async ({ departure, candidates }: Parameters<TravelTimeProvider["buildMatrix"]>[0]) => {
    const nodes = [departure, ...candidates];
    const edges: TravelMatrixResult["edges"] = {};
    for (const from of nodes) {
      edges[from.id] = {};
      for (const to of nodes) {
        if (from.id === to.id) continue;
        edges[from.id]![to.id] = {
          fromId: from.id,
          toId: to.id,
          distanceMeters: 1_000,
          durationSeconds: 600,
          lowerBoundMeters: 900,
          status: "resolved",
          source: "kakao_multi_destination_live",
          confidence: "provider_summary",
          temporalBasis: "traffic_independent",
          distanceFetchedAt: "2026-08-15T00:00:00.000Z",
          durationFetchedAt: "2026-08-15T00:00:00.000Z",
          reasonCodes: [],
        };
      }
    }
    return {
      version: "travel-matrix-v1",
      nodeIds: nodes.map(({ id }) => id),
      complete: true,
      edges,
      diagnostics: {
        nodeCount: nodes.length,
        expectedDirectedEdges: nodes.length * (nodes.length - 1),
        resolvedEdges: nodes.length * (nodes.length - 1),
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
    } satisfies TravelMatrixResult;
  });
  const validateOrderedRoute = vi.fn(async ({ departure, orderedStops }: Parameters<TravelTimeProvider["validateOrderedRoute"]>[0]) => ({
    status: "validated" as const,
    totalDistanceMeters: orderedStops.length * 1_000,
    totalDurationSeconds: orderedStops.length * 600,
    temporalBasis: "current_traffic" as const,
    geometry: [
      { latitude: departure.latitude, longitude: departure.longitude },
      ...orderedStops.map(({ latitude, longitude }) => ({ latitude, longitude })),
    ],
    sections: orderedStops.map((stop, index) => ({
      fromId: index === 0 ? departure.id : orderedStops[index - 1]!.id,
      toId: stop.id,
      distanceMeters: 1_000,
      durationSeconds: 600,
    })),
    providerResultCode: 0,
    reasonCodes: [],
    diagnostics: {
      providerOperation: "waypoints" as const,
      cacheHit: false,
      providerCalls: 1,
      durationMs: 5,
    },
  }));
  return { buildMatrix, validateOrderedRoute } satisfies TravelTimeProvider;
}

function dependencies(kto: DetailedEligibleCandidate[], kakao: MapPlacesSnapshotMarker[]) {
  const provider = travelProvider();
  return {
    tourService: {} as TourPlaceService,
    collectCatalog: vi.fn(async () => ({ places: [] } as never)),
    candidatePipeline: vi.fn(async () => pipeline(kto)),
    loadCatalogSnapshot: vi.fn(async () => snapshot(kakao)),
    travelTimeProvider: provider,
    now: () => new Date("2026-08-15T00:00:00.000Z"),
    editSessionSecret: "unit-test-route-edit-session-secret",
    provider,
  };
}

describe("recommendation service V2 orchestration", () => {
  it("returns a truthful single-stop suggestion", async () => {
    const deps = dependencies([ktoCandidate("1001", 0)], []);
    const result = await generateRouteRecommendation(REQUEST, deps);

    expect(result).toMatchObject({
      status: "ready",
      contractVersion: "route-recommendation-v2",
      engineVersion: "petpass-route-engine-v2",
      resultState: "single_stop_suggestion",
      route: { reductionStatus: "single_stop", stops: [{ placeId: "tour:1001" }] },
    });
  });

  it("excludes unverified Kakao candidates from automatic recommendations by default", async () => {
    const deps = dependencies(
      [ktoCandidate("1001", 0)],
      [kakaoMarker("201", 0), kakaoMarker("202", 0.01), kakaoMarker("203", 0.02)],
    );
    const result = await generateRouteRecommendation(REQUEST, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
    expect(result.candidateSourceCounts).toEqual({ kto: 1, kakao: 0, merged: 0 });
    expect(result.routeOptions?.flatMap(({ stops }) => stops).every((stop) =>
      stop.source === "tourism_service2" && stop.petAssessment === "allowed" && stop.evidenceStatus === "verified",
    )).toBe(true);
    expect(deps.collectCatalog).toHaveBeenCalledTimes(1);
    expect(deps.candidatePipeline).toHaveBeenCalledTimes(1);
    expect(deps.loadCatalogSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.provider.buildMatrix).toHaveBeenCalledTimes(1);
    expect(deps.provider.validateOrderedRoute.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.routeOptions?.flatMap(({ stops }) => stops).every(({ placeId }) =>
      placeId.startsWith("tour:") || placeId.startsWith("kakao:"),
    )).toBe(true);
  });

  it("uses verification-required Kakao candidates only after an explicit opt-in", async () => {
    const deps = dependencies(
      [ktoCandidate("1001", 0)],
      [kakaoMarker("201", 0), kakaoMarker("202", 0.01), kakaoMarker("203", 0.02)],
    );
    const result = await generateRouteRecommendation({
      ...REQUEST,
      includeVerificationRequired: true,
    }, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.candidateSourceCounts).toEqual({ kto: 1, kakao: 3, merged: 0 });
    expect(result.routeOptions?.flatMap(({ stops }) => stops).some((stop) =>
      stop.source === "kakao_catalog" &&
      stop.petAssessment === "unknown" &&
      stop.operatingHoursEvidenceState === "verification_required",
    )).toBe(true);
  });

  it("records bounded three-option work and response size for the controlled benchmark", async () => {
    const durations: number[] = [];
    let measurement: Record<string, number> = {};
    for (let run = 0; run < 5; run += 1) {
      const deps = {
        ...dependencies(
          [ktoCandidate("1001", 0), ktoCandidate("1002", 0.01), ktoCandidate("1003", 0.02)],
          [kakaoMarker("201", 0), kakaoMarker("202", 0.01), kakaoMarker("203", 0.02)],
        ),
        includeDiagnostics: true,
      };
      const started = performance.now();
      const result = await generateRouteRecommendation(REQUEST, deps);
      durations.push(performance.now() - started);
      expect(result.status).toBe("ready");
      if (result.status !== "ready") continue;
      expect(result.routeOptions).toHaveLength(3);
      expect(result.alternatives).toHaveLength(2);
      expect(result.diagnostics?.candidateEligibility).toMatchObject({
        providerRawCandidates: 6,
        regionFilteredCandidates: 6,
        districtFilteredCandidates: 6,
        requestedCategoryCandidates: 6,
        petEligibleCandidates: 3,
        operatingHoursEligibleCandidates: 3,
        finalUsedPlaces: result.route.routeSummary.stopCount,
      });
      measurement = {
        routeOptions: result.routeOptions?.length ?? 0,
        catalogCalls: deps.collectCatalog.mock.calls.length,
        pipelineCalls: deps.candidatePipeline.mock.calls.length,
        snapshotCalls: deps.loadCatalogSnapshot.mock.calls.length,
        matrixCalls: deps.provider.buildMatrix.mock.calls.length,
        finalValidationCalls: deps.provider.validateOrderedRoute.mock.calls.length,
        solverDurationMs: result.diagnostics?.solver.durationMs ?? 0,
        rawResponseBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength,
      };
    }
    durations.sort((left, right) => left - right);
    measurement.medianWallMs = Math.round(durations[2]! * 100) / 100;
    console.log(`V2_SERVICE_METRICS ${JSON.stringify(measurement)}`);
  });

  it.each([
    ["western", 35.1731, 128.9468],
    ["central", 35.1796, 129.0756],
    ["eastern", 35.2446, 129.2223],
  ])("uses the confirmed %s Busan origin as the matrix departure", async (_label, latitude, longitude) => {
    const deps = dependencies([ktoCandidate("1001", 0)], []);
    const result = await generateRouteRecommendation({
      ...REQUEST,
      departure: {
        ...REQUEST.departure,
        label: `${_label} origin`,
        latitude,
        longitude,
      },
    }, deps);

    expect(result.status).toBe("ready");
    expect(deps.provider.buildMatrix).toHaveBeenCalledWith(expect.objectContaining({
      departure: expect.objectContaining({ latitude, longitude }),
    }));
    expect(deps.provider.validateOrderedRoute).toHaveBeenCalledWith(expect.objectContaining({
      departure: expect.objectContaining({ latitude, longitude }),
    }));
  });

  it("uses the requested duration and target while returning the best shorter route", async () => {
    const deps = dependencies(
      [ktoCandidate("1001", 0), ktoCandidate("1002", 0.01), ktoCandidate("1003", 0.02)],
      [],
    );
    const result = await generateRouteRecommendation({
      ...REQUEST,
      trip: { ...REQUEST.trip, desiredStopCount: 3, durationMinutes: 110 },
    }, deps);

    expect(result).toMatchObject({
      status: "ready",
      resultState: "single_stop_suggestion",
      route: {
        requestedTarget: 3,
        reductionStatus: "single_stop",
        routeSummary: { stopCount: 1 },
      },
    });
  });

  it("returns an inspectable insufficient-eligibility state before matrix work", async () => {
    const deps = { ...dependencies([], []), includeDiagnostics: true };
    const result = await generateRouteRecommendation(REQUEST, deps);

    expect(result).toMatchObject({
      status: "insufficient_eligible_places",
      resultState: "insufficient_eligible_places",
      feasibleStopCount: 0,
      recoveryActions: expect.arrayContaining(["select_places_manually"]),
      diagnostics: {
        candidateEligibility: {
          providerRawCandidates: 0,
          feasibleRouteCandidates: 0,
          finalUsedPlaces: 0,
        },
      },
    });
    expect(deps.provider.buildMatrix).not.toHaveBeenCalled();
  });

  it.each([
    ["balanced" as const, 2, "ready_with_reduced_stops"],
    ["packed" as const, 3, "ready_with_reduced_stops"],
  ])("returns a reduced %s route from %i valid places", async (tripPace, count, state) => {
    const deps = dependencies(
      Array.from({ length: count }, (_, index) => ktoCandidate(`${1_001 + index}`, index * 0.01)),
      [],
    );
    const result = await generateRouteRecommendation({
      ...REQUEST,
      trip: { ...REQUEST.trip, tripPace },
    }, deps);

    expect(result).toMatchObject({
      status: "ready",
      resultState: state,
      route: { routeSummary: { stopCount: count }, reductionStatus: "reduced" },
    });
  });

  it("uses stored Kakao candidates after a partial KTO failure only with opt-in", async () => {
    const deps = dependencies([], [kakaoMarker("201", 0)]);
    deps.candidatePipeline.mockResolvedValue({
      ...pipeline([]),
      status: "provider_unavailable",
    });
    const result = await generateRouteRecommendation({
      ...REQUEST,
      includeVerificationRequired: true,
    }, deps);

    expect(result).toMatchObject({
      status: "ready",
      resultState: "single_stop_suggestion",
      route: { stops: [{ source: "kakao_catalog", petAssessment: "unknown" }] },
      warnings: ["kto_provider_partial_failure"],
    });
  });

  it("changes the canonical fingerprint for every result-changing V2 field", async () => {
    const variants: RouteRecommendationRequest[] = [
      REQUEST,
      { ...REQUEST, departure: { ...REQUEST.departure, longitude: 129.08 } },
      { ...REQUEST, trip: { ...REQUEST.trip, environmentPreference: "indoor_preferred" } },
      { ...REQUEST, trip: { ...REQUEST.trip, desiredStopCount: 2 } },
      { ...REQUEST, trip: { ...REQUEST.trip, durationMinutes: 420 } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, petActivityLevel: "high" } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, walkingTolerance: "low" } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, crowdPreference: "avoid" } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, tripMood: "scenic" } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, categoryPriorities: { attraction: 0.2 } } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, recentRouteSignatures: ["old>route"] } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, recentlySelectedCandidateIds: ["tour:old"] } },
      { ...REQUEST, includeVerificationRequired: true },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, explicitlyExcludedPlaceIds: ["tour:not-present"] } },
      { ...REQUEST, personalization: { ...REQUEST.personalization!, rerollVariant: 1 } },
    ];
    const fingerprints: string[] = [];
    for (const variant of variants) {
      const result = await generateRouteRecommendation(
        variant,
        dependencies([ktoCandidate("1001", 0)], []),
      );
      expect(result.status).toBe("ready");
      if (result.status === "ready") fingerprints.push(result.requestFingerprint!);
    }
    expect(new Set(fingerprints).size).toBe(variants.length);
  });
});
