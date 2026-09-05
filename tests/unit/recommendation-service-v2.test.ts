import { describe, expect, it, vi } from "vitest";
import { createRouteRecommendationHandler } from "@/app/api/itineraries/generate/handler";
import { KakaoTravelTimeProvider } from "@/lib/kakao/travel-time-provider";
import { KakaoMobilityProviderError } from "@/lib/kakao/directions";
import { generateRouteRecommendation, validateManualRoute } from "@/lib/recommendation/recommendation-service";
import { manualRouteValidationRequestSchema, manualRouteValidationResponseSchema, routeRecommendationResponseSchema } from "@/lib/recommendation/recommendation-response";
import { loadSavedRouteRecommendation, saveRouteRecommendation } from "@/lib/storage/recommendation-storage";
import { loadRecommendationPublicCatalog } from "@/lib/recommendation/public-catalog";
import type { PublicMapPlaceDTO } from "@/types/public-map-place";
import type { PublicMapCatalogQuery } from "@/lib/map-places/public-catalog";
import type {
  CandidatePipelineDiagnostics,
  CandidatePipelineResult,
  DetailedEligibleCandidate,
} from "@/lib/recommendation/types";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type { TravelMatrixResult, TravelTimeProvider } from "@/lib/travel/types";
import type { MapPlacesSnapshot, MapPlacesSnapshotMarker, MapPlacesSnapshotRequest } from "@/types/map-places-snapshot";
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

