import type { UsefulTourCategory } from "@/lib/recommendation/types";
import type { PetConditionEligibilityState } from "@/types/pet-condition-eligibility";
import type { RegionId } from "@/types/region";

export const CANDIDATE_FUNNEL_VERSION = "candidate-funnel-v1" as const;

export interface CandidateFunnelRecord {
  identity: string;
  dataset: "core" | "shopping";
  evidenceMode: "detailed" | "list_only";
  active: boolean;
  regionId: RegionId | null;
  districtCode: string | null;
  category: UsefulTourCategory | "unsupported";
  petEvidenceState: "verified" | "conditional" | "unknown" | "not_allowed";
  canonicalConditionState: PetConditionEligibilityState;
  operatingHoursState: "verified" | "verification_required" | "conflict";
  explicitlyExcluded?: boolean;
}

export interface CandidateFunnelDiagnostics {
  version: typeof CANDIDATE_FUNNEL_VERSION;
  catalog: {
    publishedRegionalCatalog: number;
    core: number;
    shopping: number;
    detailedEvidence: number;
    listOnly: number;
  };
  petEvidence: {
    verified: number;
    conditional: number;
    unknown: number;
    notAllowed: number;
  };
  stages: {
    activeRecords: number;
    stableIdentityUnique: number;
    requestedRegion: number;
    requestedDistrict: number;
    supportedCategories: number;
    petEvidenceEligible: number;
    canonicalConditionEligible: number;
    operatingHoursEligible: number;
    dateTimeFeasible: number;
    departureDistanceFeasible: number;
    matrixFeasible: number;
    optimizerInput: number;
  };
  rejectedByReason: Record<string, number>;
}

function increment(
  target: Record<string, number>,
  reason: string,
  amount: number,
): void {
  if (amount > 0) target[reason] = amount;
}

function filterStage(
  records: readonly CandidateFunnelRecord[],
  predicate: (record: CandidateFunnelRecord) => boolean,
  rejectedByReason: Record<string, number>,
  reason: string,
): CandidateFunnelRecord[] {
  const accepted = records.filter(predicate);
  increment(rejectedByReason, reason, records.length - accepted.length);
  return accepted;
}

