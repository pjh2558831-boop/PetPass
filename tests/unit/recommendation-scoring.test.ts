import { describe, expect, it } from "vitest";
import { computePlaceTrust } from "@/lib/trust/calculator";
import { calculatePopularityV1 } from "@/lib/recommendation/popularity/popularity-calculator";
import { scorePlaceUtilityV1 } from "@/lib/recommendation/scoring/place-utility";
import { scoreRetrievalCandidateV1 } from "@/lib/recommendation/scoring/retrieval-score";
import type { AutomaticRouteEligibilityResult } from "@/types/route-eligibility";

const ELIGIBLE: AutomaticRouteEligibilityResult = {
  eligible: true,
  status: "eligible",
  reasonCodes: [],
  warnings: [],
  evidenceFieldNames: ["etcAcmpyInfo"],
};

const INELIGIBLE: AutomaticRouteEligibilityResult = {
  eligible: false,
  status: "verification_required",
  reasonCodes: ["mandatory_condition_verification_required"],
  warnings: [],
  evidenceFieldNames: ["etcAcmpyInfo"],
};

function trust(scoreNow = "2026-08-12T00:00:00.000Z") {
  return computePlaceTrust({
    computedAt: scoreNow,
    hasAnySource: true,
    tourism: {
      hasPetSpecificEvidence: true,
      retrievedAt: scoreNow,
    },
  });
}

describe("retrieval-score-v1", () => {
  it("uses the exact versioned weights with stable half-up integer rounding", () => {
    expect(
      scoreRetrievalCandidateV1({
        preferenceFit: 1,
        proximity: 0.5,
        categoryCoverageNeed: 0.25,
        listDataQuality: 0.75,
        popularityPrior: 0.5,
      }),
    ).toEqual({
      version: "retrieval-score-v1",
      total: 675,
      preferenceFit: 1,
      proximity: 0.5,
      categoryCoverageNeed: 0.25,
      listDataQuality: 0.75,
      popularityPrior: 0.5,
      weightedContributions: {
        preferenceFit: 0.4,
        proximity: 0.125,
        categoryCoverageNeed: 0.05,
        listDataQuality: 0.07500000000000001,
        popularityPrior: 0.025,
      },
    });
    expect(
      scoreRetrievalCandidateV1({
        preferenceFit: 1,
        proximity: 1,
        categoryCoverageNeed: 1,
        listDataQuality: 1,
        popularityPrior: 1,
      }).total,
    ).toBe(1_000);
  });

  it.each([
    ["preferenceFit", -0.01],
    ["proximity", 1.01],
    ["categoryCoverageNeed", Number.NaN],
    ["listDataQuality", Number.POSITIVE_INFINITY],
    ["popularityPrior", -1],
  ] as const)("rejects an invalid normalized %s component", (field, value) => {
    expect(() =>
      scoreRetrievalCandidateV1({
        preferenceFit: 0.5,
        proximity: 0.5,
        categoryCoverageNeed: 0.5,
        listDataQuality: 0.5,
        popularityPrior: 0.5,
        [field]: value,
      }),
    ).toThrow(RangeError);
  });
});

