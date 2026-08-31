import type { Coordinates, TourPlaceCategory } from "@/types/place";
import type { PetSize, PetSpecies, TripPace } from "@/types/pet";
import type { RegionId } from "@/types/region";
import type { TourPetAccessConditionType } from "@/types/tour-pet-access";
import type { CanonicalPetConditionEligibility } from "@/types/pet-condition-eligibility";

export const ROUTE_RECOMMENDATION_ENGINE_VERSION =
  "petpass-route-engine-v1" as const;
export const ROUTE_RECOMMENDATION_CONTRACT_V2 =
  "route-recommendation-v2" as const;
export const ROUTE_RECOMMENDATION_ENGINE_V2 =
  "petpass-route-engine-v2" as const;
export const ROUTE_RECOMMENDATION_API_VERSION =
  "route-recommendation-response-v1" as const;

export type DepartureSource =
  | "kakao_place_search"
  | "address_search"
  | "map_selection"
  | "current_location";

export interface RouteRecommendationRequest {
  departure: {
    label: string;
    latitude: number;
    longitude: number;
    source: DepartureSource;
  };
  trip: {
    regionId: RegionId;
    districtId: string | null;
    date: string;
    startTime: string;
    tripType: "day_trip" | "overnight";
    tripPace: TripPace;
    selectedCategories: Array<
      Exclude<TourPlaceCategory, "transportation" | "unknown">
    >;
    roundTrip: boolean;
    environmentPreference?: "any" | "indoor_preferred" | "outdoor_preferred";
    desiredStopCount?: number;
    durationMinutes?: number;
    travelMode?: "driving";
  };
  pet: {
    name: string | null;
    species: PetSpecies;
    size: PetSize;
    availableEquipment: {
      carrier: boolean;
      leash: boolean;
      muzzle: boolean;
    };
    acceptsOutdoorOnlyPlaces: boolean;
  };
  /** Canonical provider identities (`tour:<id>` or `kakao:<id>`). */
  selectedPlaceIds?: string[];
  /** Applies only when selectedPlaceIds is non-empty. Defaults to true. */
  autoFill?: boolean;
  /** Region identity retained with each user selection to prevent silent cross-region loss. */
  selectedPlaceReferences?: Array<{ placeId: string; regionId: RegionId }>;
  /** Explicit user acknowledgement for selected places whose policy needs confirmation. */
  acknowledgedVerificationRequiredPlaceIds?: string[];
  /** Opt-in for automatic candidates whose pet policy or hours still need verification. */
  includeVerificationRequired?: boolean;
  personalization?: {
    petCount: number;
    petActivityLevel: "low" | "moderate" | "high";
    walkingTolerance: "low" | "moderate" | "high";
    crowdPreference: "avoid" | "any" | "enjoy";
    tripMood: "balanced" | "scenic" | "foodie" | "active" | "restful";
    categoryPriorities: Partial<Record<
      Exclude<TourPlaceCategory, "transportation" | "unknown">,
      number
    >>;
    recentRouteSignatures: string[];
    recentlySelectedCandidateIds: string[];
    explicitlyExcludedPlaceIds: string[];
    rerollVariant: number;
  };
}

export type RecommendationStatus =
  | "ready"
  | "confirmation_required"
  | "unavailable"
  | "invalid_request"
  | "region_not_supported_for_itinerary"
  | "insufficient_eligible_places"
  | "insufficient_feasible_route"
  | "tourism_provider_unavailable"
  | "licensing_provider_unavailable"
  | "travel_matrix_incomplete"
  | "kakao_provider_unavailable"
  | "final_route_validation_failed"
  | "rate_limited"
  | "route_engine_disabled"
  | "internal_error";

