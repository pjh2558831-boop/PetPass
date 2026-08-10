import { describe, expect, it } from "vitest";
import {
  GENERATED_PET_VERDICT_COPY,
  countItineraryVerdicts,
  createItineraryPresentation,
  formatKoreanDurationMinutes,
  getItineraryRouteMetrics,
  getRenderableRouteGeometry,
  getStopConfirmationRequirements,
  getStopDetailHref,
  getStopEquipmentRequirements,
  isItineraryBlockedByPetAccess,
} from "@/lib/itinerary/presentation";
import type {
  GeneratedItinerary,
  GeneratedItineraryStop,
  GeneratedPetAccess,
  PetEquipmentAvailability,
} from "@/types/route-generation";
import type { TourPetAccessCondition } from "@/types/tour-pet-access";

function makeCondition(
  type: TourPetAccessCondition["type"],
  manualConfirmationRecommended = false,
): TourPetAccessCondition {
  return {
    type,
    scope: "whole_place",
    label: `${type} 조건`,
    sourceText: `${type} 원문`,
    evidenceIds: [`evidence:${type}`],
    manualConfirmationRecommended,
  };
}

function makePetAccess(
  overrides: Partial<GeneratedPetAccess> = {},
): GeneratedPetAccess {
  return {
    verdict: "allowed",
    evaluationState: "complete",
    permittedScopes: ["whole_place"],
    restrictedScopes: [],
    conditions: [],
    sizeCompatibility: {
      rulesetVersion: "1",
      requestedSize: "SMALL",
      state: "compatible",
      reason: "explicit_all_sizes",
      evidenceIds: ["size:1"],
      sourceTexts: ["모든 크기 동반 가능"],
    },
    ...overrides,
  };
}

function makeStop(
  order: number,
  overrides: Partial<GeneratedItineraryStop> & {
    petAccess?: GeneratedPetAccess;
  } = {},
): GeneratedItineraryStop {
  return {
    order,
    stableIdentity: `tour:${order}`,
    source: "TOUR_API",
    contentId: String(order),
    title: `장소 ${order}`,
    address: `부산 주소 ${order}`,
    coordinates: { latitude: 35.1 + order / 100, longitude: 129.1 },
    providerContentTypeId: "12",
    contentTypeId: "12",
    category: "attraction",
    plannedArrival: "10:00",
    plannedDeparture: "11:00",
    visitDurationMinutes: 60,
    distanceFromPreviousMeters: order * 1_000,
    durationFromPreviousSeconds: order * 600,
    petAccess: overrides.petAccess ?? makePetAccess(),
    operatingHours: { status: "open", warning: null },
    travelSuitability: {
      travelSuitable: true,
      travelRole: "general_attraction",
      normalizedCategory: "attraction",
      recommendationTier: "verified",
      exclusionReason: null,
      eligibilityReason: "관광 장소로 확인됨",
      evidence: [
        {
          source: "tour_content_type",
          code: "content_type_attraction",
          value: "attraction",
        },
      ],
      source: {
        provider: "Korea Tourism Organization",
        identity: `tour:${order}`,
      },
      petVerificationState: "verified",
      scoringEligible: true,
    },
    placeScore: {
      total: 80,
      components: {
        petCompatibility: 30,
        preferenceMatch: 25,
        travelAttractiveness: 15,
        scheduleFit: 6,
        informationCompleteness: 4,
        kakaoRelevance: 0,
      },
      reasons: ["제공된 근거를 확인했습니다."],
      evidenceCodes: ["content_type_attraction"],
    },
    recommendationReasons: ["제공된 근거를 확인했습니다."],
    callAheadRequired: false,
    ...overrides,
  };
}

function makeItinerary(
  stops: GeneratedItineraryStop[],
  overrides: Partial<GeneratedItinerary> = {},
): GeneratedItinerary {
  return {
    id: "route-1",
    signature: stops.map(({ stableIdentity }) => stableIdentity).join(">"),
    profile: "preference_balanced",
    title: "취향 균형 코스",
    explanation: "서버가 제공한 설명",
    stops,
    totalDistanceMeters: 16_700,
    totalDurationSeconds: 5_700,
    estimatedElapsedDurationMinutes: 285,
    geometry: [
      { latitude: 35.1, longitude: 129.1 },
      { latitude: 35.2, longitude: 129.2 },
    ],
    routeScore: {
      total: 210,
      qualityRatio: 1,
      components: {
        placeScoreTotal: 160,
        preferenceCoverage: 25,
        travelRoleDiversity: 20,
        scheduleFit: 6,
        travelTimePenalty: 10,
        backtrackingPenalty: 0,
        repeatedCategoryPenalty: 0,
        unverifiedPlaceRisk: 0,
      },
    },
    ...overrides,
  };
}

