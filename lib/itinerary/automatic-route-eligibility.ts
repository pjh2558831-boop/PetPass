import "server-only";

import { assessPetSizeCompatibility } from "@/lib/pet-access/tourism/size-compatibility";
import type { LicensingMatchResult } from "@/types/license";
import { TOUR_CONTENT_TYPE_IDS } from "@/types/place";
import type { TourPetPolicyFieldName } from "@/types/place";
import type { TourPetAccessCondition } from "@/types/tour-pet-access";
import type {
  AutomaticRouteEligibilityInput,
  AutomaticRouteEligibilityReasonCode,
  AutomaticRouteEligibilityResult,
  AutomaticRouteEligibilityWarning,
  AutomaticRouteGeographicScope,
  AutomaticRouteProviderCallStatus,
} from "@/types/route-eligibility";

export type {
  AutomaticRouteEligibilityInput,
  AutomaticRouteEligibilityReasonCode,
  AutomaticRouteEligibilityResult,
  AutomaticRouteEligibilityStatus,
  AutomaticRouteEligibilityWarning,
  AutomaticRouteGeographicBounds,
  AutomaticRouteGeographicScope,
  AutomaticRouteOperatingHoursAssessment,
  AutomaticRoutePetProfile,
  AutomaticRouteProviderCalls,
  AutomaticRouteProviderCallStatus,
  AutomaticRouteTripRequest,
} from "@/types/route-eligibility";
export {
  AUTOMATIC_ROUTE_ELIGIBILITY_REASON_CODES,
  AUTOMATIC_ROUTE_ELIGIBILITY_STATUSES,
  AUTOMATIC_ROUTE_ELIGIBILITY_WARNINGS,
  AUTOMATIC_ROUTE_PROVIDER_CALL_STATUSES,
} from "@/types/route-eligibility";

export const KTO_SERVICE2_NAME = "KorPetTourService2" as const;

type ConditionOutcome = "satisfied" | "unsatisfied" | "verification_required";

function addUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) target.push(value);
}

function isCallUnavailable(status: AutomaticRouteProviderCallStatus): boolean {
  return status === "invalid_response" || status === "provider_unavailable";
}

