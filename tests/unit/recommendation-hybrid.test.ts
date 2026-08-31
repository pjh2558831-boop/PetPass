import { describe, expect, it, vi } from "vitest";
import { routeRecommendationRequestSchema } from "@/lib/recommendation/recommendation-request";
import { routeRecommendationResponseSchema } from "@/lib/recommendation/recommendation-response";
import { generateRouteRecommendation } from "@/lib/recommendation/recommendation-service";
import type {
  CandidatePipelineDiagnostics,
  CandidatePipelineResult,
  DetailedEligibleCandidate,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import type { TourPlaceService } from "@/lib/tour-api/service";
import { collectTourCatalog } from "@/lib/tour-api/catalog-service";
import type { TravelMatrixResult, TravelTimeProvider } from "@/lib/travel/types";
import type { MapPlacesSnapshot, MapPlacesSnapshotMarker } from "@/types/map-places-snapshot";
import type { TourPlaceSummary } from "@/types/place";
import type { RouteRecommendationRequest } from "@/types/recommendation";

const REQUEST: RouteRecommendationRequest = {
  departure: {
    label: "부산역",
    latitude: 35.115,
    longitude: 129.04,
    source: "kakao_place_search",
  },
  trip: {
    regionId: "busan",
    districtId: null,
    date: "2026-08-15",
    startTime: "10:00",
    tripType: "day_trip",
    tripPace: "balanced",
    selectedCategories: ["attraction"],
    roundTrip: false,
  },
  pet: {
    name: "보리",
    species: "DOG",
    size: "SMALL",
    availableEquipment: { carrier: true, leash: true, muzzle: false },
    acceptsOutdoorOnlyPlaces: false,
  },
};

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

function ktoCandidate(
  id: string,
  options: {
    category?: UsefulTourCategory;
    latitude?: number;
    longitude?: number;
    utility?: number;
    verdict?: "allowed" | "conditional" | "unknown";
    tier?: "verified" | "conditional" | "unverified";
    conditions?: Array<{
      type: "carrier_required" | "leash_required" | "muzzle_required" | "outdoor_only";
      label: string;
      manualConfirmationRecommended: boolean;
    }>;
  } = {},
): DetailedEligibleCandidate {
  const category = options.category ?? "attraction";
  const coordinates = {
    latitude: options.latitude ?? 35.15 + Number(id.slice(-1)) * 0.001,
    longitude: options.longitude ?? 129.08 + Number(id.slice(-1)) * 0.001,
  };
  const verdict = options.verdict ?? "allowed";
  const tier = options.tier ?? (verdict === "allowed" ? "verified" : verdict === "conditional" ? "conditional" : "unverified");
  return {
    contentId: id,
    contentTypeId: category === "food" ? "39" : category === "shopping" ? "38" : "12",
    title: `공식 장소 ${id}`,
    coordinates,
    region: { regionCode: "26", districtCode: null },
    providerVisibility: "exposed",
    source: "tourism_service2",
    category,
    summary: {
      contentId: id,
      contentTypeId: category === "food" ? "39" : category === "shopping" ? "38" : "12",
      title: `공식 장소 ${id}`,
      address: "부산광역시 테스트로 1",
      phone: null,
      thumbnailUrl: null,
      imageUrl: null,
      coordinates,
      source: {
        provider: "Korea Tourism Organization",
        operation: "areaBasedList2",
        retrievedAt: "2026-08-15T00:00:00.000Z",
      },
    },
    travelSuitability: { travelRole: category === "food" ? "food" : "general_attraction" },
    scheduleDetail: { operatingInformation: "09:00-22:00" },
    scheduleCompatibility: { status: "compatible", warningCodes: [], reasonCodes: [] },
    assessment: {
      verdict,
      evaluationState: verdict === "unknown" ? "insufficient_evidence" : "evaluated",
      permittedScopes: verdict === "allowed" ? ["whole_place"] : [],
      restrictedScopes: [],
      conditions: options.conditions ?? [],
      evidence: [],
    },
    licensing: null,
    eligibility: {
      status: tier === "verified" ? "eligible" : "verification_required",
      eligible: true,
      tier,
      reasonCodes: tier === "unverified" ? ["pet_access_unknown"] : [],
      warnings: [],
    },
    trust: {
      ruleVersion: "petpass-trust-v1",
      score: tier === "verified" ? 90 : 45,
      level: tier === "verified" ? "high" : "medium",
      evidenceCount: 1,
      computedAt: "2026-08-15T00:00:00.000Z",
      components: [],
      flags: tier === "verified" ? [] : ["verification_required"],
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
      total: options.utility ?? 800,
      preferenceFit: 1,
      petCompatibility: verdict === "allowed" ? 1 : 0.5,
      informationTrust: tier === "verified" ? 0.9 : 0.45,
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

function marker(
  id: string,
  options: {
    regionId?: "busan" | "jeju";
    verdict?: "allowed" | "conditional" | "not_allowed" | "unknown";
    category?: MapPlacesSnapshotMarker["category"];
    coordinates?: MapPlacesSnapshotMarker["coordinates"];
  } = {},
): MapPlacesSnapshotMarker {
  const providerPlaceId = id.replace(/^kakao:/u, "");
  return {
    id,
    regionId: options.regionId ?? "busan",
    providerPlaceId,
    name: `카카오 후보 ${providerPlaceId}`,
    layer: "kakao",
    category: options.category ?? "attraction",
    districtCode: null,
    districtName: null,
    address: "부산광역시 후보로 1",
    coordinates: options.coordinates === undefined
      ? { latitude: 35.2, longitude: 129.12 }
      : options.coordinates,
    lastSeenAt: "2026-08-15T00:00:00.000Z",
    completeness: 0.7,
    petAccessVerdict: options.verdict ?? "unknown",
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
    providerCounts: {
      tour: items.filter(({ layer }) => layer === "tourism").length,
      kakao: items.filter(({ layer }) => layer === "kakao").length,
    },
    categoryCounts: {},
    freshness: { status: "fresh" },
    items,
  };
}

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

function travelProvider() {
  const buildMatrix = vi.fn(async ({ departure, candidates }: Parameters<TravelTimeProvider["buildMatrix"]>[0]) => {
    const nodes = [departure, ...candidates];
    const edges: TravelMatrixResult["edges"] = {};
    for (const from of nodes) {
      edges[from.id] = {};
      for (const to of nodes) {
        if (from.id === to.id) continue;
        const preferred = from.id === "tour:1002" && to.id === "tour:1001";
        edges[from.id]![to.id] = {
          fromId: from.id,
          toId: to.id,
          distanceMeters: preferred ? 500 : 1_000,
          durationSeconds: preferred ? 300 : 600,
          lowerBoundMeters: 400,
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
        durationMs: 1,
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
    diagnostics: { providerOperation: "waypoints" as const, cacheHit: false, providerCalls: 1, durationMs: 1 },
  }));
  return { buildMatrix, validateOrderedRoute } satisfies TravelTimeProvider;
}

function dependencies(kto: DetailedEligibleCandidate[], markers: MapPlacesSnapshotMarker[]) {
  const provider = travelProvider();
  const getPlaceDetail = vi.fn();
  return {
    tourService: { getPlaceDetail } as unknown as TourPlaceService,
    collectCatalog: vi.fn<typeof collectTourCatalog>(async () => ({ places: [] } as never)),
    candidatePipeline: vi.fn(async () => pipeline(kto)),
    loadCatalogSnapshot: vi.fn(async () => snapshot(markers)),
    travelTimeProvider: provider,
    now: () => new Date("2026-08-15T00:00:00.000Z"),
    editSessionSecret: "unit-test-route-edit-session-secret",
    provider,
    getPlaceDetail,
  };
}

describe("selected-place hybrid recommendation", () => {
  it("preserves automatic mode when selection is empty", async () => {
    const result = await generateRouteRecommendation(
      { ...REQUEST, selectedPlaceIds: [] },
      dependencies([ktoCandidate("1001")], []),
    );
    expect(result).toMatchObject({ status: "ready", route: { stops: [{ placeId: "tour:1001" }] } });
    expect(result).not.toHaveProperty("selectionMode");
    if (result.status === "ready") expect(result.route.stops[0]).not.toHaveProperty("provenance");
  });

  it("keeps eligible selections mandatory even when their ranking is low", async () => {
    const deps = dependencies([
      ktoCandidate("1001", { utility: 1 }),
      ktoCandidate("1002", { utility: 1_000 }),
      ktoCandidate("1003", { utility: 900 }),
      ktoCandidate("1004", { utility: 800 }),
      ktoCandidate("1005", { utility: 700 }),
    ], []);
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001"],
      autoFill: true,
    }, deps);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.stops).toContainEqual(expect.objectContaining({
      placeId: "tour:1001",
      provenance: "user_selected",
      locked: true,
    }));
  });

  it("rejects duplicate canonical IDs", () => {
    const parsed = routeRecommendationRequestSchema.safeParse({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001", "tour:1001"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a selected ID that is not in the requested region", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["kakao:999"],
    }, dependencies([ktoCandidate("1001")], [marker("kakao:201")]));
    expect(result).toMatchObject({
      status: "invalid_request",
      selectionIssues: [{ placeId: "kakao:999", blocking: true }],
    });
  });

  it("returns a clear issue and replacements for a not-allowed selection", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["kakao:201"],
    }, dependencies([ktoCandidate("1001")], [marker("kakao:201", { verdict: "not_allowed" })]));
    expect(result).toMatchObject({
      status: "invalid_request",
      selectionIssues: [{
        placeId: "kakao:201",
        code: "selected_place_not_allowed",
        replacementCandidateIds: ["tour:1001"],
      }],
    });
  });

  it("requires explicit acknowledgement before routing an unknown selected anchor", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["kakao:201"],
      autoFill: false,
    }, dependencies([], [marker("kakao:201")]));
    expect(result).toMatchObject({
      status: "confirmation_required",
      resultState: "confirmation_required",
      requestedStopCount: 1,
      feasibleStopCount: 1,
      selectionIssues: [{
        placeId: "kakao:201",
        code: "selected_place_confirmation_required",
        blocking: true,
      }],
      recoveryActions: ["acknowledge_selected_place_verification"],
    });
  });

  it("retains an acknowledged unknown Kakao anchor with an explicit warning", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["kakao:201"],
      acknowledgedVerificationRequiredPlaceIds: ["kakao:201"],
      autoFill: false,
    }, dependencies([], [marker("kakao:201")]));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.stops).toEqual([expect.objectContaining({
      placeId: "kakao:201",
      selectionOrigin: "user_selected",
      locked: true,
      verificationWarning: "selected_kakao_requires_confirmation",
    })]);
  });

  it("rejects an explicitly cross-region selected reference instead of discarding it", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001"],
      selectedPlaceReferences: [{ placeId: "tour:1001", regionId: "jeju" }],
      autoFill: false,
    }, dependencies([ktoCandidate("1001")], []));

    expect(result).toMatchObject({
      status: "invalid_request",
      selectionIssues: [{
        placeId: "tour:1001",
        code: "selected_place_cross_region",
        blocking: true,
      }],
    });
  });

  it("supplements only the remaining pace capacity", async () => {
    const kto = ["1001", "1002", "1003", "1004", "1005"].map((id) => ktoCandidate(id));
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001", "tour:1002"],
      autoFill: true,
    }, dependencies(kto, []));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.stops).toHaveLength(4);
    expect(result.route.stops.filter(({ provenance }) => provenance === "user_selected")).toHaveLength(2);
    expect(result.route.stops.filter(({ provenance }) => provenance === "auto_fill")).toHaveLength(2);
  });

  it("excludes unverified and Shopping candidates from automatic supplementation", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001"],
      autoFill: true,
    }, dependencies([
      ktoCandidate("1001"),
      ktoCandidate("1002"),
      ktoCandidate("1003", { verdict: "unknown", tier: "unverified" }),
      ktoCandidate("1004", { category: "shopping" }),
    ], []));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.stops.map(({ placeId }) => placeId)).toContain("tour:1002");
    expect(result.route.stops.map(({ placeId }) => placeId)).not.toContain("tour:1003");
    expect(result.route.stops.map(({ placeId }) => placeId)).not.toContain("tour:1004");
  });

  it("optimizes route order while preserving every anchor", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001", "tour:1002"],
      autoFill: false,
    }, dependencies([ktoCandidate("1001"), ktoCandidate("1002")], []));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(new Set(result.route.stops.map(({ placeId }) => placeId))).toEqual(
      new Set(["tour:1001", "tour:1002"]),
    );
    expect(result.route.stops.every(({ locked }) => locked)).toBe(true);
    expect(result.routeOptions).toHaveLength(1);
  });

  it("returns a structured warning for widely separated selected anchors", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001", "tour:1002"],
      autoFill: false,
    }, dependencies([
      ktoCandidate("1001", { latitude: 35.0, longitude: 128.76 }),
      ktoCandidate("1002", { latitude: 35.49, longitude: 129.39 }),
    ], []));
    expect(result).toMatchObject({
      status: "ready",
      warnings: expect.arrayContaining(["selected_anchor_large_detour"]),
      selectionIssues: [expect.objectContaining({
        code: "selected_anchor_large_detour",
        blocking: false,
      })],
    });
  });

  it("keeps a selected Shopping anchor without any Shopping detail call", async () => {
    const shopping = ktoCandidate("9001", { category: "shopping", verdict: "unknown", tier: "unverified" });
    const shoppingSummary = {
      ...shopping.summary,
      contentTypeId: "38",
      providerContentTypeId: "38",
      category: "shopping",
      title: shopping.title,
      detailAddress: null,
      latitude: shopping.coordinates.latitude,
      longitude: shopping.coordinates.longitude,
      copyrightType: null,
      createdTime: null,
      modifiedTime: null,
      legalRegionCode: "26",
      legalDistrictCode: null,
      classificationCodes: {
        primary: null,
        secondary: null,
        tertiary: null,
        largeCategory: null,
        middleCategory: null,
        smallCategory: null,
      },
    } as TourPlaceSummary;
    const deps = dependencies([], []);
    deps.collectCatalog.mockImplementation(async (_service, query) => ({
      places: query.contentTypeId === "38" ? [shoppingSummary] : [],
    } as never));
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:9001"],
      acknowledgedVerificationRequiredPlaceIds: ["tour:9001"],
      autoFill: false,
    }, deps);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.route.stops[0]).toMatchObject({
        placeId: "tour:9001",
        provenance: "user_selected",
        verificationWarning: "selected_shopping_requires_confirmation",
      });
    }
    expect(deps.getPlaceDetail).not.toHaveBeenCalled();
    expect(deps.candidatePipeline).toHaveBeenCalledWith(expect.objectContaining({
      catalog: [],
    }));
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
  });
});
