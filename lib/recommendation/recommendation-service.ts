import { loadRecommendationPublicCatalog, type RecommendationPublicCatalog } from "@/lib/recommendation/public-catalog";
import { selectSpatialShortlistV2 } from "@/lib/recommendation/v2/spatial-shortlist";
import { seoulDate, departureCandidates } from "@/lib/recommendation/schedule/schedule-intent";
import { attachRouteSchedule } from "@/lib/recommendation/schedule/route-schedule";
import { findFeasibleSchedule } from "@/lib/recommendation/schedule/flexible-schedule";
import "server-only";
import { enterRecommendationStage, recordRecommendationProviderFailure, safeProviderFailure } from "@/lib/shared/recommendation-trace";
import { applyConditionAnswers, conditionQuestions } from "./condition-confirmation";

import { KakaoMobilityProviderError } from "@/lib/kakao/directions";
import { KakaoTravelTimeProvider } from "@/lib/kakao/travel-time-provider";
import { getTripPaceConfig } from "@/lib/itinerary/trip-pace";
import { ROUTE_SOLVER_V1_CONFIG } from "@/lib/recommendation/config/route-solver-v1";
import {
  getKtoRegionLookupIdentity,
  getRegionConfig,
  getRegionConfigByKtoAreaCode,
  getRegionConfigByService2LegalDongCode,
  getRegionRouteCapabilityBlock,
  resolveRegionDistrictCode,
} from "@/lib/regions/config";
import { loadMapPlacesSnapshot } from "@/lib/map-places/snapshot";
import {
  applyCanonicalPetConditionPolicy,
  eligiblePetConditionEligibility,
  insufficientEvidencePetConditionEligibility,
} from "@/lib/pet-access/canonical-condition-eligibility";
import {
  getDefaultLicenseMatchingService,
  type LicenseMatcher,
} from "@/lib/licenses/service";
import {
  runCandidatePipelineV1,
} from "@/lib/recommendation/candidate-pipeline";
import {
  createEditSessionId,
  createApprovedManualEditSession,
  createManualConfirmationEditSession,
  parseEditSession,
  type ManualEditCandidate,
} from "@/lib/recommendation/edit-session";
import { adaptEligibleCandidateForRouteV1 } from "@/lib/recommendation/optimizer/candidate-adapter";
import { getRouteTripConstraints } from "@/lib/recommendation/optimizer/trip-constraints";
import { optimizeRouteV1 } from "@/lib/recommendation/optimizer/route-optimizer";
import { adaptCanonicalCandidateForRouteV2 } from "@/lib/recommendation/v2/candidate-adapter";
import {
  fuseRecommendationCandidatesV2,
  type CandidateFusionV2Diagnostics,
  type CanonicalRecommendationCandidateV2,
} from "@/lib/recommendation/v2/candidate-fusion";
import {
  hasLargeAnchorDetour,
  inferHybridSupplementCategories,
} from "@/lib/recommendation/v2/hybrid-selection";
import {
  optimizeRouteOptionsV2,
} from "@/lib/recommendation/v2/route-optimizer";
import { requestFingerprintV2, routeFromOptionV2 } from "@/lib/recommendation/v2/response";
import {
  buildCandidateFunnelDiagnostics,
  type CandidateFunnelRecord,
} from "@/lib/recommendation/v2/candidate-funnel";
import { calculateDiversityCapacityV2 } from "@/lib/recommendation/v2/diversity-capacity";
import {
  analyzeRecommendationHistoryV2,
  calculateNoveltyQuotaV2,
  measureRerollDifferenceV2,
  recommendationHistoryContextKeyV2,
} from "@/lib/recommendation/v2/novelty-history";
import {
  appendScheduledVisitTiming,
  tripStartMs,
} from "@/lib/recommendation/optimizer/schedule-simulator";
import { recommendationFailure } from "@/lib/recommendation/recommendation-errors";
import { normalizeRecommendationRequest } from "@/lib/recommendation/recommendation-request";
import type {
  DetailedEligibleCandidate,
  CandidatePipelineResult,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import type {
  RecommendedRouteStop,
  RouteOptimizationInput,
  RouteOptimizationResult,
  RouteOptimizationTripRequest,
} from "@/lib/recommendation/types/route-optimizer";
import type {
  OrderedRouteValidationResult,
  TravelMatrixEdge,
  TravelTimeProvider,
} from "@/lib/travel/types";
import {
  collectTourCatalog,
} from "@/lib/tour-api/catalog-service";
import {
  getCatalogContentTypeId,
  type TourCatalogCategory,
} from "@/lib/tour-api/catalog";
import { TourProviderError } from "@/lib/tour-api/errors";
import {
  getDefaultTourService,
  type TourPlaceService,
  type TourRequestObservation,
} from "@/lib/tour-api/service";
import type { TourPlaceSummary } from "@/types/place";
import type {
  MapPlacesSnapshotMarker,
} from "@/types/map-places-snapshot";
import type {
  ManualRouteValidationResponseV1,
  ConditionAnswer,
  ProductRouteV1,
  RecommendationReplacementCandidateV1,
  RecommendationSelectionIssueV1,
  RecommendedRouteStopV1,
  RouteAlternativeV1,
  RouteRecommendationReadyResponseV1,
  RouteRecommendationFailureResponseV1,
  RouteRecommendationRequest,
  RouteRecommendationResponseV1,
  SafeRecommendationDiagnostics,
} from "@/types/recommendation";
import {
  ROUTE_RECOMMENDATION_API_VERSION,
  ROUTE_RECOMMENDATION_CONTRACT_V2,
  ROUTE_RECOMMENDATION_ENGINE_V2,
} from "@/types/recommendation";

const CATALOG_CONCURRENCY = 2;

type CandidatePipelineRunner = typeof runCandidatePipelineV1;
type OptimizerRunner = typeof optimizeRouteV1;
type RouteOptionsOptimizerRunner = typeof optimizeRouteOptionsV2;

export interface RecommendationServiceDependencies {
  tourService?: TourPlaceService;
  licenseMatcher?: LicenseMatcher | null;
  travelTimeProvider?: TravelTimeProvider;
  candidatePipeline?: CandidatePipelineRunner;
  optimizer?: OptimizerRunner;
  routeOptionsOptimizer?: RouteOptionsOptimizerRunner;
  loadCatalogSnapshot?: typeof loadMapPlacesSnapshot;
  loadPublicCatalog?: typeof loadRecommendationPublicCatalog;
  collectCatalog?: typeof collectTourCatalog;
  now?: () => Date;
  includeDiagnostics?: boolean;
  editSessionSecret?: string;
  signal?: AbortSignal;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(values[index]!);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

function licensingStatus(
  candidate: DetailedEligibleCandidate,
): RecommendedRouteStopV1["licensingStatus"] {
  const value = candidate.licensing;
  if (!value || value.matchState === "not_found") return "no_match";
  if (value.matchState === "not_applicable") return "not_applicable";
  if (
    value.matchState === "matched_high" &&
    value.operatingState === "active"
  ) {
    return "confirmed_open";
  }
  return "verification_required";
}

function productStop(
  stop: RecommendedRouteStop,
  candidate: DetailedEligibleCandidate,
): RecommendedRouteStopV1 {
  return {
    placeId: stop.placeId,
    sequence: stop.sequence,
    title: candidate.title,
    address: candidate.summary.address,
    coordinates: candidate.coordinates,
    category: candidate.category,
    arrivalAt: stop.arrivalAt,
    visitStartsAt: stop.visitStartsAt,
    departureAt: stop.departureAt,
    dwellMinutes: stop.dwellMinutes,
    driveSecondsFromPrevious: stop.driveSecondsFromPrevious,
    distanceMetersFromPrevious: stop.distanceMetersFromPrevious,
    source: "tourism_service2",
    sourceLabel: "한국관광공사",
    petAssessment: stop.petAssessment,
    petConditionEligibility:
      candidate.eligibility.conditionEligibility ?? eligiblePetConditionEligibility(),
    conditionAcknowledged: true,
    mandatoryConditions: candidate.assessment.conditions.map((condition) => ({
      type: condition.type,
      label: condition.label,
      manualConfirmationRecommended: condition.manualConfirmationRecommended,
    })),
    informationTrust: stop.informationTrust,
    licensingStatus: licensingStatus(candidate),
    operatingHoursWarnings: candidate.scheduleCompatibility.warningCodes,
    inclusionReasonCodes: stop.inclusionReasonCodes,
    orderingReasonCodes: stop.orderingReasonCodes,
    warningCodes: stop.warningCodes,
    evidence: candidate.assessment.evidence.slice(0, 9).map((evidence) => ({
      field: evidence.field,
      label: evidence.fieldLabel,
      originalText: evidence.originalText,
    })),
  };
}

function routeFromReady(
  optimized: Extract<RouteOptimizationResult, { status: "ready" }>,
  candidateById: Map<string, DetailedEligibleCandidate>,
): ProductRouteV1 {
  return {
    id: `optimized:${optimized.stops.map(({ placeId }) => placeId).join(">")}`,
    kind: "optimized",
    label: "추천 일정",
    routeSummary: {
      startAt: optimized.schedule.startAt,
      endAt: optimized.schedule.endAt,
      stopCount: optimized.stops.length,
      totalDistanceMeters: optimized.schedule.totalDistanceMeters,
      totalDrivingSeconds: optimized.schedule.totalDrivingSeconds,
      totalVisitSeconds: optimized.schedule.totalVisitSeconds,
      totalWaitSeconds: optimized.schedule.totalWaitSeconds,
    },
    temporalBasis: {
      searchMatrix: optimized.schedule.matrixTemporalBasis,
      finalRoute: optimized.schedule.finalValidationTemporalBasis,
    },
    stops: optimized.stops.map((stop) => {
      const candidate = candidateById.get(stop.placeId);
      if (!candidate) throw new TypeError("Optimized stop is missing its strict candidate.");
      return productStop(stop, candidate);
    }),
    geometry: optimized.geometry,
  };
}

function alternativesFromReady(
  optimized: Extract<RouteOptimizationResult, { status: "ready" }>,
  candidateById: Map<string, DetailedEligibleCandidate>,
): RouteAlternativeV1[] {
  return optimized.alternatives
    .filter(
      (alternative) =>
        alternative.type !== "lower_travel" ||
        alternative.totalDrivingSeconds < optimized.schedule.totalDrivingSeconds,
    )
    .map((alternative, index) => ({
    id: `alternative:${alternative.type}:${index + 1}`,
    kind: "optimized",
    alternativeType: alternative.type,
    label:
      alternative.type === "lower_travel"
        ? "이동이 적은 일정"
        : "인기 장소 중심 일정",
    routeSummary: {
      startAt: alternative.startAt,
      endAt: alternative.endAt,
      stopCount: alternative.stops.length,
      totalDistanceMeters: alternative.totalDistanceMeters,
      totalDrivingSeconds: alternative.totalDrivingSeconds,
      totalVisitSeconds: alternative.totalVisitSeconds,
      totalWaitSeconds: alternative.totalWaitSeconds,
    },
    temporalBasis: {
      searchMatrix: optimized.schedule.matrixTemporalBasis,
      finalRoute: alternative.temporalBasis,
    },
    stops: alternative.stops.map((stop) => {
      const candidate = candidateById.get(stop.placeId);
      if (!candidate) throw new TypeError("Alternative stop is missing its strict candidate.");
      return productStop(stop, candidate);
    }),
    geometry: alternative.geometry,
    }));
}

function pipelineFailure(
  pipeline: CandidatePipelineResult,
): RouteRecommendationResponseV1 {
  if (pipeline.status === "provider_unavailable") {
    return recommendationFailure("tourism_provider_unavailable", [
      "candidate_pipeline_provider_unavailable",
      ...Object.keys(pipeline.reasonCounts),
    ]);
  }
  return recommendationFailure("insufficient_eligible_places", [
    "strict_eligible_pool_below_trip_pace_minimum",
    ...Object.keys(pipeline.reasonCounts),
  ]);
}

function optimizerFailure(
  result: Exclude<RouteOptimizationResult, { status: "ready" }>,
): RouteRecommendationFailureResponseV1 {
  switch (result.status) {
    case "matrix_incomplete":
      return recommendationFailure("travel_matrix_incomplete", result.reasonCodes);
    case "insufficient_feasible_route":
      return recommendationFailure("insufficient_feasible_route", result.reasonCodes);
    case "final_validation_failed":
      return recommendationFailure("final_route_validation_failed", result.reasonCodes);
    case "solver_failed":
      return recommendationFailure("internal_error", result.reasonCodes);
  }
}

function replacementCandidates(
  candidates: readonly CanonicalRecommendationCandidateV2[],
  selectedIds: ReadonlySet<string>,
): RecommendationReplacementCandidateV1[] {
  return candidates
    .filter(candidate => !selectedIds.has(candidate.canonicalId))
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId))
    .slice(0, 3)
    .map((candidate) => ({
      placeId: candidate.canonicalId,
      title: candidate.title,
      category: candidate.category,
      source: candidate.source,
    }));
}

