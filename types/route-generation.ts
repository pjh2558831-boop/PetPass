import type { Coordinates, TourContentTypeId, TourPlaceCategory } from "@/types/place";
import type { PetSize } from "@/types/pet";
import type { PetSizeCompatibilityResult } from "@/types/pet-size-compatibility";
import type {
  TourPetAccessCondition,
  TourPetAccessEvaluationState,
  TourPetAccessScope,
} from "@/types/tour-pet-access";

export const ITINERARY_PROFILES = [
  "minimum_travel",
  "balanced_tour_food",
  "walk_leisure",
] as const;

export type ItineraryProfile = (typeof ITINERARY_PROFILES)[number];

export type IndoorAccessPreference = "any" | "preferred" | "required";

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
  | "candidate_limit"
  | "detail_unavailable"
  | "detail_mismatch"
  | "not_allowed"
  | "unknown"
  | "not_applicable"
  | "pet_size_incompatible"
  | "pet_size_verification_required"
  | "indoor_requirement"
  | "closed_at_visit"
  | "duration_exceeded"
  | "directions_unavailable"
  | "diversity_duplicate";

export type ItineraryExclusionCounts = Record<ItineraryExclusionReason, number>;

export interface NormalizedItineraryRequest {
  scope:
    | { type: "busan"; regionCode: "26"; regionName: "부산 전체" }
    | {
        type: "district";
        regionCode: "26";
        regionName: "부산";
        districtCode: string;
        districtName: string;
      };
  start: {
    coordinates: Coordinates;
    label: string | null;
  };
  travelDate: string;
  startTime: string;
  planningMode: "duration" | "stop_count";
  desiredDurationMinutes: number | null;
  desiredStopCount: number;
  petSize: PetSize | null;
  indoorAccessPreference: IndoorAccessPreference;
  selectedCategories: TourPlaceCategory[];
  includeShopping: boolean;
}

export interface GeneratedPetAccess {
  verdict: "allowed" | "conditional";
  evaluationState: TourPetAccessEvaluationState;
  permittedScopes: TourPetAccessScope[];
  restrictedScopes: TourPetAccessScope[];
  conditions: TourPetAccessCondition[];
  sizeCompatibility: PetSizeCompatibilityResult;
}

export interface ItineraryCandidateFunnel {
  matchingCatalogCandidates: number;
  afterBasicFilters: number;
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
  indoorRequirementExcluded: number;
  itineraryEligibleCandidates: number;
  returnedRoutes: number;
}

export interface GeneratedItineraryStop {
  order: number;
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
}

export interface GeneratedItinerary {
  id: string;
  profile: ItineraryProfile;
  title: string;
  explanation: string;
  stops: GeneratedItineraryStop[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  estimatedElapsedDurationMinutes: number;
  geometry: Coordinates[];
}

export interface ItineraryGenerationLimits {
  maxCatalogCandidates: number;
  maxDetailCalls: number;
  maxDirectionsCalls: number;
  detailConcurrency: number;
  catalogConcurrency: number;
  maxCatalogPagesPerContentType: number;
}

export interface ItineraryGenerationResponse {
  state: ItineraryGenerationState;
  request: NormalizedItineraryRequest;
  providerCandidatesConsidered: number;
  shortlistedCandidates: number;
  eligibleCandidates: number;
  candidateFunnel: ItineraryCandidateFunnel;
  exclusionCounts: ItineraryExclusionCounts;
  providerCalls: {
    detail: number;
    directions: number;
  };
  limits: ItineraryGenerationLimits;
  itineraries: GeneratedItinerary[];
  notices: string[];
}
