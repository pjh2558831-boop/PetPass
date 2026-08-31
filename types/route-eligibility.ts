import type { LicensingMatchResult } from "@/types/license";
import type {
  ProviderVisibilityResult,
  TourPlaceCategory,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";
import type { PetSize, PetSpecies } from "@/types/pet";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";
import type { CanonicalPetConditionEligibility } from "@/types/pet-condition-eligibility";

export const AUTOMATIC_ROUTE_ELIGIBILITY_STATUSES = [
  "eligible",
  "ineligible",
  "verification_required",
  "provider_unavailable",
] as const;

export type AutomaticRouteEligibilityStatus =
  (typeof AUTOMATIC_ROUTE_ELIGIBILITY_STATUSES)[number];

export const ROUTE_ELIGIBILITY_TIERS = [
  "verified",
  "conditional",
  "unverified",
  "explicitly_ineligible",
] as const;

export type RouteEligibilityTier = (typeof ROUTE_ELIGIBILITY_TIERS)[number];

export const AUTOMATIC_ROUTE_PROVIDER_CALL_STATUSES = [
  "succeeded",
  "not_applicable",
  "invalid_response",
  "provider_unavailable",
] as const;

export type AutomaticRouteProviderCallStatus =
  (typeof AUTOMATIC_ROUTE_PROVIDER_CALL_STATUSES)[number];

export interface AutomaticRouteProviderCalls {
  list: AutomaticRouteProviderCallStatus;
  detailCommon: AutomaticRouteProviderCallStatus;
  detailIntro: AutomaticRouteProviderCallStatus;
  detailPet: AutomaticRouteProviderCallStatus;
}

export interface AutomaticRoutePetProfile {
  species: PetSpecies;
  size: PetSize | null;
  hasCarrier: boolean | null;
  hasLeash: boolean | null;
  hasMuzzle: boolean | null;
  acceptsOutdoorOnly: boolean;
}

export interface AutomaticRouteGeographicBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface AutomaticRouteGeographicScope {
  regionCode: string;
  districtCode: string | null;
  bounds: AutomaticRouteGeographicBounds;
}

export interface AutomaticRouteTripRequest {
  /** Explicit region/district and coordinate bounds selected by the user. */
  scope: AutomaticRouteGeographicScope;
  selectedCategories: TourPlaceCategory[];
  includeShopping: boolean;
  indoorAccessPreference: "any" | "preferred" | "required";
}

export interface AutomaticRouteOperatingHoursAssessment {
  status: "open" | "closed" | "unknown";
  warning: string | null;
}

export const AUTOMATIC_ROUTE_ELIGIBILITY_REASON_CODES = [
  "source_not_kto_service2",
  "source_identity_mismatch",
  "unsupported_content_type",
  "detail_identity_mismatch",
  "outside_requested_geographic_scope",
  "geographic_scope_verification_required",
  "provider_visibility_not_exposed",
  "provider_visibility_unknown",
  "provider_visibility_unavailable",
  "provider_visibility_identity_mismatch",
  "required_list_call_unavailable",
  "required_common_detail_call_unavailable",
  "required_intro_detail_call_unavailable",
  "required_pet_detail_call_unavailable",
  "invalid_coordinates",
  "pet_evidence_provider_unavailable",
  "pet_evidence_absent",
  "pet_evidence_empty",
  "pet_evidence_identity_mismatch",
  "pet_evidence_not_consumed",
  "pet_access_not_allowed",
  "pet_access_unknown",
  "pet_access_not_applicable",
  "pet_access_provider_unavailable",
  "pet_access_verification_required",
  "pet_type_incompatible",
  "pet_type_verification_required",
  "pet_size_incompatible",
  "pet_size_verification_required",
  "mandatory_condition_unsatisfied",
  "mandatory_condition_verification_required",
  "matched_license_closed",
  "operating_time_conflict",
  "category_not_selected",
  "shopping_not_explicitly_selected",
] as const;

export type AutomaticRouteEligibilityReasonCode =
  (typeof AUTOMATIC_ROUTE_ELIGIBILITY_REASON_CODES)[number];

export const AUTOMATIC_ROUTE_ELIGIBILITY_WARNINGS = [
  "license_no_match",
  "license_match_uncertain",
  "license_state_unknown",
  "license_provider_unavailable",
  "operating_hours_unknown",
] as const;

export type AutomaticRouteEligibilityWarning =
  (typeof AUTOMATIC_ROUTE_ELIGIBILITY_WARNINGS)[number];

export interface AutomaticRouteEligibilityInput {
  /** Exact provider service name. V1 accepts only `KorPetTourService2`. */
  providerService: string;
  summary: TourPlaceSummary;
  detail: TourPlaceDetail;
  providerVisibility: ProviderVisibilityResult;
  providerCalls: AutomaticRouteProviderCalls;
  assessment: TourPetAccessSemanticAssessment;
  petProfile: AutomaticRoutePetProfile;
  tripRequest: AutomaticRouteTripRequest;
  licensing: LicensingMatchResult | null;
  operatingHours: AutomaticRouteOperatingHoursAssessment;
}

export interface AutomaticRouteEligibilityResult {
  eligible: boolean;
  status: AutomaticRouteEligibilityStatus;
  tier?: RouteEligibilityTier;
  reasonCodes: AutomaticRouteEligibilityReasonCode[];
  warnings: AutomaticRouteEligibilityWarning[];
  /** Meaningful `detailPetTour2` fields actually consumed by Phase 3. */
  evidenceFieldNames: string[];
  /** Shared condition interpretation consumed by every route entry point. */
  conditionEligibility?: CanonicalPetConditionEligibility;
}
