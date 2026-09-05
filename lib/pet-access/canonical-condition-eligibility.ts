import type { PetSizeCompatibilityState } from "@/types/pet-size-compatibility";
import type {
  CanonicalPetConditionCode,
  CanonicalPetConditionEligibility,
  CanonicalPetConditionFlow,
  CanonicalPetConditionItem,
  CanonicalPetConditionPolicyResult,
} from "@/types/pet-condition-eligibility";
import type { AutomaticRoutePetProfile } from "@/types/route-eligibility";
import type {
  TourPetAccessCondition,
  TourPetAccessSemanticAssessment,
} from "@/types/tour-pet-access";

type Compatibility =
  | PetSizeCompatibilityState
  | "unknown";

type ConditionOutcome = "satisfied" | "guidance" | "conflict" | "confirmation_required";
export const CANONICAL_PET_CONDITION_VERSION = "canonical-pet-condition-v2" as const;

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function canonicalCode(
  condition: TourPetAccessCondition,
): CanonicalPetConditionCode {
  switch (condition.type) {
    case "leash_required":
      return "leash_required";
    case "carrier_required":
      return "carrier_required";
    case "muzzle_required":
      return "muzzle_required";
    case "dangerous_dog_limit":
      return "dangerous_dog_restriction";
    case "breed_limit":
      return "breed_restriction";
    case "size_limit":
      return "size_restriction";
    case "weight_limit":
      return "weight_restriction";
    case "pet_count_limit":
      return "pet_count_restriction";
    case "outdoor_only":
    case "indoor_restricted":
      return "outdoor_only";
    case "reservation_required":
      return "reservation_required";
    case "advance_inquiry_required":
      return "phone_confirmation_required";
    case "sanitation_requirement":
      return "waste_handling_required";
    case "vaccination_required":
      return "vaccination_required";
    case "document_required":
      return "identification_required";
    case "designated_area_only":
      return "designated_area_only";
    case "selected_room_only":
      return "selected_room_only";
    case "owner_supervision":
      return "owner_supervision_required";
    case "fee_required":
    case "deposit_required":
      return "fee_or_deposit_required";
    default:
      return "operator_confirmation_required";
  }
}

function conditionItem(
  condition: TourPetAccessCondition,
): CanonicalPetConditionItem {
  return {
    code: canonicalCode(condition),
    subject: condition.subject ?? (/맹견|위험견/.test(condition.sourceText) ? "dangerous_dog" : "all"),
    sourceType: condition.type,
    label: condition.label,
    sourceText: condition.sourceText,
    scope: condition.scope,
    evidenceIds: [...condition.evidenceIds],
  };
}

function expressibleOutcome(input: {
  condition: TourPetAccessCondition;
  petProfile: AutomaticRoutePetProfile;
  sizeCompatibility: Compatibility;
}): ConditionOutcome {
  const { condition, petProfile } = input;
  const subject = condition.subject ?? (/맹견|위험견/.test(condition.sourceText) ? "dangerous_dog" : "all");
  if (subject === "dangerous_dog" && petProfile.isDangerousDog === false) return "satisfied";
  const preparable = ["leash_required", "harness_required", "carrier_required", "muzzle_required", "stroller_required", "sanitation_requirement", "owner_supervision", "fee_required", "deposit_required", "designated_area_only"];
  if (preparable.includes(condition.type)) {
    if (subject !== "all" && petProfile.isDangerousDog !== true) return "guidance";
    const equipment = condition.type === "leash_required" ? petProfile.hasLeash
      : condition.type === "carrier_required" ? petProfile.hasCarrier
        : condition.type === "muzzle_required" ? petProfile.hasMuzzle : null;
    return equipment === false ? "conflict" : "guidance";
  }
  let outcome: ConditionOutcome;
  switch (condition.type) {
    case "outdoor_only":
    case "indoor_restricted":
      outcome = petProfile.acceptsOutdoorOnly === false ? "conflict" : "guidance";
      break;
    case "dangerous_dog_limit":
      outcome = /불가|금지|제한/.test(condition.sourceText)
        ? petProfile.isDangerousDog === true && /불가|금지/.test(condition.sourceText) ? "conflict" : "confirmation_required"
        : "guidance";
      break;
    case "pet_count_limit": {
      const limit = condition.structuredValue;
      if (!limit || petProfile.petCount === undefined) return "confirmation_required";
      const compatible = limit.comparator === "maximum" ? petProfile.petCount <= limit.value
        : limit.comparator === "minimum" ? petProfile.petCount >= limit.value : petProfile.petCount === limit.value;
      outcome = compatible ? "satisfied" : "conflict";
      break;
    }
    case "size_limit":
      outcome = input.sizeCompatibility === "compatible"
        ? "satisfied"
        : input.sizeCompatibility === "incompatible"
          ? "conflict"
          : "confirmation_required";
      break;
    default:
      outcome = "confirmation_required";
      break;
  }
  return condition.manualConfirmationRecommended && outcome === "satisfied"
    ? "confirmation_required"
    : outcome;
}

