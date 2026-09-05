import type { TourPetAccessConditionType, TourPetAccessScope } from "@/types/tour-pet-access";

export const PET_CONDITION_ELIGIBILITY_STATES = [
  "eligible",
  "eligible_with_confirmation",
  "ineligible",
  "insufficient_evidence",
] as const;

export type PetConditionEligibilityState =
  (typeof PET_CONDITION_ELIGIBILITY_STATES)[number];

export type CanonicalPetConditionCode =
  | "leash_required"
  | "carrier_required"
  | "muzzle_required"
  | "dangerous_dog_restriction"
  | "breed_restriction"
  | "size_restriction"
  | "weight_restriction"
  | "pet_count_restriction"
  | "outdoor_only"
  | "reservation_required"
  | "phone_confirmation_required"
  | "waste_handling_required"
  | "vaccination_required"
  | "identification_required"
  | "designated_area_only"
  | "selected_room_only"
  | "owner_supervision_required"
  | "fee_or_deposit_required"
  | "operator_confirmation_required";

export interface CanonicalPetConditionItem {
  subject?: "all" | "dangerous_dog" | "unknown";
  code: CanonicalPetConditionCode;
  sourceType: TourPetAccessConditionType | "assessment_conflict" | "verification_item";
  label: string;
  sourceText: string;
  scope: TourPetAccessScope;
  evidenceIds: string[];
}

export interface CanonicalPetConditionWarning {
  code: CanonicalPetConditionCode | "insufficient_pet_evidence" | "pet_access_not_allowed";
  message: string;
  sourceText: string | null;
  evidenceIds: string[];
}

export interface CanonicalPetConditionEvidenceSource {
  operation: "detailPetTour2" | "detailIntro2";
  status: "available" | "empty" | "unavailable";
  retrievedAt: string;
  providerModifiedTime: string | null;
}

export type CanonicalPetConditionReasonCode =
  | "pet_access_not_allowed"
  | "pet_profile_conflict"
  | "pet_size_incompatible"
  | "unsupported_mandatory_condition"
  | "manual_confirmation_required"
  | "insufficient_pet_evidence";

export interface CanonicalPetConditionEligibility {
  version: "canonical-pet-condition-v1" | "canonical-pet-condition-v2";
  state: PetConditionEligibilityState;
  conditionCodes: CanonicalPetConditionCode[];
  satisfiedConditions: CanonicalPetConditionItem[];
  guidanceConditions?: CanonicalPetConditionItem[];
  conflictingConditions: CanonicalPetConditionItem[];
  confirmationRequiredConditions: CanonicalPetConditionItem[];
  unsupportedConditions: CanonicalPetConditionItem[];
  evidenceSources: CanonicalPetConditionEvidenceSource[];
  warnings: CanonicalPetConditionWarning[];
  reasonCodes: CanonicalPetConditionReasonCode[];
}

export type CanonicalPetConditionFlow =
  | "user_selected"
  | "automatic_fill"
  | "automatic_recommendation"
  | "route_option_validation"
  | "revalidation";

export type CanonicalPetConditionPolicyReasonCode =
  | "pet_access_not_allowed"
  | "pet_profile_conflict"
  | "insufficient_pet_evidence"
  | "unacknowledged_confirmation_required";

export interface CanonicalPetConditionPolicyResult {
  decision: "allow" | "confirmation_required" | "reject";
  routeStatus: "ready" | "confirmation_required" | "ineligible";
  preservesUserSelection: boolean;
  reasonCodes: CanonicalPetConditionPolicyReasonCode[];
  conditionEligibility: CanonicalPetConditionEligibility;
}