export interface RecommendedRouteStopV1 {
  placeId: string;
  sequence: number;
  title: string;
  address: string | null;
  coordinates: Coordinates;
  category: Exclude<TourPlaceCategory, "transportation" | "unknown">;
  arrivalAt: string;
  visitStartsAt: string;
  departureAt: string;
  dwellMinutes: number;
  driveSecondsFromPrevious: number;
  distanceMetersFromPrevious: number;
  source: "tourism_service2" | "kakao_catalog";
  sourceLabel: "한국관광공사" | "카카오 검색 후보";
  petAssessment: "allowed" | "conditional" | "unknown";
  evidenceStatus?: "verified" | "conditional" | "unverified";
  retrievedAt?: string | null;
  providerIdentities?: Array<{ provider: "kto" | "kakao"; id: string }>;
  regionId?: RegionId;
  districtId?: string | null;
  selectionOrigin?: "user_selected" | "automatic_fill" | "automatic_recommendation";
  operatingHoursEvidenceState?: "verified" | "verification_required";
  /** @deprecated Use selectionOrigin. */
  provenance?: "user_selected" | "auto_fill";
  locked?: boolean;
  verificationWarning?: string | null;
  petConditionEligibility?: CanonicalPetConditionEligibility;
  conditionAcknowledged?: boolean;
  mandatoryConditions: Array<{
    type: TourPetAccessConditionType;
    label: string;
    manualConfirmationRecommended: boolean;
  }>;
  informationTrust: "high" | "medium" | "low";
  licensingStatus:
    | "confirmed_open"
    | "no_match"
    | "verification_required"
    | "not_applicable";
  operatingHoursWarnings: string[];
  inclusionReasonCodes: string[];
  orderingReasonCodes: string[];
  warningCodes: string[];
  evidence: Array<{
    field: string;
    label: string;
    originalText: string;
  }>;
}

export interface RecommendationSelectionIssueV1 {
  placeId: string;
  code:
    | "selected_place_not_found_in_region"
    | "selected_place_cross_region"
    | "selected_place_missing_coordinates"
    | "selected_place_not_allowed"
    | "selected_place_condition_unsatisfied"
    | "selected_place_trip_incompatible"
    | "selected_place_explicitly_excluded"
    | "selected_place_confirmation_required"
    | "selected_anchor_large_detour";
  blocking: boolean;
  reasonCodes: string[];
  replacementCandidateIds: string[];
}

export interface RecommendationReplacementCandidateV1 {
  placeId: string;
  title: string;
  category: Exclude<TourPlaceCategory, "transportation" | "unknown">;
  source: "tourism_service2" | "kakao_catalog";
}

export interface ProductRouteSummaryV1 {
  startAt: string;
  endAt: string;
  stopCount: number;
  totalDistanceMeters: number;
  totalDrivingSeconds: number;
  totalVisitSeconds: number;
  totalWaitSeconds: number;
}

export type ProductRouteObjectiveV2 = "balanced" | "shortest" | "relaxed";

export interface ProductRouteSegmentV1 {
  fromPlaceId: string;
  toPlaceId: string;
  travelSeconds: number;
  distanceMeters: number;
  temporalBasis: string;
}

export interface ProductRouteV1 {
  id: string;
  kind: "optimized" | "manual";
  label: string;
  routeSummary: ProductRouteSummaryV1;
  temporalBasis: {
    searchMatrix: string;
    finalRoute: string;
  };
  stops: RecommendedRouteStopV1[];
  geometry: Coordinates[];
  confirmationStatus?: "ready" | "confirmation_required";
  style?: ProductRouteObjectiveV2;
  objective?: ProductRouteObjectiveV2;
  routeSignature?: string;
  requestedTarget?: number;
  reductionStatus?: "complete" | "reduced" | "single_stop";
  personalizationExplanationCodes?: string[];
  maximumSingleWaitSeconds?: number;
  estimatedFinishAt?: string;
  categoryComposition?: Partial<Record<Exclude<TourPlaceCategory, "transportation" | "unknown">, number>>;
  selectedPlaceCount?: number;
  automaticPlaceCount?: number;
  evidenceWarnings?: string[];
  warningCodes?: string[];
  reductionReasonCodes?: string[];
  differenceExplanationCodes?: string[];
  segments?: ProductRouteSegmentV1[];
}

export interface RouteAlternativeV1 extends ProductRouteV1 {
  kind: "optimized";
  alternativeType: "lower_travel" | "popularity_oriented";
}

export interface SafeRecommendationDiagnostics {
  candidateEligibility?: {
    providerRawCandidates: number;
    regionFilteredCandidates: number;
    districtFilteredCandidates: number;
    requestedCategoryCandidates: number;
    petEligibleCandidates: number;
    operatingHoursEligibleCandidates: number;
    feasibleRouteCandidates: number;
    finalUsedPlaces: number;
    rejectedByReason: Record<string, number>;
  };
  candidatePipeline: {
    stageA: number;
    stageB: number;
    detailedEvaluations: number;
    eligible: number;
  };
  travelMatrix: {
    nodes: number;
    resolvedEdges: number;
    unresolvedEdges: number;
  };
  solver: {
    durationMs: number;
    validationAttempts: number;
    validationFailures: number;
  };
}

