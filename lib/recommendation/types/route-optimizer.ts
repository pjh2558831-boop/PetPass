import "server-only";

import type { DetailedEligibleCandidate } from "@/lib/recommendation/types";
import type { PlaceUtilityBreakdown } from "@/lib/recommendation/scoring/place-utility";
import type { PopularityResult } from "@/lib/recommendation/popularity/popularity-calculator";
import type { PlaceTrustResult } from "@/types/place-source";
import type {
  OrderedRouteValidationResult,
  TravelMatrixEdge,
  TravelMatrixResult,
  TravelNode,
  TravelTimeTemporalBasis,
} from "@/lib/travel/types";
import type { UsefulTourCategory } from "@/lib/recommendation/types";
import type { PersonalizationScoreV2 } from "@/lib/recommendation/v2/personalization";

export type RouteVisitRole =
  | "activity"
  | "meal"
  | "rest"
  | "accommodation"
  | "shopping"
  | "other";

export interface NormalizedVisitWindow {
  startMinutes: number;
  endMinutes: number;
  finalEntryMinutes: number | null;
}

export interface NormalizedVisitSchedule {
  restDayInformation?: string | null;
  sourceDate?: string;
  status: "known" | "unknown";
  windows: NormalizedVisitWindow[];
  mandatoryReservationImpossible: boolean;
  source: "provider_normalized" | "stage2_unknown";
  warningCodes: string[];
}

export interface RouteExposureResult {
  version: "exposure-v1";
  status: "sufficient_data" | "not_available";
  score: number | null;
}

export interface RouteOptimizationCandidate {
  planningPolicy?: "full_public_catalog_v1";
  /** Present only when the candidate has an authoritative KTO detail record. */
  place: DetailedEligibleCandidate | null;
  node: TravelNode;
  placeUtility: PlaceUtilityBreakdown;
  dwellDurationMinutes: number;
  dwellDurationSource: "provider" | "category_default";
  schedule: NormalizedVisitSchedule;
  category: UsefulTourCategory;
  visitRole: RouteVisitRole;
  highActivity: boolean;
  popularity: PopularityResult;
  informationTrust: PlaceTrustResult;
  exposure: RouteExposureResult;
  source?: "tourism_service2" | "kakao_catalog";
  petAssessment?: "allowed" | "conditional" | "not_allowed" | "unknown";
  evidenceStatus?: "verified" | "conditional" | "unverified";
  eligibilityTier?: "verified" | "conditional" | "unverified";
  personalization?: PersonalizationScoreV2;
  /** Hybrid-mode anchors bypass optional-candidate pruning only. */
  locked?: boolean;
}

export interface RouteOptimizationTripRequest {
  planningPolicy?: "full_public_catalog_v1";
  scheduleIntent?: import("@/types/schedule").ScheduleIntent;
  date: string;
  startTime: string;
  timezone: "Asia/Seoul";
  tripType: "day_trip" | "overnight";
  tripPace: "relaxed" | "balanced" | "packed";
  selectedCategories: UsefulTourCategory[];
  roundTrip: boolean;
  desiredStopCount?: number;
  durationMinutes?: number;
  allowReducedStops?: boolean;
  /** Feasibility pass fixes this to the maximum honest stop count. */
  minimumStopCount?: number;
  /** Maximum jointly feasible count among requested categories. */
  minimumRequestedCategoryCount?: number;
  /** Every completed route must contain this canonical set. */
  requiredPlaceIds?: string[];
}

export interface RouteOptimizationInput {
  signal?: AbortSignal;
  validationBudget?: { remaining: number };
  departure: TravelNode;
  candidates: RouteOptimizationCandidate[];
  matrix: TravelMatrixResult;
  tripRequest: RouteOptimizationTripRequest;
}

export interface RouteScoreBreakdown {
  version: "route-objective-v1";
  discountedPlaceUtility: number;
  categoryCoverageBonus: number;
  categoryTransitionBonus: number;
  mealAlignmentBonus: number;
  restAfterActivityBonus: number;
  accommodationPlacementBonus: number;
  popularAnchorBonus: number;
  explorationBonus: number;
  drivingTimePenalty: number;
  waitingPenalty: number;
  repeatedCategoryPenalty: number;
  detourPenalty: number;
  unknownSchedulePenalty: number;
  paceDeviationPenalty: number;
  total: number;
}

export interface ScheduledRouteVisit {
  candidate: RouteOptimizationCandidate;
  arrivalAtMs: number;
  visitStartsAtMs: number;
  departureAtMs: number;
  travelSeconds: number;
  travelDistanceMeters: number;
  waitSeconds: number;
}