describe("place-utility-v1", () => {
  it("reuses canonical trust, applies exact weights, and apportions integer contributions", () => {
    const informationTrust = trust();
    expect(informationTrust.score).toBe(60);
    const result = scorePlaceUtilityV1({
      eligibility: ELIGIBLE,
      petAccessAssessment: { verdict: "allowed", evaluationState: "complete" },
      informationTrust,
      popularity: {
        score: 0.5,
        status: "insufficient_data",
        qualityComponent: 0,
        trendComponent: 0,
        sampleWeight: 0,
        version: "popularity-v1",
      },
      preferenceFit: 1,
      categoryPriority: 0.5,
      dataQuality: 0.75,
    });
    expect(result).toMatchObject({
      version: "place-utility-v1",
      total: 810,
      preferenceFit: 1,
      petCompatibility: 1,
      informationTrust: 0.6,
      popularity: 0.5,
      categoryPriority: 0.5,
      dataQuality: 0.75,
      weightedContributions: {
        preferenceFit: 300,
        petCompatibility: 250,
        informationTrust: 90,
        popularity: 60,
        categoryPriority: 50,
        dataQuality: 60,
      },
    });
    expect(result?.warningCodes).toContain("popularity_insufficient_data");
    expect(result?.reasonCodes).toContain("canonical_information_trust_used");
  });

  it("uses 0.85 only for a strict eligible compatible conditional result", () => {
    const result = scorePlaceUtilityV1({
      eligibility: ELIGIBLE,
      petAccessAssessment: {
        verdict: "conditional",
        evaluationState: "complete",
      },
      informationTrust: trust(),
      popularity: calculatePopularityV1({
        events: [],
        asOf: "2026-08-12T00:00:00.000Z",
      }),
      preferenceFit: 0,
      categoryPriority: 0,
      dataQuality: 0,
    });
    expect(result?.petCompatibility).toBe(0.85);
    expect(result?.weightedContributions.petCompatibility).toBe(213);
  });

  it("returns null before scoring any state outside canonical strict eligibility", () => {
    expect(
      scorePlaceUtilityV1({
        eligibility: INELIGIBLE,
        petAccessAssessment: {
          verdict: "conditional",
          evaluationState: "complete",
        },
        informationTrust: trust(),
        popularity: calculatePopularityV1({
          events: [],
          asOf: "2026-08-12T00:00:00.000Z",
        }),
        preferenceFit: 2,
        categoryPriority: 2,
        dataQuality: 2,
      }),
    ).toBeNull();
  });

  it("rejects noncanonical trust", () => {
    expect(() =>
      scorePlaceUtilityV1({
        eligibility: ELIGIBLE,
        petAccessAssessment: { verdict: "allowed", evaluationState: "complete" },
        informationTrust: { ...trust(), ruleVersion: "other-trust" },
        popularity: calculatePopularityV1({
          events: [],
          asOf: "2026-08-12T00:00:00.000Z",
        }),
        preferenceFit: 1,
        categoryPriority: 1,
        dataQuality: 1,
      }),
    ).toThrow(RangeError);
  });

  it.each([
    ["preferenceFit", -0.001],
    ["categoryPriority", 1.001],
    ["dataQuality", Number.NaN],
  ] as const)("rejects an invalid normalized %s component", (field, value) => {
    expect(() =>
      scorePlaceUtilityV1({
        eligibility: ELIGIBLE,
        petAccessAssessment: { verdict: "allowed", evaluationState: "complete" },
        informationTrust: trust(),
        popularity: calculatePopularityV1({
          events: [],
          asOf: "2026-08-12T00:00:00.000Z",
        }),
        preferenceFit: 1,
        categoryPriority: 1,
        dataQuality: 1,
        [field]: value,
      }),
    ).toThrow(RangeError);
  });

  it("rejects out-of-range canonical trust and popularity scores", () => {
    expect(() =>
      scorePlaceUtilityV1({
        eligibility: ELIGIBLE,
        petAccessAssessment: { verdict: "allowed", evaluationState: "complete" },
        informationTrust: { ...trust(), score: 101 },
        popularity: calculatePopularityV1({
          events: [],
          asOf: "2026-08-12T00:00:00.000Z",
        }),
        preferenceFit: 1,
        categoryPriority: 1,
        dataQuality: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      scorePlaceUtilityV1({
        eligibility: ELIGIBLE,
        petAccessAssessment: { verdict: "allowed", evaluationState: "complete" },
        informationTrust: trust(),
        popularity: {
          score: 1.001,
          status: "sufficient_data",
          qualityComponent: 1,
          trendComponent: 1,
          sampleWeight: 20,
          version: "popularity-v1",
        },
        preferenceFit: 1,
        categoryPriority: 1,
        dataQuality: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      scorePlaceUtilityV1({
        eligibility: ELIGIBLE,
        petAccessAssessment: { verdict: "allowed", evaluationState: "complete" },
        informationTrust: trust(),
        popularity: {
          score: -0.001,
          status: "insufficient_data",
          qualityComponent: 0,
          trendComponent: 0,
          sampleWeight: 0,
          version: "popularity-v1",
        },
        preferenceFit: 1,
        categoryPriority: 1,
        dataQuality: 1,
      }),
    ).toThrow(RangeError);
  });

  it("does not penalize partial-but-meaningful pet detail independently of data quality", () => {
    const result = scorePlaceUtilityV1({
      eligibility: ELIGIBLE,
      petAccessAssessment: { verdict: "allowed", evaluationState: "complete" },
      informationTrust: trust(),
      popularity: calculatePopularityV1({
        events: [],
        asOf: "2026-08-12T00:00:00.000Z",
      }),
      preferenceFit: 1,
      categoryPriority: 1,
      dataQuality: 1,
      reasonCodes: ["partial_pet_detail_meaningful"],
    });
    expect(result?.dataQuality).toBe(1);
    expect(result?.reasonCodes).toContain("partial_pet_detail_meaningful");
  });
});
