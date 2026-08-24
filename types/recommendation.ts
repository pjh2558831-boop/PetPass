import type { Coordinates, TourPlaceCategory } from "@/types/place";
import type { PetSize, PetSpecies, TripPace } from "@/types/pet";
import type { RegionId } from "@/types/region";
import type { TourPetAccessConditionType } from "@/types/tour-pet-access";

export const ROUTE_RECOMMENDATION_ENGINE_VERSION =
  "petpass-route-engine-v1" as const;
export const ROUTE_RECOMMENDATION_API_VERSION =
  "route-recommendation-response-v1" as const;

export type DepartureSource =
  | "kakao_place_search"
  | "address_search"
  | "map_selection";

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
}

export type RecommendationStatus =
  | "ready"
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
  source: "tourism_service2";
  sourceLabel: "한국관광공사";
  petAssessment: "allowed" | "conditional";
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

export interface ProductRouteSummaryV1 {
  startAt: string;
  endAt: string;
  stopCount: number;
  totalDistanceMeters: number;
  totalDrivingSeconds: number;
  totalVisitSeconds: number;
  totalWaitSeconds: number;
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
}

export interface RouteAlternativeV1 extends ProductRouteV1 {
  kind: "optimized";
  alternativeType: "lower_travel" | "popularity_oriented";
}

export interface SafeRecommendationDiagnostics {
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
  engineVersion: typeof ROUTE_RECOMMENDATION_ENGINE_VERSION;
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
  route: ProductRouteV1;
  alternatives: RouteAlternativeV1[];
  excludedHighlights: Array<{
    placeId: string;
    title: string | null;
    reasonCode: string;
  }>;
  warnings: string[];
  diagnostics?: SafeRecommendationDiagnostics;
}

export interface RouteRecommendationFailureResponseV1 {
  status: Exclude<RecommendationStatus, "ready">;
  apiVersion: typeof ROUTE_RECOMMENDATION_API_VERSION;
  reasonCodes: string[];
  userMessage: string;
  retryable: boolean;
}

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