export function buildCandidateFunnelDiagnostics(input: {
  records: readonly CandidateFunnelRecord[];
  requestedRegionId: RegionId;
  requestedDistrictCode: string | null;
  selectedCategories: readonly UsefulTourCategory[];
  dateTimeFeasibleIds: ReadonlySet<string>;
  departureDistanceFeasibleIds: ReadonlySet<string>;
  matrixEvaluatedIds?: ReadonlySet<string>;
  matrixFeasibleIds: ReadonlySet<string>;
  optimizerInputIds: ReadonlySet<string>;
  includeVerificationRequired?: boolean;
  acknowledgedConditionIds?: ReadonlySet<string>;
}): CandidateFunnelDiagnostics {
  const rejectedByReason: Record<string, number> = {};
  const selectedCategories = new Set(input.selectedCategories);
  const acknowledged = input.acknowledgedConditionIds ?? new Set<string>();
  const catalog = {
    publishedRegionalCatalog: input.records.length,
    core: input.records.filter(({ dataset }) => dataset === "core").length,
    shopping: input.records.filter(({ dataset }) => dataset === "shopping").length,
    detailedEvidence: input.records.filter(({ evidenceMode }) => evidenceMode === "detailed").length,
    listOnly: input.records.filter(({ evidenceMode }) => evidenceMode === "list_only").length,
  };

  const active = filterStage(
    input.records,
    ({ active: value }) => value,
    rejectedByReason,
    "inactive_or_unpublished",
  );
  const unique = [...new Map(active.map((record) => [record.identity, record])).values()];
  increment(
    rejectedByReason,
    "duplicate_stable_identity",
    active.length - unique.length,
  );
  const regional = filterStage(
    unique,
    ({ regionId }) => regionId === input.requestedRegionId,
    rejectedByReason,
    "cross_region",
  );
  const district = filterStage(
    regional,
    ({ districtCode }) =>
      input.requestedDistrictCode === null ||
      districtCode === input.requestedDistrictCode,
    rejectedByReason,
    "district_mismatch",
  );
  const categories = filterStage(
    district,
    ({ category }) =>
      category !== "unsupported" && selectedCategories.has(category),
    rejectedByReason,
    "unsupported_or_unrequested_category",
  );
  const petEvidence = {
    verified: categories.filter(({ petEvidenceState }) => petEvidenceState === "verified").length,
    conditional: categories.filter(({ petEvidenceState }) => petEvidenceState === "conditional").length,
    unknown: categories.filter(({ petEvidenceState }) => petEvidenceState === "unknown").length,
    notAllowed: categories.filter(({ petEvidenceState }) => petEvidenceState === "not_allowed").length,
  };
  const petEligible = filterStage(
    categories,
    ({ petEvidenceState }) =>
      petEvidenceState === "verified" || petEvidenceState === "conditional",
    rejectedByReason,
    "pet_evidence_not_eligible",
  );
  const notExplicitlyExcluded = filterStage(
    petEligible,
    ({ explicitlyExcluded }) => explicitlyExcluded !== true,
    rejectedByReason,
    "explicit_user_exclusion",
  );
  const conditionEligible = filterStage(
    notExplicitlyExcluded,
    ({ identity, canonicalConditionState }) =>
      canonicalConditionState === "eligible" ||
      (input.includeVerificationRequired === true &&
        canonicalConditionState === "eligible_with_confirmation" &&
        acknowledged.has(identity)),
    rejectedByReason,
    "canonical_condition_not_eligible",
  );
  const hoursEligible = filterStage(
    conditionEligible,
    ({ operatingHoursState }) =>
      operatingHoursState === "verified" ||
      (input.includeVerificationRequired === true &&
        operatingHoursState === "verification_required"),
    rejectedByReason,
    "operating_hours_not_eligible",
  );
  const dateTime = filterStage(
    hoursEligible,
    ({ identity }) => input.dateTimeFeasibleIds.has(identity),
    rejectedByReason,
    "date_or_time_infeasible",
  );
  const departureDistance = filterStage(
    dateTime,
    ({ identity }) => input.departureDistanceFeasibleIds.has(identity),
    rejectedByReason,
    "departure_or_distance_infeasible",
  );
  const matrixEvaluated = filterStage(
    departureDistance,
    ({ identity }) =>
      (input.matrixEvaluatedIds ?? input.departureDistanceFeasibleIds).has(identity),
    rejectedByReason,
    "matrix_evaluation_limit",
  );
  const matrix = filterStage(
    matrixEvaluated,
    ({ identity }) => input.matrixFeasibleIds.has(identity),
    rejectedByReason,
    "travel_matrix_infeasible",
  );
  const optimizer = filterStage(
    matrix,
    ({ identity }) => input.optimizerInputIds.has(identity),
    rejectedByReason,
    "optimizer_input_limit",
  );

  const rejectedTotal = Object.values(rejectedByReason).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (rejectedTotal + optimizer.length !== input.records.length) {
    throw new TypeError("Candidate funnel counts do not reconcile.");
  }

  return {
    version: CANDIDATE_FUNNEL_VERSION,
    catalog,
    petEvidence,
    stages: {
      activeRecords: active.length,
      stableIdentityUnique: unique.length,
      requestedRegion: regional.length,
      requestedDistrict: district.length,
      supportedCategories: categories.length,
      petEvidenceEligible: petEligible.length,
      canonicalConditionEligible: conditionEligible.length,
      operatingHoursEligible: hoursEligible.length,
      dateTimeFeasible: dateTime.length,
      departureDistanceFeasible: departureDistance.length,
      matrixFeasible: matrix.length,
      optimizerInput: optimizer.length,
    },
    rejectedByReason,
  };
}