function syntheticItem(input: {
  sourceType: "assessment_conflict" | "verification_item";
  label: string;
  sourceText: string;
  evidenceIds: string[];
}): CanonicalPetConditionItem {
  return {
    code: "operator_confirmation_required",
    sourceType: input.sourceType,
    label: input.label,
    sourceText: input.sourceText,
    scope: "unknown",
    evidenceIds: [...input.evidenceIds],
  };
}

export function evaluateCanonicalPetConditions(input: {
  assessment: TourPetAccessSemanticAssessment;
  petProfile: AutomaticRoutePetProfile;
  sizeCompatibility: Compatibility;
  speciesCompatibility?: "compatible" | "incompatible" | "verification_required";
}): CanonicalPetConditionEligibility {
  const satisfiedConditions: CanonicalPetConditionItem[] = [];
  const guidanceConditions: CanonicalPetConditionItem[] = [];
  const conflictingConditions: CanonicalPetConditionItem[] = [];
  const confirmationRequiredConditions: CanonicalPetConditionItem[] = [];
  const unsupportedConditions: CanonicalPetConditionItem[] = [];

  for (const condition of input.assessment.conditions ?? []) {
    // Old derived records also retain the source needed to repair the scoped muzzle bug.
    if (condition.type === "dangerous_dog_limit" && /입마개/.test(condition.sourceText) && !/불가|금지/.test(condition.sourceText)) continue;
    const item = conditionItem(condition);
    const outcome = expressibleOutcome({
      condition,
      petProfile: input.petProfile,
      sizeCompatibility: input.sizeCompatibility,
    });
    if (outcome === "satisfied") {
      satisfiedConditions.push(item);
    } else if (outcome === "guidance") {
      guidanceConditions.push(item);
    } else if (outcome === "conflict") {
      conflictingConditions.push(item);
    } else {
      confirmationRequiredConditions.push(item);
      unsupportedConditions.push(item);
    }
  }

  for (const conflict of input.assessment.conflicts ?? []) {
    const item = syntheticItem({
      sourceType: "assessment_conflict",
      label: "상충하는 동반 정책 확인",
      sourceText: conflict.summary,
      evidenceIds: conflict.evidenceIds,
    });
    confirmationRequiredConditions.push(item);
    unsupportedConditions.push(item);
  }
  for (const verification of input.assessment.verificationItems ?? []) {
    const item = syntheticItem({
      sourceType: "verification_item",
      label: verification.label,
      sourceText: verification.label,
      evidenceIds: verification.evidenceIds,
    });
    confirmationRequiredConditions.push(item);
    unsupportedConditions.push(item);
  }

  if (input.speciesCompatibility === "incompatible") {
    conflictingConditions.push({
      code: "operator_confirmation_required",
      sourceType: "verification_item",
      label: "반려동물 종류가 허용 범위와 일치하지 않음",
      sourceText: "TourAPI의 동반 가능 동물 범위와 반려동물 종류가 충돌합니다.",
      scope: "whole_place",
      evidenceIds: [],
    });
  } else if (input.speciesCompatibility === "verification_required") {
    const item = syntheticItem({
      sourceType: "verification_item",
      label: "반려동물 종류 허용 여부 확인",
      sourceText: "동반 가능 동물 종류를 자동으로 판정할 수 없습니다.",
      evidenceIds: [],
    });
    confirmationRequiredConditions.push(item);
    unsupportedConditions.push(item);
  }

  const unavailableEvidence =
    (input.assessment.conditions ?? []).some(condition => !condition.sourceText?.trim()) ||
    input.assessment.verdict === "unknown" ||
    ["partial", "insufficient_evidence", "unavailable", "not_applicable"].includes(
      input.assessment.evaluationState,
    );
  const notAllowed = input.assessment.verdict === "not_allowed";
  const reasonCodes: CanonicalPetConditionEligibility["reasonCodes"] = [];
  if (notAllowed) reasonCodes.push("pet_access_not_allowed");
  if (conflictingConditions.length > 0) {
    reasonCodes.push("pet_profile_conflict");
    if (conflictingConditions.some(({ code }) => code === "size_restriction")) {
      reasonCodes.push("pet_size_incompatible");
    }
  }
  if (confirmationRequiredConditions.length > 0) {
    reasonCodes.push("manual_confirmation_required");
  }
  if (unsupportedConditions.length > 0) {
    reasonCodes.push("unsupported_mandatory_condition");
  }
  if (unavailableEvidence) reasonCodes.push("insufficient_pet_evidence");

  const state = notAllowed || conflictingConditions.length > 0
    ? "ineligible" as const
    : unavailableEvidence
      ? "insufficient_evidence" as const
      : confirmationRequiredConditions.length > 0
        ? "eligible_with_confirmation" as const
        : "eligible" as const;
  const conditionCodes = uniqueSorted([
    ...satisfiedConditions,
    ...guidanceConditions,
    ...conflictingConditions,
    ...confirmationRequiredConditions,
  ].map(({ code }) => code));
  const warnings: CanonicalPetConditionEligibility["warnings"] = [
    ...guidanceConditions.map((item) => ({ code: item.code, message: item.sourceText || item.label, sourceText: item.sourceText, evidenceIds: item.evidenceIds })),
    ...(notAllowed ? [{
      code: "pet_access_not_allowed" as const,
      message: input.assessment.summary || "반려동물 동반이 허용되지 않습니다.",
      sourceText: input.assessment.summary || null,
      evidenceIds: (input.assessment.evidence ?? []).map(({ id }) => id),
    }] : []),
    ...conflictingConditions.map((item) => ({
      code: item.code,
      message: `${item.label}: 현재 반려동물 정보와 충돌합니다.`,
      sourceText: item.sourceText,
      evidenceIds: item.evidenceIds,
    })),
    ...confirmationRequiredConditions.map((item) => ({
      code: item.code,
      message: `${item.label}: 이 장소에 필요한 사항만 확인해 주세요.`,
      sourceText: item.sourceText,
      evidenceIds: item.evidenceIds,
    })),
    ...(unavailableEvidence ? [{
      code: "insufficient_pet_evidence" as const,
      message: "현재 제공자 근거만으로 반려동물 동반 가능 여부를 자동 판정할 수 없습니다.",
      sourceText: input.assessment.summary || null,
      evidenceIds: (input.assessment.evidence ?? []).map(({ id }) => id),
    }] : []),
  ];

  return {
    version: CANONICAL_PET_CONDITION_VERSION,
    state,
    conditionCodes,
    satisfiedConditions,
    guidanceConditions,
    conflictingConditions,
    confirmationRequiredConditions,
    unsupportedConditions,
    evidenceSources: (input.assessment.sources ?? []).map((source) => ({
      ...source,
    })),
    warnings,
    reasonCodes: uniqueSorted(reasonCodes),
  };
}

