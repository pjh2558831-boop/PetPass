import { describe, expect, it } from "vitest";
import {
  itineraryGenerationResponseSchema,
  parseItineraryGenerationResponse,
} from "@/lib/itinerary/response-schema";
import type {
  GeneratedItinerary,
  GeneratedItineraryStop,
  ItineraryGenerationResponse,
} from "@/types/route-generation";

function makeStop(order = 1): GeneratedItineraryStop {
  return {
    order,
    stableIdentity: `tour:${order}`,
    source: "TOUR_API",
    contentId: String(order),
    title: `장소 ${order}`,
    address: `부산 주소 ${order}`,
    coordinates: { latitude: 35.1796, longitude: 129.0756 },
    providerContentTypeId: "12",
    contentTypeId: "12",
    category: "attraction",
    plannedArrival: "10:20",
    plannedDeparture: "11:20",
    visitDurationMinutes: 60,
    distanceFromPreviousMeters: 1_200,
    durationFromPreviousSeconds: 720,
    petAccess: {
      verdict: "conditional",
      evaluationState: "complete",
      permittedScopes: ["whole_place"],
      restrictedScopes: ["indoor"],
      conditions: [
        {
          type: "carrier_required",
          scope: "whole_place",
          label: "이동장 필요",
          sourceText: "이동장 사용 시 동반 가능합니다.",
          evidenceIds: ["evidence:1"],
          structuredValue: {
            value: 10,
            unit: "kg",
            comparator: "maximum",
          },
          manualConfirmationRecommended: false,
        },
      ],
      sizeCompatibility: {
        rulesetVersion: "1",
        requestedSize: "SMALL",
        state: "compatible",
        reason: "explicit_size_allowance",
        evidenceIds: ["evidence:1"],
        sourceTexts: ["소형견 동반 가능"],
      },
      summary: "이동장 사용 조건으로 동반 가능합니다.",
      confidence: "high",
      reasonCodes: ["explicit_allowance", "material_condition"],
      evidence: [
        {
          id: "evidence:1",
          operation: "detailPetTour2",
          field: "acmpyPsblCpam",
          fieldLabel: "동반 가능 범위",
          originalText: "  소형견은 이동장 사용 시 동반 가능  ",
          assertion: "allows",
          scope: "whole_place",
          priority: 1,
          providerModifiedTime: "20260801000000",
        },
      ],
      conflicts: [
        {
          id: "conflict:1",
          scope: "indoor",
          evidenceIds: ["evidence:1"],
          summary: "실내 범위는 방문 전 확인이 필요합니다.",
        },
      ],
      verificationItems: [
        {
          code: "confirm_current_policy",
          label: "현재 정책 확인",
          evidenceIds: ["evidence:1"],
        },
      ],
      sources: [
        {
          operation: "detailPetTour2",
          status: "available",
          retrievedAt: "2026-08-10T00:00:00.000Z",
          providerModifiedTime: "20260801000000",
        },
      ],
      warnings: ["방문 전 최신 정책을 확인해 주세요."],
    },
    operatingHours: {
      status: "unknown",
      warning: "운영시간 확인 필요",
    },
    travelSuitability: {
      travelSuitable: true,
      travelRole: "general_attraction",
      normalizedCategory: "attraction",
      recommendationTier: "conditional",
      exclusionReason: null,
      eligibilityReason: "관광 장소로 확인됨",
      evidence: [
        {
          source: "tour_content_type",
          code: "content_type_attraction",
          value: "12",
        },
      ],
      source: {
        provider: "Korea Tourism Organization",
        identity: `tour:${order}`,
      },
      petVerificationState: "conditional",
      scoringEligible: true,
    },
    placeScore: {
      total: 80,
      components: {
        petCompatibility: 30,
        preferenceMatch: 20,
        travelAttractiveness: 15,
        scheduleFit: 10,
        informationCompleteness: 5,
        kakaoRelevance: 0,
      },
      reasons: ["동반 근거를 확인했습니다."],
      evidenceCodes: ["content_type_attraction"],
    },
    placeUtility: {
      version: "place-utility-v1",
      total: 800,
      preferenceFit: 1,
      petCompatibility: 0.85,
      informationTrust: 0.8,
      popularity: 0.5,
      categoryPriority: 0.8,
      dataQuality: 0.75,
      weightedContributions: {
        preferenceFit: 300,
        petCompatibility: 213,
        informationTrust: 120,
        popularity: 60,
        categoryPriority: 80,
        dataQuality: 27,
      },
      reasonCodes: ["pet_access_compatible_conditional"],
      warningCodes: ["popularity_insufficient_data"],
    },
    recommendationReasons: ["동반 근거를 확인했습니다."],
    callAheadRequired: true,
    imageUrl: "https://tong.visitkorea.or.kr/example.jpg",
    phone: "051-000-0000",
    verifiedReplacementIdentity: `tour:${order}`,
  };
}