describe("itinerary presentation", () => {
  it("exports exhaustive Korean copy for every existing verdict", () => {
    expect(Object.keys(GENERATED_PET_VERDICT_COPY)).toEqual([
      "allowed",
      "conditional",
      "not_allowed",
      "unknown",
    ]);
    expect(GENERATED_PET_VERDICT_COPY.not_allowed.description).toContain(
      "경로를 사용할 수 없습니다",
    );
    expect(GENERATED_PET_VERDICT_COPY.unknown.description).toContain(
      "방문 전에",
    );
  });

  it("keeps exact route metrics and counts every verdict without percentages", () => {
    const stops = [
      makeStop(1),
      makeStop(2, { petAccess: makePetAccess({ verdict: "conditional" }) }),
      makeStop(3, { petAccess: makePetAccess({ verdict: "unknown" }) }),
      makeStop(4, { petAccess: makePetAccess({ verdict: "not_allowed" }) }),
    ];
    const itinerary = makeItinerary(stops);

    expect(getItineraryRouteMetrics(itinerary)).toEqual({
      stopCount: 4,
      totalDistanceMeters: 16_700,
      totalDurationSeconds: 5_700,
      estimatedElapsedDurationMinutes: 285,
    });
    expect(countItineraryVerdicts(stops)).toEqual({
      allowed: 1,
      conditional: 1,
      not_allowed: 1,
      unknown: 1,
    });
    expect(isItineraryBlockedByPetAccess(stops)).toBe(true);
  });

  it("derives only supported equipment requirements from exact conditions", () => {
    const stop = makeStop(1, {
      petAccess: makePetAccess({
        verdict: "conditional",
        conditions: [
          makeCondition("carrier_required"),
          makeCondition("leash_required"),
          makeCondition("reservation_required", true),
        ],
      }),
    });
    const equipment: PetEquipmentAvailability = {
      hasCarrier: true,
      hasLeash: false,
      hasMuzzle: null,
    };

    expect(getStopEquipmentRequirements(stop, equipment)).toMatchObject([
      {
        equipmentKey: "hasCarrier",
        availability: true,
        status: "available",
        condition: { type: "carrier_required" },
      },
      {
        equipmentKey: "hasLeash",
        availability: false,
        status: "missing",
        condition: { type: "leash_required" },
      },
    ]);
  });

  it("preserves explicit confirmation signals without inventing evidence", () => {
    const stop = makeStop(1, {
      petAccess: makePetAccess({
        conditions: [
          makeCondition("carrier_required"),
          makeCondition("advance_inquiry_required", true),
        ],
        verificationItems: [
          {
            code: "confirm_current_policy",
            label: "현재 정책 확인",
            evidenceIds: ["evidence:1"],
          },
        ],
        warnings: ["일부 자료만 제공됨"],
        sizeCompatibility: {
          rulesetVersion: "1",
          requestedSize: "LARGE",
          state: "verification_required",
          reason: "ambiguous_size_restriction",
          evidenceIds: ["size:1"],
          sourceTexts: ["대형견 문의"],
        },
      }),
      operatingHours: {
        status: "unknown",
        warning: "운영시간 확인 필요",
      },
    });

    expect(getStopConfirmationRequirements(stop)).toMatchObject({
      callAheadRequired: false,
      manualConditions: [{ type: "advance_inquiry_required" }],
      verificationItems: [{ code: "confirm_current_policy" }],
      assessmentWarnings: ["일부 자료만 제공됨"],
      sizeVerificationRequired: true,
      operatingHoursWarning: "운영시간 확인 필요",
      hasConfirmationRequirements: true,
    });

    const kakao = makeStop(2, {
      source: "KAKAO",
      stableIdentity: "kakao:2",
      providerContentTypeId: "KAKAO",
      callAheadRequired: true,
      petAccess: makePetAccess({
        verdict: "unknown",
        evaluationState: "insufficient_evidence",
        permittedScopes: [],
        sizeCompatibility: {
          rulesetVersion: "1",
          requestedSize: "SMALL",
          state: "not_specified",
          reason: "no_explicit_size_evidence",
          evidenceIds: [],
          sourceTexts: [],
        },
      }),
    });
    expect(getStopConfirmationRequirements(kakao)).toEqual({
      callAheadRequired: true,
      manualConditions: [],
      verificationItems: [],
      assessmentWarnings: [],
      sizeVerificationRequired: false,
      operatingHoursWarning: null,
      hasConfirmationRequirements: true,
    });
  });

  it("does not turn a merely unspecified size into a confirmation requirement", () => {
    const stop = makeStop(1, {
      petAccess: makePetAccess({
        sizeCompatibility: {
          rulesetVersion: "1",
          requestedSize: "SMALL",
          state: "not_specified",
          reason: "no_explicit_size_evidence",
          evidenceIds: [],
          sourceTexts: [],
        },
      }),
    });
    expect(getStopConfirmationRequirements(stop).hasConfirmationRequirements)
      .toBe(false);
  });

  it("keeps a warning-only assessment visible as a confirmation requirement", () => {
    const stop = makeStop(1, {
      petAccess: makePetAccess({
        warnings: ["원문 일부가 안전한 표시 길이로 잘렸습니다."],
      }),
    });

    expect(getStopConfirmationRequirements(stop)).toMatchObject({
      assessmentWarnings: ["원문 일부가 안전한 표시 길이로 잘렸습니다."],
      hasConfirmationRequirements: true,
    });
  });

  it("accepts geometry only when it has two or more valid coordinates", () => {
    const geometry = [
      { latitude: 35.1, longitude: 129.1 },
      { latitude: 35.2, longitude: 129.2 },
    ];
    const accepted = getRenderableRouteGeometry(geometry);
    expect(accepted).toEqual(geometry);
    expect(accepted).not.toBe(geometry);
    expect(getRenderableRouteGeometry(geometry.slice(0, 1))).toEqual([]);
    expect(
      getRenderableRouteGeometry([
        geometry[0],
        { latitude: Number.NaN, longitude: 129.2 },
      ]),
    ).toEqual([]);
    expect(
      getRenderableRouteGeometry([
        geometry[0],
        { latitude: 35.2, longitude: 181 },
      ]),
    ).toEqual([]);
    expect(getRenderableRouteGeometry([geometry[0], null])).toEqual([]);
  });

  it("builds a pure route presentation and preserves provider-owned links", () => {
    const tourStop = makeStop(1);
    const kakaoStop = makeStop(2, {
      source: "KAKAO",
      stableIdentity: "kakao:2",
      providerContentTypeId: "KAKAO",
      placeUrl: "https://place.map.kakao.com/2",
      petAccess: makePetAccess({ verdict: "unknown" }),
    });
    const itinerary = makeItinerary([tourStop, kakaoStop], {
      profile: "discovery",
    });
    const presentation = createItineraryPresentation(itinerary, {
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: false,
    });

    expect(presentation.strategyOrder).toBe(2);
    expect(presentation.metrics.stopCount).toBe(2);
    expect(presentation.blockedByPetAccess).toBe(false);
    expect(presentation.geometry).toEqual(itinerary.geometry);
    expect(presentation.stops.map(({ detailHref }) => detailHref)).toEqual([
      "/places/1?contentTypeId=12",
      "https://place.map.kakao.com/2",
    ]);
    expect(getStopDetailHref({ ...kakaoStop, placeUrl: undefined })).toBeNull();
    expect(
      getStopDetailHref({
        ...kakaoStop,
        placeUrl: "http://place.map.kakao.com/2",
      }),
    ).toBe("https://place.map.kakao.com/2");
    for (const unsafeUrl of [
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "//place.map.kakao.com/2",
      "https://place.map.kakao.com.evil.example/2",
      "https://user@place.map.kakao.com/2",
      "https://place.map.kakao.com:444/2",
      "https://place.map.kakao.com/2/extra",
      "https://place.map.kakao.com/2?redirect=https://evil.example",
    ]) {
      expect(
        getStopDetailHref({ ...kakaoStop, placeUrl: unsafeUrl }),
      ).toBeNull();
    }
  });

  it("formats exact whole-minute durations in Korean without rounding", () => {
    expect(formatKoreanDurationMinutes(0)).toBe("0분");
    expect(formatKoreanDurationMinutes(59)).toBe("59분");
    expect(formatKoreanDurationMinutes(60)).toBe("1시간");
    expect(formatKoreanDurationMinutes(285)).toBe("4시간 45분");
    expect(formatKoreanDurationMinutes(-1)).toBeNull();
    expect(formatKoreanDurationMinutes(1.5)).toBeNull();
    expect(formatKoreanDurationMinutes(Number.NaN)).toBeNull();
  });
});
