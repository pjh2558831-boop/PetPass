import { describe, expect, it } from "vitest";
import {
  buildCandidateFunnelDiagnostics,
  type CandidateFunnelRecord,
} from "@/lib/recommendation/v2/candidate-funnel";
import { calculateDiversityCapacityV2 } from "@/lib/recommendation/v2/diversity-capacity";

function record(
  identity: string,
  overrides: Partial<CandidateFunnelRecord> = {},
): CandidateFunnelRecord {
  return {
    identity,
    dataset: "core",
    evidenceMode: "detailed",
    active: true,
    regionId: "busan",
    districtCode: "350",
    category: "attraction",
    petEvidenceState: "verified",
    canonicalConditionState: "eligible",
    operatingHoursState: "verified",
    ...overrides,
  };
}

describe("reconciled recommendation candidate funnel", () => {
  it("reconciles every stage and keeps Core, Shopping, list-only, and rejection counts distinct", () => {
    const records = [
      record("tour:1"),
      record("tour:2", { category: "food" }),
      record("tour:3", {
        petEvidenceState: "unknown",
        canonicalConditionState: "insufficient_evidence",
        operatingHoursState: "verification_required",
      }),
      record("tour:4", { districtCode: "710" }),
      record("tour:5", { active: false }),
      record("tour:1"),
      record("tour:6", { regionId: "jeju" }),
      record("tour:7", {
        dataset: "shopping",
        evidenceMode: "list_only",
        category: "shopping",
        petEvidenceState: "unknown",
        canonicalConditionState: "insufficient_evidence",
        operatingHoursState: "verification_required",
      }),
      record("tour:8", {
        dataset: "shopping",
        evidenceMode: "list_only",
        category: "shopping",
        petEvidenceState: "unknown",
        canonicalConditionState: "insufficient_evidence",
        operatingHoursState: "verification_required",
      }),
    ];

    const result = buildCandidateFunnelDiagnostics({
      records,
      requestedRegionId: "busan",
      requestedDistrictCode: "350",
      selectedCategories: ["attraction", "food"],
      dateTimeFeasibleIds: new Set(["tour:1", "tour:2"]),
      departureDistanceFeasibleIds: new Set(["tour:1"]),
      matrixFeasibleIds: new Set(["tour:1"]),
      optimizerInputIds: new Set(["tour:1"]),
    });

    expect(result.catalog).toEqual({
      publishedRegionalCatalog: 9,
      core: 7,
      shopping: 2,
      detailedEvidence: 7,
      listOnly: 2,
    });
    expect(result.stages).toEqual({
      activeRecords: 8,
      stableIdentityUnique: 7,
      requestedRegion: 6,
      requestedDistrict: 5,
      supportedCategories: 3,
      petEvidenceEligible: 2,
      canonicalConditionEligible: 2,
      operatingHoursEligible: 2,
      dateTimeFeasible: 2,
      departureDistanceFeasible: 1,
      matrixFeasible: 1,
      optimizerInput: 1,
    });
    expect(result.rejectedByReason).toEqual({
      inactive_or_unpublished: 1,
      duplicate_stable_identity: 1,
      cross_region: 1,
      district_mismatch: 1,
      unsupported_or_unrequested_category: 2,
      pet_evidence_not_eligible: 1,
      departure_or_distance_infeasible: 1,
    });
    expect(
      Object.values(result.rejectedByReason).reduce((sum, count) => sum + count, 0),
    ).toBe(result.catalog.publishedRegionalCatalog - result.stages.optimizerInput);
  });

  it("never promotes unknown or list-only evidence merely to increase the pool", () => {
    const unsafe = record("tour:shopping", {
      dataset: "shopping",
      evidenceMode: "list_only",
      category: "attraction",
      petEvidenceState: "unknown",
      canonicalConditionState: "insufficient_evidence",
      operatingHoursState: "verified",
    });
    const result = buildCandidateFunnelDiagnostics({
      records: [unsafe],
      requestedRegionId: "busan",
      requestedDistrictCode: null,
      selectedCategories: ["attraction"],
      dateTimeFeasibleIds: new Set([unsafe.identity]),
      departureDistanceFeasibleIds: new Set([unsafe.identity]),
      matrixFeasibleIds: new Set([unsafe.identity]),
      optimizerInputIds: new Set([unsafe.identity]),
    });

    expect(result.stages.petEvidenceEligible).toBe(0);
    expect(result.stages.optimizerInput).toBe(0);
    expect(result.rejectedByReason).toEqual({ pet_evidence_not_eligible: 1 });
  });
});

describe("request-specific diversity capacity", () => {
  const candidates = [
    { id: "tour:1", category: "attraction" as const },
    { id: "tour:2", category: "food" as const },
    { id: "tour:3", category: "attraction" as const },
    { id: "tour:4", category: "food" as const },
    { id: "tour:5", category: "leisure" as const },
    { id: "tour:unsafe", category: "attraction" as const },
  ];

  it("reports sufficient capacity when all replaceable stops can be novel and feasible", () => {
    expect(calculateDiversityCapacityV2({
      candidates,
      requestedStopCount: 3,
      mandatorySelectedPlaceIds: [],
      seenCandidateIds: ["tour:1"],
      requiredCategories: ["attraction", "food"],
      feasibleCandidateIds: ["tour:1", "tour:2", "tour:3", "tour:4", "tour:5"],
      requiredRoadEdgesResolved: true,
    })).toMatchObject({
      eligibleUniqueCandidateCount: 5,
      requestedStopCount: 3,
      unseenEligibleCandidateCount: 4,
      maximumFeasibleNovelReplacements: 3,
      diversityCapacity: "sufficient",
    });
  });

  it("reports limited capacity after mandatory selections and category feasibility", () => {
    expect(calculateDiversityCapacityV2({
      candidates,
      requestedStopCount: 4,
      mandatorySelectedPlaceIds: ["tour:1", "tour:2"],
      seenCandidateIds: ["tour:1", "tour:2", "tour:3", "tour:4"],
      requiredCategories: ["attraction", "food"],
      feasibleCandidateIds: ["tour:1", "tour:2", "tour:3", "tour:4", "tour:5"],
      requiredRoadEdgesResolved: true,
    })).toMatchObject({
      unseenEligibleCandidateCount: 1,
      maximumFeasibleNovelReplacements: 1,
      diversityCapacity: "limited",
    });
  });

  it("reports exhausted when no unseen matrix-feasible candidate remains", () => {
    expect(calculateDiversityCapacityV2({
      candidates,
      requestedStopCount: 3,
      mandatorySelectedPlaceIds: ["tour:1"],
      seenCandidateIds: ["tour:1", "tour:2", "tour:3"],
      requiredCategories: ["attraction", "leisure"],
      feasibleCandidateIds: ["tour:1", "tour:2", "tour:3"],
      requiredRoadEdgesResolved: false,
      feasibilityReasonCodes: ["operating_hours_limit_stop_count"],
    })).toMatchObject({
      unseenEligibleCandidateCount: 0,
      maximumFeasibleNovelReplacements: 0,
      diversityCapacity: "exhausted",
      limitingReasonCodes: [
        "operating_hours_limit_stop_count",
        "required_category_has_no_feasible_candidate",
        "required_road_edges_unresolved",
        "unseen_eligible_candidates_below_replaceable_stops",
      ],
    });
  });
});