function makeItinerary(
  index = 1,
  stops: GeneratedItineraryStop[] = [makeStop()],
): GeneratedItinerary {
  return {
    id: `route-${index}`,
    signature: `signature-${index}`,
    profile:
      index === 1
        ? "preference_balanced"
        : index === 2
          ? "minimum_movement"
          : "discovery",
    title: `경로 ${index}`,
    explanation: "서버가 계산한 경로입니다.",
    stops,
    totalDistanceMeters: 1_200,
    totalDurationSeconds: 720,
    estimatedElapsedDurationMinutes: 72,
    geometry: [
      { latitude: 35.1796, longitude: 129.0756 },
      { latitude: 35.18, longitude: 129.08 },
    ],
    routeScore: {
      total: 120,
      qualityRatio: 0.9,
      components: {
        placeScoreTotal: 80,
        preferenceCoverage: 20,
        travelRoleDiversity: 10,
        scheduleFit: 10,
        travelTimePenalty: 5,
        backtrackingPenalty: 0,
        repeatedCategoryPenalty: 0,
        unverifiedPlaceRisk: 0,
      },
    },
  };
}

function makeResponse(
  itineraries: GeneratedItinerary[] = [makeItinerary()],
): ItineraryGenerationResponse {
  return {
    state: "ready",
    request: {
      scope: {
        type: "busan",
        regionCode: "26",
        regionName: "부산 전체",
      },
      start: {
        coordinates: { latitude: 35.1796, longitude: 129.0756 },
        label: "부산광역시 연제구 중앙대로 1001",
      },
      travelDate: "2026-08-15",
      tripType: "DAY_TRIP",
      tripPace: "balanced",
      startTime: "10:00",
      planningMode: "stop_count",
      desiredDurationMinutes: null,
      desiredStopCount: 3,
      petSpecies: "DOG",
      petSize: "SMALL",
      acceptsOutdoorOnly: false,
      petEquipment: {
        hasCarrier: true,
        hasLeash: true,
        hasMuzzle: false,
      },
      indoorAccessPreference: "any",
      selectedCategories: ["attraction", "food"],
      includeShopping: false,
      generationSeed: "initial",
      recentRouteSignatures: [],
    },
    providerCandidatesConsidered: 10,
    shortlistedCandidates: 5,
    eligibleCandidates: 3,
    candidateFunnel: {
      matchingCatalogCandidates: 10,
      afterBasicFilters: 9,
      travelSuitableCandidates: 8,
      travelSuitabilityExcluded: 1,
      preliminaryRankedCandidates: 7,
      detailedAssessmentCandidates: 6,
      detailOutcomes: { unavailable: 0, mismatch: 0 },
      basePetAccess: {
        allowed: 4,
        conditional: 2,
        notAllowed: 0,
        unknown: 0,
        notApplicable: 0,
      },
      petSizeCompatibility: {
        compatible: 6,
        incompatible: 0,
        verificationRequired: 0,
        notSpecified: 0,
      },
      equipmentMismatchExcluded: 0,
      indoorRequirementExcluded: 0,
      itineraryEligibleCandidates: 6,
      generatedCombinations: 3,
      returnedRoutes: itineraries.length,
    },
    exclusionCounts: {
      shopping_disabled: 0,
      unsupported_record: 0,
      malformed_record: 0,
      malformed_coordinates: 0,
      travel_unsuitable: 0,
      candidate_limit: 0,
      detail_unavailable: 0,
      detail_mismatch: 0,
      not_allowed: 0,
      unknown: 0,
      not_applicable: 0,
      pet_size_incompatible: 0,
      pet_size_verification_required: 0,
      equipment_incompatible: 0,
      indoor_requirement: 0,
      closed_at_visit: 0,
      check_in_unavailable: 0,
      duration_exceeded: 0,
      directions_unavailable: 0,
      diversity_duplicate: 0,
      recent_signature: 0,
    },
    travelSuitabilityExclusions: {},
    providerCalls: { detail: 6, directions: 3, discovery: 0 },
    candidatePipeline: {
      version: "candidate-pipeline-v1",
      status: "ready",
      eligiblePoolTarget: 7,
      requiredMinimum: 3,
      reasonCounts: {},
      diagnostics: {
        version: "candidate-pipeline-v1",
        initialCatalogCount: 10,
        exposedCount: 10,
        coordinateValidCount: 10,
        categoryAcceptedCount: 10,
        stageACount: 10,
        stageBCount: 8,
        detailedEvaluationCount: 6,
        detailedBatchCount: 2,
        eligibleCount: 6,
        finalEligibleCount: 6,
        cacheHits: 2,
        providerCalls: 20,
        providerFailures: 0,
        providerUnavailableCandidates: 0,
        skippedCandidates: 2,
        detailCallsByOperation: { detailCommon2: 6, detailIntro2: 6, detailPetTour2: 6 },
        excludedByReason: {},
        warningsByReason: {},
        categoryDistribution: { attraction: 4, food: 2 },
      },
    },
    limits: {
      maxCatalogCandidates: 100,
      maxDetailCalls: 20,
      maxDirectionsCalls: 10,
      detailConcurrency: 4,
      catalogConcurrency: 3,
      maxCatalogPagesPerContentType: 2,
      maxCourseCombinations: 100,
    },
    itineraries,
    notices: ["방문 전 최신 운영 정책을 확인해 주세요."],
  };
}

