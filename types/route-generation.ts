import type { Coordinates, TourContentTypeId, TourPlaceCategory } from "@/types/place";
import type { PetSize, PetSpecies, TripPace, TripType } from "@/types/pet";
import type { PetSizeCompatibilityResult } from "@/types/pet-size-compatibility";
import type { CandidatePipelineDiagnostics } from "@/lib/recommendation/types";
import type { PlaceUtilityBreakdown } from "@/lib/recommendation/scoring/place-utility";
import type {
  TourPetAccessAssessment,
  TourPetAccessCondition,
  TourPetAccessEvaluationState,
  TourPetAccessScope,
  TourPetAccessVerdict,
} from "@/types/tour-pet-access";

export const ITINERARY_PROFILES = [
  "preference_balanced",
  "minimum_movement",
  "discovery",
] as const;

export type ItineraryProfile = (typeof ITINERARY_PROFILES)[number];

export type IndoorAccessPreference = "any" | "preferred" | "required";
export type EnvironmentPreference = "any" | "indoor_preferred" | "outdoor_preferred";

export type RecommendationTier =
  | "verified"
  | "conditional"
  | "exploratory"
  | "excluded";

export type TravelRole =
  | "beach"
  | "park"
  | "walking_trail"
  | "viewpoint"
  | "cultural_venue"
  | "experience"
  | "photo_spot"
  | "cafe"
  | "meal"
  | "rest_stop"
  | "indoor_activity"
  | "outdoor_activity"
  | "accommodation"
  | "tourism_market"
  | "general_attraction";

export type TravelSuitabilityExclusionReason =
  | "medical_business"
  | "household_or_wedding_retail"
  | "optical_or_beauty_service"
  | "finance_or_daily_service"
  | "generic_retail"
  | "pet_supply_only"
  | "non_visitor_facility"
  | "shopping_disabled"
  | "shopping_missing_travel_role"
  | "invalid_coordinates"
  | "outside_selected_region"
  | "closed_or_unusable"
  | "unsupported_record";

export interface TravelSuitabilityEvidence {
  source:
    | "tour_content_type"
    | "tour_classification"
    | "tour_name"
    | "region"
    | "kakao_category"
    | "pet_evidence";
  code: string;
  value: string;
}

export interface TravelSuitabilityAssessment {
  travelSuitable: boolean;
  travelRole: TravelRole | null;
  normalizedCategory: Exclude<
    TourPlaceCategory,
    "transportation" | "unknown"
  > | null;
  recommendationTier: RecommendationTier;
  exclusionReason: TravelSuitabilityExclusionReason | null;
  eligibilityReason: string | null;
  evidence: TravelSuitabilityEvidence[];
  source: {
    provider: "Korea Tourism Organization" | "Kakao Local";
    identity: string;
  };
  petVerificationState:
    | "verified"
    | "conditional"
    | "verification_required"
    | "not_allowed"
    | "unknown";
  scoringEligible: boolean;
}

export interface PetEquipmentAvailability {
  hasCarrier: boolean | null;
  hasLeash: boolean | null;
  hasMuzzle: boolean | null;
}

export interface PlaceScoreComponents {
  petCompatibility: number;
  preferenceMatch: number;
  travelAttractiveness: number;
  scheduleFit: number;
  informationCompleteness: number;
  kakaoRelevance: number;
}

export interface ExplainablePlaceScore {
  total: number;
  components: PlaceScoreComponents;
  reasons: string[];
  evidenceCodes: string[];
}

export interface RouteScoreComponents {
  placeScoreTotal: number;
  preferenceCoverage: number;
  travelRoleDiversity: number;
  scheduleFit: number;
  travelTimePenalty: number;
  backtrackingPenalty: number;
  repeatedCategoryPenalty: number;
  unverifiedPlaceRisk: number;
}

export interface ExplainableRouteScore {
  total: number;
  qualityRatio: number;
  components: RouteScoreComponents;
}

export type ItineraryGenerationState =
  | "ready"
  | "partial"
  | "insufficient_candidates"
  | "provider_unavailable";

export type ItineraryExclusionReason =
  | "shopping_disabled"
  | "unsupported_record"
  | "malformed_record"
  | "malformed_coordinates"
  | "travel_unsuitable"
  | "candidate_limit"
  | "detail_unavailable"
  | "detail_mismatch"
  | "not_allowed"
  | "unknown"
  | "not_applicable"
  | "pet_size_incompatible"
  | "pet_size_verification_required"
  | "equipment_incompatible"
  | "indoor_requirement"
  | "closed_at_visit"
  | "check_in_unavailable"
  | "duration_exceeded"
  | "directions_unavailable"
  | "diversity_duplicate"
  | "recent_signature";

export type ItineraryExclusionCounts = Record<ItineraryExclusionReason, number>;

