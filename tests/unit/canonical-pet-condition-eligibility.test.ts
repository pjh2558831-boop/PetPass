import { describe, expect, it } from "vitest";
import {
  applyCanonicalPetConditionPolicy,
  evaluateCanonicalPetConditions,
} from "@/lib/pet-access/canonical-condition-eligibility";
import type { AutomaticRoutePetProfile } from "@/types/route-eligibility";
import type {
  TourPetAccessCondition,
  TourPetAccessSemanticAssessment,
} from "@/types/tour-pet-access";

const NOW = "2026-08-31T00:00:00.000Z";

function condition(
  type: TourPetAccessCondition["type"],
  label: string,
  sourceText: string,
): TourPetAccessCondition {
  return {
    type,
    scope: "whole_place",
    label,
    sourceText,
    evidenceIds: [`detailPetTour2:${type}:1`],
    manualConfirmationRecommended: [
      "dangerous_dog_limit",
      "sanitation_requirement",
    ].includes(type),
  };
}

/** Stable TourAPI-derived fixture; this suite never calls the live provider. */
function songdoAssessment(): TourPetAccessSemanticAssessment {
  const conditions = [
    condition("leash_required", "목줄 착용 필수", "목줄 착용 필수"),
    condition(
      "muzzle_required",
      "맹견 입마개 착용",
      "맹견은 입마개 착용이 필요합니다.",
    ),
    condition(
      "dangerous_dog_limit",
      "맹견 동반 제한 확인",
      "맹견 동반 시 관련 규정을 확인해 주세요.",
    ),
    condition(
      "sanitation_requirement",
      "배변 처리 용품 지참",
      "배변봉투를 지참하고 배설물을 즉시 수거해 주세요.",
    ),
  ];

  return {
    rulesetVersion: "1",
    verdict: "conditional",
    evaluationState: "complete",
    confidence: "high",
    reasonCodes: ["explicit_allowance", "material_condition"],
    summary: "반려견 동반 가능, 목줄과 맹견 제한 및 배변 처리 조건 확인 필요",
    permittedScopes: ["whole_place"],
    restrictedScopes: [],
    conditions,
    evidence: conditions.map((item, index) => ({
      id: item.evidenceIds[0],
      operation: "detailPetTour2" as const,
      field: index === 0 ? "acmpyNeedMtr" : "relaAcdntRiskMtr",
      fieldLabel: item.label,
      originalText: item.sourceText,
      assertion: "limits" as const,
      scope: item.scope,
      priority: 1 as const,
      providerModifiedTime: null,
    })),
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
  };
}

function petProfile(
  overrides: Partial<AutomaticRoutePetProfile> = {},
): AutomaticRoutePetProfile {
  return {
    species: "DOG",
    size: "SMALL",
    hasCarrier: true,
    hasLeash: true,
    hasMuzzle: true,
    acceptsOutdoorOnly: true,
    ...overrides,
  };
}

