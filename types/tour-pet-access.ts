import type { TourOperationName } from "@/types/place";

export const TOUR_PET_ACCESS_VERDICTS = [
  "allowed",
  "conditional",
  "not_allowed",
  "unknown",
] as const;

export type TourPetAccessVerdict = (typeof TOUR_PET_ACCESS_VERDICTS)[number];

export const TOUR_PET_ACCESS_EVALUATION_STATES = [
  "complete",
  "partial",
  "insufficient_evidence",
  "unavailable",
  "not_applicable",
] as const;

export type TourPetAccessEvaluationState =
  (typeof TOUR_PET_ACCESS_EVALUATION_STATES)[number];

export type TourPetAccessConfidence = "high" | "medium" | "low";

export type TourPetAccessScope =
  | "whole_place"
  | "indoor"
  | "outdoor"
  | "terrace"
  | "guest_room"
  | "selected_room"
  | "common_area"
  | "restaurant"
  | "cafe"
  | "lobby"
  | "designated_area"
  | "transport"
  | "unknown";

export type TourPetAccessAssertion =
  | "allows"
  | "denies"
  | "limits"
  | "inquiry_only"
  | "unknown";

export type TourPetAccessConditionType =
  | "size_limit"
  | "weight_limit"
  | "breed_limit"
  | "dangerous_dog_limit"
  | "pet_count_limit"
  | "leash_required"
  | "harness_required"
  | "muzzle_required"
  | "carrier_required"
  | "stroller_required"
  | "vaccination_required"
  | "document_required"
  | "reservation_required"
  | "advance_inquiry_required"
  | "fee_required"
  | "deposit_required"
  | "designated_area_only"
  | "outdoor_only"
  | "indoor_restricted"
  | "selected_room_only"
  | "facility_restriction"
  | "time_restriction"
  | "owner_supervision"
  | "sanitation_requirement"
  | "assistance_animal_exception"
  | "other";

export type TourPetAccessReasonCode =
  | "explicit_allowance"
  | "explicit_denial"
  | "material_condition"
  | "limited_scope"
  | "same_scope_conflict"
  | "inquiry_only"
  | "no_meaningful_evidence"
  | "primary_source_unavailable"
  | "secondary_fallback_used"
  | "unsupported_record"
  | "unknown_structured_code";

export interface TourPetAccessStructuredValue {
  value: number;
  unit: "kg" | "pets" | "krw";
  comparator: "maximum" | "minimum" | "exact";
}

export interface TourPetAccessEvidence {
  id: string;
  operation: Extract<TourOperationName, "detailPetTour2" | "detailIntro2">;
  field: string;
  fieldLabel: string;
  originalText: string;
  assertion: TourPetAccessAssertion;
  scope: TourPetAccessScope;
  priority: 1 | 2 | 3 | 4;
  providerModifiedTime: string | null;
}

export interface TourPetAccessCondition {
  type: TourPetAccessConditionType;
  scope: TourPetAccessScope;
  label: string;
  sourceText: string;
  evidenceIds: string[];
  structuredValue?: TourPetAccessStructuredValue;
  manualConfirmationRecommended: boolean;
}

export interface TourPetAccessConflict {
  id: string;
  scope: TourPetAccessScope;
  evidenceIds: string[];
  summary: string;
}

export interface TourPetAccessVerificationItem {
  code:
    | "confirm_current_policy"
    | "confirm_conflicting_policy"
    | "confirm_unknown_provider_code"
    | "confirm_missing_source";
  label: string;
  evidenceIds: string[];
}

export interface TourPetAccessSourceState {
  operation: Extract<TourOperationName, "detailPetTour2" | "detailIntro2">;
  status: "available" | "empty" | "unavailable";
  retrievedAt: string;
  providerModifiedTime: string | null;
}

export interface TourPetAccessAssessment {
  rulesetVersion: "1";
  verdict: TourPetAccessVerdict;
  evaluationState: TourPetAccessEvaluationState;
  confidence: TourPetAccessConfidence;
  reasonCodes: TourPetAccessReasonCode[];
  summary: string;
  permittedScopes: TourPetAccessScope[];
  restrictedScopes: TourPetAccessScope[];
  conditions: TourPetAccessCondition[];
  evidence: TourPetAccessEvidence[];
  conflicts: TourPetAccessConflict[];
  verificationItems: TourPetAccessVerificationItem[];
  evaluatedAt: string;
  providerModifiedTime: string | null;
  sources: TourPetAccessSourceState[];
  warnings: string[];
}

export type TourPetAccessSemanticAssessment = Omit<
  TourPetAccessAssessment,
  "evaluatedAt"
>;