export interface NormalizedItineraryRequest {
  scope:
    | { type: "region" | "busan"; regionCode: string; regionName: string }
    | {
        type: "district";
        regionCode: string;
        regionName: string;
        districtCode: string;
        districtName: string;
      };
  start: {
    coordinates: Coordinates;
    label: string | null;
  };
  travelDate: string;
  tripType: TripType;
  tripPace: TripPace;
  startTime: string;
  planningMode: "duration" | "stop_count";
  desiredDurationMinutes: number | null;
  desiredStopCount: number;
  petSpecies: PetSpecies;
  petSize: PetSize | null;
  acceptsOutdoorOnly: boolean;
  petEquipment: PetEquipmentAvailability;
  indoorAccessPreference: IndoorAccessPreference;
  environmentPreference?: EnvironmentPreference;
  selectedCategories: TourPlaceCategory[];
  includeShopping: boolean;
  generationSeed: string;
  recentRouteSignatures: string[];
  personalization?: NonNullable<import("@/types/recommendation").RouteRecommendationRequest["personalization"]>;
}

export interface GeneratedPetAccess {
  verdict: TourPetAccessVerdict;
  evaluationState: TourPetAccessEvaluationState;
  permittedScopes: TourPetAccessScope[];
  restrictedScopes: TourPetAccessScope[];
  conditions: TourPetAccessCondition[];
  sizeCompatibility: PetSizeCompatibilityResult;
  summary?: TourPetAccessAssessment["summary"];
  confidence?: TourPetAccessAssessment["confidence"];
  reasonCodes?: TourPetAccessAssessment["reasonCodes"];
  evidence?: TourPetAccessAssessment["evidence"];
  conflicts?: TourPetAccessAssessment["conflicts"];
  verificationItems?: TourPetAccessAssessment["verificationItems"];
  sources?: TourPetAccessAssessment["sources"];
  warnings?: TourPetAccessAssessment["warnings"];
}

export interface ItineraryCandidateFunnel {
  matchingCatalogCandidates: number;
  afterBasicFilters: number;
  travelSuitableCandidates: number;
  travelSuitabilityExcluded: number;
  preliminaryRankedCandidates: number;
  detailedAssessmentCandidates: number;
  detailOutcomes: {
    unavailable: number;
    mismatch: number;
  };
  basePetAccess: {
    allowed: number;
    conditional: number;
    notAllowed: number;
    unknown: number;
    notApplicable: number;
  };
  petSizeCompatibility: {
    compatible: number;
    incompatible: number;
    verificationRequired: number;
    notSpecified: number;
  };
  equipmentMismatchExcluded: number;
  indoorRequirementExcluded: number;
  itineraryEligibleCandidates: number;
  generatedCombinations: number;
  returnedRoutes: number;
}

export interface GeneratedItineraryStop {
  order: number;
  stableIdentity: string;
  source: "TOUR_API" | "KAKAO";
  contentId: string;
  title: string;
  address: string | null;
  coordinates: Coordinates;
  providerContentTypeId: string;
  contentTypeId: TourContentTypeId;
  category: Exclude<TourPlaceCategory, "transportation" | "unknown">;
  plannedArrival: string;
  plannedDeparture: string;
  visitDurationMinutes: number;
  distanceFromPreviousMeters: number;
  durationFromPreviousSeconds: number;
  petAccess: GeneratedPetAccess;
  operatingHours: {
    status: "open" | "unknown";
    warning: "운영시간 확인 필요" | null;
  };
  travelSuitability: TravelSuitabilityAssessment;
  placeScore: ExplainablePlaceScore;
  placeUtility: PlaceUtilityBreakdown;
  recommendationReasons: string[];
  callAheadRequired: boolean;
  imageUrl?: string;
  phone?: string;
  placeUrl?: string;
  verifiedReplacementIdentity?: string;
}

export interface GeneratedItinerary {
  id: string;
  signature: string;
  profile: ItineraryProfile;
  title: string;
  explanation: string;
  stops: GeneratedItineraryStop[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  estimatedElapsedDurationMinutes: number;
  geometry: Coordinates[];
  routeScore: ExplainableRouteScore;
}

export interface ItineraryGenerationLimits {
  maxCatalogCandidates: number;
  maxDetailCalls: number;
  maxDirectionsCalls: number;
  detailConcurrency: number;
  catalogConcurrency: number;
  maxCatalogPagesPerContentType: number;
  maxCourseCombinations: number;
}

export interface ItineraryGenerationResponse {
  state: ItineraryGenerationState;
  request: NormalizedItineraryRequest;
  providerCandidatesConsidered: number;
  shortlistedCandidates: number;
  eligibleCandidates: number;
  candidateFunnel: ItineraryCandidateFunnel;
  exclusionCounts: ItineraryExclusionCounts;
  travelSuitabilityExclusions: Partial<
    Record<TravelSuitabilityExclusionReason, number>
  >;
  providerCalls: {
    detail: number;
    directions: number;
    discovery: number;
  };
  candidatePipeline: {
    version: "candidate-pipeline-v1";
    status:
      | "ready"
      | "insufficient_eligible_places"
      | "provider_unavailable";
    eligiblePoolTarget: number;
    requiredMinimum: number;
    reasonCounts: Record<string, number>;
    diagnostics: CandidatePipelineDiagnostics;
  };
  limits: ItineraryGenerationLimits;
  itineraries: GeneratedItinerary[];
  notices: string[];
}