function selectedFailure(
  issues: RecommendationSelectionIssueV1[],
  replacements: RecommendationReplacementCandidateV1[],
): RouteRecommendationResponseV1 {
  const replacementIds = replacements.map(({ placeId }) => placeId);
  const hydratedIssues = issues.map((issue) => ({
    ...issue,
    replacementCandidateIds: issue.replacementCandidateIds.length > 0
      ? issue.replacementCandidateIds
      : replacementIds,
  }));
  return {
    ...recommendationFailure("invalid_request", [
      "selected_place_validation_failed",
      ...hydratedIssues.flatMap(({ reasonCodes }) => reasonCodes),
    ]),
    selectionMode: "hybrid",
    selectionIssues: hydratedIssues,
    replacementCandidates: replacements,
  };
}

function safeV2DiagnosticsBeforeRoute(
  pipeline: CandidatePipelineResult | null,
  fusion: CandidateFusionV2Diagnostics,
  candidateFunnel?: SafeRecommendationDiagnostics["candidateFunnel"],
): SafeRecommendationDiagnostics {
  return {
    ...(candidateFunnel ? { candidateFunnel } : {}),
    candidatePipeline: {
      stageA: pipeline?.diagnostics.stageACount ?? 0,
      stageB: pipeline?.diagnostics.stageBCount ?? 0,
      detailedEvaluations: pipeline?.diagnostics.detailedEvaluationCount ?? 0,
      eligible: fusion.finalCount,
    },
    candidateEligibility: {
      ...fusion.stageCounts,
      feasibleRouteCandidates: 0,
      finalUsedPlaces: 0,
      rejectedByReason: fusion.excludedByReason,
    },
    travelMatrix: { nodes: 0, resolvedEdges: 0, unresolvedEdges: 0 },
    solver: { durationMs: 0, validationAttempts: 0, validationFailures: 0 },
  };
}

function mergeReasonCounts(
  ...records: ReadonlyArray<Readonly<Record<string, number>>>
): Record<string, number> {
  const merged = new Map<string, number>();
  for (const record of records) {
    for (const [reason, count] of Object.entries(record)) {
      merged.set(reason, (merged.get(reason) ?? 0) + count);
    }
  }
  return Object.fromEntries([...merged].sort(([left], [right]) => left.localeCompare(right)));
}

function funnelCategory(
  category: MapPlacesSnapshotMarker["category"] | TourPlaceSummary["category"],
): CandidateFunnelRecord["category"] {
  switch (category) {
    case "attraction":
      return "attraction";
    case "park_walk":
    case "leisure":
    case "camping":
      return "leisure";
    case "food":
    case "cafe":
      return "food";
    case "accommodation":
      return "accommodation";
    case "shopping":
      return "shopping";
    case "culture":
      return "culture";
    case "festival":
      return "festival";
    default:
      return "unsupported";
  }
}

function buildCandidateFunnelRecordsV2(input: {
  requestedRegion: NonNullable<ReturnType<typeof getRegionConfig>>;
  publishedMarkers: readonly MapPlacesSnapshotMarker[];
  collectedCatalog: readonly TourPlaceSummary[];
  fusedCandidates: readonly CanonicalRecommendationCandidateV2[];
  explicitlyExcludedPlaceIds: readonly string[];
}): CandidateFunnelRecord[] {
  const excluded = new Set(input.explicitlyExcludedPlaceIds);
  let records: CandidateFunnelRecord[] = input.publishedMarkers.map((marker) => ({
    identity: marker.id,
    dataset: marker.dataset ?? (marker.category === "shopping" ? "shopping" : "core"),
    evidenceMode: "list_only",
    active: true,
    regionId: marker.regionId,
    districtCode: marker.districtCode,
    category: funnelCategory(marker.category),
    petEvidenceState:
      marker.petAccessVerdict === "allowed"
        ? "verified"
        : marker.petAccessVerdict === "conditional"
          ? "conditional"
          : marker.petAccessVerdict === "not_allowed"
            ? "not_allowed"
            : "unknown",
    canonicalConditionState: "insufficient_evidence",
    operatingHoursState: "verification_required",
    explicitlyExcluded:
      excluded.has(marker.id) || excluded.has(marker.providerPlaceId),
  }));
  const publishedMarkerIds = new Set(records.map(({ identity }) => identity));
  for (const summary of input.collectedCatalog) {
    const identity = `tour:${summary.contentId}`;
    if (publishedMarkerIds.has(identity)) continue;
    const legalRegion = getRegionConfigByService2LegalDongCode(
      summary.legalRegionCode,
    );
    const areaRegion = getRegionConfigByKtoAreaCode(summary.areaCode);
    const resolvedRegion =
      legalRegion && areaRegion && legalRegion.id !== areaRegion.id
        ? null
        : legalRegion ?? areaRegion;
    records.push({
      identity,
      dataset: summary.category === "shopping" ? "shopping" : "core",
      evidenceMode: "list_only",
      active: summary.providerVisibility?.status === "exposed",
      regionId: resolvedRegion?.id ?? null,
      districtCode: resolvedRegion
        ? resolveRegionDistrictCode(resolvedRegion, {
            legalRegionCode: summary.legalRegionCode,
            areaCode: summary.areaCode,
            legalDistrictCode: summary.legalDistrictCode,
            areaDistrictCode: summary.sigunguCode,
          })
        : null,
      category: funnelCategory(summary.category),
      petEvidenceState: "unknown",
      canonicalConditionState: "insufficient_evidence",
      operatingHoursState: "verification_required",
      explicitlyExcluded:
        excluded.has(`tour:${summary.contentId}`) || excluded.has(summary.contentId),
    });
  }
  for (const candidate of input.fusedCandidates) {
    const enriched: CandidateFunnelRecord = {
      identity: candidate.canonicalId,
      dataset: candidate.category === "shopping" ? "shopping" : "core",
      evidenceMode: candidate.ktoCandidate ? "detailed" : "list_only",
      hasGuidance: Boolean(candidate.conditionEligibility.guidanceConditions?.length),
      active: true,
      regionId: candidate.regionId,
      districtCode: candidate.districtCode,
      category: candidate.category,
      petEvidenceState:
        candidate.catalogPetVerdict === "allowed"
          ? "verified"
          : candidate.catalogPetVerdict === "conditional"
            ? "conditional"
            : candidate.catalogPetVerdict === "not_allowed"
              ? "not_allowed"
              : "unknown",
      canonicalConditionState: candidate.conditionEligibility.state,
      operatingHoursState:
        candidate.operatingHoursEvidenceState === "verified"
          ? "verified"
          : "verification_required",
      explicitlyExcluded: excluded.has(candidate.canonicalId),
    };
    let matchedPublishedIdentity = false;
    records = records.map((record) => {
      if (record.identity !== candidate.canonicalId) return record;
      matchedPublishedIdentity = true;
      return {
        ...enriched,
        dataset: record.dataset,
        evidenceMode: enriched.evidenceMode,
        active: record.active,
        explicitlyExcluded:
          record.explicitlyExcluded === true || enriched.explicitlyExcluded === true,
      };
    });
    if (!matchedPublishedIdentity) records.push(enriched);
  }
  return records;
}

