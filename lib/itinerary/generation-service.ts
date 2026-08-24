import "server-only";

import {
  BUSAN_DISCOVERY_BOUNDS,
  containsCoordinates,
  discoverKakaoPlaces,
  rectangleFromCenter,
  type KakaoDiscoveryInput,
} from "@/lib/kakao/discovery";
import { getDirections } from "@/lib/kakao/directions";
import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import {
  assessPetSizeCompatibility,
  type PetSizeSourceEvidence,
} from "@/lib/pet-access/tourism/size-compatibility";
import { getItineraryGenerationRequestKey } from "@/lib/itinerary/request-schema";
import {
  assessOperatingHours,
  UNKNOWN_OPERATING_HOURS_WARNING,
} from "@/lib/itinerary/operating-hours";
import {
  evaluateAutomaticRouteEligibility,
  KTO_SERVICE2_NAME,
} from "@/lib/itinerary/automatic-route-eligibility";
import { supportsRequiredIndoorAccess } from "@/lib/itinerary/indoor-access";
import {
  getDefaultLicenseMatchingService,
  type LicenseMatcher,
} from "@/lib/licenses/service";
import { haversineKm } from "@/lib/itinerary/optimizer";
import {
  scorePreliminaryCompleteness,
} from "@/lib/itinerary/recommendation-scoring";
import { getTripPaceConfig } from "@/lib/itinerary/trip-pace";
import { runCandidatePipelineV1 } from "@/lib/recommendation/candidate-pipeline";
import { CANDIDATE_PIPELINE_V1_CONFIG } from "@/lib/recommendation/config/candidate-pipeline-v1";
import type { PlaceUtilityBreakdown } from "@/lib/recommendation/scoring/place-utility";
import {
  classifyTourTravelSuitability,
  withTourPetVerification,
} from "@/lib/itinerary/travel-suitability";
import {
  BUSAN_REGION_CONFIG,
  getRegionDistrict,
} from "@/lib/regions/config";
import {
  TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE,
  collectTourCatalog,
} from "@/lib/tour-api/catalog-service";
import {
  getCatalogContentTypeId,
  TOUR_ITINERARY_ELIGIBLE_CONTENT_TYPE_IDS,
  type BusanDistrictCode,
  type TourCatalogCategory,
} from "@/lib/tour-api/catalog";
import {
  getDefaultTourService,
  type TourPlaceService,
  type TourRequestObservation,
} from "@/lib/tour-api/service";
import {
  KAKAO_DISCOVERY_CATEGORIES,
  type KakaoDirectionsRequest,
  type KakaoDiscoveryCategory,
  type KakaoDiscoveryResponse,
  type KakaoDrivingRoute,
} from "@/types/kakao";
import type {
  Coordinates,
  TourContentTypeId,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";
import type {
  ExplainablePlaceScore,
  ExplainableRouteScore,
  GeneratedItinerary,
  GeneratedItineraryStop,
  GeneratedPetAccess,
  ItineraryCandidateFunnel,
  ItineraryExclusionCounts,
  ItineraryGenerationLimits,
  ItineraryGenerationResponse,
  ItineraryProfile,
  NormalizedItineraryRequest,
  PetEquipmentAvailability,
  TravelSuitabilityAssessment,
  TravelSuitabilityExclusionReason,
} from "@/types/route-generation";
import type { PetSizeCompatibilityResult } from "@/types/pet-size-compatibility";
import type { TourPetAccessSemanticAssessment } from "@/types/tour-pet-access";

const MAX_COURSE_COMBINATIONS = 60;

export const ITINERARY_GENERATION_LIMITS = {
  maxCatalogCandidates: CANDIDATE_PIPELINE_V1_CONFIG.stageALimit,
  maxDetailCalls: CANDIDATE_PIPELINE_V1_CONFIG.maxDetailedEvaluations,
  maxDirectionsCalls: 6,
  detailConcurrency: CANDIDATE_PIPELINE_V1_CONFIG.detailConcurrency,
  catalogConcurrency: 2,
  maxCatalogPagesPerContentType: TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE,
  maxCourseCombinations: MAX_COURSE_COMBINATIONS,
} as const satisfies ItineraryGenerationLimits;

export const MAX_ITINERARY_JACCARD_OVERLAP = 0.5;
export const MIN_ALTERNATE_ROUTE_QUALITY_RATIO = 0.85;

const VISIT_DURATION_MINUTES = {
  attraction: 60,
  culture: 75,
  festival: 90,
  leisure: 90,
  accommodation: 60,
  food: 75,
  shopping: 60,
} as const satisfies Record<TourCatalogCategory, number>;

const PROFILE_COPY: Record<
  ItineraryProfile,
  { title: string; explanation: string }
> = {
  preference_balanced: {
    title: "취향 균형 코스",
    explanation:
      "선택한 유형과 여행 역할을 고르게 포함하면서 검증된 반려동물 조건과 실제 Kakao 이동 경로를 반영했습니다.",
  },
  minimum_movement: {
    title: "이동 최소 코스",
    explanation:
      "여행 품질 하한을 지키는 후보 중 예상 이동과 역주행이 작은 조합을 실제 Kakao 길찾기로 확정했습니다.",
  },
  discovery: {
    title: "새로운 발견 코스",
    explanation:
      "검증된 관광공사 장소의 역할 다양성을 우선하며, 안전한 경우에만 확인이 필요한 Kakao 후보 한 곳을 포함합니다.",
  },
};

type SuitableTourSummary = TourPlaceSummary & {
  title: string;
  contentTypeId: TourContentTypeId;
  providerContentTypeId: TourContentTypeId | null;
  category: TourCatalogCategory;
  latitude: number;
  longitude: number;
};

interface ClassifiedSummary {
  summary: SuitableTourSummary;
  suitability: TravelSuitabilityAssessment;
  distanceKm: number;
  preliminaryScore: number;
}

interface RouteCandidate {
  stableIdentity: string;
  source: "TOUR_API" | "KAKAO";
  contentId: string;
  title: string;
  address: string | null;
  coordinates: Coordinates;
  providerContentTypeId: string;
  contentTypeId: TourContentTypeId;
  category: TourCatalogCategory;
  detail: TourPlaceDetail | null;
  petAccess: GeneratedPetAccess;
  suitability: TravelSuitabilityAssessment;
  placeScore: ExplainablePlaceScore;
  placeUtility: PlaceUtilityBreakdown;
  imageUrl?: string;
  phone?: string;
  placeUrl?: string;
  verifiedReplacementIdentity?: string;
}

interface ProposedCourse {
  profile: ItineraryProfile;
  candidates: RouteCandidate[];
  signature: string;
  legacySignature: string;
  estimatedScore: number;
}

export interface ItineraryGenerationDependencies {
  tourService?: TourPlaceService;
  licenseMatcher?: LicenseMatcher;
  directions?: (
    request: KakaoDirectionsRequest,
  ) => Promise<KakaoDrivingRoute>;
  discoverPlaces?: (
    input: KakaoDiscoveryInput,
    existingPlaces: readonly TourPlaceSummary[],
  ) => Promise<KakaoDiscoveryResponse>;
}

function emptyExclusions(): ItineraryExclusionCounts {
  return {
    shopping_disabled: 0,
    unsupported_record: 0,
    malformed_record: 0,
    malformed_coordinates: 0,
    travel_unsuitable: 0,
    candidate_limit: 0,
    detail_unavailable: 0,
    detail_mismatch: 0,
    not_allowed: 0,
    unknown: 0,
    not_applicable: 0,
    pet_size_incompatible: 0,
    pet_size_verification_required: 0,
    equipment_incompatible: 0,
    indoor_requirement: 0,
    closed_at_visit: 0,
    check_in_unavailable: 0,
    duration_exceeded: 0,
    directions_unavailable: 0,
    diversity_duplicate: 0,
    recent_signature: 0,
  };
}

function emptyCandidateFunnel(): ItineraryCandidateFunnel {
  return {
    matchingCatalogCandidates: 0,
    afterBasicFilters: 0,
    travelSuitableCandidates: 0,
    travelSuitabilityExcluded: 0,
    preliminaryRankedCandidates: 0,
    detailedAssessmentCandidates: 0,
    detailOutcomes: { unavailable: 0, mismatch: 0 },
    basePetAccess: {
      allowed: 0,
      conditional: 0,
      notAllowed: 0,
      unknown: 0,
      notApplicable: 0,
    },
    petSizeCompatibility: {
      compatible: 0,
      incompatible: 0,
      verificationRequired: 0,
      notSpecified: 0,
    },
    equipmentMismatchExcluded: 0,
    indoorRequirementExcluded: 0,
    itineraryEligibleCandidates: 0,
    generatedCombinations: 0,
    returnedRoutes: 0,
  };
}

function emptyCandidatePipeline(
  request: NormalizedItineraryRequest,
  observations: readonly TourRequestObservation[] = [],
): ItineraryGenerationResponse["candidatePipeline"] {
  const pace = getTripPaceConfig(request.tripPace);
  const cacheHits = observations.filter(
    ({ cache }) => cache === "hit" || cache === "coalesced",
  ).length;
  const providerCalls = observations.filter(
    ({ liveProviderCall }) => liveProviderCall,
  ).length;
  const providerFailures = observations.filter(
    ({ providerOutcome }) => providerOutcome === "failed",
  ).length;
  return {
    version: "candidate-pipeline-v1",
    status: "provider_unavailable",
    eligiblePoolTarget: Math.min(10, pace.maxStops + 3),
    requiredMinimum: pace.minStops,
    reasonCounts: { catalog_provider_unavailable: 1 },
    diagnostics: {
      version: "candidate-pipeline-v1",
      initialCatalogCount: 0,
      exposedCount: 0,
      coordinateValidCount: 0,
      categoryAcceptedCount: 0,
      stageACount: 0,
      stageBCount: 0,
      detailedEvaluationCount: 0,
      detailedBatchCount: 0,
      eligibleCount: 0,
      finalEligibleCount: 0,
      cacheHits,
      providerCalls,
      providerFailures,
      providerUnavailableCandidates: 0,
      skippedCandidates: 0,
      detailCallsByOperation: {},
      excludedByReason: { catalog_provider_unavailable: 1 },
      warningsByReason: {},
      categoryDistribution: {},
    },
  };
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function stableRequestHash(request: NormalizedItineraryRequest): string {
  return stableHash(getItineraryGenerationRequestKey(request)).toString(36);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function incrementTravelExclusion(
  counts: Partial<Record<TravelSuitabilityExclusionReason, number>>,
  reason: TravelSuitabilityExclusionReason | null,
): void {
  if (!reason) return;
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function maximumReasonCount(
  counts: Readonly<Record<string, number>>,
  reasons: readonly string[],
): number {
  return reasons.reduce(
    (maximum, reason) => Math.max(maximum, counts[reason] ?? 0),
    0,
  );
}

function applyCandidatePipelineExclusions(
  target: ItineraryExclusionCounts,
  counts: Readonly<Record<string, number>>,
  request: NormalizedItineraryRequest,
): void {
  target.not_allowed += maximumReasonCount(counts, ["pet_access_not_allowed"]);
  target.not_applicable += maximumReasonCount(counts, [
    "pet_access_not_applicable",
  ]);
  target.unknown += maximumReasonCount(counts, [
    "provider_visibility_unknown",
    "pet_evidence_absent",
    "pet_evidence_empty",
    "pet_evidence_not_consumed",
    "pet_access_unknown",
    "pet_type_verification_required",
    "mandatory_condition_verification_required",
  ]);
  const providerUnavailable = maximumReasonCount(counts, [
    "schedule_provider_unavailable",
    "schedule_intro_provider_unavailable",
    "candidate_detail_provider_unavailable",
    "provider_visibility_unavailable",
    "required_list_call_unavailable",
    "required_common_detail_call_unavailable",
    "required_intro_detail_call_unavailable",
    "required_pet_detail_call_unavailable",
    "pet_evidence_provider_unavailable",
    "pet_access_provider_unavailable",
  ]);
  // A provider outage may also yield canonical unknown/verification reasons,
  // but it must remain an availability failure rather than being reported as
  // an evidence-unknown outcome.
  target.unknown = Math.max(0, target.unknown - providerUnavailable);
  target.pet_size_incompatible += maximumReasonCount(counts, [
    "pet_size_incompatible",
  ]);
  target.pet_size_verification_required += maximumReasonCount(counts, [
    "pet_size_verification_required",
  ]);
  const mandatoryConditionUnsatisfied = maximumReasonCount(counts, [
    "mandatory_condition_unsatisfied",
  ]);
  if (request.indoorAccessPreference === "required") {
    target.indoor_requirement +=
      mandatoryConditionUnsatisfied +
      maximumReasonCount(counts, ["indoor_access_not_confirmed"]);
  } else {
    target.equipment_incompatible += mandatoryConditionUnsatisfied;
  }
  target.equipment_incompatible += maximumReasonCount(counts, [
    "mandatory_condition_verification_required",
  ]);
  target.travel_unsuitable += maximumReasonCount(counts, [
    "matched_license_closed",
  ]);
  target.closed_at_visit += maximumReasonCount(counts, [
    "confirmed_schedule_conflict",
    "operating_time_conflict",
  ]);
  target.malformed_coordinates += maximumReasonCount(counts, [
    "invalid_coordinates",
    "outside_requested_geographic_scope",
    "geographic_scope_verification_required",
  ]);
  target.detail_mismatch += maximumReasonCount(counts, [
    "detail_identity_mismatch",
    "source_identity_mismatch",
    "provider_visibility_identity_mismatch",
    "pet_evidence_identity_mismatch",
  ]);
  target.unsupported_record += maximumReasonCount(counts, [
    "source_not_kto_service2",
  ]);
  target.detail_unavailable += providerUnavailable;
}

function isCatalogRecordForRequest(
  place: TourPlaceSummary,
  requestedCategory: TourCatalogCategory,
  requestedType: TourContentTypeId,
): boolean {
  return (
    place.contentTypeId === requestedType &&
    place.providerContentTypeId === requestedType &&
    place.category === requestedCategory &&
    TOUR_ITINERARY_ELIGIBLE_CONTENT_TYPE_IDS.includes(requestedType) &&
    place.source.operation === "areaBasedList2"
  );
}

function toSuitableSummary(place: TourPlaceSummary): SuitableTourSummary | null {
  if (
    !place.title?.trim() ||
    !place.contentTypeId ||
    place.category === "transportation" ||
    place.category === "unknown" ||
    place.latitude === null ||
    place.longitude === null ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    return null;
  }
  return place as SuitableTourSummary;
}

function getPetSizeSourceEvidence(
  detail: TourPlaceDetail,
): PetSizeSourceEvidence[] {
  const primary = detail.petPolicyEvidence
    ? Object.entries(detail.petPolicyEvidence.fields).flatMap(
        ([field, sourceText]) =>
          sourceText
            ? [{ id: `detailPetTour2:${field}:source`, sourceText }]
            : [],
      )
    : [];
  const fallback = detail.introPetPolicyEvidence
    ? [
        {
          id: `detailIntro2:${detail.introPetPolicyEvidence.field}:source`,
          sourceText: detail.introPetPolicyEvidence.value,
        },
      ]
    : [];
  return [...primary, ...fallback];
}

const EQUIPMENT_FIELDS = {
  carrier_required: "hasCarrier",
  leash_required: "hasLeash",
  muzzle_required: "hasMuzzle",
} as const satisfies Partial<
  Record<string, keyof PetEquipmentAvailability>
>;

function hasKnownEquipmentMismatch(
  assessment: TourPetAccessSemanticAssessment,
  equipment: PetEquipmentAvailability,
): boolean {
  return assessment.conditions.some((condition) => {
    const field = EQUIPMENT_FIELDS[
      condition.type as keyof typeof EQUIPMENT_FIELDS
    ];
    return field ? equipment[field] === false : false;
  });
}

function detailMatchesCatalog(
  detail: TourPlaceDetail,
  summary: SuitableTourSummary,
): boolean {
  return (
    detail.summary.contentId === summary.contentId &&
    detail.summary.contentTypeId === summary.contentTypeId &&
    detail.summary.providerContentTypeId === summary.contentTypeId &&
    (summary.providerContentTypeId === null ||
      detail.summary.providerContentTypeId === summary.providerContentTypeId) &&
    detail.summary.category === summary.category
  );
}

function approvedTourImageUrl(detail: TourPlaceDetail): string | undefined {
  for (const candidate of [
    detail.summary.imageUrl,
    detail.summary.thumbnailUrl,
  ]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.hostname.toLowerCase() === "tong.visitkorea.or.kr"
      ) {
        return candidate;
      }
    } catch {
      // Ignore malformed provider image URLs.
    }
  }
  return undefined;
}

function toGeneratedPetAccess(
  assessment: TourPetAccessSemanticAssessment & {
    verdict: "allowed" | "conditional";
  },
  sizeCompatibility: PetSizeCompatibilityResult,
): GeneratedPetAccess & { verdict: "allowed" | "conditional" } {
  return {
    verdict: assessment.verdict,
    evaluationState: assessment.evaluationState,
    permittedScopes: assessment.permittedScopes,
    restrictedScopes: assessment.restrictedScopes,
    conditions: assessment.conditions,
    sizeCompatibility,
    summary: assessment.summary,
    confidence: assessment.confidence,
    reasonCodes: assessment.reasonCodes,
    evidence: assessment.evidence,
    conflicts: assessment.conflicts,
    verificationItems: assessment.verificationItems,
    sources: assessment.sources,
    warnings: assessment.warnings,
  };
}

function legacyPlaceScoreFromUtility(
  utility: PlaceUtilityBreakdown,
): ExplainablePlaceScore {
  const components = {
    petCompatibility: utility.weightedContributions.petCompatibility,
    preferenceMatch: utility.weightedContributions.preferenceFit,
    travelAttractiveness: utility.weightedContributions.categoryPriority,
    scheduleFit: utility.weightedContributions.dataQuality,
    informationCompleteness:
      utility.weightedContributions.informationTrust,
    kakaoRelevance: utility.weightedContributions.popularity,
  };
  return {
    total: utility.total,
    components,
    reasons: [...utility.reasonCodes, ...utility.warningCodes],
    evidenceCodes: [...utility.reasonCodes],
  };
}

function candidateCoordinates(candidate: RouteCandidate): Coordinates {
  return candidate.coordinates;
}

function orderNearest(
  candidates: readonly RouteCandidate[],
  request: NormalizedItineraryRequest,
): RouteCandidate[] {
  const remaining = [...candidates];
  const ordered: RouteCandidate[] = [];
  let current = request.start.coordinates;
  while (remaining.length > 0) {
    remaining.sort(
      (left, right) =>
        haversineKm(current, candidateCoordinates(left)) -
          haversineKm(current, candidateCoordinates(right)) ||
        left.stableIdentity.localeCompare(right.stableIdentity),
    );
    const next = remaining.shift();
    if (!next) break;
    ordered.push(next);
    current = candidateCoordinates(next);
  }
  return ordered;
}

function routeSignature(candidates: readonly RouteCandidate[]): string {
  return candidates.map(({ stableIdentity }) => stableIdentity).join(">");
}

function legacyRouteSignature(candidates: readonly RouteCandidate[]): string {
  return candidates.map(({ contentId }) => contentId).join(">");
}

function enumerateCombinations<T>(
  values: readonly T[],
  size: number,
  limit: number,
): T[][] {
  const results: T[][] = [];
  const current: T[] = [];
  const visit = (start: number) => {
    if (results.length >= limit) return;
    if (current.length === size) {
      results.push([...current]);
      return;
    }
    const remainingNeeded = size - current.length;
    for (
      let index = start;
      index <= values.length - remainingNeeded && results.length < limit;
      index += 1
    ) {
      current.push(values[index]);
      visit(index + 1);
      current.pop();
    }
  };
  visit(0);
  return results;
}

function pathEstimateKm(
  candidates: readonly RouteCandidate[],
  request: NormalizedItineraryRequest,
): { total: number; backtracking: number } {
  let current = request.start.coordinates;
  let total = 0;
  let furthest = 0;
  for (const candidate of candidates) {
    const segment = haversineKm(current, candidate.coordinates);
    total += segment;
    furthest = Math.max(
      furthest,
      haversineKm(request.start.coordinates, candidate.coordinates),
    );
    current = candidate.coordinates;
  }
  return { total, backtracking: Math.max(0, total - furthest) };
}

function estimatedCourseScore(
  profile: ItineraryProfile,
  candidates: readonly RouteCandidate[],
  request: NormalizedItineraryRequest,
): number {
  const placeScore = candidates.reduce(
    (total, candidate) => total + candidate.placeScore.total,
    0,
  );
  const categories = new Set(candidates.map(({ category }) => category));
  const roles = new Set(candidates.map(({ suitability }) => suitability.travelRole));
  const coverage = request.selectedCategories.filter((category) =>
    categories.has(category as TourCatalogCategory),
  ).length;
  const repeated = candidates.length - categories.size;
  const unverified = candidates.filter(({ source }) => source === "KAKAO").length;
  const estimate = pathEstimateKm(candidates, request);
  const strategyAdjustment =
    profile === "preference_balanced"
      ? coverage * 8 + roles.size * 5
      : profile === "minimum_movement"
        ? -estimate.total * 5 - estimate.backtracking * 5
        : roles.size * 7;
  return (
    placeScore +
    strategyAdjustment -
    repeated * 10 -
    estimate.total * 2 -
    estimate.backtracking * 4 -
    unverified * 12
  );
}

function proposedCourses(
  profile: ItineraryProfile,
  candidates: readonly RouteCandidate[],
  request: NormalizedItineraryRequest,
): ProposedCourse[] {
  const eligible = candidates.filter(
    (candidate) => profile === "discovery" || candidate.source === "TOUR_API",
  );
  const sorted = [...eligible].sort(
    (left, right) =>
      right.placeScore.total - left.placeScore.total ||
      haversineKm(request.start.coordinates, left.coordinates) -
        haversineKm(request.start.coordinates, right.coordinates) ||
      stableHash(`${request.generationSeed}:${left.stableIdentity}`) -
        stableHash(`${request.generationSeed}:${right.stableIdentity}`) ||
      left.stableIdentity.localeCompare(right.stableIdentity),
  );
  const exploratoryCandidates = sorted.filter(
    ({ source }) => source === "KAKAO",
  );
  const verifiedCandidates = sorted.filter(
    ({ source }) => source === "TOUR_API",
  );
  const combinations =
    profile === "discovery" && exploratoryCandidates.length > 0
      ? [
          ...enumerateCombinations(
            verifiedCandidates,
            request.desiredStopCount,
            Math.floor(ITINERARY_GENERATION_LIMITS.maxCourseCombinations / 2),
          ),
          ...exploratoryCandidates.flatMap((exploratory, index) =>
            enumerateCombinations(
              verifiedCandidates,
              request.desiredStopCount - 1,
              Math.ceil(
                ITINERARY_GENERATION_LIMITS.maxCourseCombinations /
                  2 /
                  exploratoryCandidates.length,
              ),
            ).map((combination) => [
              ...combination,
              exploratoryCandidates[index],
            ]),
          ),
        ].slice(0, ITINERARY_GENERATION_LIMITS.maxCourseCombinations)
      : enumerateCombinations(
          sorted,
          request.desiredStopCount,
          ITINERARY_GENERATION_LIMITS.maxCourseCombinations,
        );
  const recent = new Set(request.recentRouteSignatures);
  return combinations
    .filter(
      (combination) =>
        combination.filter(({ source }) => source === "KAKAO").length <= 1,
    )
    .map((combination) => {
      const ordered = orderNearest(combination, request);
      return {
        profile,
        candidates: ordered,
        signature: routeSignature(ordered),
        legacySignature: legacyRouteSignature(ordered),
        estimatedScore: estimatedCourseScore(profile, ordered, request),
      };
    })
    .filter(
      ({ signature, legacySignature }) =>
        !recent.has(signature) && !recent.has(legacySignature),
    )
    .sort(
      (left, right) => {
        if (profile === "discovery") {
          const leftHasExploratory = left.candidates.some(
            ({ source }) => source === "KAKAO",
          );
          const rightHasExploratory = right.candidates.some(
            ({ source }) => source === "KAKAO",
          );
          if (leftHasExploratory !== rightHasExploratory) {
            return Number(rightHasExploratory) - Number(leftHasExploratory);
          }
        }
        return (
          right.estimatedScore - left.estimatedScore ||
          stableHash(`${request.generationSeed}:${left.signature}`) -
            stableHash(`${request.generationSeed}:${right.signature}`) ||
          left.signature.localeCompare(right.signature)
        );
      },
    );
}

function toDirectionsRequest(
  candidates: readonly RouteCandidate[],
  request: NormalizedItineraryRequest,
): KakaoDirectionsRequest {
  const points = candidates.map((candidate) => ({
    name: candidate.title.slice(0, 80),
    x: candidate.coordinates.longitude,
    y: candidate.coordinates.latitude,
  }));
  const destination = points.at(-1);
  if (!destination) throw new Error("No itinerary destination");
  return {
    origin: {
      name: request.start.label ?? "출발지",
      x: request.start.coordinates.longitude,
      y: request.start.coordinates.latitude,
    },
    destination,
    waypoints: points.slice(0, -1),
  };
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

function supportedCheckInMinutes(value: string | null): number | null {
  const match = value?.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/u);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function routeScore(
  candidates: readonly RouteCandidate[],
  route: KakaoDrivingRoute,
  request: NormalizedItineraryRequest,
): ExplainableRouteScore {
  const placeScoreTotal = candidates.reduce(
    (total, candidate) => total + candidate.placeScore.total,
    0,
  );
  const categorySet = new Set(candidates.map(({ category }) => category));
  const roleSet = new Set(candidates.map(({ suitability }) => suitability.travelRole));
  const preferenceMatches = request.selectedCategories.filter((category) =>
    categorySet.has(category as TourCatalogCategory),
  ).length;
  const preferenceCoverage = Math.round(
    (preferenceMatches / Math.max(1, request.selectedCategories.length)) * 25,
  );
  const travelRoleDiversity = Math.round(
    (roleSet.size / Math.max(1, candidates.length)) * 20,
  );
  const scheduleFit = Math.round(
    candidates.reduce(
      (total, candidate) => total + candidate.placeScore.components.scheduleFit,
      0,
    ) / Math.max(1, candidates.length),
  );
  const estimate = pathEstimateKm(candidates, request);
  const travelTimePenalty = Math.min(
    30,
    Math.round(route.totalDurationSeconds / 600),
  );
  const backtrackingPenalty = Math.min(
    25,
    Math.round(estimate.backtracking * 3),
  );
  const repeatedCategoryPenalty =
    Math.max(0, candidates.length - categorySet.size) * 10;
  const unverifiedPlaceRisk =
    candidates.filter(({ source }) => source === "KAKAO").length * 18;
  const components = {
    placeScoreTotal,
    preferenceCoverage,
    travelRoleDiversity,
    scheduleFit,
    travelTimePenalty,
    backtrackingPenalty,
    repeatedCategoryPenalty,
    unverifiedPlaceRisk,
  };
  return {
    total: Math.max(
      0,
      placeScoreTotal +
        preferenceCoverage +
        travelRoleDiversity +
        scheduleFit -
        travelTimePenalty -
        backtrackingPenalty -
        repeatedCategoryPenalty -
        unverifiedPlaceRisk,
    ),
    qualityRatio: 1,
    components,
  };
}

function createItinerary(
  proposal: ProposedCourse,
  route: KakaoDrivingRoute,
  request: NormalizedItineraryRequest,
  exclusions: ItineraryExclusionCounts,
): GeneratedItinerary | null {
  if (route.sections.length !== proposal.candidates.length) {
    exclusions.directions_unavailable += 1;
    return null;
  }
  const start = minutesFromTime(request.startTime);
  let cursor = start;
  const stops: GeneratedItineraryStop[] = [];
  for (let index = 0; index < proposal.candidates.length; index += 1) {
    const candidate = proposal.candidates[index];
    const section = route.sections[index];
    cursor += Math.ceil(section.durationSeconds / 60);
    if (candidate.category === "accommodation" && candidate.detail) {
      const checkIn = supportedCheckInMinutes(candidate.detail.checkInTime);
      if (checkIn !== null && cursor < checkIn) cursor = checkIn;
    }
    const visitDuration = VISIT_DURATION_MINUTES[candidate.category];
    const departure = cursor + visitDuration;
    if (departure > 24 * 60) {
      if (candidate.category === "accommodation") {
        exclusions.check_in_unavailable += 1;
      } else {
        exclusions.duration_exceeded += 1;
      }
      return null;
    }
    const hours = candidate.detail
      ? assessOperatingHours({
          travelDate: request.travelDate,
          arrivalMinutes: cursor,
          departureMinutes: departure,
          operatingInformation: candidate.detail.operatingInformation,
          restDayInformation: candidate.detail.restDayInformation,
        })
      : { status: "unknown" as const, warning: "운영시간 확인 필요" as const };
    if (hours.status === "closed") {
      exclusions.closed_at_visit += 1;
      return null;
    }
    const acceptedOperatingHours: GeneratedItineraryStop["operatingHours"] = {
      status: hours.status,
      warning: hours.warning,
    };
    stops.push({
      order: index + 1,
      stableIdentity: candidate.stableIdentity,
      source: candidate.source,
      contentId: candidate.contentId,
      title: candidate.title,
      address: candidate.address,
      coordinates: candidate.coordinates,
      providerContentTypeId: candidate.providerContentTypeId,
      contentTypeId: candidate.contentTypeId,
      category: candidate.category,
      plannedArrival: timeFromMinutes(cursor),
      plannedDeparture: timeFromMinutes(departure),
      visitDurationMinutes: visitDuration,
      distanceFromPreviousMeters: section.distanceMeters,
      durationFromPreviousSeconds: section.durationSeconds,
      petAccess: candidate.petAccess,
      operatingHours: acceptedOperatingHours,
      travelSuitability: candidate.suitability,
      placeScore: candidate.placeScore,
      placeUtility: candidate.placeUtility,
      recommendationReasons: candidate.placeScore.reasons,
      callAheadRequired: candidate.source === "KAKAO",
      ...(candidate.imageUrl ? { imageUrl: candidate.imageUrl } : {}),
      ...(candidate.phone ? { phone: candidate.phone } : {}),
      ...(candidate.placeUrl ? { placeUrl: candidate.placeUrl } : {}),
      ...(candidate.verifiedReplacementIdentity
        ? { verifiedReplacementIdentity: candidate.verifiedReplacementIdentity }
        : {}),
    });
    cursor = departure;
  }
  const elapsed = cursor - start;
  if (
    request.desiredDurationMinutes !== null &&
    elapsed > request.desiredDurationMinutes
  ) {
    exclusions.duration_exceeded += 1;
    return null;
  }
  return {
    id: `${stableRequestHash(request)}:${proposal.profile}:${proposal.signature}`,
    signature: proposal.signature,
    profile: proposal.profile,
    ...PROFILE_COPY[proposal.profile],
    stops,
    totalDistanceMeters: route.totalDistanceMeters,
    totalDurationSeconds: route.totalDurationSeconds,
    estimatedElapsedDurationMinutes: elapsed,
    geometry: route.coordinates,
    routeScore: routeScore(proposal.candidates, route, request),
  };
}

function jaccardOverlap(
  left: readonly GeneratedItineraryStop[],
  right: readonly GeneratedItineraryStop[],
): number {
  const leftIds = new Set(left.map(({ stableIdentity }) => stableIdentity));
  const rightIds = new Set(right.map(({ stableIdentity }) => stableIdentity));
  const intersection = [...leftIds].filter((id) => rightIds.has(id)).length;
  const union = new Set([...leftIds, ...rightIds]).size;
  return union === 0 ? 1 : intersection / union;
}

function selectDiverseRoutes(
  routed: GeneratedItinerary[],
  notices: string[],
): GeneratedItinerary[] {
  if (routed.length === 0) return [];
  const bestScore = Math.max(...routed.map(({ routeScore }) => routeScore.total));
  for (const itinerary of routed) {
    itinerary.routeScore.qualityRatio =
      bestScore > 0 ? itinerary.routeScore.total / bestScore : 1;
  }
  const qualityCandidates = routed.filter(
    ({ routeScore }) =>
      routeScore.qualityRatio >= MIN_ALTERNATE_ROUTE_QUALITY_RATIO,
  );
  const thresholds = [MAX_ITINERARY_JACCARD_OVERLAP, 0.6, 0.75, 1];
  let bestSelection: GeneratedItinerary[] = [];
  let usedThreshold = thresholds[0];
  for (const threshold of thresholds) {
    const selection: GeneratedItinerary[] = [];
    for (const profile of [
      "preference_balanced",
      "minimum_movement",
      "discovery",
    ] as const) {
      const candidate = qualityCandidates
        .filter(({ profile: value }) => value === profile)
        .sort(
          (left, right) => {
            if (profile === "discovery") {
              const leftHasExploratory = left.stops.some(
                ({ source }) => source === "KAKAO",
              );
              const rightHasExploratory = right.stops.some(
                ({ source }) => source === "KAKAO",
              );
              if (leftHasExploratory !== rightHasExploratory) {
                return Number(rightHasExploratory) - Number(leftHasExploratory);
              }
            }
            return right.routeScore.total - left.routeScore.total;
          },
        )
        .find(
          (value) =>
            !selection.some(({ signature }) => signature === value.signature) &&
            selection.every(
              (accepted) => jaccardOverlap(accepted.stops, value.stops) <= threshold,
            ),
        );
      if (candidate) selection.push(candidate);
    }
    if (selection.length > bestSelection.length) {
      bestSelection = selection;
      usedThreshold = threshold;
    }
    if (selection.length === 3) break;
  }
  if (usedThreshold > MAX_ITINERARY_JACCARD_OVERLAP) {
    notices.push(
      `후보 공급이 제한되어 경로 간 장소 겹침 기준을 ${Math.round(
        usedThreshold * 100,
      )}%까지 점진적으로 완화했습니다.`,
    );
  }
  if (bestSelection.length < 3) {
    notices.push(
      `품질 하한과 다양성 기준을 충족한 실제 경로가 ${bestSelection.length}개여서 낮은 품질 장소로 빈 슬롯을 만들지 않았습니다.`,
    );
  }
  return bestSelection;
}

function discoveryCategory(
  request: NormalizedItineraryRequest,
): KakaoDiscoveryCategory | null {
  const supported = [...new Set(request.selectedCategories)]
    .filter(
      (category): category is KakaoDiscoveryCategory =>
        KAKAO_DISCOVERY_CATEGORIES.includes(
          category as KakaoDiscoveryCategory,
        ) && category !== "accommodation",
    )
    .sort((left, right) => left.localeCompare(right));
  if (supported.length === 0) return null;
  return supported[stableHash(request.generationSeed) % supported.length];
}

function discoveryInput(
  request: NormalizedItineraryRequest,
  category: KakaoDiscoveryCategory,
): KakaoDiscoveryInput {
  if (request.scope.type === "district") {
    const district = getRegionDistrict(
      BUSAN_REGION_CONFIG,
      request.scope.districtCode,
    );
    if (district) {
      return {
        category,
        mode: "district",
        rectangle: rectangleFromCenter(district.searchCenter),
        district: {
          code: district.legalDongDistrictCode,
          name: district.name,
        },
        center: district.searchCenter,
      };
    }
  }
  const center = containsCoordinates(
    BUSAN_DISCOVERY_BOUNDS,
    request.start.coordinates,
  )
    ? request.start.coordinates
    : BUSAN_REGION_CONFIG.defaultMapCenter;
  return {
    category,
    mode: "viewport",
    rectangle: rectangleFromCenter(center),
    center,
  };
}

async function loadDiscovery(
  request: NormalizedItineraryRequest,
  catalogPlaces: readonly TourPlaceSummary[],
  dependencies: ItineraryGenerationDependencies,
): Promise<KakaoDiscoveryResponse | null> {
  const category = discoveryCategory(request);
  if (!category) return null;
  const input = discoveryInput(request, category);
  if (dependencies.discoverPlaces) {
    return dependencies.discoverPlaces(input, catalogPlaces);
  }
  // Unit tests inject the Tour service. Never cross from a fixture test into a live provider.
  if (dependencies.tourService) return null;
  return discoverKakaoPlaces(input, {
    loadExistingPlaces: async (requestedCategory) =>
      catalogPlaces.filter(({ category: value }) => value === requestedCategory),
  });
}

function unavailableResponse(
  request: NormalizedItineraryRequest,
  exclusions: ItineraryExclusionCounts,
  travelSuitabilityExclusions: Partial<
    Record<TravelSuitabilityExclusionReason, number>
  >,
  observations: readonly TourRequestObservation[],
  notice: string,
): ItineraryGenerationResponse {
  return {
    state: "provider_unavailable",
    request,
    providerCandidatesConsidered: 0,
    shortlistedCandidates: 0,
    eligibleCandidates: 0,
    candidateFunnel: emptyCandidateFunnel(),
    exclusionCounts: exclusions,
    travelSuitabilityExclusions,
    providerCalls: { detail: 0, directions: 0, discovery: 0 },
    candidatePipeline: emptyCandidatePipeline(request, observations),
    limits: ITINERARY_GENERATION_LIMITS,
    itineraries: [],
    notices: [notice],
  };
}

export async function generateItineraries(
  request: NormalizedItineraryRequest,
  dependencies: ItineraryGenerationDependencies = {},
): Promise<ItineraryGenerationResponse> {
  const service = dependencies.tourService ?? getDefaultTourService();
  const licenseMatcher =
    dependencies.licenseMatcher ??
    (dependencies.tourService ? null : getDefaultLicenseMatchingService());
  const routeDirections = dependencies.directions ?? getDirections;
  const exclusions = emptyExclusions();
  const candidateFunnel = emptyCandidateFunnel();
  const travelSuitabilityExclusions: Partial<
    Record<TravelSuitabilityExclusionReason, number>
  > = {};
  const notices: string[] = [];
  const requestedCategories = [...new Set(request.selectedCategories)]
    .filter((category): category is TourCatalogCategory => {
      if (category === "shopping" && !request.includeShopping) {
        exclusions.shopping_disabled = 1;
        return false;
      }
      return category !== "transportation" && category !== "unknown";
    })
    .sort((left, right) => left.localeCompare(right));
  if (exclusions.shopping_disabled > 0) {
    notices.push("쇼핑은 includeShopping이 true일 때만 일정 후보에 포함됩니다.");
  }

  let catalogResults: Array<{
    category: TourCatalogCategory;
    contentTypeId: TourContentTypeId;
    places: TourPlaceSummary[];
  }>;
  const catalogObservations: TourRequestObservation[] = [];
  try {
    catalogResults = await mapWithConcurrency(
      requestedCategories,
      ITINERARY_GENERATION_LIMITS.catalogConcurrency,
      async (category) => {
        const contentTypeId = getCatalogContentTypeId(category);
        if (!contentTypeId) {
          return { category, contentTypeId: "12" as const, places: [] };
        }
        const result = await collectTourCatalog(service, {
          regionCode: request.scope.regionCode,
          districtCode:
            request.scope.type === "district"
              ? (request.scope.districtCode as BusanDistrictCode)
              : undefined,
          contentTypeId,
        }, (event) => catalogObservations.push(event));
        return { category, contentTypeId, places: result.places };
      },
    );
  } catch {
    return unavailableResponse(
      request,
      exclusions,
      travelSuitabilityExclusions,
      catalogObservations,
      "한국관광공사 장소 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const matchingCatalog = new Map<
    string,
    {
      place: TourPlaceSummary;
      category: TourCatalogCategory;
      contentTypeId: TourContentTypeId;
    }
  >();
  for (const result of catalogResults) {
    for (const place of result.places) {
      if (!matchingCatalog.has(place.contentId)) {
        matchingCatalog.set(place.contentId, {
          place,
          category: result.category,
          contentTypeId: result.contentTypeId,
        });
      }
    }
  }
  candidateFunnel.matchingCatalogCandidates = matchingCatalog.size;

  const classified: ClassifiedSummary[] = [];
  for (const { place, category, contentTypeId } of matchingCatalog.values()) {
    if (!place.title?.trim()) {
      exclusions.malformed_record += 1;
      continue;
    }
    if (!isCatalogRecordForRequest(place, category, contentTypeId)) {
      exclusions.unsupported_record += 1;
      continue;
    }
    candidateFunnel.afterBasicFilters += 1;
    const suitability = classifyTourTravelSuitability(place, request);
    if (!suitability.travelSuitable) {
      exclusions.travel_unsuitable += 1;
      candidateFunnel.travelSuitabilityExcluded += 1;
      incrementTravelExclusion(
        travelSuitabilityExclusions,
        suitability.exclusionReason,
      );
      if (suitability.exclusionReason === "invalid_coordinates") {
        exclusions.malformed_coordinates += 1;
      }
      continue;
    }
    const summary = toSuitableSummary(place);
    if (!summary || !suitability.travelRole) {
      exclusions.malformed_coordinates += 1;
      continue;
    }
    const distanceKm = haversineKm(request.start.coordinates, {
      latitude: summary.latitude,
      longitude: summary.longitude,
    });
    const preliminaryScore =
      30 +
      scorePreliminaryCompleteness({
        hasImage: Boolean(summary.thumbnailUrl || summary.imageUrl),
        hasAddress: Boolean(summary.address),
        hasPhone: Boolean(summary.phone),
      }) +
      (request.indoorAccessPreference !== "any" &&
      ["culture", "food", "accommodation"].includes(summary.category)
        ? 8
        : 0) -
      Math.min(15, distanceKm / 2);
    classified.push({ summary, suitability, distanceKm, preliminaryScore });
  }
  candidateFunnel.travelSuitableCandidates = classified.length;

  const pace = getTripPaceConfig(request.tripPace);
  const pipeline = await runCandidatePipelineV1({
    context: {
      request,
      maxStops: pace.maxStops,
      minStops: pace.minStops,
      tripType: request.tripType,
      petProfile: {
        species: request.petSpecies,
        size: request.petSize,
        hasCarrier: request.petEquipment.hasCarrier,
        hasLeash: request.petEquipment.hasLeash,
        hasMuzzle: request.petEquipment.hasMuzzle,
        acceptsOutdoorOnly: request.acceptsOutdoorOnly,
      },
      tripRequest: {
        scope: {
          regionCode: request.scope.regionCode,
          districtCode:
            request.scope.type === "district"
              ? request.scope.districtCode
              : null,
          bounds: BUSAN_DISCOVERY_BOUNDS,
        },
        selectedCategories: request.selectedCategories,
        includeShopping: request.includeShopping,
        indoorAccessPreference: request.indoorAccessPreference,
      },
    },
    catalog: catalogResults.flatMap(({ places }) => places),
    tourService: service,
    licenseMatcher,
    initialObservations: catalogObservations,
  });
  const detailCalls = pipeline.diagnostics.detailedEvaluationCount;
  candidateFunnel.preliminaryRankedCandidates = pipeline.diagnostics.stageACount;
  candidateFunnel.detailedAssessmentCandidates =
    pipeline.diagnostics.detailedEvaluationCount;
  candidateFunnel.detailOutcomes.unavailable =
    pipeline.diagnostics.providerUnavailableCandidates;
  applyCandidatePipelineExclusions(exclusions, pipeline.reasonCounts, request);
  exclusions.candidate_limit += Math.max(
    0,
    classified.length - pipeline.diagnostics.stageACount,
  );

  const shortlist = pipeline.candidates.map((candidate) => ({
    summary: candidate.summary as SuitableTourSummary,
    suitability: candidate.travelSuitability,
    distanceKm: candidate.distanceKm,
    preliminaryScore: candidate.retrievalScore.total,
  }));
  const detailResults = pipeline.candidates.map((candidate) => ({
    classifiedSummary: {
      summary: candidate.summary as SuitableTourSummary,
      suitability: candidate.travelSuitability,
      distanceKm: candidate.distanceKm,
      preliminaryScore: candidate.retrievalScore.total,
    },
    detail: candidate.detail,
    licensing: candidate.licensing,
    pipelineCandidate: candidate,
  }));

  const eligible: RouteCandidate[] = [];
  let eligibilityProviderUnavailableCount =
    pipeline.status === "provider_unavailable"
      ? Math.max(1, pipeline.diagnostics.providerUnavailableCandidates)
      : 0;
  for (const result of detailResults) {
    if (!result.detail) {
      exclusions.detail_unavailable += 1;
      candidateFunnel.detailOutcomes.unavailable += 1;
      continue;
    }
    const { summary } = result.classifiedSummary;
    const assessment = evaluateTourPetAccess(
      createTrustedTourPetAccessInput(result.detail),
    );
    if (!detailMatchesCatalog(result.detail, summary)) {
      const hasKnownUnsupportedDetailType =
        result.detail.summary.providerContentTypeId !== null &&
        result.detail.summary.contentTypeId === null;
      if (hasKnownUnsupportedDetailType) {
        exclusions.not_applicable += 1;
      } else {
        exclusions.detail_mismatch += 1;
      }
      candidateFunnel.detailOutcomes.mismatch += 1;
      continue;
    }
    const sizeCompatibility = assessPetSizeCompatibility(
      assessment,
      request.petSize,
      getPetSizeSourceEvidence(result.detail),
    );
    const detailForEligibility: TourPlaceDetail = {
      ...result.detail,
      summary: {
        ...result.detail.summary,
        providerVisibility:
          result.detail.summary.providerVisibility ?? summary.providerVisibility,
      },
    };
    const providerVisibility =
      detailForEligibility.summary.providerVisibility ?? {
        status: "unknown" as const,
        providerField: null,
        providerValue: null,
        checkedAt: result.detail.source.retrievedAt,
        reasonCodes: ["provider_visibility_field_missing"],
      };
    const eligibility = evaluateAutomaticRouteEligibility({
      providerService: KTO_SERVICE2_NAME,
      summary,
      detail: detailForEligibility,
      providerVisibility,
      providerCalls: {
        list: "succeeded",
        detailCommon:
          result.detail.sections.common.status === "available"
            ? "succeeded"
            : result.detail.sections.common.status === "unavailable"
              ? "provider_unavailable"
              : "invalid_response",
        detailIntro:
          result.detail.sections.intro.status === "available"
            ? "succeeded"
            : result.detail.sections.intro.status === "unavailable"
              ? "provider_unavailable"
              : "invalid_response",
        detailPet:
          result.detail.sections.petPolicy.status === "available"
            ? "succeeded"
            : result.detail.sections.petPolicy.status === "unavailable"
              ? "provider_unavailable"
              : "invalid_response",
      },
      assessment,
      petProfile: {
        species: request.petSpecies,
        size: request.petSize,
        hasCarrier: request.petEquipment.hasCarrier,
        hasLeash: request.petEquipment.hasLeash,
        hasMuzzle: request.petEquipment.hasMuzzle,
        acceptsOutdoorOnly: request.acceptsOutdoorOnly,
      },
      tripRequest: {
        scope: {
          regionCode: request.scope.regionCode,
          districtCode:
            request.scope.type === "district"
              ? request.scope.districtCode
              : null,
          bounds: BUSAN_DISCOVERY_BOUNDS,
        },
        selectedCategories: request.selectedCategories,
        includeShopping: request.includeShopping,
        indoorAccessPreference: request.indoorAccessPreference,
      },
      licensing: result.licensing,
      // Exact arrival is known only after road routing. Unknown hours remain a
      // warning here; createItinerary performs the hard actual-window check.
      operatingHours: {
        status: "unknown",
        warning: UNKNOWN_OPERATING_HOURS_WARNING,
      },
    });

    if (assessment.evaluationState === "not_applicable") {
      candidateFunnel.basePetAccess.notApplicable += 1;
    } else if (assessment.verdict === "not_allowed") {
      candidateFunnel.basePetAccess.notAllowed += 1;
    } else if (assessment.verdict === "unknown") {
      candidateFunnel.basePetAccess.unknown += 1;
    } else {
      candidateFunnel.basePetAccess[assessment.verdict] += 1;
      if (sizeCompatibility.state === "compatible") {
        candidateFunnel.petSizeCompatibility.compatible += 1;
      } else if (sizeCompatibility.state === "incompatible") {
        candidateFunnel.petSizeCompatibility.incompatible += 1;
      } else if (sizeCompatibility.state === "verification_required") {
        candidateFunnel.petSizeCompatibility.verificationRequired += 1;
      } else {
        candidateFunnel.petSizeCompatibility.notSpecified += 1;
      }
    }

    if (!eligibility.eligible) {
      if (eligibility.status === "provider_unavailable") {
        eligibilityProviderUnavailableCount += 1;
        exclusions.detail_unavailable += 1;
      } else if (
        request.indoorAccessPreference === "required" &&
        !supportsRequiredIndoorAccess(assessment)
      ) {
        exclusions.indoor_requirement += 1;
        candidateFunnel.indoorRequirementExcluded += 1;
      } else if (eligibility.reasonCodes.includes("pet_access_not_applicable")) {
        exclusions.not_applicable += 1;
      } else if (eligibility.reasonCodes.includes("pet_access_not_allowed")) {
        exclusions.not_allowed += 1;
      } else if (
        eligibility.reasonCodes.includes("pet_access_unknown") ||
        eligibility.reasonCodes.includes("pet_access_verification_required") ||
        eligibility.reasonCodes.includes("pet_type_verification_required")
      ) {
        exclusions.unknown += 1;
      } else if (eligibility.reasonCodes.includes("pet_size_incompatible")) {
        exclusions.pet_size_incompatible += 1;
      } else if (
        eligibility.reasonCodes.includes("pet_size_verification_required")
      ) {
        exclusions.pet_size_verification_required += 1;
      } else if (
        eligibility.reasonCodes.includes("mandatory_condition_unsatisfied") ||
        eligibility.reasonCodes.includes(
          "mandatory_condition_verification_required",
        )
      ) {
        exclusions.equipment_incompatible += 1;
        candidateFunnel.equipmentMismatchExcluded += 1;
      } else if (eligibility.reasonCodes.includes("matched_license_closed")) {
        exclusions.travel_unsuitable += 1;
      } else if (
        eligibility.reasonCodes.includes("invalid_coordinates") ||
        eligibility.reasonCodes.includes("outside_requested_geographic_scope")
      ) {
        exclusions.malformed_coordinates += 1;
      } else if (
        eligibility.reasonCodes.includes("detail_identity_mismatch") ||
        eligibility.reasonCodes.includes("source_identity_mismatch") ||
        eligibility.reasonCodes.includes("provider_visibility_identity_mismatch") ||
        eligibility.reasonCodes.includes("pet_evidence_identity_mismatch")
      ) {
        exclusions.detail_mismatch += 1;
      } else {
        exclusions.detail_unavailable += 1;
      }
      continue;
    }
    if (hasKnownEquipmentMismatch(assessment, request.petEquipment)) {
      exclusions.equipment_incompatible += 1;
      candidateFunnel.equipmentMismatchExcluded += 1;
      continue;
    }
    if (
      request.indoorAccessPreference === "required" &&
      !supportsRequiredIndoorAccess(assessment)
    ) {
      exclusions.indoor_requirement += 1;
      candidateFunnel.indoorRequirementExcluded += 1;
      continue;
    }
    const suitability = withTourPetVerification(
      result.classifiedSummary.suitability,
      assessment.verdict,
    );
    const petAccess = toGeneratedPetAccess(
      assessment as TourPetAccessSemanticAssessment & {
        verdict: "allowed" | "conditional";
      },
      sizeCompatibility,
    );
    const imageUrl = approvedTourImageUrl(result.detail);
    eligible.push({
      stableIdentity: `tour:${summary.contentId}`,
      source: "TOUR_API",
      contentId: summary.contentId,
      title: summary.title,
      address: summary.address,
      coordinates: { latitude: summary.latitude, longitude: summary.longitude },
      providerContentTypeId: summary.contentTypeId,
      contentTypeId: summary.contentTypeId,
      category: summary.category,
      detail: result.detail,
      petAccess,
      suitability,
      placeScore: legacyPlaceScoreFromUtility(result.pipelineCandidate.utility),
      placeUtility: result.pipelineCandidate.utility,
      ...(imageUrl ? { imageUrl } : {}),
      ...(summary.phone ? { phone: summary.phone } : {}),
    });
  }
  candidateFunnel.itineraryEligibleCandidates = eligible.length;

  let discoveryCalls = 0;
  try {
    const discovery = await loadDiscovery(
      request,
      catalogResults.flatMap(({ places }) => places),
      dependencies,
    );
    if (discovery) {
      discoveryCalls = discovery.metadata.externalCallCount;
      const exactByContentId = new Map(
        discovery.candidates.flatMap((candidate) =>
          candidate.exactExistingPlaceLink
            ? [[candidate.exactExistingPlaceLink.contentId, candidate] as const]
            : [],
        ),
      );
      for (const candidate of eligible) {
        if (candidate.source !== "TOUR_API") continue;
        const exact = exactByContentId.get(candidate.contentId);
        if (!exact || !candidate.detail) continue;
        candidate.phone = candidate.phone ?? exact.phone;
        candidate.placeUrl = exact.placeUrl;
        candidate.suitability = {
          ...candidate.suitability,
          evidence: [
            ...candidate.suitability.evidence,
            {
              source: "kakao_category",
              code: "exact_kakao_link",
              value: exact.kakaoCategoryText,
            },
          ],
        };
        // Exact Kakao identity may enrich contact/navigation metadata, but it
        // does not change Stage 2 utility or official pet eligibility.
      }
      // Kakao-only records remain discovery candidates. They may enrich an exact
      // Tourism match, but they never enter an automatically generated route.
    }
  } catch {
    notices.push(
      "Kakao 탐색 후보를 사용할 수 없어 검증된 관광공사 장소만으로 경로를 계산했습니다.",
    );
  }

  const profiles: ItineraryProfile[] = [
    "preference_balanced",
    "minimum_movement",
    "discovery",
  ];
  const proposalsByProfile = profiles.map((profile) =>
    proposedCourses(profile, eligible, request),
  );
  candidateFunnel.generatedCombinations = proposalsByProfile.reduce(
    (total, values) => total + values.length,
    0,
  );
  exclusions.recent_signature = Math.max(
    0,
    request.recentRouteSignatures.length > 0 &&
      candidateFunnel.generatedCombinations === 0
      ? request.recentRouteSignatures.length
      : 0,
  );

  const proposals: ProposedCourse[] = [];
  const usedSignatures = new Set<string>();
  for (let round = 0; round < 2; round += 1) {
    for (const values of proposalsByProfile) {
      const next = values.find(
        ({ signature }) => !usedSignatures.has(signature),
      );
      if (!next) continue;
      usedSignatures.add(next.signature);
      proposals.push(next);
      values.splice(values.indexOf(next), 1);
      if (proposals.length >= ITINERARY_GENERATION_LIMITS.maxDirectionsCalls) {
        break;
      }
    }
    if (proposals.length >= ITINERARY_GENERATION_LIMITS.maxDirectionsCalls) {
      break;
    }
  }

  let directionsCalls = 0;
  const routed: GeneratedItinerary[] = [];
  for (const proposal of proposals) {
    directionsCalls += 1;
    try {
      const route = await routeDirections(toDirectionsRequest(proposal.candidates, request));
      const itinerary = createItinerary(proposal, route, request, exclusions);
      if (itinerary) routed.push(itinerary);
    } catch {
      exclusions.directions_unavailable += 1;
    }
  }
  const itineraries = selectDiverseRoutes(routed, notices);
  candidateFunnel.returnedRoutes = itineraries.length;

  if (exclusions.pet_size_incompatible > 0) {
    notices.push(
      `선택한 반려견 크기와 명시된 시설 조건이 맞지 않는 후보 ${exclusions.pet_size_incompatible}곳을 자동 일정에서 제외했습니다.`,
    );
  }
  if (exclusions.equipment_incompatible > 0) {
    notices.push(
      `명시된 필수 장비와 현재 준비 상태가 맞지 않는 후보 ${exclusions.equipment_incompatible}곳을 제외했습니다.`,
    );
  }

  const upstreamFailures =
    exclusions.detail_unavailable + exclusions.directions_unavailable;
  const tourEligibleCount = eligible.filter(({ source }) => source === "TOUR_API").length;
  const state: ItineraryGenerationResponse["state"] =
    itineraries.length > 0
      ? upstreamFailures > 0
        ? "partial"
        : "ready"
      : eligibilityProviderUnavailableCount > 0
        ? "provider_unavailable"
        : detailCalls > 0 && exclusions.detail_unavailable === detailCalls
        ? "provider_unavailable"
        : tourEligibleCount >= request.desiredStopCount &&
            exclusions.directions_unavailable > 0
          ? "provider_unavailable"
          : "insufficient_candidates";
  if (state === "provider_unavailable") {
    notices.push(
      "장소 상세 또는 Kakao 길찾기 제공자 응답을 사용할 수 없어 경로를 확정하지 못했습니다.",
    );
  } else if (state === "insufficient_candidates") {
    notices.push(
      "현재 요청에서 여행 적합성과 반려동물 조건을 충족한 장소 또는 새로운 경로 조합이 부족합니다.",
    );
  }

  return {
    state,
    request,
    providerCandidatesConsidered: candidateFunnel.matchingCatalogCandidates,
    shortlistedCandidates: shortlist.length,
    eligibleCandidates: tourEligibleCount,
    candidateFunnel,
    exclusionCounts: exclusions,
    travelSuitabilityExclusions,
    providerCalls: {
      detail: detailCalls,
      directions: directionsCalls,
      discovery: discoveryCalls,
    },
    candidatePipeline: {
      version: "candidate-pipeline-v1",
      status: pipeline.status,
      eligiblePoolTarget: pipeline.eligiblePoolTarget,
      requiredMinimum: pipeline.requiredMinimum,
      reasonCounts: pipeline.reasonCounts,
      diagnostics: pipeline.diagnostics,
    },
    limits: ITINERARY_GENERATION_LIMITS,
    itineraries,
    notices,
  };
}