function ktoCandidate(id: string, offset: number, title = `공식 장소 ${id}`): DetailedEligibleCandidate {
  return {
    contentId: id,
    contentTypeId: "12",
    title,
    coordinates: { latitude: 35.15 + offset, longitude: 129.08 + offset },
    region: { regionCode: "26", districtCode: null },
    providerVisibility: "exposed",
    source: "tourism_service2",
    category: "attraction",
    summary: {
      contentId: id,
      contentTypeId: "12",
      title,
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

function tourMarker(id: string, offset: number): MapPlacesSnapshotMarker {
  return {
    ...kakaoMarker(id, offset),
    id: `tour:${id}`,
    layer: "tourism",
    petAccessVerdict: "allowed",
    publicLabel: "반려동물 동반 가능",
    sourceLabel: "한국관광공사",
  };
}

function snapshot(items: MapPlacesSnapshotMarker[], dataset: MapPlacesSnapshotRequest["dataset"] = "core"): MapPlacesSnapshot {
  return {
    contractVersion: 1,
    region: "busan",
    scope: "default",
    dataset,
    generatedAt: "2026-08-15T00:00:00.000Z",
    publicationVersion: "p1-0123456789abcdef",
    dataVersion: "v1-0123456789abcdef",
    totalCount: items.length,
    providerCounts: { tour: items.filter(item => item.layer === "tourism").length, kakao: items.filter(item => item.layer === "kakao").length },
    categoryCounts: items.reduce<MapPlacesSnapshot["categoryCounts"]>((counts, item) => { counts[item.category] = (counts[item.category] ?? 0) + 1; return counts; }, {}),
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
  // Publish the fixture inventory explicitly: optional detail collection is not
  // the source of candidates in the public-catalog recommendation path.
  const published = [...new Map([
    ...kto.map((candidate): MapPlacesSnapshotMarker => ({
      ...tourMarker(candidate.contentId, 0),
      contentTypeId: candidate.contentTypeId,
      name: candidate.title,
      coordinates: candidate.coordinates,
      address: candidate.summary.address ?? undefined,
      petAccessVerdict: candidate.assessment.verdict,
      petConditions: candidate.assessment.conditions.map(condition => condition.sourceText).join("\n") || null,
    })),
    ...kakao,
  ].map(marker => [marker.id, marker])).values()];
  return {
    tourService: {} as TourPlaceService,
    collectCatalog: vi.fn(async () => ({ places: [] } as never)),
    candidatePipeline: vi.fn(async () => pipeline(kto)),
    loadCatalogSnapshot: vi.fn(async ({ dataset }: MapPlacesSnapshotRequest) => snapshot(
      published.filter(marker => (marker.dataset ?? (marker.category === "shopping" && marker.layer === "tourism" ? "shopping" : "core")) === dataset),
      dataset,
    )),
    travelTimeProvider: provider,
    now: () => new Date("2026-08-15T00:00:00.000Z"),
    editSessionSecret: "unit-test-route-edit-session-secret",
    provider,
  };
}

describe("recommendation service V2 orchestration", () => {
  it.each(["catalog", "kakao_matrix", "final_directions"] as const)("correlates the first failed %s stage without raw provider data", async stage => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const deps = dependencies([], [kakaoMarker("801", 0)]);
      const fail = vi.fn(async () => { throw new KakaoMobilityProviderError("HTTP_ERROR", "SECRET private address provider body", 503); });
      const roads = new KakaoTravelTimeProvider({ client: { multiDestination: fail, pairDirections: fail, waypointDirections: fail, futureDirections: fail }, cache: { getEdge: async () => null, setEdge: async () => {} } });
      if (stage === "catalog") deps.loadCatalogSnapshot.mockRejectedValue(new Error("public_catalog_unavailable", { cause: Object.assign(new Error("SECRET"), { code: "PGRST003", httpStatus: 429 }) }));
      const travelTimeProvider: TravelTimeProvider = {
        buildMatrix: stage === "kakao_matrix" ? input => roads.buildMatrix(input) : deps.provider.buildMatrix,
        validateOrderedRoute: stage === "final_directions" ? input => roads.validateOrderedRoute(input) : deps.provider.validateOrderedRoute,
      };
      const response = await createRouteRecommendationHandler({ enabled: true, dependencies: { ...deps, travelTimeProvider }, rateLimit: () => ({ allowed: true, limit: 8, remaining: 7, retryAfterSeconds: 0 }) })(new Request("http://localhost/api/itineraries/generate", { method: "POST", body: JSON.stringify(REQUEST) }));
      expect(response.status).toBe(stage === "catalog" ? 429 : 503);
      expect(routeRecommendationResponseSchema.safeParse(await response.clone().json()).success).toBe(true);
      expect(log).toHaveBeenCalledTimes(1);
      const trace = JSON.parse(log.mock.calls[0]![1]);
      expect(trace).toMatchObject({ correlationId: response.headers.get("X-Request-ID"), firstFailedStage: stage, provider: stage === "catalog" ? "supabase" : "kakao", upstreamHttpStatus: stage === "catalog" ? 429 : 503, retryable: true });
      expect(trace.candidateCount).toBe(stage === "catalog" ? 0 : 1);
      expect(trace.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
      expect(await response.text()).not.toContain("SECRET");
    } finally { log.mockRestore(); }
  });
  it("counts every new automatic stop even when only one candidate matches a preferred category", async () => {
    const result = await generateRouteRecommendation(REQUEST, dependencies([], [
      kakaoMarker("801", 0),
      { ...kakaoMarker("802", .002), category: "food" },
      { ...kakaoMarker("803", .004), category: "food" },
    ]));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.stops.some(stop => stop.placeId === "kakao:801")).toBe(true);
    expect(result.newPlaceCount).toBe(result.route.stops.length);
  });
  it.each(["provider_unavailable", "kakao_rate_limited", "kakao_authentication_failed"])("does not label an essential matrix outage %s as schedule shortage", async reason => {
    const deps = dependencies([ktoCandidate("9001", 0)], []);
    const build = deps.provider.buildMatrix.getMockImplementation()!;
    deps.provider.buildMatrix.mockImplementation(async input => {
      const matrix = await build(input);
      for (const edges of Object.values(matrix.edges)) for (const edge of Object.values(edges)) {
        edge.status = "provider_unavailable"; edge.durationSeconds = null; edge.distanceMeters = null; edge.reasonCodes = [reason];
      }
      matrix.diagnostics.resolvedEdges = 0;
      return matrix;
    });
    const result = await generateRouteRecommendation({ ...REQUEST, requestVersion: 2 }, deps);
    expect(result.status).toBe(reason === "kakao_rate_limited" ? "rate_limited" : "kakao_provider_unavailable");
    expect(deps.provider.validateOrderedRoute).not.toHaveBeenCalled();
  });
  it("keeps unanswered published conditions as facts without an admission confirmation gate", async () => {
    const candidate = ktoCandidate("9001", 0);
    candidate.assessment.conditions = [
      { type: "vaccination_required", label: "백신 증빙", sourceText: "예방접종 증명서 지참 필수", scope: "whole_place", evidenceIds: [], manualConfirmationRecommended: true },
      { type: "reservation_required", label: "예약 완료", sourceText: "반려동물 객실 사전 예약 필수", scope: "whole_place", evidenceIds: [], manualConfirmationRecommended: true },
    ];
    const request: RouteRecommendationRequest = { ...REQUEST, requestVersion: 2, trip: { ...REQUEST.trip, date: null, startTime: null }, pet: { name: null, species: "DOG", size: "SMALL" } };
    const deps = { ...dependencies([candidate], []), now: () => new Date("2026-09-05T03:00:00Z") };
    for (const conditionConfirmation of [undefined, { token: "obsolete-untrusted-token", answers: [{ requirementId: "obsolete-question", answer: "confirmed" as const }] }]) {
      const result = await generateRouteRecommendation({ ...request, conditionConfirmation }, deps);
      expect(result.status).toBe("ready");
      if (result.status !== "ready") throw new Error("Expected a geographic draft");
      expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
      expect(result.route).toMatchObject({ planningPolicy: "full_public_catalog_v1", venueCompatibility: "unchecked", schedule: { state: "undated_template" } });
      expect(result.route.stops[0]).toMatchObject({
        catalogEvidence: [{ provider: "kto", providerPlaceId: "9001", originalText: "예방접종 증명서 지참 필수\n반려동물 객실 사전 예약 필수", retrievedAt: "2026-08-15T00:00:00.000Z" }],
      });
      expect(result.route.stops[0]!.conditionAcknowledged).not.toBe(true);
      expect("confirmationToken" in result).toBe(false);
    }
    expect(deps.candidatePipeline).not.toHaveBeenCalled();
  });
  it("preserves published conditions through signed manual edits while rejecting tampering and expiry", async () => {
    const candidates = [ktoCandidate("9101", 0), ktoCandidate("9102", 0.01)];
    for (const candidate of candidates) {
      candidate.scheduleDetail!.operatingInformation = "15:00-20:00";
      candidate.assessment.conditions = [
        { type: "vaccination_required", label: "백신 증빙", sourceText: "예방접종 증명서 지참 필수", scope: "whole_place", evidenceIds: [], manualConfirmationRecommended: true },
        { type: "reservation_required", label: "예약 확인", sourceText: "반려동물 객실 사전 예약 필수", scope: "whole_place", evidenceIds: [], manualConfirmationRecommended: true },
      ];
    }
    const request: RouteRecommendationRequest = { ...REQUEST, requestVersion: 2, trip: { ...REQUEST.trip, desiredStopCount: 2 }, pet: { name: null, species: "DOG", size: "SMALL" } };
    const deps = dependencies(candidates, []);
    const answered = await generateRouteRecommendation(request, deps);
    expect(answered.status).toBe("ready");
    if (answered.status !== "ready") return;
    expect(answered.route.schedule?.state).toBe("scheduled");
    const keptId = answered.route.stops[0]!.placeId;
    const validationDeps = { travelTimeProvider: deps.travelTimeProvider, now: deps.now, editSessionSecret: deps.editSessionSecret };
    const revised = await validateManualRoute(answered.editSessionId, [keptId], validationDeps);
    expect(revised).toMatchObject({ status: "ready", route: { planningPolicy: "full_public_catalog_v1", venueCompatibility: "unchecked", stops: [{ placeId: keptId, conditionAcknowledged: false }] } });
    expect(manualRouteValidationResponseSchema.safeParse(revised).success).toBe(true);
    expect(await validateManualRoute(answered.editSessionId + "forged", [keptId], validationDeps)).toMatchObject({ status: "invalid_request" });
    expect(await validateManualRoute(answered.editSessionId, ["kakao:unlisted"], validationDeps)).toMatchObject({ status: "invalid_request" });
    expect(await validateManualRoute(answered.editSessionId, [keptId], { ...validationDeps, now: () => new Date("2026-08-15T00:21:00Z") })).toMatchObject({ status: "invalid_request" });
    expect(manualRouteValidationRequestSchema.safeParse({ editSessionId: answered.editSessionId, orderedPlaceIds: [keptId], conditionAnswers: [{ requirementId: "same-question", answer: "confirmed" }, { requirementId: "same-question", answer: "cannot_meet" }] }).success).toBe(false);
    if (revised.status === "ready") {
      expect(revised.route.stops[0]!.catalogEvidence).toEqual(answered.route.stops[0]!.catalogEvidence);
      expect(revised.editSessionId).toBeTruthy();
      expect(await validateManualRoute(revised.editSessionId!, [keptId], validationDeps)).toMatchObject({ status: "ready", route: { stops: [{ conditionAcknowledged: false }] } });
      const cancellation = new AbortController();
      const cancelledProvider = { ...deps.travelTimeProvider, validateOrderedRoute: async () => {
        cancellation.abort();
        throw cancellation.signal.reason;
      } };
      await expect(validateManualRoute(revised.editSessionId!, [keptId], { ...validationDeps, travelTimeProvider: cancelledProvider, signal: cancellation.signal })).rejects.toMatchObject({ name: "AbortError" });
    }
  });
  it("proposes the nearest feasible clock without mutating intent, then revalidates explicit application", async () => {
    const candidate = ktoCandidate("9002", 0);
    const deps = { ...dependencies([candidate], []), now: () => new Date("2026-09-05T03:07:00Z") };
    const request: RouteRecommendationRequest = { ...REQUEST, requestVersion: 2, trip: { ...REQUEST.trip, date: "2026-09-05", startTime: "10:00", desiredStopCount: 1 }, pet: { name: null, species: "DOG", size: "SMALL" } };
    const proposal = await generateRouteRecommendation(request, deps);
    expect(proposal.status).toBe("ready");
    if (proposal.status !== "ready") throw new Error("Expected proposed route");
    expect(proposal.route.schedule?.state).toBe("adjustment_proposal");
    expect(proposal.route.schedule?.requested.startTime).toBe("10:00");
    const time = proposal.route.schedule!.effective.startTime!;
    expect(time).toBe("12:15");
    expect(request.trip.startTime).toBe("10:00");
    const applied = await generateRouteRecommendation({ ...request, trip: { ...request.trip, startTime: time } }, deps);
    expect(applied.status).toBe("ready");
    if (applied.status === "ready") expect(applied.route.schedule).toMatchObject({ state: "scheduled", requested: { startTime: time } });
    const manualApplied = await validateManualRoute(proposal.editSessionId, proposal.route.stops.map(({ placeId }) => placeId), { travelTimeProvider: deps.travelTimeProvider, now: deps.now, editSessionSecret: deps.editSessionSecret }, [], true);
    expect(manualApplied).toMatchObject({ status: "ready", route: { kind: "manual", schedule: { state: "scheduled", requested: { startTime: time } } } });
    if (manualApplied.status === "ready") expect(await validateManualRoute(manualApplied.editSessionId!, manualApplied.route.stops.map(({ placeId }) => placeId), { travelTimeProvider: deps.travelTimeProvider, now: deps.now, editSessionSecret: deps.editSessionSecret }, [], true)).toMatchObject({ status: "invalid_request", reasonCodes: ["manual_route_has_no_schedule_proposal"] });
  });
  it("does not use a past departure today and rejects an explicit past date", async () => {
    const deps = { ...dependencies([ktoCandidate("9003", 0)], []), now: () => new Date("2026-09-05T03:07:00Z") };
    const request: RouteRecommendationRequest = { ...REQUEST, requestVersion: 2, trip: { ...REQUEST.trip, date: "2026-09-05", startTime: "10:00", desiredStopCount: 1 } };
    const result = await generateRouteRecommendation(request, deps);
    expect(result.status).toBe("ready");
    if (result.status === "ready") { expect(result.route.schedule?.state).toBe("adjustment_proposal"); expect(result.route.schedule!.effective.startTime! >= "12:15").toBe(true); }
    expect((await generateRouteRecommendation({ ...request, trip: { ...request.trip, date: "2026-09-04" } }, deps)).status).toBe("invalid_request");
  });
  it.each([[null, null], ["2026-09-12", null], [null, "10:00"], ["2026-09-12", "10:00"]])("keeps schedule intent %s / %s through real orchestration", async (date, startTime) => {
    const deps = dependencies([ktoCandidate("1001", 0), ktoCandidate("1002", 0.01), ktoCandidate("1003", 0.02)], []);
    const result = await generateRouteRecommendation({ ...REQUEST, requestVersion: 2, trip: { ...REQUEST.trip, date, startTime }, pet: { name: "보리", species: "DOG", size: "SMALL" } }, { ...deps, now: () => new Date("2026-09-05T00:00:00Z") });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.schedule?.requested).toEqual({ date, startTime });
    expect(result.route.schedule?.roadValidated).toBe(true);
    expect(result.route.segments).toHaveLength(result.route.stops.length);
    if (date === null) {
      expect(result.route.routeSummary.startAt).toBeNull();
      expect(result.route.stops[0].arrivalAt).toBeNull();
      expect(result.route.stops[0].arrivalOffsetSeconds).toBeGreaterThan(0);
      expect(JSON.stringify(result)).not.toContain("2000-01-01");
    }
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(saveRouteRecommendation(result, result.route, storage)).toBe(true);
    const snapshot = loadSavedRouteRecommendation(storage)!;
    expect(snapshot.route.schedule?.requested).toEqual({ date, startTime });
    expect(snapshot.route.stops[0]!.coordinates).toEqual(result.route.stops[0]!.coordinates);
    expect(snapshot.route.segments).toEqual(result.route.segments);
    expect(JSON.stringify(snapshot)).not.toContain("editSession");
    const before = [...values];
    expect(saveRouteRecommendation(result, { ...result.route, segments: [] }, storage)).toBe(false);
    expect(saveRouteRecommendation(result, result.route, { ...storage, setItem: () => { throw new Error("quota"); } })).toBe(false);
    expect([...values]).toEqual(before);
  });
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

  it("recommends and saves public Kakao candidates without inventing pet approval", async () => {
    const deps = dependencies(
      [ktoCandidate("1001", 0)],
      [kakaoMarker("201", 0), kakaoMarker("202", 0.01), kakaoMarker("203", 0.02)],
    );
    const result = await generateRouteRecommendation(REQUEST, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
    expect(result.candidateSourceCounts).toEqual({ kto: 1, kakao: 3, merged: 0 });
    const kakaoStops = result.route.stops.filter(stop => stop.source === "kakao_catalog");
    expect(kakaoStops.length).toBeGreaterThan(0);
    expect(kakaoStops.every(stop => stop.petAssessment === "unknown" && stop.evidenceStatus === "unverified" && stop.conditionAcknowledged !== true)).toBe(true);
    expect(deps.collectCatalog).not.toHaveBeenCalled();
    expect(deps.candidatePipeline).not.toHaveBeenCalled();
    expect(deps.loadCatalogSnapshot.mock.calls.map(([input]) => input.dataset)).toEqual(["core"]);
    expect(deps.provider.buildMatrix).toHaveBeenCalledTimes(1);
    expect(deps.provider.validateOrderedRoute.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.routeOptions?.flatMap(({ stops }) => stops).every(({ placeId }) =>
      placeId.startsWith("tour:") || placeId.startsWith("kakao:"),
    )).toBe(true);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(saveRouteRecommendation(result, result.route, storage)).toBe(true);
    const saved = loadSavedRouteRecommendation(storage)!;
    expect(saved.route.stops.filter(stop => stop.source === "kakao_catalog")).toEqual(kakaoStops);
    expect(saved.route.venueCompatibility).toBe("unchecked");
  });

  it("counts one published identity once when snapshot, list, and enriched views overlap", async () => {
    const kto = ktoCandidate("1001", 0);
    const deps = {
      ...dependencies([kto], [tourMarker("1001", 0)]),
      includeDiagnostics: true,
    };
    deps.collectCatalog.mockResolvedValue({ places: [kto.summary] } as never);

    const result = await generateRouteRecommendation(REQUEST, deps);

    expect(result.diagnostics?.candidateFunnel).toMatchObject({
      catalog: { publishedRegionalCatalog: 1, core: 1, shopping: 0 },
      stages: { stableIdentityUnique: 1, optimizerInput: 1 },
    });
  });

  it("does not turn the legacy evidence opt-in into pet approval", async () => {
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
    expect(result.diagnostics).toBeUndefined();
    expect(result.candidateSourceCounts).toEqual({ kto: 1, kakao: 3, merged: 0 });
    expect(result.routeOptions?.flatMap(({ stops }) => stops).filter(stop => stop.source === "kakao_catalog").every(stop =>
      stop.petAssessment === "unknown" && stop.conditionAcknowledged !== true,
    )).toBe(true);
  });

  it("exposes three segment-preserving public-catalog route options", async () => {
    const deps = dependencies(
      [
        ktoCandidate("1001", 0),
        ktoCandidate("1002", 0.01),
        ktoCandidate("1003", 0.02),
        ktoCandidate("1004", 0.03),
        ktoCandidate("1005", 0.04),
      ],
      [],
    );
    const result = await generateRouteRecommendation(REQUEST, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
    expect(result.primaryRouteId).toBe(result.routeOptions?.[0]?.id);
    expect(result.routeOptionCount).toBe(3);
    expect(result.routeOptions?.map(({ objective }) => objective)).toEqual([
      "balanced", "shortest", "relaxed",
    ]);
    expect(result.routeOptions?.every((option) =>
      option.segments?.every((segment, index) =>
        segment.travelSeconds === option.stops[index]?.driveSecondsFromPrevious) &&
      option.estimatedFinishAt === option.routeSummary.endAt &&
      option.maximumSingleWaitSeconds !== undefined &&
      option.categoryComposition !== undefined &&
      option.selectedPlaceCount !== undefined &&
      option.automaticPlaceCount !== undefined &&
      option.evidenceWarnings !== undefined &&
      option.warningCodes !== undefined &&
      option.reductionReasonCodes !== undefined &&
      option.differenceExplanationCodes !== undefined,
    )).toBe(true);
  });

  it("records bounded three-option work and response size for the controlled benchmark", async () => {
    const durations: number[] = [];
    let measurement: Record<string, number> = {};
    for (let run = 0; run < 5; run += 1) {
      const deps = {
        ...dependencies(
          [
            ktoCandidate("1001", 0),
            ktoCandidate("1002", 0.01),
            ktoCandidate("1003", 0.02),
            ktoCandidate("1004", 0.03),
            ktoCandidate("1005", 0.04),
          ],
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
        providerRawCandidates: 8,
        regionFilteredCandidates: 8,
        districtFilteredCandidates: 8,
        requestedCategoryCandidates: 8,
        petEligibleCandidates: 8,
        operatingHoursEligibleCandidates: 8,
        finalUsedPlaces: result.route.routeSummary.stopCount,
      });
      expect(result.diagnostics?.candidateFunnel).toMatchObject({
        catalog: {
          publishedRegionalCatalog: 8,
          core: 8,
          shopping: 0,
          listOnly: 8,
        },
        stages: {
          stableIdentityUnique: 8,
          petEvidenceEligible: 8,
          canonicalConditionEligible: 8,
          operatingHoursEligible: 8,
          optimizerInput: 4,
        },
      });
      expect(result.diversity).toMatchObject({
        eligibleUniqueCandidateCount: 4,
        requestedStopCount: 3,
        unseenEligibleCandidateCount: 4,
        maximumFeasibleNovelReplacements: 3,
        diversityCapacity: "sufficient",
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
      expect(measurement).toMatchObject({ catalogCalls: 0, pipelineCalls: 0, snapshotCalls: 1, matrixCalls: 1 });
      expect(measurement.finalValidationCalls).toBeLessThanOrEqual(3);
    }
    durations.sort((left, right) => left - right);
    measurement.medianWallMs = Math.round(durations[2]! * 100) / 100;
    console.log(`V2_SERVICE_METRICS ${JSON.stringify(measurement)}`);
  });

  it.each([20, 71, 538])("scores all %i public candidates before the bounded road shortlist", async count => {
    const kto = Array.from({ length: count }, (_, index) =>
      ktoCandidate(String(3_000 + index), index / 10_000));
    const deps = {
      ...dependencies(kto, []),
      includeDiagnostics: true,
    };

    const result = await generateRouteRecommendation(REQUEST, deps);

    expect(result.status).toBe("ready");
    const matrixInput = deps.provider.buildMatrix.mock.calls[0]?.[0];
    expect(matrixInput?.candidates).toHaveLength(4);
    const coverage = result.diagnostics?.catalogCoverage;
    expect(coverage?.scoredIds.slice().sort()).toEqual(kto.map(candidate => `tour:${candidate.contentId}`).sort());
    expect(coverage?.shortlistIds).toHaveLength(4);
    expect(coverage?.reserveIds).toHaveLength(count - 4);
    expect(new Set([...coverage!.shortlistIds, ...coverage!.reserveIds]).size).toBe(count);
    expect(coverage?.evidenceGateRejections).toBe(0);
    expect(result.diagnostics?.candidateFunnel).toMatchObject({
      catalog: { publishedRegionalCatalog: count },
      stages: { stableIdentityUnique: count, matrixFeasible: 4 },
    });
    expect(result.diagnostics?.candidateFunnel?.rejectedByReason.matrix_evaluation_limit).toBeUndefined();
  });

  it.each([538, 743])("reads all %i paginated public rows through scoring and real optimization including the last-page Kakao choice", async count => {
    const rows: PublicMapPlaceDTO[] = Array.from({ length: count }, (_, index) => {
      const last = index === count - 1;
      const provider = last || index % 2 ? "kakao" : "tour";
      return {
        id: `${provider}:${index + 1}`, provider, providerPlaceId: String(index + 1),
        name: last ? "마지막 페이지 가까운 미확인 후보" : `공개 장소 ${index + 1}`,
        kind: provider === "tour" ? "tourism_place" : "pet_travel_candidate",
        category: "attraction", district: { code: "350", name: "해운대구" },
        address: `부산광역시 공개로 ${index + 1}`,
        coordinates: last ? { latitude: REQUEST.departure.latitude + 0.0001, longitude: REQUEST.departure.longitude + 0.0001 } : { latitude: 35.3 + index / 100_000, longitude: 129.2 + index / 100_000 },
        phone: null, imageUrl: null, contentTypeId: provider === "tour" ? "12" : null,
        placeUrl: null, source: provider === "tour" ? "kto_official" : "kakao_search_candidate",
        reviewStatus: "unreviewed", publicLabel: "동반 여부 미확인", petAccessVerdict: "unknown",
      };
    });
    const query = vi.fn(async (input: PublicMapCatalogQuery) => {
      expect(input.categories).toBeUndefined();
      expect(input.kinds).toBeUndefined();
      expect(input.districtCodes).toBeUndefined();
      const source = rows.filter(row => row.provider === input.providers![0]);
      const start = input.afterId ?? 0;
      const items = source.slice(start, start + input.pageSize);
      return { region: { id: "busan" as const, displayName: "부산" }, items, page: input.page, pageSize: input.pageSize, totalCount: source.length, hasNext: start + items.length < source.length, nextCursor: start + items.length };
    });
    const deps = dependencies([], []);
    const result = await generateRouteRecommendation({ ...REQUEST, requestVersion: 2, trip: { ...REQUEST.trip, date: null, startTime: null } }, {
      ...deps, loadCatalogSnapshot: undefined,
      loadPublicCatalog: region => loadRecommendationPublicCatalog(region, { query }),
      includeDiagnostics: true,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected complete public-catalog recommendation");
    expect(query.mock.calls.length).toBeGreaterThan(2);
    expect(deps.collectCatalog).not.toHaveBeenCalled();
    expect(deps.candidatePipeline).not.toHaveBeenCalled();
    expect(deps.loadCatalogSnapshot).not.toHaveBeenCalled();
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
    const coverage = result.diagnostics!.catalogCoverage!;
    expect(new Set(coverage.scoredIds)).toEqual(new Set(rows.map(row => row.id)));
    expect(new Set([...coverage.shortlistIds, ...coverage.reserveIds])).toEqual(new Set(coverage.scoredIds));
    expect(coverage.reserveIds.length).toBe(count - coverage.shortlistIds.length);
    expect(coverage.evidenceGateRejections).toBe(0);
    expect(coverage.shortlistIds).toContain(`kakao:${count}`);
    expect(result.route.stops).toEqual(expect.arrayContaining([expect.objectContaining({ placeId: `kakao:${count}`, petAssessment: "unknown", evidenceStatus: "unverified" })]));
    expect(result.route.schedule).toMatchObject({ roadValidated: true, state: "undated_template" });
    expect(result.route.segments).toHaveLength(result.route.stops.length);
    expect(deps.provider.buildMatrix).toHaveBeenCalledTimes(1);
    expect(deps.provider.validateOrderedRoute.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("completes a reduced road-valid route with reserve candidates while retaining its witness and shared provider budget", async () => {
    const deps = dependencies(Array.from({ length: 9 }, (_, index) => ktoCandidate(String(5_000 + index), index / 10_000)), []);
    const completeMatrix = deps.provider.buildMatrix.getMockImplementation()!;
    const exactRoute = deps.provider.validateOrderedRoute.getMockImplementation()!;
    const cachedEdges = new Map<string, TravelMatrixResult["edges"][string][string]>();
    const unavailableIds = new Set<string>();
    let initialValidIds: string[] = [];
    let matrixProviderCalls = 0;
    const budgetBeforeAttempts: number[] = [];
    deps.provider.buildMatrix.mockImplementation(async input => {
      const firstAttempt = budgetBeforeAttempts.length === 0;
      const budget = input.providerCallBudget!;
      budgetBeforeAttempts.push(budget.remaining);
      if (firstAttempt) {
        initialValidIds = input.candidates.slice(0, 2).map(node => node.id);
        input.candidates.slice(2).forEach(node => unavailableIds.add(node.id));
      }
      const matrix = await completeMatrix(input);
      let providerCalls = 0;
      let cacheHits = 0;
      for (const row of Object.values(matrix.edges)) for (const edge of Object.values(row)) {
        const key = `${edge.fromId}>${edge.toId}`;
        const cached = cachedEdges.get(key);
        if (cached) {
          Object.assign(edge, cached, { source: "request_cache" });
          cacheHits += 1;
          continue;
        }
        expect(budget.remaining).toBeGreaterThan(0);
        budget.remaining -= 1;
        providerCalls += 1;
        matrixProviderCalls += 1;
        if (unavailableIds.has(edge.fromId) || unavailableIds.has(edge.toId)) {
          Object.assign(edge, { status: "unresolved", distanceMeters: null, durationSeconds: null, reasonCodes: ["provider_no_route"] });
        }
        cachedEdges.set(key, { ...edge });
      }
      const edges = Object.values(matrix.edges).flatMap(row => Object.values(row));
      const resolvedEdges = edges.filter(edge => edge.status === "resolved").length;
      Object.assign(matrix, { complete: resolvedEdges === edges.length });
      Object.assign(matrix.diagnostics, { resolvedEdges, unresolvedEdges: edges.length - resolvedEdges, providerCalls, requestCacheHits: cacheHits, multiDestinationRequests: 0, directionsFallbackRequests: providerCalls });
      return matrix;
    });
    deps.provider.validateOrderedRoute.mockImplementation(async input => {
      expect(input.providerCallBudget!.remaining).toBeGreaterThan(0);
      input.providerCallBudget!.remaining -= 1;
      expect(input.orderedStops.every(node => !unavailableIds.has(node.id))).toBe(true);
      return exactRoute(input);
    });

    const result = await generateRouteRecommendation({ ...REQUEST, requestVersion: 2, trip: { ...REQUEST.trip, desiredStopCount: 4, durationMinutes: 600 } }, { ...deps, includeDiagnostics: true });

    expect(result).toMatchObject({ status: "ready", route: { reductionStatus: "complete", routeSummary: { stopCount: 4 } } });
    if (result.status !== "ready") throw new Error("Expected reserve candidates to complete the real route");
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
    const [initial, replenished] = deps.provider.buildMatrix.mock.calls.map(([input]) => input);
    expect(deps.provider.buildMatrix).toHaveBeenCalledTimes(2);
    expect(initial!.candidates).toHaveLength(5);
    expect(replenished!.candidates).toHaveLength(4);
    expect(replenished!.candidates.map(node => node.id)).toEqual(expect.arrayContaining(initialValidIds));
    expect(result.route.stops.map(stop => stop.placeId)).toEqual(expect.arrayContaining(initialValidIds));
    expect(result.route.stops.filter(stop => !initial!.candidates.some(node => node.id === stop.placeId))).toHaveLength(2);
    expect(initial!.providerCallBudget).toBe(replenished!.providerCallBudget);
    expect(budgetBeforeAttempts).toEqual([48, 18]);
    expect(matrixProviderCalls).toBe(44);
    expect(matrixProviderCalls).toBeLessThanOrEqual(48);
    expect(replenished!.providerCallBudget!.remaining).toBe(4);
    expect(result.diagnostics?.catalogCoverage).toMatchObject({ matrixAttempts: 2, matrixProviderCalls: 44 });
    expect(result.route.segments).toHaveLength(4);
    expect(result.route.routeSummary.totalDrivingSeconds).toBe(2_400);
    expect(deps.provider.validateOrderedRoute.mock.calls.length).toBeGreaterThan(0);
    expect(deps.provider.validateOrderedRoute.mock.calls.length).toBeLessThanOrEqual(3);
    expect(new Set(deps.provider.validateOrderedRoute.mock.calls.map(([input]) => input.providerCallBudget)).size).toBe(1);
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
        candidateFunnel: {
          stages: { optimizerInput: 0 },
        },
      },
      diversity: {
        eligibleUniqueCandidateCount: 0,
        maximumFeasibleNovelReplacements: 0,
        diversityCapacity: "exhausted",
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

  it("uses public Kakao rows independently of unavailable optional KTO detail enrichment", async () => {
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
      route: { stops: [{ placeId: "kakao:201", petAssessment: "unknown", evidenceStatus: "unverified" }] },
    });
    expect(deps.candidatePipeline).not.toHaveBeenCalled();
    expect(deps.provider.buildMatrix).toHaveBeenCalledTimes(1);
  });

  it("distinguishes unavailable public inventory from a healthy empty inventory", async () => {
    const deps = dependencies([], []);
    deps.loadCatalogSnapshot.mockRejectedValue(new Error("Published catalog unavailable"));
    expect(await generateRouteRecommendation(REQUEST, deps)).toMatchObject({
      status: "tourism_provider_unavailable",
      reasonCodes: ["public_catalog_unavailable"],
    });
    expect(deps.provider.buildMatrix).not.toHaveBeenCalled();
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

  it("replaces at least two automatic places on a scoped three-stop reroll", async () => {
    const candidates = Array.from({ length: 7 }, (_, index) =>
      ktoCandidate(String(4_001 + index), index * 0.006));
    const first = await generateRouteRecommendation(REQUEST, dependencies(candidates, []));
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;
    const firstIds = first.route.stops.map(({ placeId }) => placeId);
    const reroll = await generateRouteRecommendation({
      ...REQUEST,
      personalization: {
        ...REQUEST.personalization!,
        historyContextKey: first.historyContextKey,
        recentRouteSignatures: [first.route.routeSignature!],
        recentlySelectedCandidateIds: firstIds,
        rerollVariant: 1,
      },
    }, dependencies(candidates, []));

    expect(reroll.status).toBe("ready");
    if (reroll.status !== "ready") return;
    expect(reroll).toMatchObject({
      meaningfullyDifferent: true,
      diversityCapacity: "sufficient",
    });
    expect(reroll.newPlaceCount).toBeGreaterThanOrEqual(2);
    expect(reroll.route.stops.filter(({ placeId }) => !firstIds.includes(placeId)))
      .toHaveLength(reroll.newPlaceCount!);
  });

  it("ignores history whose context key does not match the requested trip", async () => {
    const candidates = Array.from({ length: 5 }, (_, index) =>
      ktoCandidate(String(5_001 + index), index * 0.006));
    const result = await generateRouteRecommendation({
      ...REQUEST,
      personalization: {
        ...REQUEST.personalization!,
        historyContextKey: "0".repeat(64),
        recentRouteSignatures: ["tour:5001>tour:5002>tour:5003"],
        recentlySelectedCandidateIds: ["tour:5001", "tour:5002", "tour:5003"],
        rerollVariant: 1,
      },
    }, dependencies(candidates, []));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.sharedPlaceRatio).toBe(0);
    expect(result.newPlaceCount).toBe(result.route.routeSummary.stopCount);
    expect(result.historyContextKey).not.toBe("0".repeat(64));
  });

  it("reports exhausted capacity without claiming a cosmetic reroll is new", async () => {
    const candidates = [
      ktoCandidate("6001", 0),
      ktoCandidate("6002", 0.01),
      ktoCandidate("6003", 0.02),
    ];
    const first = await generateRouteRecommendation(REQUEST, dependencies(candidates, []));
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;
    const firstIds = first.route.stops.map(({ placeId }) => placeId);
    const reroll = await generateRouteRecommendation({
      ...REQUEST,
      personalization: {
        ...REQUEST.personalization!,
        historyContextKey: first.historyContextKey,
        recentRouteSignatures: [first.route.routeSignature!],
        recentlySelectedCandidateIds: firstIds,
        rerollVariant: 1,
      },
    }, dependencies(candidates, []));

    expect(reroll).toMatchObject({
      status: "ready",
      meaningfullyDifferent: false,
      newPlaceCount: 0,
      sharedPlaceRatio: 1,
      diversityCapacity: "exhausted",
      diversity: {
        maximumFeasibleNovelReplacements: 0,
        diversityCapacity: "exhausted",
      },
    });
  });

  it("never ignores explicit Dream Surf Lounge and Wonsihak exclusions", async () => {
    const candidates = [
      ktoCandidate("7001", 0, "드림서프라운지"),
      ktoCandidate("7002", 0.006, "원시학"),
      ktoCandidate("7003", 0.012, "안전 대안 1"),
      ktoCandidate("7004", 0.018, "안전 대안 2"),
      ktoCandidate("7005", 0.024, "안전 대안 3"),
      ktoCandidate("7006", 0.03, "안전 대안 4"),
    ];
    const withoutDream = await generateRouteRecommendation({
      ...REQUEST,
      personalization: {
        ...REQUEST.personalization!,
        explicitlyExcludedPlaceIds: ["tour:7001"],
      },
    }, dependencies(candidates, []));
    const withoutBoth = await generateRouteRecommendation({
      ...REQUEST,
      personalization: {
        ...REQUEST.personalization!,
        explicitlyExcludedPlaceIds: ["tour:7001", "tour:7002"],
      },
    }, dependencies(candidates, []));

    expect(withoutDream.status).toBe("ready");
    expect(withoutBoth.status).toBe("ready");
    if (withoutDream.status !== "ready" || withoutBoth.status !== "ready") return;
    expect(withoutDream.routeOptions?.flatMap(({ stops }) => stops)
      .every(({ placeId }) => placeId !== "tour:7001")).toBe(true);
    expect(withoutBoth.routeOptions?.flatMap(({ stops }) => stops)
      .every(({ placeId }) => !["tour:7001", "tour:7002"].includes(placeId))).toBe(true);
    expect(withoutBoth.route.routeSummary.stopCount).toBe(3);
  });
});