async function generateRouteRecommendationLegacy(
  request: RouteRecommendationRequest,
  dependencies: RecommendationServiceDependencies = {},
): Promise<RouteRecommendationResponseV1> {
  const tourService = dependencies.tourService ?? getDefaultTourService();
  const licenseMatcher =
    dependencies.licenseMatcher ??
    (dependencies.tourService ? null : getDefaultLicenseMatchingService());
  const travelTimeProvider =
    dependencies.travelTimeProvider ?? new KakaoTravelTimeProvider();
  const pipelineRunner = dependencies.candidatePipeline ?? runCandidatePipelineV1;
  const optimizer = dependencies.optimizer ?? optimizeRouteV1;
  const catalogLoader = dependencies.collectCatalog ?? collectTourCatalog;
  const now = dependencies.now ?? (() => new Date());
  const normalized = normalizeRecommendationRequest(request);
  const region = getRegionConfig(request.trip.regionId);
  const lookup = getKtoRegionLookupIdentity(region, request.trip.districtId);
  const observations: TourRequestObservation[] = [];
  try {
    const catalogGroups = await mapWithConcurrency(
      request.trip.selectedCategories,
      CATALOG_CONCURRENCY,
      async (category) => {
        const contentTypeId = getCatalogContentTypeId(
          category as TourCatalogCategory,
        );
        if (!contentTypeId) return [] as TourPlaceSummary[];
        const catalog = await catalogLoader(
          tourService,
          {
            regionCode: lookup.areaCode,
            districtCode: lookup.district?.areaCodes[0],
            administrativeCodeSystem: "area_code",
            visibilityRegionCode: lookup.legalRegionCode,
            visibilityDistrictCode: lookup.district?.legalCodes[0],
            contentTypeId,
          },
          (event) => observations.push(event),
        );
        return catalog.places;
      },
    );
    const catalog = [
      ...new Map(
        catalogGroups.flat().map((place) => [place.contentId, place]),
      ).values(),
    ];
    // Stage 2 compares provider visibility retrieval timestamps with one
    // immutable snapshot. Capture it after the catalog/visibility joins so a
    // freshly retrieved record cannot appear to come from the future.
    const pipelineAsOf = now();
    const pace = getTripPaceConfig(request.trip.tripPace);
    const pipeline = await pipelineRunner({
      context: {
        request: normalized,
        maxStops: pace.maxStops,
        minStops: pace.minStops,
        tripType: normalized.tripType,
        petProfile: {
          species: normalized.petSpecies,
          size: normalized.petSize,
          hasCarrier: normalized.petEquipment.hasCarrier,
          hasLeash: normalized.petEquipment.hasLeash,
          hasMuzzle: normalized.petEquipment.hasMuzzle,
          acceptsOutdoorOnly: normalized.acceptsOutdoorOnly,
        },
        tripRequest: {
          scope: {
            regionCode: normalized.scope.regionCode,
            districtCode:
              normalized.scope.type === "district"
                ? normalized.scope.districtCode
                : null,
            bounds: region.mapBounds,
          },
          selectedCategories: normalized.selectedCategories,
          includeShopping: normalized.includeShopping,
          indoorAccessPreference: normalized.indoorAccessPreference,
        },
      },
      catalog,
      tourService,
      licenseMatcher,
      now: () => new Date(pipelineAsOf),
      initialObservations: observations,
    });
    if (pipeline.status !== "ready") return pipelineFailure(pipeline);
    const candidates = pipeline.candidates
      .slice(0, ROUTE_SOLVER_V1_CONFIG.maxCandidates)
      .map((candidate) => adaptEligibleCandidateForRouteV1({ candidate }));
    const departure = {
      id: "departure",
      kind: "departure" as const,
      name: request.departure.label,
      latitude: request.departure.latitude,
      longitude: request.departure.longitude,
    };
    const matrix = await travelTimeProvider.buildMatrix({
      signal: dependencies.signal,
      departure,
      candidates: candidates.map(({ node }) => node),
      travelMode: "driving",
      priority: "TIME",
      avoid: [],
      requestedDepartureAt: null,
    });
    const tripRequest: RouteOptimizationTripRequest = {
      date: normalized.travelDate,
      startTime: normalized.startTime,
      timezone: "Asia/Seoul",
      tripType: request.trip.tripType,
      tripPace: request.trip.tripPace,
      selectedCategories: request.trip.selectedCategories,
      roundTrip: request.trip.roundTrip,
    };
    const optimizationInput: RouteOptimizationInput = {
      departure,
      candidates,
      matrix,
      tripRequest,
    };
    const optimized = await optimizer(optimizationInput, { travelTimeProvider });
    if (optimized.status !== "ready") return optimizerFailure(optimized);
    const candidateById = new Map(
      pipeline.candidates.map((candidate) => [candidate.contentId, candidate]),
    );
    const route = routeFromReady(optimized, candidateById);
    const alternatives = alternativesFromReady(optimized, candidateById);
    const editSessionId = createEditSessionId(
      optimizationInput,
      [route, ...alternatives],
      optimized.schedule.matrixTemporalBasis,
      pipelineAsOf.getTime(),
      dependencies.editSessionSecret,
    );
    const response: RouteRecommendationReadyResponseV1 = {
      status: "ready",
      apiVersion: ROUTE_RECOMMENDATION_API_VERSION,
      engineVersion: optimized.engineVersion,
      objectiveVersion: optimized.objectiveVersion,
      solverVersion: optimized.solverVersion,
      editSessionId,
      requestSummary: {
        departureLabel: request.departure.label,
        tripDate: request.trip.date,
        startTime: request.trip.startTime,
        tripType: request.trip.tripType,
        tripPace: request.trip.tripPace,
        selectedCategories: request.trip.selectedCategories,
        roundTrip: request.trip.roundTrip,
      },
      optimality: optimized.searchOptimality,
      route,
      alternatives,
      excludedHighlights: optimized.excludedHighlights.map((highlight) => ({
        placeId: highlight.placeId,
        title: candidateById.get(highlight.placeId)?.title ?? null,
        reasonCode: highlight.reasonCode,
      })),
      warnings: optimized.warnings,
      ...(dependencies.includeDiagnostics
        ? {
            diagnostics: {
              candidatePipeline: {
                stageA: pipeline.diagnostics.stageACount,
                stageB: pipeline.diagnostics.stageBCount,
                detailedEvaluations:
                  pipeline.diagnostics.detailedEvaluationCount,
                eligible: pipeline.diagnostics.finalEligibleCount,
              },
              travelMatrix: {
                nodes: matrix.diagnostics.nodeCount,
                resolvedEdges: matrix.diagnostics.resolvedEdges,
                unresolvedEdges: matrix.diagnostics.unresolvedEdges,
              },
              solver: {
                durationMs: optimized.diagnostics.totalDurationMs,
                validationAttempts: optimized.diagnostics.validationAttempts,
                validationFailures: optimized.diagnostics.validationFailures,
              },
            },
          }
        : {}),
    };
    return response;
  } catch (error) {
    dependencies.signal?.throwIfAborted();
    if (error instanceof TourProviderError) {
      return recommendationFailure("tourism_provider_unavailable", [
        `tourism_${error.code.toLowerCase()}`,
      ]);
    }
    if (error instanceof KakaoMobilityProviderError) {
      return recommendationFailure("kakao_provider_unavailable", [
        `kakao_${error.code.toLowerCase()}`,
      ]);
    }
    return recommendationFailure("internal_error", ["recommendation_orchestration_failed"]);
  }
}

