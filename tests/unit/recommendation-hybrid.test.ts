import { describe, expect, it, vi } from "vitest";
import { routeRecommendationRequestSchema } from "@/lib/recommendation/recommendation-request";
import { routeRecommendationResponseSchema } from "@/lib/recommendation/recommendation-response";
import {
  generateRouteRecommendation,
  validateManualRoute,
} from "@/lib/recommendation/recommendation-service";
import { evaluateCanonicalPetConditions } from "@/lib/pet-access/canonical-condition-eligibility";
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

function restrictedCandidate(hasMuzzle: boolean): DetailedEligibleCandidate {
  const candidate = ktoCandidate("126122", {
    verdict: "conditional",
    tier: "conditional",
    latitude: 35.0759,
    longitude: 129.0178,
  });
  const conditions = [
    {
      type: "leash_required" as const,
      scope: "whole_place" as const,
      label: "목줄 착용 필수",
      sourceText: "목줄 착용 필수",
      evidenceIds: ["detailPetTour2:acmpyNeedMtr:1"],
      manualConfirmationRecommended: false,
    },
    {
      type: "muzzle_required" as const,
      scope: "whole_place" as const,
      label: "맹견 입마개 착용",
      sourceText: "맹견은 입마개 착용이 필요합니다.",
      evidenceIds: ["detailPetTour2:relaAcdntRiskMtr:1"],
      manualConfirmationRecommended: false,
    },
    {
      type: "dangerous_dog_limit" as const,
      scope: "whole_place" as const,
      label: "맹견 동반 제한 확인",
      sourceText: "맹견 동반은 제한되므로 대상 여부를 확인해 주세요.",
      evidenceIds: ["detailPetTour2:relaAcdntRiskMtr:2"],
      manualConfirmationRecommended: true,
    },
    {
      type: "sanitation_requirement" as const,
      scope: "whole_place" as const,
      label: "배변 처리 용품 지참",
      sourceText: "배변봉투를 지참하고 배설물을 즉시 수거해 주세요.",
      evidenceIds: ["detailPetTour2:etcAcmpyInfo:1"],
      manualConfirmationRecommended: true,
    },
  ];
  const assessment = {
    ...candidate.assessment,
    rulesetVersion: "1" as const,
    verdict: "conditional" as const,
    evaluationState: "complete" as const,
    confidence: "high" as const,
    reasonCodes: ["explicit_allowance" as const, "material_condition" as const],
    summary: "반려견 동반 가능, 맹견 제한과 배변 처리 조건 확인 필요",
    permittedScopes: ["whole_place" as const],
    conditions,
    conflicts: [],
    verificationItems: [],
    sources: [{
      operation: "detailPetTour2" as const,
      status: "available" as const,
      retrievedAt: "2026-08-15T00:00:00.000Z",
      providerModifiedTime: null,
    }],
    warnings: [],
  };
  candidate.title = "조건 정책 테스트 장소";
  candidate.summary.title = "조건 정책 테스트 장소";
  candidate.assessment = assessment;
  candidate.eligibility = {
    ...candidate.eligibility,
    status: "verification_required",
    tier: "conditional",
    reasonCodes: ["mandatory_condition_verification_required"],
    conditionEligibility: evaluateCanonicalPetConditions({
      assessment,
      petProfile: {
        species: "DOG",
        size: "SMALL",
        hasCarrier: true,
        hasLeash: true,
        hasMuzzle,
        acceptsOutdoorOnly: true,
      },
      sizeCompatibility: "compatible",
    }),
  };
  return candidate;
}

