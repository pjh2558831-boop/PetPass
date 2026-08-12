import type { LicensingMatchResult } from "@/types/license";
import type { PetSizeCompatibilityResult } from "@/types/pet-size-compatibility";
import type {
  TourContentTypeId,
  TourPlaceCategory,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";
import type {
  AutomaticRouteEligibilityResult,
  AutomaticRoutePetProfile,
  AutomaticRouteTripRequest,
} from "@/types/route-eligibility";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";
import type {
  NormalizedItineraryRequest,
  TravelSuitabilityAssessment,
} from "@/types/route-generation";
import type { TourPlaceScheduleDetail } from "@/lib/tour-api/service";
import type { PlaceTrustResult } from "@/types/place-source";
import type { PopularityResult } from "@/lib/recommendation/popularity/popularity-calculator";
import type { PlaceUtilityBreakdown } from "@/lib/recommendation/scoring/place-utility";

export type UsefulTourCategory = Exclude<
  TourPlaceCategory,
  "transportation" | "unknown"
>;

export type CachedDetailStatus =
  | "available"
  | "missing"
  | "stale"
  | "provider_unavailable";

export interface LightweightRouteCandidate {
  contentId: string;
  contentTypeId: TourContentTypeId;
  title: string;
  coordinates: { latitude: number; longitude: number };
  region: { regionCode: string; districtCode: string | null };
  providerVisibility: "exposed";
  source: "tourism_service2";
  category: UsefulTourCategory;
  summary: TourPlaceSummary;
  travelSuitability: TravelSuitabilityAssessment;
  distanceKm: number;
  listDataQuality: number;
  cachedDetailStatus: CachedDetailStatus;
  retrievalScore: {
    version: "retrieval-score-v1";
    total: number;
    preferenceFit: number;
    proximity: number;
    categoryCoverageNeed: number;
    listDataQuality: number;
    popularityPrior: number;
    weightedContributions: {
      preferenceFit: number;
      proximity: number;
      categoryCoverageNeed: number;
      listDataQuality: number;
      popularityPrior: number;
    };
  };
}

export type ScheduleCompatibility =
  | "compatible"
  | "unknown"
  | "conflict"
  | "provider_unavailable";

export interface ScheduleCompatibilityResult {
  status: ScheduleCompatibility;
  warningCodes: string[];
  reasonCodes: string[];
}

export interface ScheduledRouteCandidate extends LightweightRouteCandidate {
  scheduleDetail: TourPlaceScheduleDetail | null;
  scheduleCompatibility: ScheduleCompatibilityResult;
}

export interface DetailedEligibleCandidate extends ScheduledRouteCandidate {
  detail: TourPlaceDetail;
  assessment: TourPetAccessSemanticAssessment;
  sizeCompatibility: PetSizeCompatibilityResult;
  licensing: LicensingMatchResult | null;
  eligibility: AutomaticRouteEligibilityResult & { eligible: true };
  trust: PlaceTrustResult;
  popularity: PopularityResult;
  utility: PlaceUtilityBreakdown;
}

export interface CandidatePipelineDiagnostics {
  version: "candidate-pipeline-v1";
  initialCatalogCount: number;
  exposedCount: number;
  coordinateValidCount: number;
  categoryAcceptedCount: number;
  stageACount: number;
  stageBCount: number;
  detailedEvaluationCount: number;
  detailedBatchCount: number;
  eligibleCount: number;
  finalEligibleCount: number;
  cacheHits: number;
  providerCalls: number;
  providerFailures: number;
  providerUnavailableCandidates: number;
  skippedCandidates: number;
  detailCallsByOperation: Record<string, number>;
  excludedByReason: Record<string, number>;
  warningsByReason: Record<string, number>;
  categoryDistribution: Record<string, number>;
}

export type CandidatePipelineStatus =
  | "ready"
  | "insufficient_eligible_places"
  | "provider_unavailable";

export interface CandidatePipelineResult {
  status: CandidatePipelineStatus;
  eligibleCount: number;
  requiredMinimum: number;
  eligiblePoolTarget: number;
  reasonCounts: Record<string, number>;
  candidates: DetailedEligibleCandidate[];
  diagnostics: CandidatePipelineDiagnostics;
}

export interface CandidatePipelineRequestContext {
  request: NormalizedItineraryRequest;
  /** Stage 2 server-owned pace maximum; never accepted from browser controls. */
  maxStops: number;
  minStops: number;
  tripType: "DAY_TRIP" | "OVERNIGHT";
  petProfile: AutomaticRoutePetProfile;
  tripRequest: AutomaticRouteTripRequest;
}
