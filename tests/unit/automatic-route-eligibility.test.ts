import { describe, expect, it } from "vitest";
import {
  evaluateAutomaticRouteEligibility,
  type AutomaticRouteEligibilityInput,
} from "@/lib/itinerary/automatic-route-eligibility";
import type { LicensingMatchResult } from "@/types/license";
import type {
  NormalizedPetEvidence,
  TourPetPolicyFields,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";
import type {
  TourPetAccessCondition,
  TourPetAccessSemanticAssessment,
} from "@/types/tour-pet-access";

const NOW = "2026-08-12T00:00:00.000Z";

const EMPTY_FIELDS: TourPetPolicyFields = {
  acmpyTypeCd: null,
  acmpyPsblCpam: null,
  acmpyNeedMtr: null,
  etcAcmpyInfo: null,
  relaAcdntRiskMtr: null,
  relaPosesFclty: null,
  relaFrnshPrdlst: null,
  relaPurcPrdlst: null,
  relaRntlPrdlst: null,
};

function summary(): TourPlaceSummary {
  return {
    contentId: "route-eligible-1",
    contentTypeId: "12",
    providerContentTypeId: "12",
    category: "attraction",
    title: "검증 장소",
    address: "부산광역시",
    detailAddress: null,
    longitude: 129.0756,
    latitude: 35.1796,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: "26",
    legalDistrictCode: "230",
    classificationCodes: {
      primary: null,
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    providerVisibility: {
      status: "exposed",
      providerField: "showflag",
      providerValue: "1",
      checkedAt: NOW,
      reasonCodes: [],
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      contentId: "route-eligible-1",
      retrievedAt: NOW,
    },
  };
}

function normalizedEvidence(
  fields: Partial<TourPetPolicyFields> = {
    acmpyTypeCd: "전구역 동반가능",
  },
): NormalizedPetEvidence {
  const merged = { ...EMPTY_FIELDS, ...fields };
  const sourceFields = Object.entries(merged)
    .filter((entry): entry is [keyof TourPetPolicyFields, string] =>
      Boolean(entry[1]?.trim()),
    )
    .map(([field, value]) => ({ field, value }));
  return {
    availability: sourceFields.length > 0 ? "partial" : "empty",
    fields: merged,
    sourceFields,
    emptyFieldNames: [],
    absentFieldNames: [],
    warningCodes: sourceFields.length > 0 ? ["pet_detail_fields_partial"] : [],
  };
}

function detail(
  place: TourPlaceSummary,
  normalized = normalizedEvidence(),
): TourPlaceDetail {
  return {
    summary: {
      ...place,
      source: {
        ...place.source,
        operation: "detailCommon2",
        contentId: place.contentId,
      },
    },
    overview: null,
    homepageUrl: null,
    operatingInformation: "09:00-20:00",
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: null,
    petPolicyEvidence: {
      fields: normalized.fields,
      sourceEvidence: {
        provider: "Korea Tourism Organization",
        operation: "detailPetTour2",
        contentId: place.contentId,
        retrievedAt: NOW,
        originalEvidenceFields: normalized.fields,
      },
    },
    normalizedPetEvidence: normalized,
    introPetPolicyEvidence: null,
    sections: {
      common: { status: "available" },
      intro: { status: "available" },
      petPolicy: { status: "available" },
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: place.contentId,
      retrievedAt: NOW,
    },
  };
}

function assessment(
  overrides: Partial<TourPetAccessSemanticAssessment> = {},
): TourPetAccessSemanticAssessment {
  return {
    rulesetVersion: "1",
    verdict: "allowed",
    evaluationState: "complete",
    confidence: "high",
    reasonCodes: ["explicit_allowance"],
    summary: "반려동물 동반 가능",
    permittedScopes: ["whole_place"],
    restrictedScopes: [],
    conditions: [],
    evidence: [
      {
        id: "detailPetTour2:acmpyTypeCd:1",
        operation: "detailPetTour2",
        field: "acmpyTypeCd",
        fieldLabel: "동반 유형",
        originalText: "전구역 동반가능",
        assertion: "allows",
        scope: "whole_place",
        priority: 1,
        providerModifiedTime: null,
      },
    ],
    conflicts: [],
    verificationItems: [],
    providerModifiedTime: null,
    sources: [
      {
        operation: "detailPetTour2",
        status: "available",
        retrievedAt: NOW,
        providerModifiedTime: null,
      },
      {
        operation: "detailIntro2",
        status: "empty",
        retrievedAt: NOW,
        providerModifiedTime: null,
      },
    ],
    warnings: [],
    ...overrides,
  };
}

function input(): AutomaticRouteEligibilityInput {
  const place = summary();
  return {
    providerService: "KorPetTourService2",
    summary: place,
    detail: detail(place),
    providerVisibility: place.providerVisibility!,
    providerCalls: {
      list: "succeeded",
      detailCommon: "succeeded",
      detailIntro: "succeeded",
      detailPet: "succeeded",
    },
    assessment: assessment(),
    petProfile: {
      species: "DOG",
      size: "SMALL",
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: true,
      acceptsOutdoorOnly: true,
    },
    tripRequest: {
      scope: {
        regionCode: "26",
        districtCode: null,
        bounds: { west: 128.75, south: 34.95, east: 129.4, north: 35.5 },
      },
      selectedCategories: ["attraction"],
      includeShopping: false,
      indoorAccessPreference: "any",
    },
    licensing: null,
    operatingHours: { status: "open", warning: null },
  };
}

function replacePetEvidence(
  candidate: AutomaticRouteEligibilityInput,
  fields: Partial<TourPetPolicyFields>,
): void {
  const normalized = normalizedEvidence(fields);
  candidate.detail.normalizedPetEvidence = normalized;
  candidate.detail.petPolicyEvidence = {
    fields: normalized.fields,
    sourceEvidence: {
      provider: "Korea Tourism Organization",
      operation: "detailPetTour2",
      contentId: candidate.summary.contentId,
      retrievedAt: NOW,
      originalEvidenceFields: normalized.fields,
    },
  };
}

function condition(
  type: TourPetAccessCondition["type"],
  options: Partial<TourPetAccessCondition> = {},
): TourPetAccessCondition {
  return {
    type,
    scope: "whole_place",
    label: type,
    sourceText: type,
    evidenceIds: ["detailPetTour2:acmpyNeedMtr:1"],
    manualConfirmationRecommended: false,
    ...options,
  };
}

function license(
  matchState: LicensingMatchResult["matchState"],
  operatingState: "active" | "closed" | "suspended" | "unknown" | null,
): LicensingMatchResult {
  return {
    licensingKind: "food",
    matchState,
    refinedVenueKind: "restaurant",
    confidence: matchState === "matched_high" ? "high" : "none",
    totalScore: null,
    reasons: [],
    sources: [],
    section: { status: "available" },
    selectedRecord: null,
    alternatives: [],
    operatingState,
  };
}

describe("automatic-route eligibility V1", () => {
  it.each([
    ["롯데백화점 부산본점", "shopping"],
    ["카페온 롯데백화점 부산본점", "food"],
  ] as const)("excludes a major retail complex or tenant: %s", (title, category) => {
    const candidate = input();
    candidate.summary.title = title;
    candidate.summary.category = category;
    candidate.detail.summary.title = title;
    candidate.detail.summary.category = category;
    candidate.tripRequest.selectedCategories = [category];
    candidate.tripRequest.includeShopping = category === "shopping";

    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible: false,
      status: "ineligible",
      reasonCodes: expect.arrayContaining(["major_retail_complex"]),
    });
  });

  it("keeps an independent restaurant with a similar brand word eligible", () => {
    const candidate = input();
    candidate.summary.title = "현대옥 전주본점";
    candidate.summary.category = "food";
    candidate.detail.summary.title = "현대옥 전주본점";
    candidate.detail.summary.category = "food";
    candidate.tripRequest.selectedCategories = ["food"];

    expect(evaluateAutomaticRouteEligibility(candidate).reasonCodes).not.toContain("major_retail_complex");
  });
  it("accepts an exposed KTO Service2 place with consumed primary evidence", () => {
    expect(evaluateAutomaticRouteEligibility(input())).toMatchObject({
      eligible: true,
      status: "eligible",
      tier: "verified",
      reasonCodes: [],
      warnings: ["license_no_match"],
      evidenceFieldNames: ["acmpyTypeCd"],
      conditionEligibility: { state: "eligible", reasonCodes: [] },
    });
  });

  it.each([
    ["leash_required", "hasLeash"],
    ["carrier_required", "hasCarrier"],
    ["muzzle_required", "hasMuzzle"],
  ] as const)("accepts a satisfied %s condition", (type, _profileField) => {
    const candidate = input();
    expect(candidate.petProfile[_profileField]).toBe(true);
    candidate.assessment = assessment({
      verdict: "conditional",
      conditions: [condition(type)],
    });
    expect(evaluateAutomaticRouteEligibility(candidate).status).toBe("eligible");
  });

  it.each([
    ["leash_required", "hasLeash"],
    ["carrier_required", "hasCarrier"],
    ["muzzle_required", "hasMuzzle"],
  ] as const)("excludes an unmet %s condition", (type, profileField) => {
    const candidate = input();
    candidate.assessment = assessment({
      verdict: "conditional",
      conditions: [condition(type)],
    });
    candidate.petProfile[profileField] = false;
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible: false,
      status: "ineligible",
      reasonCodes: ["mandatory_condition_unsatisfied"],
    });
  });

  it("keeps uncollected preparable equipment as guidance", () => {
    const candidate = input();
    candidate.assessment = assessment({
      verdict: "conditional",
      conditions: [condition("leash_required")],
    });
    candidate.petProfile.hasLeash = null;
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible: true,
      status: "eligible",
      tier: "conditional",
      reasonCodes: [],
    });
  });

  it("keeps unknown pet evidence active as an unverified candidate", () => {
    const candidate = input();
    candidate.assessment = assessment({
      verdict: "unknown",
      evaluationState: "insufficient_evidence",
    });

    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible: true,
      status: "verification_required",
      tier: "unverified",
      reasonCodes: expect.arrayContaining(["pet_access_unknown"]),
    });
  });

  it("keeps manual confirmation conditions active as conditional candidates", () => {
    const candidate = input();
    candidate.assessment = assessment({
      verdict: "conditional",
      conditions: [
        condition("reservation_required", {
          manualConfirmationRecommended: true,
        }),
      ],
    });

    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible: true,
      status: "verification_required",
      tier: "conditional",
      reasonCodes: ["mandatory_condition_verification_required"],
    });
  });

  it("keeps assessment conflicts in the canonical verification state", () => {
    const candidate = input();
    candidate.assessment = assessment({
      verdict: "conditional",
      conflicts: [{
        id: "conflict:1",
        scope: "whole_place",
        evidenceIds: ["detailPetTour2:acmpyTypeCd:1"],
        summary: "동일 범위의 허용 및 제한 문구가 충돌합니다.",
      }],
    });

    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "verification_required",
      reasonCodes: ["mandatory_condition_verification_required"],
      conditionEligibility: {
        state: "eligible_with_confirmation",
        confirmationRequiredConditions: [expect.objectContaining({
          code: "operator_confirmation_required",
          sourceType: "assessment_conflict",
        })],
      },
    });
  });

  it("separates routine guidance from material reservation requirements", () => {
    const manual = input();
    manual.assessment = assessment({
      verdict: "conditional",
      conditions: [
        condition("vaccination_required", { manualConfirmationRecommended: true }),
      ],
    });
    expect(evaluateAutomaticRouteEligibility(manual).status).toBe(
      "verification_required",
    );

    const unsupported = input();
    unsupported.assessment = assessment({
      verdict: "conditional",
      conditions: [condition("reservation_required")],
    });
    expect(evaluateAutomaticRouteEligibility(unsupported)).toMatchObject({
      status: "verification_required",
      reasonCodes: ["mandatory_condition_verification_required"],
    });
  });

  it("accepts a compatible explicit size rule and excludes an incompatible size", () => {
    const makeSized = (size: "SMALL" | "LARGE") => {
      const candidate = input();
      candidate.petProfile.size = size;
      candidate.assessment = assessment({
        verdict: "conditional",
        conditions: [
          condition("size_limit", {
            sourceText: "소형견만 가능",
            evidenceIds: ["detailPetTour2:acmpyPsblCpam:1"],
          }),
        ],
        evidence: [
          ...assessment().evidence,
          {
            id: "detailPetTour2:acmpyPsblCpam:1",
            operation: "detailPetTour2",
            field: "acmpyPsblCpam",
            fieldLabel: "동반 가능 수용 범위",
            originalText: "소형견만 가능",
            assertion: "limits",
            scope: "whole_place",
            priority: 2,
            providerModifiedTime: null,
          },
        ],
      });
      replacePetEvidence(candidate, {
        acmpyTypeCd: "전구역 동반가능",
        acmpyPsblCpam: "소형견만 가능",
      });
      return candidate;
    };

    expect(evaluateAutomaticRouteEligibility(makeSized("SMALL")).status).toBe(
      "eligible",
    );
    expect(evaluateAutomaticRouteEligibility(makeSized("LARGE"))).toMatchObject({
      status: "ineligible",
      reasonCodes: ["pet_size_incompatible"],
    });
  });

  it("requires verification for a weight rule because V1 has no exact pet weight", () => {
    const candidate = input();
    candidate.assessment = assessment({
      verdict: "conditional",
      conditions: [
        condition("weight_limit", {
          sourceText: "10kg 이하",
          structuredValue: { value: 10, unit: "kg", comparator: "maximum" },
        }),
      ],
    });
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "verification_required",
      reasonCodes: ["pet_size_verification_required"],
    });
  });

  it("checks species from acmpyPsblCpam and never from acmpyTypeCd", () => {
    const candidate = input();
    candidate.petProfile.species = "CAT";
    replacePetEvidence(candidate, {
      acmpyTypeCd: "반려견",
      acmpyPsblCpam: "고양이 동반 가능",
    });
    candidate.assessment = assessment({
      evidence: [
        {
          ...assessment().evidence[0],
          id: "detailPetTour2:acmpyPsblCpam:1",
          field: "acmpyPsblCpam",
          fieldLabel: "동반 가능 동물",
          originalText: "고양이 동반 가능",
        },
      ],
    });
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "eligible",
      reasonCodes: [],
    });
  });

  it("excludes a recognized incompatible allowed-animal species", () => {
    const candidate = input();
    candidate.petProfile.species = "CAT";
    replacePetEvidence(candidate, {
      acmpyTypeCd: "전구역 동반가능",
      acmpyPsblCpam: "반려견 동반 가능",
    });
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["pet_type_incompatible"],
    });
  });

  it("requires verification for undocumented allowed-animal wording", () => {
    const candidate = input();
    replacePetEvidence(candidate, {
      acmpyTypeCd: "전구역 동반가능",
      acmpyPsblCpam: "provider-code-unknown",
    });
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "verification_required",
      reasonCodes: ["pet_type_verification_required"],
    });
  });

  it.each([
    ["not_allowed", "complete", "pet_access_not_allowed", "ineligible"],
    ["unknown", "insufficient_evidence", "pet_access_unknown", "verification_required"],
    ["unknown", "not_applicable", "pet_access_not_applicable", "verification_required"],
  ] as const)(
    "maps Phase 3 %s/%s without licensing reinterpretation",
    (verdict, evaluationState, reason, status) => {
      const candidate = input();
      candidate.assessment = assessment({ verdict, evaluationState });
      candidate.licensing = license("matched_high", "active");
      const result = evaluateAutomaticRouteEligibility(candidate);
      expect(result.status).toBe(status);
      expect(result.reasonCodes).toContain(reason);
      expect(result.reasonCodes).not.toContain("matched_license_closed");
    },
  );

  it.each([
    ["not_exposed", "provider_visibility_not_exposed", "ineligible", false],
    ["unknown", "provider_visibility_unknown", "verification_required", true],
    [
      "provider_unavailable",
      "provider_visibility_unavailable",
      "provider_unavailable",
      true,
    ],
  ] as const)("classifies visibility %s without inventing incompatibility", (visibility, reason, status, eligible) => {
    const candidate = input();
    const providerValue =
      visibility === "not_exposed" ? "0" : null;
    const providerField = visibility === "unknown" ? null : "showflag";
    const normalizedVisibility = {
      ...candidate.providerVisibility,
      status: visibility,
      providerField,
      providerValue,
    };
    candidate.providerVisibility = normalizedVisibility;
    candidate.summary.providerVisibility = normalizedVisibility;
    candidate.detail.summary.providerVisibility = normalizedVisibility;
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible,
      status,
      reasonCodes: [reason],
    });
  });

  it("requires intro success for every current Service2 content type", () => {
    const introNotApplicable = input();
    introNotApplicable.providerCalls.detailIntro = "not_applicable";
    expect(evaluateAutomaticRouteEligibility(introNotApplicable)).toMatchObject({
      eligible: true,
      status: "verification_required",
      reasonCodes: ["required_intro_detail_call_unavailable"],
    });

    for (const field of [
      "list",
      "detailCommon",
      "detailIntro",
      "detailPet",
    ] as const) {
      const candidate = input();
      candidate.providerCalls[field] = "provider_unavailable";
      expect(evaluateAutomaticRouteEligibility(candidate).status).toBe(
        "provider_unavailable",
      );
    }
  });

  it("treats invalid provider responses as unavailable, never as pet denial", () => {
    const candidate = input();
    candidate.providerCalls.detailPet = "invalid_response";
    const result = evaluateAutomaticRouteEligibility(candidate);
    expect(result.status).toBe("provider_unavailable");
    expect(result.reasonCodes).toContain("required_pet_detail_call_unavailable");
    expect(result.reasonCodes).not.toContain("pet_access_not_allowed");
  });

  it.each([
    [null, 129.0756],
    [35.1796, null],
    [91, 129.0756],
    [35.1796, 181],
    [0, 0],
  ] as const)("rejects invalid coordinates %s/%s", (latitude, longitude) => {
    const candidate = input();
    candidate.detail.summary.latitude = latitude;
    candidate.detail.summary.longitude = longitude;
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["invalid_coordinates"],
    });
  });

  it("rejects coordinates and region codes outside the requested scope", () => {
    const outsideBounds = input();
    outsideBounds.tripRequest.scope.bounds = {
      west: 129.2,
      south: 35.2,
      east: 129.3,
      north: 35.3,
    };
    expect(evaluateAutomaticRouteEligibility(outsideBounds)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["outside_requested_geographic_scope"],
    });

    const wrongRegion = input();
    wrongRegion.detail.summary.legalRegionCode = "11";
    expect(evaluateAutomaticRouteEligibility(wrongRegion)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["outside_requested_geographic_scope"],
    });
  });

  it("requires exact district scope identity and verifies missing codes", () => {
    const wrongDistrict = input();
    wrongDistrict.tripRequest.scope.districtCode = "350";
    expect(evaluateAutomaticRouteEligibility(wrongDistrict)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["outside_requested_geographic_scope"],
    });

    const missingDistrict = input();
    missingDistrict.tripRequest.scope.districtCode = "230";
    missingDistrict.detail.summary.legalDistrictCode = null;
    expect(evaluateAutomaticRouteEligibility(missingDistrict)).toMatchObject({
      status: "verification_required",
      reasonCodes: ["geographic_scope_verification_required"],
    });
  });

  it("distinguishes absent, empty, unavailable, and unconsumed pet evidence", () => {
    const absent = input();
    delete absent.detail.normalizedPetEvidence;
    expect(evaluateAutomaticRouteEligibility(absent)).toMatchObject({
      status: "verification_required",
      reasonCodes: expect.arrayContaining([
        "pet_evidence_absent",
        "pet_evidence_not_consumed",
      ]),
    });

    const empty = input();
    replacePetEvidence(empty, {});
    empty.assessment = assessment({
      sources: assessment().sources.map((source) =>
        source.operation === "detailPetTour2"
          ? { ...source, status: "empty" }
          : source,
      ),
    });
    expect(evaluateAutomaticRouteEligibility(empty)).toMatchObject({
      status: "verification_required",
      reasonCodes: expect.arrayContaining([
        "pet_evidence_empty",
        "pet_evidence_not_consumed",
      ]),
    });

    const unavailable = input();
    replacePetEvidence(unavailable, {});
    unavailable.detail.normalizedPetEvidence = {
      ...unavailable.detail.normalizedPetEvidence!,
      availability: "provider_unavailable",
    };
    expect(evaluateAutomaticRouteEligibility(unavailable).status).toBe(
      "provider_unavailable",
    );

    const unconsumed = input();
    unconsumed.assessment = assessment({
      evidence: [
        {
          ...assessment().evidence[0],
          operation: "detailIntro2",
          field: "chkpet",
        },
      ],
    });
    expect(evaluateAutomaticRouteEligibility(unconsumed)).toMatchObject({
      status: "verification_required",
      reasonCodes: ["pet_evidence_not_consumed"],
      evidenceFieldNames: [],
    });
  });

  it("requires both raw primary evidence and its normalized representation", () => {
    const candidate = input();
    candidate.detail.petPolicyEvidence = null;
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "verification_required",
      reasonCodes: expect.arrayContaining([
        "pet_evidence_absent",
        "pet_evidence_not_consumed",
      ]),
    });
  });

  it("binds consumed evidence to its normalized value and content identity", () => {
    const staleAssessment = input();
    staleAssessment.assessment = assessment({
      evidence: [
        { ...assessment().evidence[0], originalText: "이전 정책 원문" },
      ],
    });
    expect(evaluateAutomaticRouteEligibility(staleAssessment)).toMatchObject({
      status: "verification_required",
      reasonCodes: ["pet_evidence_not_consumed"],
      evidenceFieldNames: [],
    });

    const wrongContent = input();
    wrongContent.detail.petPolicyEvidence!.sourceEvidence.contentId = "other";
    expect(evaluateAutomaticRouteEligibility(wrongContent)).toMatchObject({
      status: "ineligible",
      reasonCodes: expect.arrayContaining(["pet_evidence_identity_mismatch"]),
    });
  });

  it("excludes only an explicitly closed high-confidence license match", () => {
    const closed = input();
    closed.licensing = license("matched_high", "closed");
    expect(evaluateAutomaticRouteEligibility(closed)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["matched_license_closed"],
    });

    const uncertainClosed = input();
    uncertainClosed.licensing = license("matched_possible", "closed");
    expect(evaluateAutomaticRouteEligibility(uncertainClosed)).toMatchObject({
      status: "eligible",
      warnings: ["license_match_uncertain"],
    });

    const noMatch = input();
    noMatch.licensing = license("not_found", null);
    expect(evaluateAutomaticRouteEligibility(noMatch)).toMatchObject({
      status: "eligible",
      warnings: ["license_no_match"],
    });
  });

  it("excludes a confirmed impossible time and warns without excluding unknown hours", () => {
    const closed = input();
    closed.operatingHours = { status: "closed", warning: null };
    expect(evaluateAutomaticRouteEligibility(closed)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["operating_time_conflict"],
    });

    const unknown = input();
    unknown.operatingHours = {
      status: "unknown",
      warning: "운영시간 확인 필요",
    };
    expect(evaluateAutomaticRouteEligibility(unknown)).toMatchObject({
      status: "eligible",
      warnings: ["license_no_match", "operating_hours_unknown"],
    });
  });

  it("requires the normalized category to be selected", () => {
    const candidate = input();
    candidate.tripRequest.selectedCategories = ["food"];
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["category_not_selected"],
    });
  });

  it("allows shopping only when both selected and explicitly enabled", () => {
    const shopping = input();
    shopping.summary.category = "shopping";
    shopping.summary.contentTypeId = "38";
    shopping.summary.providerContentTypeId = "38";
    shopping.detail.summary.category = "shopping";
    shopping.detail.summary.contentTypeId = "38";
    shopping.detail.summary.providerContentTypeId = "38";
    shopping.tripRequest.selectedCategories = ["shopping"];
    expect(evaluateAutomaticRouteEligibility(shopping)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["shopping_not_explicitly_selected"],
    });

    shopping.tripRequest.includeShopping = true;
    expect(evaluateAutomaticRouteEligibility(shopping).status).toBe("eligible");
  });

  it("rejects a non-Service2 source and mismatched detail identity", () => {
    const wrongService = input();
    wrongService.providerService = "KorPetTourService";
    expect(evaluateAutomaticRouteEligibility(wrongService)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["source_not_kto_service2"],
    });

    const mismatch = input();
    mismatch.detail.summary.contentId = "other";
    mismatch.detail.summary.category = "food";
    expect(evaluateAutomaticRouteEligibility(mismatch)).toMatchObject({
      status: "ineligible",
      reasonCodes: expect.arrayContaining([
        "detail_identity_mismatch",
        "category_not_selected",
      ]),
    });
  });

  it("requires exact list/common source operations and showflag identity", () => {
    const wrongOperation = input();
    wrongOperation.summary.source.operation = "detailCommon2";
    expect(evaluateAutomaticRouteEligibility(wrongOperation)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["source_identity_mismatch"],
    });

    const forgedExposed = input();
    const forgedVisibility = {
      ...forgedExposed.providerVisibility,
      providerValue: "0",
    };
    forgedExposed.providerVisibility = forgedVisibility;
    forgedExposed.summary.providerVisibility = forgedVisibility;
    forgedExposed.detail.summary.providerVisibility = forgedVisibility;
    expect(evaluateAutomaticRouteEligibility(forgedExposed)).toMatchObject({
      status: "ineligible",
      reasonCodes: ["provider_visibility_identity_mismatch"],
    });
  });

  it("rejects a legacy or unresolved provider content type", () => {
    const candidate = input();
    candidate.detail.summary.providerContentTypeId = "75";
    candidate.detail.summary.contentTypeId = null;
    candidate.detail.summary.category = "unknown";
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      status: "ineligible",
      reasonCodes: expect.arrayContaining(["unsupported_content_type"]),
    });
  });

  it("does not accept trust or popularity as eligibility overrides", () => {
    const candidate = input() as AutomaticRouteEligibilityInput & {
      trust: { level: string };
      popularity: number;
    };
    candidate.trust = { level: "high" };
    candidate.popularity = Number.MAX_SAFE_INTEGER;
    candidate.assessment = assessment({
      verdict: "conditional",
      conditions: [condition("carrier_required")],
    });
    candidate.petProfile.hasCarrier = false;
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible: false,
      status: "ineligible",
      reasonCodes: ["mandatory_condition_unsatisfied"],
    });
  });

  it("keeps provider-unavailable status distinct even with another exclusion", () => {
    const candidate = input();
    candidate.providerCalls.detailPet = "provider_unavailable";
    candidate.assessment = assessment({ verdict: "not_allowed" });
    expect(evaluateAutomaticRouteEligibility(candidate)).toMatchObject({
      eligible: false,
      status: "ineligible",
      tier: "explicitly_ineligible",
      reasonCodes: expect.arrayContaining([
        "required_pet_detail_call_unavailable",
        "pet_access_not_allowed",
      ]),
    });
  });
});