export interface RouteRecommendationReadyResponseV1 {
  status: "ready";
  apiVersion: typeof ROUTE_RECOMMENDATION_API_VERSION;
  engineVersion:
    | typeof ROUTE_RECOMMENDATION_ENGINE_VERSION
    | typeof ROUTE_RECOMMENDATION_ENGINE_V2;
  objectiveVersion: "route-objective-v1";
  solverVersion: "route-solver-v1";
  editSessionId: string;
  requestSummary: {
    departureLabel: string;
    tripDate: string;
    startTime: string;
    tripType: "day_trip" | "overnight";
    tripPace: TripPace;
    selectedCategories: string[];
    roundTrip: boolean;
  };
  optimality:
    | "optimal_within_candidate_set_current_matrix"
    | "best_found_within_time_limit";
  /** @deprecated V2 compatibility adapter. Use primaryRouteId + routeOptions. */
  route: ProductRouteV1;
  /** @deprecated V2 compatibility adapter. Use routeOptions. */
  alternatives: RouteAlternativeV1[];
  excludedHighlights: Array<{
    placeId: string;
    title: string | null;
    reasonCode: string;
  }>;
  warnings: string[];
  contractVersion?: typeof ROUTE_RECOMMENDATION_CONTRACT_V2;
  region?: RegionId;
  requestFingerprint?: string;
  resultState?: "ready" | "ready_with_reduced_stops" | "single_stop_suggestion";
  requestedStopCount?: number;
  feasibleStopCount?: number;
  resultReasonCodes?: string[];
  resultExplanation?: string;
  recoveryActions?: RecommendationRecoveryAction[];
  /** Authoritative V2 route collection. */
  routeOptions?: ProductRouteV1[];
  primaryRouteId?: string;
  routeOptionCount?: number;
  routeOptionsLimitedReason?:
    | "fewer_than_three_meaningfully_distinct_routes"
    | "final_validation_reduced_route_options";
  candidateSourceCounts?: { kto: number; kakao: number; merged: number };
  alternativeAvailability?: "available" | "limited";
  selectionMode?: "automatic" | "hybrid";
  selectionIssues?: RecommendationSelectionIssueV1[];
  replacementCandidates?: RecommendationReplacementCandidateV1[];
  diagnostics?: SafeRecommendationDiagnostics;
}

export interface RecommendationConditionConfirmationV1 {
  placeId: string;
  title: string;
  selectionOrigin: "user_selected" | "automatic_fill" | "automatic_recommendation";
  conditionEligibility: CanonicalPetConditionEligibility;
}

export interface RouteRecommendationFailureResponseV1 {
  status: Exclude<RecommendationStatus, "ready">;
  apiVersion: typeof ROUTE_RECOMMENDATION_API_VERSION;
  reasonCodes: string[];
  userMessage: string;
  retryable: boolean;
  resultState?: "insufficient_eligible_places" | "insufficient_feasible_route" | "confirmation_required";
  requestedStopCount?: number;
  feasibleStopCount?: number;
  resultExplanation?: string;
  recoveryActions?: RecommendationRecoveryAction[];
  diagnostics?: SafeRecommendationDiagnostics;
  selectionMode?: "automatic" | "hybrid";
  selectionIssues?: RecommendationSelectionIssueV1[];
  replacementCandidates?: RecommendationReplacementCandidateV1[];
  confirmationRequirements?: RecommendationConditionConfirmationV1[];
  routeOptions?: ProductRouteV1[];
}

export type RecommendationRecoveryAction =
  | "reduce_requested_stops"
  | "change_time_window"
  | "change_categories"
  | "widen_district"
  | "select_places_manually"
  | "allow_verification_required_candidates"
  | "acknowledge_selected_place_verification"
  | "acknowledge_route_conditions";

export type RouteRecommendationResponseV1 =
  | RouteRecommendationReadyResponseV1
  | RouteRecommendationFailureResponseV1;

export interface ManualRouteValidationRequestV1 {
  editSessionId: string;
  orderedPlaceIds: string[];
}

export type ManualRouteValidationResponseV1 =
  | {
      status: "ready";
      apiVersion: typeof ROUTE_RECOMMENDATION_API_VERSION;
      route: ProductRouteV1;
      warnings: string[];
    }
  | RouteRecommendationFailureResponseV1;