describe("canonical pet-condition eligibility", () => {
  it("returns identical Songdo analysis to selected and automatic policies", () => {
    const analysis = evaluateCanonicalPetConditions({
      assessment: songdoAssessment(),
      petProfile: petProfile(),
      sizeCompatibility: "compatible",
    });
    const selected = applyCanonicalPetConditionPolicy({
      analysis,
      flow: "user_selected",
      includeVerificationRequired: false,
      acknowledged: false,
    });
    const automatic = applyCanonicalPetConditionPolicy({
      analysis,
      flow: "automatic_recommendation",
      includeVerificationRequired: true,
      acknowledged: false,
    });

    expect(selected.conditionEligibility).toEqual(
      automatic.conditionEligibility,
    );
    expect(analysis.state).toBe("eligible_with_confirmation");
    expect(analysis.satisfiedConditions.map((item) => item.code)).toEqual(
      expect.arrayContaining(["leash_required", "muzzle_required"]),
    );
    expect(
      analysis.confirmationRequiredConditions.map((item) => item.code),
    ).toEqual(
      expect.arrayContaining([
        "dangerous_dog_restriction",
        "waste_handling_required",
      ]),
    );
  });

  it("excludes Songdo from strict automatic results", () => {
    const analysis = evaluateCanonicalPetConditions({
      assessment: songdoAssessment(),
      petProfile: petProfile(),
      sizeCompatibility: "compatible",
    });

    expect(
      applyCanonicalPetConditionPolicy({
        analysis,
        flow: "automatic_recommendation",
        includeVerificationRequired: false,
        acknowledged: false,
      }),
    ).toMatchObject({
      decision: "reject",
      reasonCodes: ["unacknowledged_confirmation_required"],
    });
  });

  it("allows Songdo only as confirmation_required after automatic opt-in", () => {
    const analysis = evaluateCanonicalPetConditions({
      assessment: songdoAssessment(),
      petProfile: petProfile(),
      sizeCompatibility: "compatible",
    });
    const pending = applyCanonicalPetConditionPolicy({
      analysis,
      flow: "automatic_recommendation",
      includeVerificationRequired: true,
      acknowledged: false,
    });

    expect(pending).toMatchObject({
      decision: "confirmation_required",
      routeStatus: "confirmation_required",
    });
    expect(pending.conditionEligibility.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "dangerous_dog_restriction" }),
        expect.objectContaining({ code: "waste_handling_required" }),
      ]),
    );
    expect(pending.conditionEligibility.evidenceSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: "detailPetTour2",
        status: "available",
      }),
    ]));

    expect(
      applyCanonicalPetConditionPolicy({
        analysis,
        flow: "route_option_validation",
        includeVerificationRequired: true,
        acknowledged: true,
      }),
    ).toMatchObject({ decision: "allow", routeStatus: "ready" });
  });

  it("rejects a Songdo profile that explicitly conflicts with a condition", () => {
    const analysis = evaluateCanonicalPetConditions({
      assessment: songdoAssessment(),
      petProfile: petProfile({ hasMuzzle: false }),
      sizeCompatibility: "compatible",
    });

    expect(analysis).toMatchObject({ state: "ineligible" });
    expect(analysis.conflictingConditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "muzzle_required" }),
      ]),
    );
    expect(
      applyCanonicalPetConditionPolicy({
        analysis,
        flow: "user_selected",
        includeVerificationRequired: true,
        acknowledged: true,
      }),
    ).toMatchObject({ decision: "reject" });
  });

  it("preserves a non-conflicting selected Songdo place until acknowledgement", () => {
    const analysis = evaluateCanonicalPetConditions({
      assessment: songdoAssessment(),
      petProfile: petProfile(),
      sizeCompatibility: "compatible",
    });

    expect(
      applyCanonicalPetConditionPolicy({
        analysis,
        flow: "user_selected",
        includeVerificationRequired: false,
        acknowledged: false,
      }),
    ).toMatchObject({
      decision: "confirmation_required",
      preservesUserSelection: true,
    });
    expect(
      applyCanonicalPetConditionPolicy({
        analysis,
        flow: "user_selected",
        includeVerificationRequired: false,
        acknowledged: true,
      }),
    ).toMatchObject({ decision: "allow", routeStatus: "ready" });
  });

  it("keeps unknown evidence distinct and out of automatic routes", () => {
    const assessment = songdoAssessment();
    assessment.verdict = "unknown";
    assessment.evaluationState = "insufficient_evidence";
    assessment.conditions = [];
    assessment.evidence = [];
    assessment.sources = assessment.sources.map((source) => ({
      ...source,
      status: "empty" as const,
    }));
    const analysis = evaluateCanonicalPetConditions({
      assessment,
      petProfile: petProfile(),
      sizeCompatibility: "unknown",
    });

    expect(analysis.state).toBe("insufficient_evidence");
    expect(
      applyCanonicalPetConditionPolicy({
        analysis,
        flow: "automatic_fill",
        includeVerificationRequired: true,
        acknowledged: false,
      }),
    ).toMatchObject({ decision: "reject" });
  });

  it("never labels an unacknowledged Songdo option as an ordinary ready route", () => {
    const analysis = evaluateCanonicalPetConditions({
      assessment: songdoAssessment(),
      petProfile: petProfile(),
      sizeCompatibility: "compatible",
    });
    for (const flow of [
      "automatic_fill",
      "automatic_recommendation",
      "route_option_validation",
      "revalidation",
    ] as const) {
      const result = applyCanonicalPetConditionPolicy({
        analysis,
        flow,
        includeVerificationRequired: true,
        acknowledged: false,
      });
      expect(result.routeStatus).not.toBe("ready");
    }
  });
});