describe("itinerary generation response boundary", () => {
  it("parses every UI-consumed field and preserves original assessment text", () => {
    const response = makeResponse();
    const parsed = parseItineraryGenerationResponse(response);

    expect(parsed).toEqual(response);
    expect(parsed.request.petEquipment).toEqual({
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: false,
    });
    expect(parsed.notices).toEqual(response.notices);
    expect(parsed.itineraries[0]?.stops[0]?.petAccess.evidence?.[0]?.originalText)
      .toBe("  소형견은 이동장 사용 시 동반 가능  ");
  });

  it("enforces the response route and stop bounds", () => {
    const fourRoutes = makeResponse(
      Array.from({ length: 4 }, (_, index) => makeItinerary(index + 1)),
    );
    expect(itineraryGenerationResponseSchema.safeParse(fourRoutes).success).toBe(
      false,
    );

    const sixStops = Array.from({ length: 6 }, (_, index) => makeStop(index + 1));
    const routeWithSixStops = makeResponse([makeItinerary(1, sixStops)]);
    expect(
      itineraryGenerationResponseSchema.safeParse(routeWithSixStops).success,
    ).toBe(false);
  });

  it("omits an unsafe Kakao link without removing the itinerary stop", () => {
    const rejectedUrl = "https://place.map.kakao.com.evil.example/1";
    const response = makeResponse();
    response.itineraries[0]!.stops[0]!.placeUrl = rejectedUrl;

    const parsed = parseItineraryGenerationResponse(response);

    expect(parsed.itineraries[0]?.stops).toHaveLength(1);
    expect(parsed.itineraries[0]?.stops[0]?.placeUrl).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain(rejectedUrl);
  });

  it.each([
    [
      "missing request equipment",
      (response: ItineraryGenerationResponse) => {
        delete (response.request as Partial<typeof response.request>)
          .petEquipment;
      },
    ],
    [
      "out-of-bounds stop coordinates",
      (response: ItineraryGenerationResponse) => {
        response.itineraries[0]!.stops[0]!.coordinates.latitude = 91;
      },
    ],
    [
      "non-finite geometry",
      (response: ItineraryGenerationResponse) => {
        response.itineraries[0]!.geometry[0]!.longitude = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "negative route metrics",
      (response: ItineraryGenerationResponse) => {
        response.itineraries[0]!.totalDistanceMeters = -1;
      },
    ],
    [
      "unknown operating-hours warning",
      (response: ItineraryGenerationResponse) => {
        (
          response.itineraries[0]!.stops[0]!.operatingHours as {
            warning: unknown;
          }
        ).warning = "아마 영업 중";
      },
    ],
    [
      "unknown pet-access verdict",
      (response: ItineraryGenerationResponse) => {
        (
          response.itineraries[0]!.stops[0]!.petAccess as { verdict: unknown }
        ).verdict = "sometimes";
      },
    ],
    [
      "invalid rich assessment timestamp",
      (response: ItineraryGenerationResponse) => {
        response.itineraries[0]!.stops[0]!.petAccess.sources![0]!.retrievedAt =
          "not-a-timestamp";
      },
    ],
    [
      "non-string notice",
      (response: ItineraryGenerationResponse) => {
        (response as { notices: unknown[] }).notices = [{ message: "unsafe" }];
      },
    ],
    [
      "unsupported image host",
      (response: ItineraryGenerationResponse) => {
        response.itineraries[0]!.stops[0]!.imageUrl =
          "https://images.example.com/untrusted.jpg";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const response = makeResponse();
    mutate(response);
    expect(itineraryGenerationResponseSchema.safeParse(response).success).toBe(
      false,
    );
  });
});