function marker(
  id: string,
  options: {
    regionId?: "busan" | "jeju";
    verdict?: "allowed" | "conditional" | "not_allowed" | "unknown";
    petConditions?: string | null;
    verificationRequired?: boolean;
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
    petConditions: options.petConditions ?? null,
    verificationRequired: options.verificationRequired ?? false,
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

function publishedKto(candidate: DetailedEligibleCandidate): MapPlacesSnapshotMarker {
  const publicCategory: MapPlacesSnapshotMarker["category"] =
    ["attraction", "leisure", "accommodation", "food", "shopping"].includes(candidate.category)
      ? candidate.category as MapPlacesSnapshotMarker["category"]
      : "other";
  return {
    id: `tour:${candidate.contentId}`,
    regionId: "busan",
    providerPlaceId: candidate.contentId,
    name: candidate.title,
    layer: "tourism",
    category: publicCategory,
    districtCode: candidate.region.districtCode,
    districtName: null,
    address: candidate.summary.address ?? "",
    coordinates: candidate.coordinates,
    lastSeenAt: candidate.summary.source.retrievedAt,
    completeness: 1,
    petAccessVerdict: candidate.assessment.verdict,
    petConditions: candidate.assessment.conditions.map(({ sourceText }) => sourceText).filter(Boolean).join(" · ") || null,
    verificationRequired: candidate.assessment.verdict !== "allowed",
    publicLabel: "한국관광공사 공개 관광정보",
    sourceLabel: "한국관광공사",
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
    loadCatalogSnapshot: vi.fn(async () => snapshot([...kto.map(publishedKto), ...markers])),
    travelTimeProvider: provider,
    now: () => new Date("2026-08-15T00:00:00.000Z"),
    editSessionSecret: "unit-test-route-edit-session-secret",
    provider,
    getPlaceDetail,
  };
}

describe("selected-place hybrid recommendation", () => {
  it("returns restricted public places as factual geographic drafts without a confirmation gate", async () => {
    const request = {
      ...REQUEST,
      pet: {
        ...REQUEST.pet,
        availableEquipment: {
          ...REQUEST.pet.availableEquipment,
          muzzle: true,
        },
        acceptsOutdoorOnlyPlaces: true,
      },
      trip: { ...REQUEST.trip, desiredStopCount: 1 },
    };
    const selected = await generateRouteRecommendation({
      ...request,
      selectedPlaceIds: ["tour:126122"],
      autoFill: false,
    }, dependencies([restrictedCandidate(true)], []));
    const automatic = await generateRouteRecommendation({
      ...request,
      includeVerificationRequired: true,
    }, dependencies([restrictedCandidate(true)], []));

    expect(selected).toMatchObject({ status: "ready", route: { planningPolicy: "full_public_catalog_v1", venueCompatibility: "unchecked", confirmationStatus: "ready", stops: [expect.objectContaining({ petAssessment: "conditional" })] } });
    expect(automatic).toMatchObject({ status: "ready", route: { planningPolicy: "full_public_catalog_v1", confirmationStatus: "ready", stops: [expect.objectContaining({ petAssessment: "conditional" })] } });
    expect(routeRecommendationResponseSchema.safeParse(automatic).success).toBe(true);
  });

  it("keeps a restricted public place in automatic broad planning", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      pet: {
        ...REQUEST.pet,
        availableEquipment: { ...REQUEST.pet.availableEquipment, muzzle: true },
        acceptsOutdoorOnlyPlaces: true,
      },
      trip: { ...REQUEST.trip, desiredStopCount: 1 },
    }, dependencies([restrictedCandidate(true)], []));

    expect(result).toMatchObject({ status: "ready", route: { venueCompatibility: "unchecked", stops: [expect.objectContaining({ placeId: "tour:126122", petAssessment: "conditional" })] } });
  });

  it("keeps profile-conflicting selected facts without claiming compatibility", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:126122"],
      pet: { ...REQUEST.pet, availableEquipment: { ...REQUEST.pet.availableEquipment, leash: false } },
      autoFill: false,
    }, dependencies([restrictedCandidate(false)], []));

    expect(result).toMatchObject({ status: "ready", selectionIssues: [], route: { venueCompatibility: "unchecked", stops: [expect.objectContaining({ placeId: "tour:126122", petAssessment: "conditional" })] } });
  });

  it("does not turn legacy acknowledgement IDs into condition approval", async () => {
    const base = {
      ...REQUEST,
      pet: {
        ...REQUEST.pet,
        availableEquipment: { ...REQUEST.pet.availableEquipment, muzzle: true },
        acceptsOutdoorOnlyPlaces: true,
      },
      trip: { ...REQUEST.trip, desiredStopCount: 1 },
      includeVerificationRequired: true,
    };
    const selectedDependencies = dependencies([restrictedCandidate(true)], []);
    const selected = await generateRouteRecommendation({
      ...base,
      selectedPlaceIds: ["tour:126122"],
      acknowledgedVerificationRequiredPlaceIds: ["tour:126122"],
      autoFill: false,
    }, selectedDependencies);
    const automatic = await generateRouteRecommendation({
      ...base,
      acknowledgedVerificationRequiredPlaceIds: ["tour:126122"],
    }, dependencies([restrictedCandidate(true)], []));

    expect(selected).toMatchObject({
      status: "ready",
      route: {
        confirmationStatus: "ready",
        stops: [expect.objectContaining({
          placeId: "tour:126122",
          selectionOrigin: "user_selected",
        })],
      },
    });
    expect(automatic).toMatchObject({
      status: "ready",
      route: {
        confirmationStatus: "ready",
        stops: [expect.objectContaining({
          placeId: "tour:126122",
          selectionOrigin: "automatic_recommendation",
        })],
      },
    });
    if (selected.status === "ready") {
      const revalidated = await validateManualRoute(
        selected.editSessionId,
        ["tour:126122"],
        {
          travelTimeProvider: selectedDependencies.provider,
          now: () => new Date("2026-08-15T00:01:00.000Z"),
          editSessionSecret: "unit-test-route-edit-session-secret",
        },
      );
      expect(revalidated).toMatchObject({
        status: "ready",
        route: {
          stops: [expect.objectContaining({
            placeId: "tour:126122",
            petAssessment: "conditional",
          })],
        },
      });
    }
  });
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

  it("accepts automatic condition acknowledgements only with explicit inclusion", () => {
    const acknowledged = {
      ...REQUEST,
      acknowledgedVerificationRequiredPlaceIds: ["tour:126122"],
    };
    expect(routeRecommendationRequestSchema.safeParse(acknowledged).success).toBe(false);
    expect(routeRecommendationRequestSchema.safeParse({
      ...acknowledged,
      includeVerificationRequired: true,
    }).success).toBe(true);
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

  it("keeps a not-allowed selected place as a factual draft", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["kakao:201"],
    }, dependencies([ktoCandidate("1001")], [marker("kakao:201", { verdict: "not_allowed" })]));
    expect(result).toMatchObject({ status: "ready", selectionIssues: [], route: { venueCompatibility: "unchecked", stops: expect.arrayContaining([expect.objectContaining({ placeId: "kakao:201", petAssessment: "not_allowed" })]) } });
  });

  it("routes an unknown selected anchor without fabricating confirmation", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["kakao:201"],
      autoFill: false,
    }, dependencies([], [marker("kakao:201")]));
    expect(result).toMatchObject({ status: "ready", requestedStopCount: 1, feasibleStopCount: 1, selectionIssues: [], route: { confirmationStatus: "ready", venueCompatibility: "unchecked", stops: [expect.objectContaining({ placeId: "kakao:201", petAssessment: "unknown" })] } });
    if (result.status === "ready") expect(result.route.stops[0]).not.toHaveProperty("conditionAcknowledged");
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
      verificationWarning: expect.stringContaining("직접 확인"),
    })]);
  });

  it("retains the real condition warning for an acknowledged conditional Kakao anchor", async () => {
    const condition = "테라스만 가능 · 이동가방 필수";
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["kakao:201"],
      acknowledgedVerificationRequiredPlaceIds: ["kakao:201"],
      autoFill: false,
    }, dependencies([], [marker("kakao:201", {
      verdict: "conditional",
      petConditions: condition,
      verificationRequired: true,
    })]));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.stops[0]).toMatchObject({
      placeId: "kakao:201",
      petAssessment: "conditional",
      catalogEvidence: [expect.objectContaining({ originalText: condition, petAssessment: "conditional" })],
    });
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

  it("allows unverified and Shopping public candidates in automatic supplementation", async () => {
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
    expect(result.route.stops.map(({ placeId }) => placeId)).toContain("tour:1003");
    expect(result.route.stops.map(({ placeId }) => placeId)).toContain("tour:1004");
  });

  it("keeps unknown-evidence supplements without needing the legacy opt-in", async () => {
    const result = await generateRouteRecommendation({
      ...REQUEST,
      selectedPlaceIds: ["tour:1001"],
      autoFill: true,
      includeVerificationRequired: true,
    }, dependencies([
      ktoCandidate("1001"),
      ktoCandidate("1002", { verdict: "unknown", tier: "unverified" }),
    ], []));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.route.stops.map(({ placeId }) => placeId)).toEqual(["tour:1001", "tour:1002"]);
  });

  it("preserves every anchor without relabeling a reordered copy as another option", async () => {
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
    expect(result.routeOptionsLimitedReason).toBe(
      "fewer_than_three_meaningfully_distinct_routes",
    );
    expect(result.routeOptions?.every(({ stops }) =>
      stops.every(({ locked }) => locked))).toBe(true);
  });

  it("returns an honest insufficient state instead of dropping any of five incompatible locked anchors", async () => {
    const selectedPlaceIds = ["tour:1001", "tour:1002", "tour:1003", "tour:1004", "tour:1005"];
    const result = await generateRouteRecommendation({
      ...REQUEST,
      trip: { ...REQUEST.trip, tripPace: "relaxed", desiredStopCount: 1 },
      selectedPlaceIds,
      autoFill: false,
    }, dependencies(selectedPlaceIds.map((id) => ktoCandidate(id.split(":")[1]!)), []));

    expect(result).toMatchObject({
      status: "insufficient_feasible_route",
      selectionMode: "hybrid",
      requestedStopCount: 5,
      feasibleStopCount: 0,
      selectionIssues: [expect.objectContaining({
        code: "selected_place_trip_incompatible",
        blocking: true,
      })],
    });
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
    const deps = dependencies([shopping], []);
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
        petAssessment: "unknown",
        catalogEvidence: [expect.objectContaining({ provider: "kto", petAssessment: "unknown" })],
      });
    }
    expect(deps.getPlaceDetail).not.toHaveBeenCalled();
    expect(deps.candidatePipeline).not.toHaveBeenCalled();
    expect(routeRecommendationResponseSchema.safeParse(result).success).toBe(true);
  });
});
