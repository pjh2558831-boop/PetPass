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
  hasGuidance?: boolean;
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
  observations?: {
    detailedBySource: { kto: number; kakao: number };
    conditions: { guidance: number; material: number; incompatible: number; unknown: number };
    uniqueRejectedIds: number;
    rejectionReasonOccurrences: number;
    calendarDateSelected: boolean;
  };
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
  planningPolicy?: "full_public_catalog_v1";
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
  completionFirst?: boolean;
  calendarDateSelected?: boolean;
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
      input.planningPolicy === "full_public_catalog_v1" || input.requestedDistrictCode === null ||
      districtCode === input.requestedDistrictCode,
    rejectedByReason,
    "district_mismatch",
  );
  const categories = filterStage(
    district,
    ({ category }) =>
      input.planningPolicy === "full_public_catalog_v1" || (category !== "unsupported" && selectedCategories.has(category)),
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
      input.planningPolicy === "full_public_catalog_v1" || petEvidenceState === "verified" || petEvidenceState === "conditional",
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
      input.planningPolicy === "full_public_catalog_v1" || canonicalConditionState === "eligible" ||
      (input.completionFirst === true && canonicalConditionState === "eligible_with_confirmation") ||
      (input.includeVerificationRequired === true &&
        canonicalConditionState === "eligible_with_confirmation" &&
        acknowledged.has(identity)),
    rejectedByReason,
    "canonical_condition_not_eligible",
  );
  const hoursEligible = filterStage(
    conditionEligible,
    ({ operatingHoursState }) =>
      input.planningPolicy === "full_public_catalog_v1" || operatingHoursState === "verified" ||
      (input.completionFirst === true && operatingHoursState === "verification_required") ||
      (input.includeVerificationRequired === true &&
        operatingHoursState === "verification_required"),
    rejectedByReason,
    "operating_hours_not_eligible",
  );
  const routeReasons = input.planningPolicy === "full_public_catalog_v1" ? {} : rejectedByReason;
  const matrixEvaluated = filterStage(
    hoursEligible,
    ({ identity }) => !input.matrixEvaluatedIds || input.matrixEvaluatedIds.has(identity),
    routeReasons,
    "matrix_evaluation_limit",
  );
  const dateTime = filterStage(
    matrixEvaluated,
    ({ identity }) => input.dateTimeFeasibleIds.has(identity),
    routeReasons,
    "date_or_time_infeasible",
  );
  const departureDistance = filterStage(
    dateTime,
    ({ identity }) => input.departureDistanceFeasibleIds.has(identity),
    routeReasons,
    "departure_or_distance_infeasible",
  );
  const matrix = filterStage(
    departureDistance,
    ({ identity }) => input.matrixFeasibleIds.has(identity),
    routeReasons,
    "travel_matrix_infeasible",
  );
  const optimizer = filterStage(
    matrix,
    ({ identity }) => input.optimizerInputIds.has(identity),
    routeReasons,
    "optimizer_input_limit",
  );

  const rejectedTotal = Object.values(rejectedByReason).reduce(
    (sum, count) => sum + count,
    0,
  );
  const deferred = input.planningPolicy === "full_public_catalog_v1" ? hoursEligible.length - optimizer.length : 0;
  if (rejectedTotal + optimizer.length + deferred !== input.records.length) {
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
    observations: {
      detailedBySource: { kto: unique.filter(record => record.identity.startsWith("tour:") && record.evidenceMode === "detailed").length, kakao: unique.filter(record => record.identity.startsWith("kakao:") && record.evidenceMode === "detailed").length },
      conditions: { guidance: unique.filter(record => record.hasGuidance).length, material: unique.filter(record => record.canonicalConditionState === "eligible_with_confirmation").length, incompatible: unique.filter(record => record.canonicalConditionState === "ineligible").length, unknown: unique.filter(record => record.canonicalConditionState === "insufficient_evidence").length },
      uniqueRejectedIds: new Set(input.records.filter(record => !(input.planningPolicy === "full_public_catalog_v1" ? hoursEligible : optimizer).some(value => value.identity === record.identity)).map(record => record.identity)).size,
      rejectionReasonOccurrences: rejectedTotal,
      calendarDateSelected: input.calendarDateSelected ?? true,
    },
  };
}