function hasValidCoordinates(
  latitude: number | null,
  longitude: number | null,
): boolean {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

function petSpeciesOutcome(input: AutomaticRouteEligibilityInput): ConditionOutcome {
  const value = input.detail.normalizedPetEvidence?.fields.acmpyPsblCpam
    ?.normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  if (!value) return "satisfied";

  const dog = /(?:반려견|애완견|강아지|견종|소형견|중형견|대형견)/u;
  const cat = /(?:반려묘|고양이)/u;
  const generic = /(?:반려동물|애완동물)/u;
  const denied = /(?:불가|금지|제외|허용하지\s*않|출입할\s*수\s*없)/u;
  const inquiry = /(?:문의|확인\s*필요|협의)/u;
  const requestedPattern =
    input.petProfile.species === "DOG"
      ? dog
      : input.petProfile.species === "CAT"
        ? cat
        : null;

  // `acmpyPsblCpam` is the provider's allowed-animal field. Only recognized,
  // explicit animal wording is interpreted. Unknown prose never becomes an
  // allowance or denial.
  if (inquiry.test(value)) return "verification_required";
  if (requestedPattern) {
    const requestedClause = new RegExp(
      `${requestedPattern.source}.{0,16}${denied.source}|${denied.source}.{0,16}${requestedPattern.source}`,
      "u",
    );
    if (requestedClause.test(value)) return "unsatisfied";
    if (requestedPattern.test(value)) return "satisfied";
    if (generic.test(value) && !denied.test(value)) return "satisfied";
    if (dog.test(value) || cat.test(value)) return "unsatisfied";
    return "verification_required";
  }

  // `OTHER` does not identify an animal precisely enough to compare with a
  // species list. Only an explicit all-companion-animals allowance is safe.
  return /(?:모든|전체|전)\s*(?:반려동물|애완동물)/u.test(value) &&
    !denied.test(value)
    ? "satisfied"
    : "verification_required";
}

function visibilityIdentityMatches(input: AutomaticRouteEligibilityInput): boolean {
  const expected = input.providerVisibility;
  const providerValueIsValid =
    expected.status === "exposed"
      ? expected.providerField === "showflag" && expected.providerValue === "1"
      : expected.status === "not_exposed"
        ? expected.providerField === "showflag" && expected.providerValue === "0"
        : true;
  if (!providerValueIsValid) return false;

  return [input.summary.providerVisibility, input.detail.summary.providerVisibility].every(
    (visibility) =>
      visibility?.status === expected.status &&
      visibility.providerField === expected.providerField &&
      visibility.providerValue === expected.providerValue,
  );
}

function hasExpectedSourceIdentity(input: AutomaticRouteEligibilityInput): boolean {
  return (
    input.summary.source.provider === "Korea Tourism Organization" &&
    input.summary.source.operation === "areaBasedList2" &&
    input.summary.source.contentId === input.summary.contentId &&
    input.detail.summary.source.provider === "Korea Tourism Organization" &&
    input.detail.summary.source.operation === "detailCommon2" &&
    input.detail.source.provider === "Korea Tourism Organization" &&
    input.detail.source.operation === "detailCommon2" &&
    input.detail.summary.source.contentId === input.summary.contentId &&
    input.detail.source.contentId === input.summary.contentId
  );
}

function scopeOutcome(input: AutomaticRouteEligibilityInput): ConditionOutcome {
  const scope = input.tripRequest.scope as AutomaticRouteGeographicScope | undefined;
  if (!scope || !scope.regionCode.trim()) return "verification_required";
  const { bounds } = scope;
  if (
    ![bounds.south, bounds.west, bounds.north, bounds.east].every(
      Number.isFinite,
    ) ||
    bounds.south >= bounds.north ||
    bounds.west >= bounds.east
  ) {
    return "verification_required";
  }

  const { latitude, longitude } = input.detail.summary;
  if (!hasValidCoordinates(latitude, longitude)) {
    // Coordinate validity has its own hard exclusion; the scope comparison is
    // not a second source of truth for malformed coordinates.
    return "satisfied";
  }
  if (latitude === null || longitude === null) return "satisfied";
  if (
    latitude < bounds.south ||
    latitude > bounds.north ||
    longitude < bounds.west ||
    longitude > bounds.east ||
    (input.detail.summary.legalRegionCode !== null &&
      input.detail.summary.legalRegionCode !== scope.regionCode) ||
    (input.summary.legalRegionCode !== null &&
      input.summary.legalRegionCode !== scope.regionCode)
  ) {
    return "unsatisfied";
  }

  if (
    input.detail.summary.legalRegionCode === null ||
    input.summary.legalRegionCode === null
  ) {
    return "verification_required";
  }

  if (scope.districtCode === null) return "satisfied";
  if (
    input.detail.summary.legalDistrictCode === null ||
    input.summary.legalDistrictCode === null
  ) {
    return "verification_required";
  }
  return input.detail.summary.legalDistrictCode === scope.districtCode &&
    input.summary.legalDistrictCode === scope.districtCode
    ? "satisfied"
    : "unsatisfied";
}

function primaryEvidenceValues(
  input: AutomaticRouteEligibilityInput,
): Map<string, string> | null {
  const raw = input.detail.petPolicyEvidence;
  const normalized = input.detail.normalizedPetEvidence;
  if (!raw || !normalized) return null;
  const primarySources = input.assessment.sources.filter(
    ({ operation }) => operation === "detailPetTour2",
  );
  const expectedPrimaryStatus =
    normalized.sourceFields.length > 0 ? "available" : "empty";
  if (
    raw.sourceEvidence.provider !== "Korea Tourism Organization" ||
    raw.sourceEvidence.operation !== "detailPetTour2" ||
    raw.sourceEvidence.contentId !== input.summary.contentId ||
    raw.sourceEvidence.contentId !== input.detail.summary.contentId ||
    primarySources.length !== 1 ||
    primarySources[0].status !== expectedPrimaryStatus ||
    primarySources[0].retrievedAt !== raw.sourceEvidence.retrievedAt ||
    primarySources[0].providerModifiedTime !==
      (raw.sourceEvidence.providerModifiedTime ?? null)
  ) {
    return null;
  }

  const values = new Map<string, string>();
  for (const { field, value } of normalized.sourceFields) {
    const normalizedValue = normalizeEvidenceText(value);
    const rawValue = normalizeEvidenceText(raw.fields[field]);
    const normalizedFieldValue = normalizeEvidenceText(normalized.fields[field]);
    const originalValue =
      normalizeEvidenceText(raw.sourceEvidence.originalEvidenceFields[field]);
    if (
      !normalizedValue ||
      rawValue !== normalizedValue ||
      normalizedFieldValue !== normalizedValue ||
      originalValue !== normalizedValue ||
      values.has(field)
    ) {
      return null;
    }
    values.set(field, normalizedValue);
  }
  return values;
}

function normalizeEvidenceText(value: string | null | undefined): string | null {
  const normalized = value
    ?.normalize("NFKC")
    .replace(/[ \t]+/gu, " ")
    .replace(/\s*\n\s*/gu, "\n")
    .trim();
  return normalized || null;
}

function conditionOutcome(
  condition: TourPetAccessCondition,
  input: AutomaticRouteEligibilityInput,
): ConditionOutcome {
  if (condition.manualConfirmationRecommended) return "verification_required";

  switch (condition.type) {
    case "leash_required":
      return input.petProfile.hasLeash === null
        ? "verification_required"
        : input.petProfile.hasLeash
          ? "satisfied"
          : "unsatisfied";
    case "muzzle_required":
      return input.petProfile.hasMuzzle === null
        ? "verification_required"
        : input.petProfile.hasMuzzle
          ? "satisfied"
          : "unsatisfied";
    case "carrier_required":
      return input.petProfile.hasCarrier === null
        ? "verification_required"
        : input.petProfile.hasCarrier
          ? "satisfied"
          : "unsatisfied";
    case "outdoor_only":
    case "indoor_restricted":
      if (input.tripRequest.indoorAccessPreference === "required") {
        return "unsatisfied";
      }
      return input.petProfile.acceptsOutdoorOnly
        ? "satisfied"
        : "unsatisfied";
    case "size_limit": {
      const compatibility = assessPetSizeCompatibility(
        input.assessment,
        input.petProfile.size,
        input.assessment.evidence
          .filter(({ operation }) => operation === "detailPetTour2")
          .map(({ id, originalText }) => ({ id, sourceText: originalText })),
      );
      if (compatibility.state === "compatible") return "satisfied";
      if (compatibility.state === "incompatible") return "unsatisfied";
      return "verification_required";
    }
    default:
      // V1 has no machine-readable user input for weight, breed, count,
      // documents, reservations, fees, selected rooms, or other manual rules.
      return "verification_required";
  }
}

function isConfirmedClosedLicense(licensing: LicensingMatchResult): boolean {
  return (
    licensing.matchState === "matched_high" &&
    licensing.operatingState === "closed"
  );
}

function addLicensingOutcome(
  licensing: LicensingMatchResult | null,
  reasons: AutomaticRouteEligibilityReasonCode[],
  warnings: AutomaticRouteEligibilityWarning[],
): void {
  if (!licensing || licensing.matchState === "not_found") {
    addUnique(warnings, "license_no_match");
    return;
  }
  if (licensing.matchState === "unavailable") {
    addUnique(warnings, "license_provider_unavailable");
    return;
  }
  if (
    licensing.matchState === "matched_possible" ||
    licensing.matchState === "ambiguous"
  ) {
    addUnique(warnings, "license_match_uncertain");
    return;
  }
  if (licensing.matchState === "not_applicable") return;
  if (isConfirmedClosedLicense(licensing)) {
    addUnique(reasons, "matched_license_closed");
    return;
  }
  if (
    licensing.operatingState === null ||
    licensing.operatingState === "unknown" ||
    licensing.operatingState === "requires_confirmation" ||
    licensing.operatingState === "suspended"
  ) {
    addUnique(warnings, "license_state_unknown");
  }
}

/**
 * Stage 1 automatic-route eligibility boundary.
 *
 * This function is deterministic, performs no provider calls, and intentionally
 * does not accept trust, popularity, or ranking inputs.
 */
export function evaluateAutomaticRouteEligibility(
  input: AutomaticRouteEligibilityInput,
): AutomaticRouteEligibilityResult {
  const reasons: AutomaticRouteEligibilityReasonCode[] = [];
  const warnings: AutomaticRouteEligibilityWarning[] = [];
  let providerUnavailable = false;
  let verificationRequired = false;

  const sourceIsKtoService2 = input.providerService === KTO_SERVICE2_NAME;
  if (!sourceIsKtoService2) addUnique(reasons, "source_not_kto_service2");
  if (!hasExpectedSourceIdentity(input)) {
    addUnique(reasons, "source_identity_mismatch");
  }

  if (
    input.detail.summary.contentTypeId === null ||
    input.detail.summary.providerContentTypeId === null ||
    !TOUR_CONTENT_TYPE_IDS.includes(input.detail.summary.contentTypeId) ||
    !TOUR_CONTENT_TYPE_IDS.includes(
      input.detail.summary.providerContentTypeId as (typeof TOUR_CONTENT_TYPE_IDS)[number],
    ) ||
    input.detail.summary.contentTypeId !==
      input.detail.summary.providerContentTypeId
  ) {
    addUnique(reasons, "unsupported_content_type");
  }

  if (
    input.summary.contentId !== input.detail.summary.contentId ||
    (input.summary.providerContentTypeId !== null &&
      input.detail.summary.providerContentTypeId !== null &&
      input.summary.providerContentTypeId !==
        input.detail.summary.providerContentTypeId) ||
    (input.summary.contentTypeId !== null &&
      input.detail.summary.contentTypeId !== null &&
      input.summary.contentTypeId !== input.detail.summary.contentTypeId) ||
    (input.summary.category !== "unknown" &&
      input.detail.summary.category !== "unknown" &&
      input.summary.category !== input.detail.summary.category)
  ) {
    addUnique(reasons, "detail_identity_mismatch");
  }

  const geographicScope = scopeOutcome(input);
  if (geographicScope === "unsatisfied") {
    addUnique(reasons, "outside_requested_geographic_scope");
  } else if (geographicScope === "verification_required") {
    addUnique(reasons, "geographic_scope_verification_required");
    verificationRequired = true;
  }

  switch (input.providerVisibility.status) {
    case "not_exposed":
      addUnique(reasons, "provider_visibility_not_exposed");
      break;
    case "unknown":
      addUnique(reasons, "provider_visibility_unknown");
      verificationRequired = true;
      break;
    case "provider_unavailable":
      addUnique(reasons, "provider_visibility_unavailable");
      providerUnavailable = true;
      break;
    default:
      break;
  }
  if (!visibilityIdentityMatches(input)) {
    addUnique(reasons, "provider_visibility_identity_mismatch");
  }

  const requiredCalls: Array<
    [AutomaticRouteProviderCallStatus, AutomaticRouteEligibilityReasonCode]
  > = [
    [input.providerCalls.list, "required_list_call_unavailable"],
    [
      input.providerCalls.detailCommon,
      "required_common_detail_call_unavailable",
    ],
    [input.providerCalls.detailIntro, "required_intro_detail_call_unavailable"],
    [
      input.providerCalls.detailPet,
      "required_pet_detail_call_unavailable",
    ],
  ];
  for (const [status, reason] of requiredCalls) {
    if (status === "succeeded") continue;
    addUnique(reasons, reason);
    if (isCallUnavailable(status)) providerUnavailable = true;
  }

  if (
    !hasValidCoordinates(
      input.detail.summary.latitude,
      input.detail.summary.longitude,
    )
  ) {
    addUnique(reasons, "invalid_coordinates");
  }

  const normalizedEvidence = input.detail.normalizedPetEvidence;
  if (!input.detail.petPolicyEvidence || !normalizedEvidence) {
    addUnique(reasons, "pet_evidence_absent");
    verificationRequired = true;
  } else if (normalizedEvidence.availability === "provider_unavailable") {
    addUnique(reasons, "pet_evidence_provider_unavailable");
    providerUnavailable = true;
  } else if (normalizedEvidence.availability === "absent") {
    addUnique(reasons, "pet_evidence_absent");
    verificationRequired = true;
  } else if (normalizedEvidence.availability === "empty") {
    addUnique(reasons, "pet_evidence_empty");
    verificationRequired = true;
  }

  const trustedPrimaryValues = primaryEvidenceValues(input);
  if (input.detail.petPolicyEvidence && normalizedEvidence && !trustedPrimaryValues) {
    addUnique(reasons, "pet_evidence_identity_mismatch");
  }
  const evidenceFieldNames = [
    ...new Set(
      input.assessment.evidence
        .filter(
          ({ operation, assertion, field, originalText }) => {
            const sourceValue = trustedPrimaryValues?.get(field);
            const wording = normalizeEvidenceText(originalText);
            return (
              operation === "detailPetTour2" &&
              assertion !== "unknown" &&
              typeof sourceValue === "string" &&
              typeof wording === "string" &&
              sourceValue.includes(wording)
            );
          },
        )
        .map(({ field }) => field as TourPetPolicyFieldName),
    ),
  ].sort();
  if (evidenceFieldNames.length === 0) {
    addUnique(reasons, "pet_evidence_not_consumed");
    verificationRequired = true;
  }

  if (input.assessment.evaluationState === "unavailable") {
    addUnique(reasons, "pet_access_provider_unavailable");
    providerUnavailable = true;
  } else if (input.assessment.evaluationState === "not_applicable") {
    addUnique(reasons, "pet_access_not_applicable");
  } else if (
    input.assessment.evaluationState === "insufficient_evidence" ||
    input.assessment.evaluationState === "partial"
  ) {
    addUnique(reasons, "pet_access_verification_required");
    verificationRequired = true;
  }

  if (input.assessment.verdict === "not_allowed") {
    addUnique(reasons, "pet_access_not_allowed");
  } else if (input.assessment.verdict === "unknown") {
    addUnique(reasons, "pet_access_unknown");
    verificationRequired = true;
  } else {
    const typeOutcome = petSpeciesOutcome(input);
    if (typeOutcome === "unsatisfied") {
      addUnique(reasons, "pet_type_incompatible");
    } else if (typeOutcome === "verification_required") {
      addUnique(reasons, "pet_type_verification_required");
      verificationRequired = true;
    }

    for (const condition of input.assessment.conditions) {
      const outcome = conditionOutcome(condition, input);
      if (outcome === "unsatisfied") {
        if (condition.type === "size_limit") {
          addUnique(reasons, "pet_size_incompatible");
        } else {
          addUnique(reasons, "mandatory_condition_unsatisfied");
        }
      } else if (outcome === "verification_required") {
        if (condition.type === "size_limit" || condition.type === "weight_limit") {
          addUnique(reasons, "pet_size_verification_required");
        } else {
          addUnique(reasons, "mandatory_condition_verification_required");
        }
        verificationRequired = true;
      }
    }
  }

  addLicensingOutcome(input.licensing, reasons, warnings);

  if (input.operatingHours.status === "closed") {
    addUnique(reasons, "operating_time_conflict");
  } else if (input.operatingHours.status === "unknown") {
    addUnique(warnings, "operating_hours_unknown");
  }

  const category = input.detail.summary.category;
  if (!input.tripRequest.selectedCategories.includes(category)) {
    addUnique(reasons, "category_not_selected");
  }
  if (
    category === "shopping" &&
    (!input.tripRequest.includeShopping ||
      !input.tripRequest.selectedCategories.includes("shopping"))
  ) {
    addUnique(reasons, "shopping_not_explicitly_selected");
  }

  if (providerUnavailable) {
    return {
      eligible: false,
      status: "provider_unavailable",
      reasonCodes: reasons,
      warnings,
      evidenceFieldNames,
    };
  }

  const verificationReasons = new Set<AutomaticRouteEligibilityReasonCode>([
    "provider_visibility_unknown",
    "geographic_scope_verification_required",
    "pet_evidence_absent",
    "pet_evidence_empty",
    "pet_evidence_not_consumed",
    "pet_access_unknown",
    "pet_access_verification_required",
    "pet_type_verification_required",
    "pet_size_verification_required",
    "mandatory_condition_verification_required",
  ]);
  const hardIneligible = reasons.some((reason) => !verificationReasons.has(reason));
  if (hardIneligible) {
    return {
      eligible: false,
      status: "ineligible",
      reasonCodes: reasons,
      warnings,
      evidenceFieldNames,
    };
  }
  if (verificationRequired || reasons.length > 0) {
    return {
      eligible: false,
      status: "verification_required",
      reasonCodes: reasons,
      warnings,
      evidenceFieldNames,
    };
  }
  return {
    eligible: true,
    status: "eligible",
    reasonCodes: [],
    warnings,
    evidenceFieldNames,
  };
}