/** Production V2 orchestration. One request performs one retrieval pass and one matrix build. */
export async function generateRouteRecommendation(
  request: RouteRecommendationRequest,
  dependencies: RecommendationServiceDependencies = {},
): Promise<RouteRecommendationResponseV1> {
  dependencies.signal?.throwIfAborted();
  // Preserve the injectable Stage 5 seam used by legacy/manual-route unit tests.
  if (
    dependencies.optimizer &&
    !dependencies.routeOptionsOptimizer &&
    !dependencies.loadCatalogSnapshot
  ) {
    return generateRouteRecommendationLegacy(request, dependencies);
  }

  const normalized = normalizeRecommendationRequest(request);
  const scheduleNow = (dependencies.now ?? (() => new Date()))();
  const originalConditions = new Map<string, import("@/types/pet-condition-eligibility").CanonicalPetConditionEligibility>();
  if (request.requestVersion === 2 && request.trip.date && request.trip.date < seoulDate(scheduleNow)) return recommendationFailure("invalid_request", ["travel_date_in_past"]);
  if (normalized.scheduleIntent && !normalized.scheduleIntent.startTime) {
    const first = departureCandidates(normalized.scheduleIntent, scheduleNow)[0];
    if (!first) return recommendationFailure("insufficient_feasible_route", ["no_departure_remaining_today"]);
    normalized.startTime = first;
  }
  const petProfile = {
    species: normalized.petSpecies,
    size: normalized.petSize,
    hasCarrier: normalized.petEquipment.hasCarrier,
    hasLeash: normalized.petEquipment.hasLeash,
    hasMuzzle: normalized.petEquipment.hasMuzzle,
    acceptsOutdoorOnly: normalized.acceptsOutdoorOnly,
    petCount: request.personalization?.petCount ?? 1,
  };
  const region = getRegionConfig(request.trip.regionId);
  const selectedPlaceIds = [...(request.selectedPlaceIds ?? [])];
  const hybridMode = selectedPlaceIds.length > 0;
  const capabilityBlock = getRegionRouteCapabilityBlock(region, {
    selectedPlaceCount: selectedPlaceIds.length,
    autoFill: request.autoFill ?? true,
  });
  if (capabilityBlock) {
    return recommendationFailure("region_not_supported_for_itinerary", [
      capabilityBlock,
    ]);
  }

  const selectedIdSet = new Set(selectedPlaceIds);
  const pace = getTripPaceConfig(request.trip.tripPace);
  const crossRegionReferences = (request.selectedPlaceReferences ?? []).filter(
    ({ regionId: selectedRegionId }) => selectedRegionId !== request.trip.regionId,
  );
  if (crossRegionReferences.length > 0) {
    return selectedFailure(crossRegionReferences.map(({ placeId }) => ({
      placeId,
      code: "selected_place_cross_region" as const,
      blocking: true,
      reasonCodes: ["selected_place_region_mismatch"],
      replacementCandidateIds: [],
    })), []);
  }
  if (
    hybridMode &&
    (selectedIdSet.size !== selectedPlaceIds.length ||
      selectedPlaceIds.some((placeId) => !/^(?:tour|kakao):[0-9]+$/u.test(placeId)))
  ) {
    return selectedFailure([{
      placeId: selectedPlaceIds.find((placeId, index) =>
        selectedPlaceIds.indexOf(placeId) !== index || !/^(?:tour|kakao):[0-9]+$/u.test(placeId)) ??
        selectedPlaceIds.at(-1) ?? "selected-place",
      code: "selected_place_not_found_in_region",
      blocking: true,
      reasonCodes: ["selected_place_identity_invalid_or_duplicated"],
      replacementCandidateIds: [],
    }], []);
  }

  try {
    const travelTimeProvider = dependencies.travelTimeProvider ?? new KakaoTravelTimeProvider();
    const routeOptionsOptimizer = dependencies.routeOptionsOptimizer ?? optimizeRouteOptionsV2;
    enterRecommendationStage("catalog", 0);
    const now = dependencies.now ?? (() => new Date());
    let publicCatalog: RecommendationPublicCatalog;
    try {
      if (dependencies.loadCatalogSnapshot) {
        const snapshots = await Promise.all(region.mapCatalog.snapshotDatasets.map(dataset => dependencies.loadCatalogSnapshot!({ version: 1, region: request.trip.regionId, scope: "default", dataset })));
        publicCatalog = { items: snapshots.flatMap(snapshot => snapshot?.items ?? []), dataVersion: snapshots.map(snapshot => snapshot?.dataVersion ?? "unavailable").join(":"), pages: snapshots.length, unavailableSources: [] };
      } else {
        publicCatalog = await (dependencies.loadPublicCatalog ?? loadRecommendationPublicCatalog)(request.trip.regionId, { signal: dependencies.signal });
      }
    } catch (error) {
      if (dependencies.signal?.aborted) throw error;
      recordRecommendationProviderFailure("get_public_map_catalog_by_region_v4", error);
      const failure = safeProviderFailure(error);
      return recommendationFailure(failure.httpStatus === 429 ? "rate_limited" : "tourism_provider_unavailable", [
        "public_catalog_unavailable",
        ...(failure.httpStatus || failure.domainCode ? [`public_catalog_${failure.category}`] : []),
      ]);
    }
    enterRecommendationStage("candidate_selection", publicCatalog.items.length);
    const snapshot = publicCatalog;
    const publishedMarkers = publicCatalog.items;
    const snapshotUnavailable = publicCatalog.unavailableSources.length > 0;
    const pipeline: CandidatePipelineResult | null = null;
    const collectedCatalog: TourPlaceSummary[] = [];
    const usefulCategories = normalized.selectedCategories;
    const selectedMarkers = new Map(publishedMarkers.map(marker => [marker.id, marker]));
    const personalizationRequest = normalized.personalization ?? {
      petCount: 1,
      petActivityLevel: "moderate" as const,
      walkingTolerance: "moderate" as const,
      crowdPreference: "any" as const,
      tripMood: "balanced" as const,
      categoryPriorities: {},
      recentRouteSignatures: [],
      recentlySelectedCandidateIds: [],
      explicitlyExcludedPlaceIds: [],
      rerollVariant: 0,
    };
    const historyContextKey = recommendationHistoryContextKeyV2({
      regionId: request.trip.regionId,
      districtId: request.trip.districtId,
      departure: {
        latitude: request.departure.latitude,
        longitude: request.departure.longitude,
      },
      date: request.trip.date,
      startTime: request.trip.startTime,
      tripType: request.trip.tripType,
      tripPace: request.trip.tripPace,
      selectedCategories: [...request.trip.selectedCategories].sort(),
      roundTrip: request.trip.roundTrip,
      environmentPreference: request.trip.environmentPreference ?? "any",
      desiredStopCount: request.trip.desiredStopCount ?? null,
      durationMinutes: request.trip.durationMinutes ?? null,
      pet: {
        species: request.pet.species,
        size: request.pet.size,
        availableEquipment: request.pet.availableEquipment,
        acceptsOutdoorOnlyPlaces: request.pet.acceptsOutdoorOnlyPlaces,
      },
      selectedPlaceIds: [...selectedPlaceIds].sort(),
      autoFill: request.autoFill ?? true,
      includeVerificationRequired: request.includeVerificationRequired ?? false,
      acknowledgedVerificationRequiredPlaceIds: [
        ...(request.acknowledgedVerificationRequiredPlaceIds ?? []),
      ].sort(),
      personalization: {
        petCount: personalizationRequest.petCount,
        petActivityLevel: personalizationRequest.petActivityLevel,
        walkingTolerance: personalizationRequest.walkingTolerance,
        crowdPreference: personalizationRequest.crowdPreference,
        tripMood: personalizationRequest.tripMood,
        categoryPriorities: personalizationRequest.categoryPriorities,
      },
    });
    const historyMatchesContext =
      personalizationRequest.historyContextKey === historyContextKey;
    const scopedRecentRouteSignatures = historyMatchesContext
      ? personalizationRequest.recentRouteSignatures
      : [];
    const scopedRecentlySelectedCandidateIds = historyMatchesContext
      ? personalizationRequest.recentlySelectedCandidateIds
      : [];
    const fused = fuseRecommendationCandidatesV2({
      regionId: request.trip.regionId,
      districtId: request.trip.districtId,
      selectedCategories: usefulCategories,
      ktoCandidates: [],
      catalogCandidates: snapshot?.items ?? [],
      explicitlyExcludedPlaceIds: personalizationRequest.explicitlyExcludedPlaceIds,
      selectedPlaceIds,
      includeVerificationRequired: request.includeVerificationRequired ?? false,
      acknowledgedVerificationRequiredPlaceIds:
        request.requestVersion === 2 ? [] : request.acknowledgedVerificationRequiredPlaceIds ?? [],
      petProfile,
      selectionOrigin: hybridMode ? "automatic_fill" : "automatic_recommendation",
    });
    const observedFusedCandidates = [...fused.candidates];
    const reconciledRecords = buildCandidateFunnelRecordsV2({
      requestedRegion: region,
      publishedMarkers,
      collectedCatalog,
      fusedCandidates: observedFusedCandidates,
      explicitlyExcludedPlaceIds: personalizationRequest.explicitlyExcludedPlaceIds,
    });
    const emptyCandidateIds = new Set<string>();
    const candidateFunnelBeforeRoute = buildCandidateFunnelDiagnostics({
      planningPolicy: "full_public_catalog_v1",
      completionFirst: request.requestVersion === 2,
      calendarDateSelected: request.trip.date !== null,
      records: reconciledRecords,
      requestedRegionId: request.trip.regionId,
      requestedDistrictCode: request.trip.districtId,
      selectedCategories: usefulCategories,
      dateTimeFeasibleIds: emptyCandidateIds,
      departureDistanceFeasibleIds: emptyCandidateIds,
      matrixFeasibleIds: emptyCandidateIds,
      optimizerInputIds: emptyCandidateIds,
      includeVerificationRequired: request.includeVerificationRequired ?? false,
      acknowledgedConditionIds: new Set(
        request.acknowledgedVerificationRequiredPlaceIds ?? [],
      ),
    });
    const requestedCapacity = hybridMode
      ? (request.autoFill ?? true)
        ? Math.min(5, Math.max(
            selectedPlaceIds.length,
            Math.min(pace.maxStops, request.trip.desiredStopCount ?? pace.maxStops),
          ))
        : selectedPlaceIds.length
      : request.trip.desiredStopCount ?? pace.desiredStopCount;
    const diversityBeforeRoute = calculateDiversityCapacityV2({
      planningPolicy: "full_public_catalog_v1",
      unqueriedCandidateIds: fused.candidates.map(candidate => candidate.canonicalId),
      candidates: fused.candidates.map(({ canonicalId, category }) => ({
        id: canonicalId,
        category,
      })),
      requestedStopCount: requestedCapacity,
      mandatorySelectedPlaceIds: selectedPlaceIds,
      seenCandidateIds: scopedRecentlySelectedCandidateIds,
      requiredCategories: usefulCategories,
      feasibleCandidateIds: [],
      requiredRoadEdgesResolved: false,
    });

    const fusedById = new Map(
      fused.candidates.map((candidate) => [candidate.canonicalId, candidate]),
    );
    const selectionIssues: RecommendationSelectionIssueV1[] = [];
    const anchors: CanonicalRecommendationCandidateV2[] = [];
    const acknowledgedSelectedIds = new Set<string>();
    for (const placeId of selectedPlaceIds) {
      const marker = selectedMarkers.get(placeId);
      const candidate = fusedById.get(placeId) ?? fused.candidates.find(item => item.providerIdentities.some(identity => (identity.provider === "kto" ? "tour:" : "kakao:") + identity.id === placeId));
      if (!candidate) {
        const explicitlyExcluded = personalizationRequest.explicitlyExcludedPlaceIds.includes(placeId) || fused.diagnostics.identities?.some(item => item.rawId === placeId && item.reason === "explicit_user_exclusion");
        selectionIssues.push({ placeId, code: explicitlyExcluded ? "selected_place_explicitly_excluded" : marker?.coordinates === null ? "selected_place_missing_coordinates" : "selected_place_not_found_in_region", blocking: true, reasonCodes: [explicitlyExcluded ? "selected_place_is_also_explicitly_excluded" : "selected_place_not_routeable_in_public_catalog"], replacementCandidateIds: [] });
        continue;
      }
      // Keep the public selected alias as the canonical route ID; aliases still share one entity.
      if (candidate.canonicalId !== placeId) {
        fusedById.delete(candidate.canonicalId);
        const previousId = candidate.canonicalId;
        candidate.canonicalId = placeId;
        for (const identity of fused.diagnostics.identities ?? []) if (identity.canonicalId === previousId) identity.canonicalId = placeId;
        fusedById.set(placeId, candidate);
      }
      if (anchors.includes(candidate)) {
        selectionIssues.push({ placeId, code: "selected_place_trip_incompatible", blocking: true, reasonCodes: ["selected_aliases_refer_to_same_place"], replacementCandidateIds: [] });
      } else anchors.push(candidate);
    }

    const replacements = replacementCandidates(fused.candidates, selectedIdSet);
    if (selectionIssues.some(({ blocking }) => blocking)) {
      return selectedFailure(selectionIssues, replacements);
    }
    if (!hybridMode && fused.candidates.length === 0) {
      return {
        ...recommendationFailure("insufficient_eligible_places", [
          "no_routeable_public_candidate",
          ...(snapshotUnavailable ? ["kakao_catalog_unavailable"] : []),
        ]),
        resultState: "insufficient_eligible_places",
        requestedStopCount: request.trip.desiredStopCount ?? pace.desiredStopCount,
        feasibleStopCount: 0,
        resultExplanation:
          "공개 목록에 좌표를 사용할 수 있는 장소가 없거나 이번 여행에서 모두 제외했습니다.",
        recoveryActions: [
          "change_categories",
          ...(request.trip.districtId ? ["widen_district" as const] : []),
          "select_places_manually",
        ],
        diversity: diversityBeforeRoute,
        ...(dependencies.includeDiagnostics ? {
          diagnostics: safeV2DiagnosticsBeforeRoute(
            pipeline,
            fused.diagnostics,
            candidateFunnelBeforeRoute,
          ),
        } : {}),
      };
    }
    if (hybridMode && anchors.length === 0) {
      return selectedFailure([{
        placeId: selectedPlaceIds[0]!,
        code: "selected_place_not_found_in_region",
        blocking: true,
        reasonCodes: ["no_selected_anchor_resolved"],
        replacementCandidateIds: [],
      }], replacements);
    }

    const generatedAt = now();
    const desiredSupplementCategories = hybridMode
      ? inferHybridSupplementCategories({ request, selected: anchors.filter(
          (candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate),
        ) })
      : new Set<UsefulTourCategory>(usefulCategories);
    const protectedCandidateIds = new Set(selectedPlaceIds);
    const history = analyzeRecommendationHistoryV2({
      recentRouteSignatures: scopedRecentRouteSignatures,
      recentlySelectedCandidateIds: scopedRecentlySelectedCandidateIds,
      protectedPlaceIds: [...protectedCandidateIds],
    });
    const personalization = {
      environmentPreference: normalized.environmentPreference ?? "any",
      petCount: personalizationRequest.petCount,
      petActivityLevel: personalizationRequest.petActivityLevel,
      walkingTolerance: personalizationRequest.walkingTolerance,
      crowdPreference: personalizationRequest.crowdPreference,
      tripMood: personalizationRequest.tripMood,
      categoryPriorities: personalizationRequest.categoryPriorities,
      recentRouteSignatures: scopedRecentRouteSignatures,
      recentlySelectedCandidateIds: scopedRecentlySelectedCandidateIds,
      protectedCandidateIds: [...protectedCandidateIds],
      history,
      rerollVariant: personalizationRequest.rerollVariant,
    };
    const targetCapacity = requestedCapacity;
    const canonicalCandidates = fused.candidates;
    const adaptedAll = canonicalCandidates
      .map((candidate) => ({
        ...adaptCanonicalCandidateForRouteV2({
        candidate,
        departure: request.departure,
        personalization,
        computedAt: generatedAt.toISOString(),
        }),
        ...(hybridMode ? { locked: selectedIdSet.has(candidate.canonicalId) } : {}),
      }))
      .sort((left, right) =>
        Number(Boolean(right.locked)) - Number(Boolean(left.locked)) ||
        right.placeUtility.total - left.placeUtility.total ||
        left.node.id.localeCompare(right.node.id));
    const spatial = selectSpatialShortlistV2({ candidates: adaptedAll, departure: request.departure, lockedPlaceIds: selectedPlaceIds, selectedCategories: usefulCategories, recentlySelectedCandidateIds: scopedRecentlySelectedCandidateIds, seed: normalized.generationSeed, rerollVariant: personalizationRequest.rerollVariant, limit: Math.min(6, Math.max(selectedPlaceIds.length, targetCapacity + 1)) });
    let adapted = hybridMode && request.autoFill === false ? adaptedAll.filter(candidate => selectedIdSet.has(candidate.node.id)) : spatial.candidates;
    let adaptedIds = new Set(adapted.map(({ node }) => node.id));
    const candidateById = new Map(
      canonicalCandidates
        .map((candidate) => [candidate.canonicalId, candidate]),
    );
    const departure = {
      id: "departure",
      kind: "departure" as const,
      name: request.departure.label,
      latitude: request.departure.latitude,
      longitude: request.departure.longitude,
    };
    const matrixBudget = { remaining: 48 };
    enterRecommendationStage("kakao_matrix", adapted.length);
    let matrix = await travelTimeProvider.buildMatrix({
      providerCallBudget: matrixBudget,
      signal: dependencies.signal,
      departure,
      candidates: adapted.map(({ node }) => node),
      travelMode: "driving",
      priority: "TIME",
      avoid: [],
      requestedDepartureAt: null,
      requiredDirectedEdges: [
        ...adapted.map(({ node }) => ({ fromId: departure.id, toId: node.id })),
        ...(request.trip.roundTrip
          ? adapted.map(({ node }) => ({ fromId: node.id, toId: departure.id }))
          : []),
        ...adapted.flatMap(({ node }) => selectedPlaceIds.flatMap((selectedId) =>
          node.id === selectedId
            ? []
            : [
                { fromId: selectedId, toId: node.id },
                { fromId: node.id, toId: selectedId },
              ]
        )),
      ],
    });
    dependencies.signal?.throwIfAborted();
    const matrixRuns = [matrix];
    const tripRequest: RouteOptimizationTripRequest = {
      planningPolicy: "full_public_catalog_v1",
      scheduleIntent: normalized.scheduleIntent,
      date: normalized.travelDate,
      startTime: normalized.startTime,
      timezone: "Asia/Seoul",
      tripType: request.trip.tripType,
      tripPace: request.trip.tripPace,
      selectedCategories: hybridMode
        ? [...desiredSupplementCategories]
        : usefulCategories,
      roundTrip: request.trip.roundTrip,
      desiredStopCount: targetCapacity,
      durationMinutes: request.trip.durationMinutes,
      allowReducedStops: true,
      ...(hybridMode ? { requiredPlaceIds: selectedPlaceIds } : {}),
    };
    let feasibilityInput: RouteOptimizationInput = {
      signal: dependencies.signal,
      departure,
      candidates: adapted,
      matrix,
      tripRequest,
    };
    enterRecommendationStage("route_search", adapted.length);
    let scheduling = findFeasibleSchedule(feasibilityInput, generatedAt);
    // One reserve attempt shares road calls, cache, cancellation, and the original search allowance.
    if (scheduling.feasibility.maximumFeasibleStopCount < targetCapacity && spatial.reserveIds.length && !(hybridMode && request.autoFill === false) && matrixBudget.remaining >= 2) {
      const keepIds = new Set([...selectedPlaceIds, ...(scheduling.feasibility.bestRouteIds ?? [])]);
      const retryCandidates = scheduling.input.candidates.filter(candidate => keepIds.has(candidate.node.id));
      const existingIds = new Set(retryCandidates.map(candidate => candidate.node.id));
      let newPairAllowance = matrixBudget.remaining;
      for (const reserveId of spatial.reserveIds) {
        if (retryCandidates.length >= 6) break;
        const additionalPairs = (retryCandidates.length + 1) * 2;
        if (additionalPairs > newPairAllowance) break;
        const candidate = adaptedAll.find(item => item.node.id === reserveId)!;
        retryCandidates.push(candidate); newPairAllowance -= additionalPairs;
      }
      if (retryCandidates.some(candidate => !existingIds.has(candidate.node.id))) {
        enterRecommendationStage("kakao_matrix", retryCandidates.length);
        const retryMatrix = await travelTimeProvider.buildMatrix({ signal: dependencies.signal, providerCallBudget: matrixBudget, departure, candidates: retryCandidates.map(candidate => candidate.node), travelMode: "driving", priority: "TIME", avoid: [], requestedDepartureAt: null });
        matrixRuns.push(retryMatrix);
        enterRecommendationStage("route_search", retryCandidates.length);
        const retry = findFeasibleSchedule({ ...scheduling.input, candidates: retryCandidates, matrix: retryMatrix }, generatedAt, scheduling.budget);
        if (retry.feasibility.maximumFeasibleStopCount > scheduling.feasibility.maximumFeasibleStopCount) { adapted = retryCandidates; matrix = retryMatrix; adaptedIds = new Set(adapted.map(candidate => candidate.node.id)); scheduling = retry; }
      }
    }
    feasibilityInput = scheduling.input;
    const feasibility = scheduling.feasibility;
    const dateTimeFeasibleIds = new Set(
      canonicalCandidates
        .filter((candidate) =>
          feasibility.feasibleCandidateIds.includes(candidate.canonicalId)
        )
        .map(({ canonicalId }) => canonicalId),
    );
    const departureDistanceFeasibleIds = new Set(
      adaptedAll.map(({ node }) => node.id),
    );
    const matrixFeasibleIds = new Set(
      adapted.flatMap((candidate) => {
        const inbound = matrix.edges[departure.id]?.[candidate.node.id];
        const hasInbound = inbound?.status === "resolved";
        const hasContinuation = adapted.length === 1 || adapted.some((other) =>
          other.node.id !== candidate.node.id &&
          matrix.edges[candidate.node.id]?.[other.node.id]?.status === "resolved"
        );
        return hasInbound && hasContinuation ? [candidate.node.id] : [];
      }),
    );
    const optimizerInputIds = new Set(
      feasibility.status === "ready" ? feasibility.feasibleCandidateIds : [],
    );
    const catalogCoverage: NonNullable<SafeRecommendationDiagnostics["catalogCoverage"]> = {
      pages: publicCatalog.pages, unavailableSources: publicCatalog.unavailableSources,
      sourceCounts: fused.diagnostics.sourceCounts,
      entities: { ktoOnly: fused.diagnostics.acceptedSourceCounts.kto, kakaoOnly: fused.diagnostics.acceptedSourceCounts.kakao, merged: fused.diagnostics.crossProviderDuplicatesMerged },
      identities: fused.diagnostics.identities ?? [], scoredIds: spatial.scoredIds,
      shortlistIds: adapted.map(item => item.node.id), reserveIds: spatial.scoredIds.filter(id => !adaptedIds.has(id)),
      matrixNodeIds: [...new Set(matrixRuns.flatMap(run => run.nodeIds))],
      matrixEdges: matrixRuns.flatMap(run => Object.values(run.edges).flatMap(row => Object.values(row))).filter(edge => edge.fromId !== edge.toId).map(edge => ({ fromId: edge.fromId, toId: edge.toId, status: edge.status, source: edge.source, reasonCodes: edge.reasonCodes })),
      matrixProviderCalls: 48 - matrixBudget.remaining, matrixAttempts: matrixRuns.length,
      feasibleIds: feasibility.feasibleCandidateIds, finalUsedIds: [], evidenceGateRejections: 0,
    };
    const candidateFunnel = buildCandidateFunnelDiagnostics({
      planningPolicy: "full_public_catalog_v1",
      completionFirst: request.requestVersion === 2,
      calendarDateSelected: request.trip.date !== null,
      records: reconciledRecords,
      requestedRegionId: request.trip.regionId,
      requestedDistrictCode: request.trip.districtId,
      selectedCategories: usefulCategories,
      dateTimeFeasibleIds,
      departureDistanceFeasibleIds,
      matrixEvaluatedIds: adaptedIds,
      matrixFeasibleIds,
      optimizerInputIds,
      includeVerificationRequired: request.includeVerificationRequired ?? false,
      acknowledgedConditionIds: acknowledgedSelectedIds,
    });
    const diversity = calculateDiversityCapacityV2({
      planningPolicy: "full_public_catalog_v1",
      unqueriedCandidateIds: spatial.scoredIds.filter(id => !matrixRuns.some(run => run.nodeIds.includes(id))),
      candidates: adaptedAll.map(({ node, category }) => ({ id: node.id, category })),
      requestedStopCount: targetCapacity,
      mandatorySelectedPlaceIds: selectedPlaceIds,
      seenCandidateIds: scopedRecentlySelectedCandidateIds,
      requiredCategories: tripRequest.selectedCategories,
      feasibleCandidateIds:
        feasibility.status === "ready" ? feasibility.feasibleCandidateIds : [],
      requiredRoadEdgesResolved:
        feasibility.status === "ready" && feasibility.feasibleCandidateIds.length > 0,
      feasibilityReasonCodes: feasibility.limitingReasonCodes,
    });
    if (feasibility.status !== "ready") {
      const failedEdges = Object.values(matrix.edges).flatMap(edges => Object.values(edges))
        .filter(edge => edge.fromId !== edge.toId && edge.status === "provider_unavailable");
      if (failedEdges.some(edge => edge.reasonCodes.includes("kakao_rate_limited"))) {
        enterRecommendationStage("kakao_matrix", adapted.length);
        return recommendationFailure("rate_limited", ["kakao_rate_limited"]);
      }
      if (failedEdges.length && (matrix.diagnostics.resolvedEdges === 0 ||
          failedEdges.some(edge => edge.reasonCodes.includes("kakao_authentication_failed")))) {
        enterRecommendationStage("kakao_matrix", adapted.length);
        return recommendationFailure("kakao_provider_unavailable", [...new Set(failedEdges.flatMap(edge => edge.reasonCodes))]);
      }
      const detailedFailure = {
        ...recommendationFailure("insufficient_feasible_route", feasibility.limitingReasonCodes),
        resultState: "insufficient_feasible_route" as const,
        requestedStopCount: targetCapacity,
        feasibleStopCount: 0,
        resultExplanation:
          `요청 ${targetCapacity}곳 중 실제 이동시간과 요청 시간 예산을 만족하는 장소 조합은 0곳입니다. 제한 요인: ${feasibility.limitingReasonCodes.join(", ")}.`,
        recoveryActions: [
          "reduce_requested_stops" as const,
          "change_time_window" as const,
          "change_categories" as const,
          ...(request.trip.districtId ? ["widen_district" as const] : []),
        ],
        diversity,
        ...(dependencies.includeDiagnostics ? {
          diagnostics: {
            ...safeV2DiagnosticsBeforeRoute(
              pipeline,
              fused.diagnostics,
              candidateFunnel,
            ),
            travelMatrix: {
              nodes: matrix.diagnostics.nodeCount,
              resolvedEdges: matrix.diagnostics.resolvedEdges,
              unresolvedEdges: matrix.diagnostics.unresolvedEdges,
            },
          },
        } : {}),
      };
      return hybridMode
        ? {
            ...detailedFailure,
            selectionMode: "hybrid" as const,
            selectionIssues: [{
              placeId: selectedPlaceIds.join(","),
              code: "selected_place_trip_incompatible" as const,
              blocking: true,
              reasonCodes: feasibility.limitingReasonCodes,
              replacementCandidateIds: replacements.map(({ placeId }) => placeId),
            }],
            replacementCandidates: replacements,
          }
        : detailedFailure;
    }
    const optimizationInput: RouteOptimizationInput = {
      ...feasibilityInput,
      signal: dependencies.signal, validationBudget: { remaining: 3 },
      tripRequest: {
        ...feasibilityInput.tripRequest,
        desiredStopCount: feasibility.targetStopCount,
        minimumStopCount: feasibility.targetStopCount,
        minimumRequestedCategoryCount: feasibility.requiredRequestedCategoryCount,
      },
    };
    const noveltyQuota = calculateNoveltyQuotaV2({
      requestedStopCount: feasibility.targetStopCount,
      mandatoryPlaceCount: selectedPlaceIds.length,
      maximumFeasibleNovelReplacements: diversity.maximumFeasibleNovelReplacements,
      rerollVariant: personalizationRequest.rerollVariant,
    });
    const optimized = await routeOptionsOptimizer(optimizationInput, {
      travelTimeProvider,
      solverDeadlineMs: Math.max(0, scheduling.budget.deadline - performance.now()), maxExpandedStates: Math.max(0, scheduling.budget.remainingStates),
      recentRouteSignatures: scopedRecentRouteSignatures,
      recentlySelectedCandidateIds: scopedRecentlySelectedCandidateIds,
      protectedPlaceIds: [...protectedCandidateIds],
      minimumNewAutomaticPlaces: noveltyQuota,
      deterministicSeed: normalized.generationSeed,
      rerollVariant: personalizationRequest.rerollVariant,
    });
    dependencies.signal?.throwIfAborted();
    if (optimized.status !== "ready") {
      if (optimized.reasonCodes.includes("kakao_rate_limited")) return recommendationFailure("rate_limited", optimized.reasonCodes);
      if (optimized.reasonCodes.some(code => code === "route_provider_unavailable" || code === "kakao_authentication_failed")) return recommendationFailure("kakao_provider_unavailable", optimized.reasonCodes);
      const failure = optimizerFailure({
        ...optimized,
        status: optimized.status,
      } as Exclude<RouteOptimizationResult, { status: "ready" }>);
      const detailedFailure = {
        ...failure,
        resultState: "insufficient_feasible_route" as const,
        requestedStopCount: targetCapacity,
        feasibleStopCount: 0,
        resultExplanation:
          "공개 장소는 있지만 요청 시간과 실제 이동시간을 만족하는 경로를 만들지 못했습니다.",
        recoveryActions: [
          "reduce_requested_stops" as const,
          "change_time_window" as const,
          "change_categories" as const,
          ...(request.trip.districtId ? ["widen_district" as const] : []),
        ],
        diversity,
        ...(dependencies.includeDiagnostics ? {
          diagnostics: {
            catalogCoverage,
          candidateFunnel,
            candidatePipeline: {
              stageA: fused.candidates.length,
              stageB: adapted.length,
              detailedEvaluations: 0,
              eligible: fused.candidates.length,
            },
            candidateEligibility: {
              ...fused.diagnostics.stageCounts,
              feasibleRouteCandidates: 0,
              finalUsedPlaces: 0,
              rejectedByReason: mergeReasonCounts(
                fused.diagnostics.excludedByReason,
                Object.fromEntries(optimized.reasonCodes.reduce((counts, reason) => {
                  counts.set(reason, (counts.get(reason) ?? 0) + 1);
                  return counts;
                }, new Map<string, number>())),
              ),
            },
            travelMatrix: {
              nodes: matrix.diagnostics.nodeCount,
              resolvedEdges: matrix.diagnostics.resolvedEdges,
              unresolvedEdges: matrix.diagnostics.unresolvedEdges,
            },
            solver: {
              durationMs: optimized.diagnostics.totalDurationMs,
              validationAttempts: optimized.diagnostics.validationAttempts,
              validationFailures: optimized.diagnostics.validationFailures,
            },
          },
        } : {}),
      };
      return hybridMode
        ? {
            ...detailedFailure,
            selectionMode: "hybrid",
            selectionIssues: [{
              placeId: selectedPlaceIds[0]!,
              code: "selected_place_trip_incompatible",
              blocking: true,
              reasonCodes: ["selected_anchors_have_no_feasible_route", ...optimized.reasonCodes],
              replacementCandidateIds: replacements.map(({ placeId }) => placeId),
            }],
            replacementCandidates: replacements,
          }
        : detailedFailure;
    }
    const requestedTarget = targetCapacity;
    enterRecommendationStage("response_mapping", adapted.length);
    const evaluatedRouteOptions = optimized.options.map((option) => routeFromOptionV2({
      allowMaterialProposal: request.requestVersion === 2,
      option,
      optimization: optimizationInput,
      candidates: candidateById,
      requestedTarget,
      reductionReasonCodes: feasibility.limitingReasonCodes,
      licensingStatus,
      includeVerificationRequired: request.includeVerificationRequired ?? false,
      acknowledgedPlaceIds: acknowledgedSelectedIds,
      ...(hybridMode ? { selectedPlaceIds: selectedIdSet } : {}),
    }));
    if (normalized.scheduleIntent) {
      for (let i = 0; i < evaluatedRouteOptions.length; i++) evaluatedRouteOptions[i] = attachRouteSchedule(evaluatedRouteOptions[i]!, normalized.scheduleIntent, optimizationInput.tripRequest.startTime);
    }
    const routeOptions = evaluatedRouteOptions;
    const route = routeOptions[0]!;
    catalogCoverage.finalUsedIds = route.stops.map(stop => stop.placeId);
    const rerollDifference = measureRerollDifferenceV2({
      orderedPlaceIds: route.stops.map(({ placeId }) => placeId),
      previousOrderedPlaceIds: history.latestOrderedPlaceIds,
      protectedPlaceIds: [...protectedCandidateIds],
      noveltyQuota,
    });
    const diversityLimitedReasons = [
      ...diversity.limitingReasonCodes,
      ...(personalizationRequest.rerollVariant > 0 && rerollDifference.samePlaceSet &&
        !rerollDifference.sameOrder ? ["only_route_order_changed"] : []),
      ...(personalizationRequest.rerollVariant > 0 &&
        rerollDifference.newPlaceCount < noveltyQuota ? ["novelty_quota_not_met"] : []),
    ].filter((value, index, values) => values.indexOf(value) === index).sort();
    const resultState = route.routeSummary.stopCount === 1
      ? "single_stop_suggestion" as const
      : route.routeSummary.stopCount < requestedTarget
        ? "ready_with_reduced_stops" as const
        : "ready" as const;
    const resultReasonCodes = resultState === "ready"
      ? ["requested_stop_count_satisfied", ...feasibility.limitingReasonCodes]
      : resultState === "ready_with_reduced_stops"
        ? ["feasible_stop_count_below_requested_stop_count", ...feasibility.limitingReasonCodes]
        : ["only_one_eligible_feasible_place", ...feasibility.limitingReasonCodes];
    const recoveryActions = resultState === "ready"
      ? []
      : [
          "reduce_requested_stops" as const,
          "change_time_window" as const,
          "change_categories" as const,
          ...(request.trip.districtId ? ["widen_district" as const] : []),
        ];
    const alternatives: RouteAlternativeV1[] = routeOptions.slice(1, 3).map(
      (option, index) => ({
        ...option,
        kind: "optimized" as const,
        alternativeType: option.style === "shortest" || index === 1
          ? "lower_travel"
          : "popularity_oriented",
      }),
    );
    const editSessionId = createEditSessionId(
      optimizationInput,
      routeOptions,
      matrix.edges[departure.id]
        ? Object.values(matrix.edges[departure.id]!).find(({ status }) => status === "resolved")?.temporalBasis ?? "unknown"
        : "unknown",
      generatedAt.getTime(),
      dependencies.editSessionSecret,
      originalConditions,
    );
    return {
      status: "ready",
      apiVersion: request.requestVersion === 2 ? "route-recommendation-response-v2" : ROUTE_RECOMMENDATION_API_VERSION,
      contractVersion: ROUTE_RECOMMENDATION_CONTRACT_V2,
      engineVersion: ROUTE_RECOMMENDATION_ENGINE_V2,
      objectiveVersion: "route-objective-v1",
      solverVersion: "route-solver-v1",
      editSessionId,
      region: request.trip.regionId,
      requestFingerprint: requestFingerprintV2({
        normalized,
        schedules: routeOptions.map(option => option.schedule),
        catalogVersion: snapshot?.dataVersion ?? "catalog-unavailable",
        candidates: fused.candidates,
        eligibilityPolicy: {
          includeVerificationRequired: request.includeVerificationRequired ?? false,
          acknowledgedVerificationRequiredPlaceIds:
            request.acknowledgedVerificationRequiredPlaceIds ?? [],
          selectedPlaceReferences: request.selectedPlaceReferences ?? [],
        },
        ...(hybridMode ? {
          selection: { selectedPlaceIds, autoFill: request.autoFill ?? true },
        } : {}),
      }),
      historyContextKey,
      meaningfullyDifferent: rerollDifference.meaningfullyDifferent,
      newPlaceCount: rerollDifference.newPlaceCount,
      sharedPlaceRatio: rerollDifference.sharedPlaceRatio,
      diversityCapacity: diversity.diversityCapacity,
      diversityLimitedReasons,
      resultState,
      requestedStopCount: requestedTarget,
      feasibleStopCount: route.routeSummary.stopCount,
      resultReasonCodes,
      resultExplanation: resultState === "ready"
        ? "전체 장소 기반 경로 초안입니다. 도로 계산은 완료했으며 시설 이용과 동반 여부는 별도입니다."
        : resultState === "ready_with_reduced_stops"
          ? `요청 ${requestedTarget}곳 중 ${route.routeSummary.stopCount}곳이 현재 실제 이동시간과 요청 시간 예산을 만족하는 것으로 이번 탐색에서 확인한 경로입니다. 제한 요인: ${feasibility.limitingReasonCodes.join(", ")}.`
          : `요청 ${requestedTarget}곳 중 이번 도로 탐색으로 구성한 방문지는 1곳입니다. 제한 요인: ${feasibility.limitingReasonCodes.join(", ")}.`,
      recoveryActions,
      requestSummary: {
        departureLabel: request.departure.label,
        tripDate: request.trip.date,
        startTime: request.trip.startTime,
        tripType: request.trip.tripType,
        tripPace: request.trip.tripPace,
        selectedCategories: request.trip.selectedCategories,
        roundTrip: request.trip.roundTrip,
      },
      optimality: optimized.optimality,
      route,
      routeOptions,
      primaryRouteId: route.id,
      routeOptionCount: routeOptions.length,
      ...(routeOptions.length < evaluatedRouteOptions.length
        ? { routeOptionsLimitedReason: "final_validation_reduced_route_options" as const }
        : optimized.limitedReason
          ? { routeOptionsLimitedReason: optimized.limitedReason }
          : {}),
      alternatives,
      alternativeAvailability: routeOptions.length < evaluatedRouteOptions.length
        ? "limited"
        : optimized.alternativeAvailability,
      candidateSourceCounts: {
        kto: fused.diagnostics.acceptedSourceCounts.kto,
        kakao: fused.diagnostics.acceptedSourceCounts.kakao,
        merged: fused.diagnostics.crossProviderDuplicatesMerged,
      },
      excludedHighlights: optimized.excludedHighlights.map((highlight) => ({
        placeId: highlight.placeId,
        title: candidateById.get(highlight.placeId)?.title ?? null,
        reasonCode: highlight.reasonCode,
      })),
      warnings: [
        ...optimized.warnings,
        ...(scheduling.adjustedDwell ? ["default_dwell_shortened"] : []),
        ...feasibility.limitingReasonCodes,
        ...(snapshotUnavailable ? ["kakao_catalog_partial_failure"] : []),
        ...(hybridMode && anchors.some((candidate) =>
          candidate?.source === "kakao_catalog" ||
          candidate?.category === "shopping" ||
          candidate?.evidenceStatus === "unverified")
          ? ["selected_place_verification_required"]
          : []),
        ...(hybridMode && hasLargeAnchorDetour(
          request.departure,
          anchors.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
        ) ? ["selected_anchor_large_detour"] : []),
      ],
      diversity,
      ...(hybridMode ? {
        selectionMode: "hybrid" as const,
        selectionIssues: hasLargeAnchorDetour(
          request.departure,
          anchors.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
        ) ? [{
          placeId: selectedPlaceIds.join(","),
          code: "selected_anchor_large_detour" as const,
          blocking: false,
          reasonCodes: ["recommend_removing_anchor_or_splitting_trip"],
          replacementCandidateIds: [],
        }] : [],
      } : {}),
      ...(dependencies.includeDiagnostics ? {
        diagnostics: {
          catalogCoverage,
          candidateFunnel,
          candidatePipeline: {
            stageA: fused.candidates.length,
            stageB: adapted.length,
            detailedEvaluations: 0,
            eligible: fused.candidates.length,
          },
          candidateEligibility: {
            ...fused.diagnostics.stageCounts,
            feasibleRouteCandidates: feasibility.feasibleCandidateIds.length,
            finalUsedPlaces: route.routeSummary.stopCount,
            rejectedByReason: mergeReasonCounts(
              fused.diagnostics.excludedByReason,
              Object.fromEntries(
                optimized.excludedHighlights.reduce((counts, { reasonCode }) => {
                  counts.set(reasonCode, (counts.get(reasonCode) ?? 0) + 1);
                  return counts;
                }, new Map<string, number>()),
              ),
            ),
          },
          travelMatrix: {
            nodes: matrix.diagnostics.nodeCount,
            resolvedEdges: matrix.diagnostics.resolvedEdges,
            unresolvedEdges: matrix.diagnostics.unresolvedEdges,
          },
          solver: {
            durationMs: optimized.diagnostics.totalDurationMs,
            validationAttempts: optimized.diagnostics.validationAttempts,
            validationFailures: optimized.diagnostics.validationFailures,
          },
        },
      } : {}),
    };
  } catch (error) {
    if (dependencies.signal?.aborted) throw error;
    if (error instanceof KakaoMobilityProviderError) {
      return recommendationFailure("kakao_provider_unavailable", [
        `kakao_${error.code.toLowerCase()}`,
      ]);
    }
    if (error instanceof TourProviderError) {
      return recommendationFailure("tourism_provider_unavailable", [
        `tourism_${error.code.toLowerCase()}`,
      ]);
    }
    return recommendationFailure("internal_error", ["recommendation_v2_orchestration_failed"]);
  }
}

