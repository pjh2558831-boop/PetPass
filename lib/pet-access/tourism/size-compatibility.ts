import type { PetSize } from "@/types/pet";
import type { PetSizeCompatibilityResult } from "@/types/pet-size-compatibility";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";

export const PET_SIZE_COMPATIBILITY_RULESET_VERSION = "1" as const;

const SIZE_WORD: Record<PetSize, string> = {
  SMALL: "소형견",
  MEDIUM: "중형견",
  LARGE: "대형견",
};

const ALL_SIZES_PATTERN =
  /(?:크기\s*(?:제한|구분)\s*(?:없|무관)|소형견.{0,12}중형견.{0,12}대형견.{0,12}(?:모두\s*)?(?:가능|허용))/u;
const SMALL_ONLY_PATTERN = /소형견.{0,5}(?:만|에\s*한해).{0,6}(?:가능|허용)?/u;
const SMALL_MEDIUM_ONLY_PATTERN =
  /(?:중소형견|소형견.{0,8}중형견).{0,8}(?:까지|만|가능|허용)/u;
const SIZE_RELEVANT_PATTERN =
  /(?:소형견|중형견|대형견|중소형견|크기\s*(?:제한|구분)|\d+(?:\.\d+)?\s*kg)/iu;
const WEIGHT_PATTERN = /\d+(?:\.\d+)?\s*kg/iu;

export interface PetSizeSourceEvidence {
  id: string;
  sourceText: string;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function result(
  requestedSize: PetSize | null,
  state: PetSizeCompatibilityResult["state"],
  reason: PetSizeCompatibilityResult["reason"],
  evidenceIds: readonly string[] = [],
  sourceTexts: readonly string[] = [],
): PetSizeCompatibilityResult {
  return {
    rulesetVersion: PET_SIZE_COMPATIBILITY_RULESET_VERSION,
    requestedSize,
    state,
    reason,
    evidenceIds: unique(evidenceIds),
    sourceTexts: unique(sourceTexts),
  };
}

function explicitlyDenied(text: string, size: PetSize): boolean {
  return new RegExp(
    `${SIZE_WORD[size]}.{0,8}(?:불가|금지|제한|출입\\s*불가|동반\\s*불가)`,
    "u",
  ).test(text);
}

function explicitlyAllowed(text: string, size: PetSize): boolean {
  return new RegExp(
    `${SIZE_WORD[size]}.{0,8}(?:가능|허용|동반\\s*가능)`,
    "u",
  ).test(text);
}

export function assessPetSizeCompatibility(
  assessment: TourPetAccessSemanticAssessment,
  requestedSize: PetSize | null,
  providerEvidence: readonly PetSizeSourceEvidence[] = [],
): PetSizeCompatibilityResult {
  if (!requestedSize) {
    return result(null, "not_specified", "pet_size_not_requested");
  }

  const sizeConditions = assessment.conditions.filter(
    ({ type }) => type === "size_limit" || type === "weight_limit",
  );
  const unrestrictedEvidence = assessment.evidence.filter(({ originalText }) =>
    ALL_SIZES_PATTERN.test(originalText),
  );
  const relevantProviderEvidence = providerEvidence.filter(({ sourceText }) =>
    SIZE_RELEVANT_PATTERN.test(sourceText),
  );

  if (
    sizeConditions.length === 0 &&
    unrestrictedEvidence.length === 0 &&
    relevantProviderEvidence.length === 0
  ) {
    return result(
      requestedSize,
      "not_specified",
      "no_explicit_size_evidence",
    );
  }

  const evidenceIds = [
    ...sizeConditions.flatMap(({ evidenceIds: ids }) => ids),
    ...unrestrictedEvidence.map(({ id }) => id),
    ...relevantProviderEvidence.map(({ id }) => id),
  ];
  const sourceTexts = [
    ...sizeConditions.map(({ sourceText }) => sourceText),
    ...unrestrictedEvidence.map(({ originalText }) => originalText),
    ...relevantProviderEvidence.map(({ sourceText }) => sourceText),
  ];
  const combinedText = sourceTexts.join(" ");

  if (
    sizeConditions.some(({ type }) => type === "weight_limit") ||
    WEIGHT_PATTERN.test(combinedText)
  ) {
    return result(
      requestedSize,
      "verification_required",
      "exact_weight_required",
      evidenceIds,
      sourceTexts,
    );
  }

  if (ALL_SIZES_PATTERN.test(combinedText)) {
    return result(
      requestedSize,
      "compatible",
      "explicit_all_sizes",
      evidenceIds,
      sourceTexts,
    );
  }

  if (explicitlyDenied(combinedText, requestedSize)) {
    return result(
      requestedSize,
      "incompatible",
      "explicit_size_denial",
      evidenceIds,
      sourceTexts,
    );
  }

  if (SMALL_ONLY_PATTERN.test(combinedText)) {
    return result(
      requestedSize,
      requestedSize === "SMALL" ? "compatible" : "incompatible",
      requestedSize === "SMALL"
        ? "explicit_size_allowance"
        : "explicit_size_denial",
      evidenceIds,
      sourceTexts,
    );
  }

  if (SMALL_MEDIUM_ONLY_PATTERN.test(combinedText)) {
    return result(
      requestedSize,
      requestedSize === "LARGE" ? "incompatible" : "compatible",
      requestedSize === "LARGE"
        ? "explicit_size_denial"
        : "explicit_size_allowance",
      evidenceIds,
      sourceTexts,
    );
  }

  if (explicitlyAllowed(combinedText, requestedSize)) {
    return result(
      requestedSize,
      "compatible",
      "explicit_size_allowance",
      evidenceIds,
      sourceTexts,
    );
  }

  const deniedSizes = (Object.keys(SIZE_WORD) as PetSize[]).filter((size) =>
    explicitlyDenied(combinedText, size),
  );
  if (deniedSizes.length > 0) {
    return result(
      requestedSize,
      "compatible",
      "explicit_size_allowance",
      evidenceIds,
      sourceTexts,
    );
  }

  return result(
    requestedSize,
    "verification_required",
    "ambiguous_size_restriction",
    evidenceIds,
    sourceTexts,
  );
}