export function insufficientEvidencePetConditionEligibility(): CanonicalPetConditionEligibility {
  return {
    version: "canonical-pet-condition-v1",
    state: "insufficient_evidence",
    conditionCodes: [],
    satisfiedConditions: [],
    conflictingConditions: [],
    confirmationRequiredConditions: [],
    unsupportedConditions: [],
    evidenceSources: [],
    warnings: [{
      code: "insufficient_pet_evidence",
      message: "검증 가능한 원문 근거가 없어 반려동물 동반 조건을 직접 확인해야 합니다.",
      sourceText: null,
      evidenceIds: [],
    }],
    reasonCodes: ["insufficient_pet_evidence"],
  };
}

export function eligiblePetConditionEligibility(): CanonicalPetConditionEligibility {
  return {
    version: "canonical-pet-condition-v1",
    state: "eligible",
    conditionCodes: [],
    satisfiedConditions: [],
    conflictingConditions: [],
    confirmationRequiredConditions: [],
    unsupportedConditions: [],
    evidenceSources: [],
    warnings: [],
    reasonCodes: [],
  };
}

export function applyCanonicalPetConditionPolicy(input: {
  analysis: CanonicalPetConditionEligibility;
  flow: CanonicalPetConditionFlow;
  includeVerificationRequired: boolean;
  acknowledged: boolean;
  preserveUserSelection?: boolean;
  allowMaterialProposal?: boolean;
}): CanonicalPetConditionPolicyResult {
  const preservesUserSelection =
    input.flow === "user_selected" || input.preserveUserSelection === true;
  if (input.analysis.state === "ineligible") {
    return {
      decision: "reject",
      routeStatus: "ineligible",
      preservesUserSelection: false,
      reasonCodes: input.analysis.reasonCodes.includes("pet_access_not_allowed")
        ? ["pet_access_not_allowed"]
        : ["pet_profile_conflict"],
      conditionEligibility: input.analysis,
    };
  }
  if (input.analysis.state === "insufficient_evidence") {
    if (preservesUserSelection && input.acknowledged) {
      return {
        decision: "allow",
        routeStatus: "ready",
        preservesUserSelection: true,
        reasonCodes: [],
        conditionEligibility: input.analysis,
      };
    }
    if (preservesUserSelection) {
      return {
        decision: "confirmation_required",
        routeStatus: "confirmation_required",
        preservesUserSelection: true,
        reasonCodes: ["insufficient_pet_evidence"],
        conditionEligibility: input.analysis,
      };
    }
    return {
      decision: "reject",
      routeStatus: "ineligible",
      preservesUserSelection: false,
      reasonCodes: ["insufficient_pet_evidence"],
      conditionEligibility: input.analysis,
    };
  }
  if (input.analysis.state === "eligible_with_confirmation") {
    if (input.acknowledged) {
      return {
        decision: "allow",
        routeStatus: "ready",
        preservesUserSelection,
        reasonCodes: [],
        conditionEligibility: input.analysis,
      };
    }
    if (preservesUserSelection || input.includeVerificationRequired || input.allowMaterialProposal) {
      return {
        decision: "confirmation_required",
        routeStatus: "confirmation_required",
        preservesUserSelection,
        reasonCodes: ["unacknowledged_confirmation_required"],
        conditionEligibility: input.analysis,
      };
    }
    return {
      decision: "reject",
      routeStatus: "ineligible",
      preservesUserSelection: false,
      reasonCodes: ["unacknowledged_confirmation_required"],
      conditionEligibility: input.analysis,
    };
  }
  return {
    decision: "allow",
    routeStatus: "ready",
    preservesUserSelection,
    reasonCodes: [],
    conditionEligibility: input.analysis,
  };
}