function validatedEdge(
  section: OrderedRouteValidationResult["sections"][number],
  temporalBasis: OrderedRouteValidationResult["temporalBasis"],
): TravelMatrixEdge {
  return {
    ...section,
    lowerBoundMeters: null,
    status: "resolved",
    source: "kakao_directions_live",
    confidence: "validated",
    temporalBasis,
    distanceFetchedAt: null,
    durationFetchedAt: null,
    reasonCodes: ["manual_order_final_validation"],
  };
}

export async function validateManualRoute(
  editSessionId: string,
  orderedPlaceIds: readonly string[],
  dependencies: Pick<
    RecommendationServiceDependencies,
    "travelTimeProvider" | "now" | "editSessionSecret" | "signal"
  > = {},
  conditionAnswers: ConditionAnswer[] = [],
  applyScheduleProposal = false,
): Promise<ManualRouteValidationResponseV1> {
  dependencies.signal?.throwIfAborted();
  const now = dependencies.now ?? (() => new Date());
  const nowMs = now().getTime();
  let session = parseEditSession(
    editSessionId,
    nowMs,
    dependencies.editSessionSecret,
  );
  if (!session) {
    return recommendationFailure("invalid_request", ["edit_session_expired"]);
  }
  if (applyScheduleProposal) {
    const intent = session.tripRequest.scheduleIntent;
    if (!intent?.startTime || intent.startTime === session.tripRequest.startTime) {
      return recommendationFailure("invalid_request", ["manual_route_has_no_schedule_proposal"]);
    }
    session = {
      ...session,
      tripRequest: {
        ...session.tripRequest,
        scheduleIntent: { ...intent, startTime: session.tripRequest.startTime },
      },
      approvedRoutes: [],
      pendingConfirmation: undefined,
    };
  }
  const candidates = orderedPlaceIds.map((id) =>
    session.candidates.find(({ node }) => node.id === id),
  );
  if (candidates.some((candidate) => !candidate)) {
    return recommendationFailure("invalid_request", ["manual_route_contains_unknown_place"]);
  }
  const ordered = candidates as ManualEditCandidate[];
  const broadPlanning = session.tripRequest.planningPolicy === "full_public_catalog_v1";
  const routeIds = [...orderedPlaceIds];
  const approved = session.approvedRoutes?.some((route) => route.length === routeIds.length && route.every((id, index) => id === routeIds[index])) === true;
  const pending = session.pendingConfirmation?.route.length === routeIds.length && session.pendingConfirmation.route.every((id, index) => id === routeIds[index])
    ? session.pendingConfirmation : null;
  const conditionResults = new Map<string, ReturnType<typeof applyConditionAnswers>>();
  for (const candidate of ordered) {
    const originalAnalysis = candidate.originalConditionEligibility ?? candidate.originalStop.petConditionEligibility;
    if (broadPlanning) {
      conditionResults.set(candidate.node.id, { analysis: originalAnalysis ?? insufficientEvidencePetConditionEligibility(), acknowledged: false });
      continue;
    }
    const analysis = approved ? candidate.originalStop.petConditionEligibility ?? originalAnalysis : originalAnalysis;
    if (!analysis) return recommendationFailure("confirmation_required", ["manual_route_condition_revalidation_required"]);
    if (analysis.state === "ineligible") return recommendationFailure("insufficient_eligible_places", ["manual_route_condition_unsatisfied"]);
    const result = approved
      ? { analysis, acknowledged: candidate.originalStop.conditionAcknowledged === true }
      : applyConditionAnswers(candidate.node.id, analysis, pending ? { context: "manual", expiresAt: session.expiresAt, route: routeIds, questions: pending.questions, confirmed: pending.confirmed ?? [] } : null, conditionAnswers);
    conditionResults.set(candidate.node.id, result);
    const policy = applyCanonicalPetConditionPolicy({ analysis: result.analysis, flow: "revalidation", includeVerificationRequired: true, acknowledged: result.acknowledged, preserveUserSelection: candidate.originalStop.selectionOrigin === "user_selected" });
    if (policy.decision === "reject") return recommendationFailure("insufficient_eligible_places", ["manual_route_condition_unsatisfied"]);
  }
  const provider = dependencies.travelTimeProvider ?? new KakaoTravelTimeProvider();
  const requestedDepartureAt = new Date(
    tripStartMs(session.tripRequest),
  ).toISOString();
  let validation: OrderedRouteValidationResult;
  try {
    validation = await provider.validateOrderedRoute({
      signal: dependencies.signal,
      departure: session.departure,
      orderedStops: ordered.map(({ node }) => node),
      roundTrip: session.tripRequest.roundTrip,
      requestedDepartureAt: session.tripRequest.scheduleIntent?.date === null ? null : requestedDepartureAt,
      providerCallBudget: { remaining: 3 },
      priority: "TIME",
      avoid: [],
      includeGeometry: true,
    });
    dependencies.signal?.throwIfAborted();
  } catch (error) {
    dependencies.signal?.throwIfAborted();
    if (error instanceof KakaoMobilityProviderError && error.httpStatus === 429) return recommendationFailure("rate_limited", ["kakao_rate_limited"]);
    if (error instanceof KakaoMobilityProviderError && [401, 403].includes(error.httpStatus ?? 0)) return recommendationFailure("kakao_provider_unavailable", ["kakao_authentication_failed"]);
    return recommendationFailure("kakao_provider_unavailable", [
      "manual_route_provider_call_failed",
    ]);
  }
  if (
    validation.status !== "validated" ||
    validation.totalDistanceMeters === null ||
    validation.totalDurationSeconds === null ||
    validation.geometry.length < 2
  ) {
    if (validation.reasonCodes.includes("kakao_rate_limited")) return recommendationFailure("rate_limited", validation.reasonCodes);
    if (validation.status === "provider_unavailable" || validation.reasonCodes.some((code) => code === "kakao_authentication_failed" || code === "route_provider_unavailable")) return recommendationFailure("kakao_provider_unavailable", validation.reasonCodes.length ? validation.reasonCodes : ["manual_route_provider_unavailable"]);
    return recommendationFailure("final_route_validation_failed", [
      ...validation.reasonCodes,
      "manual_route_not_validated",
    ]);
  }
  const expectedSections =
    ordered.length + (session.tripRequest.roundTrip ? 1 : 0);
  if (validation.sections.length !== expectedSections) {
    return recommendationFailure("final_route_validation_failed", [
      "manual_route_section_count_mismatch",
    ]);
  }
  const chain = [session.departure.id, ...orderedPlaceIds, ...(session.tripRequest.roundTrip ? [session.departure.id] : [])];
  if (validation.sections.some((section, index) => section.fromId !== chain[index] || section.toId !== chain[index + 1])) return recommendationFailure("final_route_validation_failed", ["manual_route_section_identity_mismatch"]);
  const sectionTravelSeconds = validation.sections.reduce(
    (total, section) => total + section.durationSeconds,
    0,
  );
  const sectionDistanceMeters = validation.sections.reduce(
    (total, section) => total + section.distanceMeters,
    0,
  );
  if (
    sectionTravelSeconds !== validation.totalDurationSeconds ||
    sectionDistanceMeters !== validation.totalDistanceMeters
  ) {
    return recommendationFailure("final_route_validation_failed", [
      "manual_route_aggregate_mismatch",
    ]);
  }
  const startMs = tripStartMs(session.tripRequest);
  let currentTimeMs = startMs;
  let totalVisitSeconds = 0;
  let totalWaitSeconds = 0;
  const stops: RecommendedRouteStopV1[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const candidate = ordered[index]!;
    const section = validation.sections[index]!;
    const appended = appendScheduledVisitTiming({
      candidate,
      edge: validatedEdge(section, validation.temporalBasis),
      currentTimeMs,
      serviceDayStartMs: startMs,
      tripRequest: session.tripRequest,
    });
    if (!appended) {
      return recommendationFailure("insufficient_feasible_route", [
        "manual_order_operating_window_or_pace_conflict",
      ]);
    }
    const original = candidate.originalStop;
    const condition = conditionResults.get(candidate.node.id)!;
    totalVisitSeconds += candidate.dwellDurationMinutes * 60;
    totalWaitSeconds += appended.visit.waitSeconds;
    stops.push({
      ...original,
      petConditionEligibility: condition.analysis,
      conditionAcknowledged: condition.acknowledged,
      sequence: index + 1,
      arrivalAt: new Date(appended.visit.arrivalAtMs).toISOString(),
      visitStartsAt: new Date(appended.visit.visitStartsAtMs).toISOString(),
      departureAt: new Date(appended.visit.departureAtMs).toISOString(),
      driveSecondsFromPrevious: section.durationSeconds,
      distanceMetersFromPrevious: section.distanceMeters,
      orderingReasonCodes: ["manual_order_preserved"],
      warningCodes: [
        ...new Set([...original.warningCodes, "manual_route_revalidated"]),
      ].sort(),
    });
    currentTimeMs = appended.visit.departureAtMs;
  }
  if (session.tripRequest.roundTrip) {
    currentTimeMs += validation.sections.at(-1)!.durationSeconds * 1_000;
  }
  if (
    currentTimeMs - startMs >
    getRouteTripConstraints(session.tripRequest).maxDurationMinutes * 60_000
  ) {
    return recommendationFailure("insufficient_feasible_route", [
      "manual_route_maximum_duration_exceeded",
    ]);
  }
  const route: ProductRouteV1 = {
      ...(broadPlanning ? { planningPolicy: "full_public_catalog_v1" as const, venueCompatibility: "unchecked" as const, confirmationStatus: "ready" as const } : {}),
      id: `manual:${orderedPlaceIds.join(">")}`,
      kind: "manual",
      label: "직접 수정한 일정",
      routeSummary: {
        startAt: requestedDepartureAt,
        endAt: new Date(currentTimeMs).toISOString(),
        stopCount: stops.length,
        totalDistanceMeters: validation.totalDistanceMeters,
        totalDrivingSeconds: validation.totalDurationSeconds,
        totalVisitSeconds,
        totalWaitSeconds,
      },
      temporalBasis: {
        searchMatrix: session.searchTemporalBasis,
        finalRoute: validation.temporalBasis,
      },
      stops,
      geometry: validation.geometry,
      segments: validation.sections.map(section => ({ fromPlaceId: section.fromId, toPlaceId: section.toId, travelSeconds: section.durationSeconds, distanceMeters: section.distanceMeters, temporalBasis: validation.temporalBasis })),
  };
  const unresolved = (broadPlanning ? [] : ordered).flatMap((candidate) => {
    const condition = conditionResults.get(candidate.node.id)!;
    return condition.acknowledged ? [] : conditionQuestions(candidate.node.id, condition.analysis);
  });
  if (unresolved.length > 0) {
    const accepted = new Set(pending?.confirmed ?? []);
    for (const candidate of ordered) {
      const original = candidate.originalConditionEligibility ?? candidate.originalStop.petConditionEligibility!;
      const remaining = new Set(conditionQuestions(candidate.node.id, conditionResults.get(candidate.node.id)!.analysis).map(({ requirementId }) => requirementId));
      for (const question of conditionQuestions(candidate.node.id, original)) if (!remaining.has(question.requirementId)) accepted.add(question.requirementId);
    }
    return {
      ...recommendationFailure("confirmation_required", ["manual_route_condition_revalidation_required"]),
      resultState: "confirmation_required",
      routeOptions: [session.tripRequest.scheduleIntent ? attachRouteSchedule(route, session.tripRequest.scheduleIntent, session.tripRequest.startTime) : route],
      confirmationRequirements: ordered.flatMap((candidate) => {
        const condition = conditionResults.get(candidate.node.id)!;
        const questions = condition.acknowledged ? [] : conditionQuestions(candidate.node.id, condition.analysis);
        return questions.length ? [{ placeId: candidate.node.id, title: candidate.originalStop.title, selectionOrigin: candidate.originalStop.selectionOrigin ?? "automatic_recommendation" as const, conditionEligibility: condition.analysis, questions }] : [];
      }),
      confirmationToken: createManualConfirmationEditSession(session, routeIds, unresolved.map(({ requirementId }) => requirementId), [...accepted], dependencies.editSessionSecret),
    };
  }
  const readyRoute = session.tripRequest.scheduleIntent ? attachRouteSchedule(route, session.tripRequest.scheduleIntent, session.tripRequest.startTime) : route;
  return { status: "ready", apiVersion: session.tripRequest.scheduleIntent ? "route-recommendation-response-v2" : ROUTE_RECOMMENDATION_API_VERSION, route: readyRoute, warnings: ["manual_route_revalidated"], editSessionId: createApprovedManualEditSession(session, readyRoute, dependencies.editSessionSecret) };
}