export interface RouteSearchState {
  orderedPlaceIds: string[];
  currentNodeId: string;
  currentTimeEpochMs: number;
  totalDrivingSeconds: number;
  totalVisitSeconds: number;
  totalWaitSeconds: number;
  totalDistanceMeters: number;
  visitedCategories: string[];
  visitedRoles: RouteVisitRole[];
  unknownScheduleCount: number;
  popularAnchorCount: number;
  explorationCandidateCount: number;
  score: number;
  scoreBreakdown: RouteScoreBreakdown;
  warningCodes: string[];
  visits: ScheduledRouteVisit[];
}

export interface CompletedRouteCandidate extends RouteSearchState {
  signature: string;
  detourRatio: number;
  fastestDrivingSecondsForSelectedSet: number;
  informationTrustSum: number;
  transitionReasonCodes: string[];
  mealReasonCodes: string[];
  popularAnchorPlaceId: string | null;
  explorationPlaceId: string | null;
}

export interface RecommendedRouteStop {
  placeId: string;
  sequence: number;
  arrivalAt: string;
  visitStartsAt: string;
  departureAt: string;
  dwellMinutes: number;
  driveSecondsFromPrevious: number;
  distanceMetersFromPrevious: number;
  waitSeconds: number;
  dwellDurationSource: "provider" | "category_default";
  source: "tourism_service2" | "kakao_catalog";
  petAssessment: "allowed" | "conditional" | "not_allowed" | "unknown";
  evidenceStatus?: "verified" | "conditional" | "unverified";
  informationTrust: "high" | "medium" | "low";
  placeUtility: PlaceUtilityBreakdown;
  inclusionReasonCodes: string[];
  orderingReasonCodes: string[];
  warningCodes: string[];
}

export type ExcludedPlaceReason =
  | "time_window_conflict"
  | "excessive_detour"
  | "category_redundancy"
  | "lower_total_route_score"
  | "unresolved_travel_edge"
  | "pace_limit"
  | "accommodation_position_rule"
  | "final_validation_failure";

export interface ExcludedPlaceExplanation {
  placeId: string;
  reasonCode: ExcludedPlaceReason;
  placeUtility: number;
}

export interface ValidatedRouteAlternative {
  type: "lower_travel" | "popularity_oriented";
  score: number;
  scoreBreakdown: RouteScoreBreakdown;
  stopIds: string[];
  startAt: string;
  endAt: string;
  totalDrivingSeconds: number;
  totalVisitSeconds: number;
  totalWaitSeconds: number;
  totalDistanceMeters: number;
  temporalBasis: TravelTimeTemporalBasis;
  stops: RecommendedRouteStop[];
  geometry: Array<{ latitude: number; longitude: number }>;
}

export interface RouteSolverDiagnostics {
  candidateCount: number;
  expandedStates: number;
  prunedByBound: number;
  prunedByTimeWindow: number;
  prunedByDuration: number;
  prunedByMissingEdge: number;
  prunedByConstraint: number;
  completedRoutes: number;
  exactSearchCompleted: boolean;
  deadlineExceeded: boolean;
  stateLimitExceeded: boolean;
  beamFallbackUsed: boolean;
  internalFinalists: number;
  validationAttempts: number;
  validationFailures: number;
  validatedRoutes: number;
  matrixTemporalBasis: TravelTimeTemporalBasis;
  solverDurationMs: number;
  validationDurationMs: number;
  totalDurationMs: number;
}

export type RouteSearchOptimality =
  | "optimal_within_candidate_set_current_matrix"
  | "best_found_within_time_limit";

export interface ValidatedInternalRoute {
  route: CompletedRouteCandidate;
  validation: OrderedRouteValidationResult & { status: "validated" };
}

export type RouteOptimizationResult =
  | {
      status: "ready";
      engineVersion: "petpass-route-engine-v1";
      solverVersion: "route-solver-v1";
      objectiveVersion: "route-objective-v1";
      searchOptimality: RouteSearchOptimality;
      validationSelection:
        | "best_validated_candidate"
        | "only_validated_candidate";
      score: number;
      scoreBreakdown: RouteScoreBreakdown;
      schedule: {
        startAt: string;
        endAt: string;
        matrixTemporalBasis: TravelMatrixEdge["temporalBasis"];
        finalValidationTemporalBasis: OrderedRouteValidationResult["temporalBasis"];
        totalDrivingSeconds: number;
        totalVisitSeconds: number;
        totalWaitSeconds: number;
        totalDistanceMeters: number;
      };
      stops: RecommendedRouteStop[];
      geometry: Array<{ latitude: number; longitude: number }>;
      alternatives: ValidatedRouteAlternative[];
      excludedHighlights: ExcludedPlaceExplanation[];
      warnings: string[];
      diagnostics: RouteSolverDiagnostics;
    }
  | {
      status:
        | "insufficient_feasible_route"
        | "matrix_incomplete"
        | "final_validation_failed"
        | "solver_failed";
      reasonCodes: string[];
      diagnostics: RouteSolverDiagnostics;
    };
