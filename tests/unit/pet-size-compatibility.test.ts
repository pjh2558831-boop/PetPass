import { describe, expect, it } from "vitest";
import { assessPetSizeCompatibility } from "@/lib/pet-access/tourism/size-compatibility";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";

function assessment(
  sourceText: string | null,
  conditionType: "size_limit" | "weight_limit" | null = "size_limit",
): TourPetAccessSemanticAssessment {
  const evidence = sourceText
    ? [
        {
          id: "evidence-1",
          operation: "detailPetTour2" as const,
          field: "acmpyPsblCpam",
          fieldLabel: "동반 가능 동물",
          originalText: sourceText,
          assertion: "limits" as const,
          scope: "whole_place" as const,
          priority: 2 as const,
          providerModifiedTime: "20260805000000",
        },
      ]
    : [];
  const conditions = sourceText && conditionType
    ? [
        {
          type: conditionType,
          scope: "whole_place" as const,
          label: conditionType === "weight_limit" ? "무게 제한" : "크기 제한",
          sourceText,
          evidenceIds: ["evidence-1"],
          ...(conditionType === "weight_limit"
            ? {
                structuredValue: {
                  value: 10,
                  unit: "kg" as const,
                  comparator: "maximum" as const,
                },
              }
            : {}),
          manualConfirmationRecommended: conditionType === "weight_limit",
        },
      ]
    : [];

  return {
    rulesetVersion: "1",
    verdict: sourceText ? "conditional" : "allowed",
    evaluationState: "complete",
    confidence: "high",
    reasonCodes: sourceText ? ["material_condition"] : ["explicit_allowance"],
    summary: "테스트 판정",
    permittedScopes: ["whole_place"],
    restrictedScopes: [],
    conditions,
    evidence,
    conflicts: [],
    verificationItems: [],
    providerModifiedTime: "20260805000000",
    sources: [
      {
        operation: "detailPetTour2",
        status: "available",
        retrievedAt: "2026-08-05T00:00:00.000Z",
        providerModifiedTime: "20260805000000",
      },
    ],
    warnings: [],
  };
}

describe("pet-size compatibility", () => {
  it("keeps the base pet-access verdict unchanged", () => {
    const base = assessment("소형견만 가능");
    const snapshot = JSON.stringify(base);
    assessPetSizeCompatibility(base, "LARGE");
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(base.verdict).toBe("conditional");
  });

  it("marks explicit unrestricted size evidence compatible", () => {
    const base = assessment("반려동물 동반 가능, 크기 제한 없음", null);
    expect(assessPetSizeCompatibility(base, "LARGE")).toMatchObject({
      state: "compatible",
      reason: "explicit_all_sizes",
      evidenceIds: ["evidence-1"],
    });
  });

  it("supports a small-only rule without inventing weight thresholds", () => {
    const base = assessment("반려동물 동반 가능, 소형견만 가능");
    expect(assessPetSizeCompatibility(base, "SMALL").state).toBe("compatible");
    expect(assessPetSizeCompatibility(base, "MEDIUM").state).toBe("incompatible");
    expect(assessPetSizeCompatibility(base, "LARGE").state).toBe("incompatible");
  });

  it("does not infer permission for another size from a named-size denial", () => {
    const base = assessment("반려동물 동반 가능, 대형견 동반 불가");
    expect(assessPetSizeCompatibility(base, "LARGE").state).toBe("incompatible");
    expect(assessPetSizeCompatibility(base, "SMALL").state).toBe(
      "verification_required",
    );
    expect(assessPetSizeCompatibility(base, "MEDIUM").state).toBe(
      "verification_required",
    );
  });

  it("requires exact verification for kg limits for every coarse size", () => {
    const base = assessment("반려동물 동반 가능, 10kg 이하", "weight_limit");
    for (const size of ["SMALL", "MEDIUM", "LARGE"] as const) {
      expect(assessPetSizeCompatibility(base, size)).toMatchObject({
        state: "verification_required",
        reason: "exact_weight_required",
      });
    }
  });

  it("keeps vague restrictions reviewable and missing size wording unspecified", () => {
    expect(
      assessPetSizeCompatibility(assessment("반려동물 크기 제한 있음"), "MEDIUM")
        .state,
    ).toBe("verification_required");
    expect(assessPetSizeCompatibility(assessment(null, null), "MEDIUM").state)
      .toBe("not_specified");
  });
});
