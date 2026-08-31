import "server-only";

import { BUSAN_DISCOVERY_BOUNDS } from "@/lib/kakao/discovery";
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
} from "@/lib/pet-access/canonical-condition-eligibility";
import {
  getDefaultLicenseMatchingService,
  type LicenseMatcher,
} from "@/lib/licenses/service";
import {
  runCandidatePipelineV1,
  type CandidatePipelineTraceEvent,
} from "@/lib/recommendation/candidate-pipeline";
import {
  createEditSessionId,
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
  findPublishedSelectedMarkerV2,
  hasLargeAnchorDetour,
  inferHybridSupplementCategories,
  selectedCatalogCandidateV2,
  selectedShoppingCandidateV2,
  selectHybridShortlist,
} from "@/lib/recommendation/v2/hybrid-selection";
import {
  optimizeRouteOptionsV2,
} from "@/lib/recommendation/v2/route-optimizer";
import { requestFingerprintV2, routeFromOptionV2 } from "@/lib/recommendation/v2/response";
import { analyzeRouteFeasibilityV2 } from "@/lib/recommendation/v2/feasibility";
import {
  buildCandidateFunnelDiagnostics,
  type CandidateFunnelRecord,
} from "@/lib/recommendation/v2/candidate-funnel";
import { calculateDiversityCapacityV2 } from "@/lib/recommendation/v2/diversity-capacity";
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
  MapPlacesSnapshot,
  MapPlacesSnapshotMarker,
} from "@/types/map-places-snapshot";
import type {
  ManualRouteValidationResponseV1,
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
    .filter((candidate) =>
      !selectedIds.has(candidate.canonicalId) &&
      candidate.source === "tourism_service2" &&
      candidate.category !== "shopping" &&
      (candidate.eligibilityTier === "verified" || candidate.eligibilityTier === "conditional"))
    .sort((left, right) =>
      Number(right.eligibilityTier === "verified") - Number(left.eligibilityTier === "verified") ||
      right.dataCompleteness - left.dataCompleteness ||
      left.canonicalId.localeCompare(right.canonicalId))
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
    evidenceMode: marker.category === "shopping" ? "list_only" : "detailed",
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
      evidenceMode: summary.category === "shopping" ? "list_only" : "detailed",
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
      evidenceMode: candidate.category === "shopping" ? "list_only" : "detailed",
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
        evidenceMode: record.evidenceMode,
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
            bounds: BUSAN_DISCOVERY_BOUNDS,
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
      departure,
      candidates: candidates.map(({ node }) => node),
      travelMode: "driving",
      priority: "TIME",
      avoid: [],
      requestedDepartureAt: null,
    });
    const tripRequest: RouteOptimizationTripRequest = {
      date: request.trip.date,
      startTime: request.trip.startTime,
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
  const petProfile = {
    species: normalized.petSpecies,
    size: normalized.petSize,
    hasCarrier: normalized.petEquipment.hasCarrier,
    hasLeash: normalized.petEquipment.hasLeash,
    hasMuzzle: normalized.petEquipment.hasMuzzle,
    acceptsOutdoorOnly: normalized.acceptsOutdoorOnly,
  };
  const region = getRegionConfig(request.trip.regionId);
  const lookup = getKtoRegionLookupIdentity(region, request.trip.districtId);
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
    const tourService = dependencies.tourService ?? getDefaultTourService();
    const licenseMatcher = dependencies.licenseMatcher ??
      (dependencies.tourService ? null : getDefaultLicenseMatchingService());
    const travelTimeProvider = dependencies.travelTimeProvider ?? new KakaoTravelTimeProvider();
    const pipelineRunner = dependencies.candidatePipeline ?? runCandidatePipelineV1;
    const routeOptionsOptimizer = dependencies.routeOptionsOptimizer ?? optimizeRouteOptionsV2;
    const catalogLoader = dependencies.collectCatalog ?? collectTourCatalog;
    const now = dependencies.now ?? (() => new Date());
    const observations: TourRequestObservation[] = [];
    let snapshotUnavailable = false;
    const snapshotLoader = (
      dependencies.loadCatalogSnapshot ??
      (dependencies.tourService
        ? async () => null
        : loadMapPlacesSnapshot)
    );
    const snapshotPromise: Promise<MapPlacesSnapshot | null> = snapshotLoader(
      { version: 1, region: request.trip.regionId, scope: "default", dataset: "core" },
    )
      .catch(() => {
        snapshotUnavailable = true;
        return null;
      });

    let snapshot = hybridMode ? await snapshotPromise : null;
    let publishedMarkers = [...(snapshot?.items ?? [])];
    const unresolvedPublishedTourSelection = hybridMode && selectedPlaceIds.some(
      (placeId) =>
        placeId.startsWith("tour:") &&
        !findPublishedSelectedMarkerV2({
          placeId,
          requestedRegionId: request.trip.regionId,
          markers: publishedMarkers,
        }),
    );
    if (
      unresolvedPublishedTourSelection &&
      region.mapCatalog.snapshotDatasets.includes("shopping")
    ) {
      const shoppingSnapshot = await snapshotLoader({
        version: 1,
        region: request.trip.regionId,
        scope: "default",
        dataset: "shopping",
      }).catch(() => {
        snapshotUnavailable = true;
        return null;
      });
      publishedMarkers = [
        ...publishedMarkers,
        ...(shoppingSnapshot?.items ?? []),
      ];
    }
    const selectedMarkers = new Map(
      selectedPlaceIds.flatMap((placeId) => {
        const marker = findPublishedSelectedMarkerV2({
          placeId,
          requestedRegionId: request.trip.regionId,
          markers: publishedMarkers,
        });
        return marker ? [[marker.id, marker] as const] : [];
      }),
    );
    const preliminaryAnchors = [...selectedMarkers.values()]
      .map(selectedCatalogCandidateV2)
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    const inferredCategories = hybridMode && (request.autoFill ?? true)
      ? inferHybridSupplementCategories({ request, selected: preliminaryAnchors })
      : new Set<UsefulTourCategory>();
    const catalogCategories = new Set(
      hybridMode
        ? [
            ...request.trip.selectedCategories,
            ...inferredCategories,
            ...preliminaryAnchors.map(({ category }) => category),
          ]
        : request.trip.selectedCategories,
    );
    const unresolvedTourSelection = selectedPlaceIds.some((placeId) =>
      placeId.startsWith("tour:") && !selectedMarkers.has(placeId));
    if (hybridMode && unresolvedTourSelection) catalogCategories.add("shopping");
    const pipelineCategories = [...catalogCategories].filter(
      (category): category is UsefulTourCategory => category !== "shopping",
    );
    const selectedKtoContentIds = new Set(
      [...selectedMarkers.values()]
        .filter((marker) => marker.layer === "tourism" && marker.category !== "shopping")
        .map(({ providerPlaceId }) => providerPlaceId),
    );
    const traceReasons = new Map<string, string[]>();
    const captureSelectedTrace = (event: CandidatePipelineTraceEvent) => {
      if (!selectedIdSet.has(`tour:${event.contentId}`) || event.outcome !== "excluded") return;
      traceReasons.set(event.contentId, [
        ...new Set([...(traceReasons.get(event.contentId) ?? []), ...event.reasonCodes]),
      ].sort());
    };

    let pipeline: CandidatePipelineResult | null = null;
    let collectedCatalog: TourPlaceSummary[] = [];
    let ktoUnavailable = false;
    try {
      dependencies.signal?.throwIfAborted();
      const catalogGroups = await mapWithConcurrency(
        [...catalogCategories],
        CATALOG_CONCURRENCY,
        async (category) => {
          const contentTypeId = getCatalogContentTypeId(category as TourCatalogCategory);
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
      const catalog = [...new Map(
        catalogGroups.flat().map((place) => [place.contentId, place]),
      ).values()];
      collectedCatalog = catalog;
      const pipelineCatalog = hybridMode
        ? catalog.filter(({ category }) => category !== "shopping")
        : catalog;
      const pipelineAsOf = now();
      pipeline = await pipelineRunner({
        context: {
          request: hybridMode
            ? {
                ...normalized,
                selectedCategories: pipelineCategories,
                includeShopping: false,
              }
            : normalized,
          maxStops: pace.maxStops,
          minStops: pace.minStops,
          tripType: normalized.tripType,
          petProfile,
          tripRequest: {
            scope: {
              regionCode: normalized.scope.regionCode,
              districtCode: normalized.scope.type === "district"
                ? normalized.scope.districtCode
                : null,
              bounds: region.mapBounds,
            },
            selectedCategories: hybridMode
              ? pipelineCategories
              : normalized.selectedCategories,
            includeShopping: hybridMode ? false : normalized.includeShopping,
            indoorAccessPreference: "any",
          },
        },
        catalog: pipelineCatalog,
        tourService,
        licenseMatcher,
        now: () => new Date(pipelineAsOf),
        initialObservations: observations,
        ...(hybridMode ? {
          requiredContentIds: [...selectedKtoContentIds],
          onCandidateTrace: captureSelectedTrace,
        } : {}),
      });
      ktoUnavailable = pipeline.status === "provider_unavailable";
    } catch (error) {
      if (error instanceof TourProviderError) ktoUnavailable = true;
      else throw error;
    }

    dependencies.signal?.throwIfAborted();
    snapshot ??= await snapshotPromise;
    if (publishedMarkers.length === 0) {
      publishedMarkers = [...(snapshot?.items ?? [])];
    }
    const usefulCategories = (hybridMode ? pipelineCategories : normalized.selectedCategories).filter(
      (category): category is UsefulTourCategory =>
        category !== "transportation" && category !== "unknown",
    );
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
    const fused = fuseRecommendationCandidatesV2({
      regionId: request.trip.regionId,
      districtId: request.trip.districtId,
      selectedCategories: usefulCategories,
      ktoCandidates: pipeline?.candidates ?? [],
      catalogCandidates: snapshot?.items ?? [],
      explicitlyExcludedPlaceIds: personalizationRequest.explicitlyExcludedPlaceIds,
      selectedPlaceIds,
      includeVerificationRequired: request.includeVerificationRequired ?? false,
      acknowledgedVerificationRequiredPlaceIds:
        request.acknowledgedVerificationRequiredPlaceIds ?? [],
      petProfile,
      selectionOrigin: hybridMode ? "automatic_fill" : "automatic_recommendation",
    });
    const reconciledRecords = buildCandidateFunnelRecordsV2({
      requestedRegion: region,
      publishedMarkers,
      collectedCatalog,
      fusedCandidates: fused.candidates,
      explicitlyExcludedPlaceIds: personalizationRequest.explicitlyExcludedPlaceIds,
    });
    const emptyCandidateIds = new Set<string>();
    const candidateFunnelBeforeRoute = buildCandidateFunnelDiagnostics({
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
      candidates: fused.candidates.map(({ canonicalId, category }) => ({
        id: canonicalId,
        category,
      })),
      requestedStopCount: requestedCapacity,
      mandatorySelectedPlaceIds: selectedPlaceIds,
      seenCandidateIds: personalizationRequest.recentlySelectedCandidateIds,
      requiredCategories: usefulCategories,
      feasibleCandidateIds: [],
      requiredRoadEdgesResolved: false,
    });

    const fusedById = new Map(
      fused.candidates.map((candidate) => [candidate.canonicalId, candidate]),
    );
    const shoppingSummaries = hybridMode
      ? collectedCatalog.filter(({ category }) => category === "shopping")
      : [];
    const shoppingById = new Map(
      shoppingSummaries.map((summary) => [`tour:${summary.contentId}`, summary]),
    );

    const selectionIssues: RecommendationSelectionIssueV1[] = [];
    const anchors: CanonicalRecommendationCandidateV2[] = [];
    const acknowledgedSelectedIds = new Set(
      request.acknowledgedVerificationRequiredPlaceIds ?? [],
    );
    for (const placeId of selectedPlaceIds) {
      const marker = selectedMarkers.get(placeId);
      if (personalizationRequest.explicitlyExcludedPlaceIds.includes(placeId)) {
        selectionIssues.push({
          placeId,
          code: "selected_place_explicitly_excluded",
          blocking: true,
          reasonCodes: ["selected_place_is_also_explicitly_excluded"],
          replacementCandidateIds: [],
        });
        continue;
      }
      if (marker && marker.regionId !== request.trip.regionId) {
        selectionIssues.push({
          placeId,
          code: "selected_place_cross_region",
          blocking: true,
          reasonCodes: ["selected_place_region_mismatch"],
          replacementCandidateIds: [],
        });
        continue;
      }
      if (marker?.coordinates === null) {
        selectionIssues.push({
          placeId,
          code: "selected_place_missing_coordinates",
          blocking: true,
          reasonCodes: ["selected_place_coordinates_unavailable"],
          replacementCandidateIds: [],
        });
        continue;
      }
      if (marker?.petAccessVerdict === "not_allowed") {
        selectionIssues.push({
          placeId,
          code: "selected_place_not_allowed",
          blocking: true,
          reasonCodes: ["pet_access_not_allowed"],
          replacementCandidateIds: [],
        });
        continue;
      }

      let candidate = fusedById.get(placeId) ??
        (marker ? selectedCatalogCandidateV2(marker) : null);
      if (!candidate && placeId.startsWith("tour:")) {
        const summary = shoppingById.get(placeId);
        if (summary) candidate = selectedShoppingCandidateV2(summary, request.trip.regionId);
      }
      if (!candidate) {
        const rawId = placeId.slice(placeId.indexOf(":") + 1);
        const reasons = traceReasons.get(rawId) ?? [];
        const issueCode = reasons.includes("outside_requested_geographic_scope")
          ? "selected_place_cross_region" as const
          : reasons.includes("invalid_coordinates")
            ? "selected_place_missing_coordinates" as const
            : reasons.includes("pet_access_not_allowed")
              ? "selected_place_not_allowed" as const
              : marker || reasons.length > 0
                ? "selected_place_trip_incompatible" as const
                : "selected_place_not_found_in_region" as const;
        selectionIssues.push({
          placeId,
          code: issueCode,
          blocking: true,
          reasonCodes: reasons.length > 0 ? reasons : ["selected_place_not_found_in_requested_region"],
          replacementCandidateIds: [],
        });
        continue;
      }
      const selectedPolicy = applyCanonicalPetConditionPolicy({
        analysis: candidate.conditionEligibility,
        flow: "user_selected",
        includeVerificationRequired: request.includeVerificationRequired ?? false,
        acknowledged: acknowledgedSelectedIds.has(candidate.canonicalId),
      });
      if (selectedPolicy.decision === "reject") {
        selectionIssues.push({
          placeId,
          code: "selected_place_condition_unsatisfied",
          blocking: true,
          reasonCodes: [
            ...new Set([
              ...selectedPolicy.reasonCodes,
              ...candidate.conditionEligibility.reasonCodes,
            ]),
          ].sort(),
          replacementCandidateIds: [],
        });
        continue;
      }
      anchors.push(candidate);
    }

    const replacements = replacementCandidates(fused.candidates, selectedIdSet);
    if (selectionIssues.some(({ blocking }) => blocking)) {
      return selectedFailure(selectionIssues, replacements);
    }
    const unacknowledgedAnchors = anchors.filter(
      (candidate) => applyCanonicalPetConditionPolicy({
        analysis: candidate.conditionEligibility,
        flow: "user_selected",
        includeVerificationRequired: request.includeVerificationRequired ?? false,
        acknowledged: acknowledgedSelectedIds.has(candidate.canonicalId),
      }).decision === "confirmation_required",
    );
    if (unacknowledgedAnchors.length > 0) {
      return {
        ...recommendationFailure("confirmation_required", [
          "selected_place_verification_acknowledgement_missing",
        ]),
        resultState: "confirmation_required",
        requestedStopCount: selectedPlaceIds.length,
        feasibleStopCount: anchors.length,
        resultExplanation:
          "선택한 장소는 일정에 그대로 유지됩니다. 동반 정책 또는 운영 조건을 직접 확인한다는 동의가 필요합니다.",
        recoveryActions: ["acknowledge_selected_place_verification"],
        selectionMode: "hybrid",
        selectionIssues: unacknowledgedAnchors.map((candidate) => ({
          placeId: candidate.canonicalId,
          code: "selected_place_confirmation_required" as const,
          blocking: true,
          reasonCodes: [
            ...new Set([
              ...candidate.conditionEligibility.reasonCodes,
              ...candidate.conditionEligibility.warnings.map(({ code }) => code),
            ]),
          ].sort(),
          replacementCandidateIds: [],
        })),
        confirmationRequirements: unacknowledgedAnchors.map((candidate) => ({
          placeId: candidate.canonicalId,
          title: candidate.title,
          selectionOrigin: "user_selected" as const,
          conditionEligibility: candidate.conditionEligibility,
        })),
        replacementCandidates: replacements,
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
    if (!hybridMode && fused.candidates.length === 0) {
      return {
        ...recommendationFailure("insufficient_eligible_places", [
          "no_strictly_eligible_candidate_across_enabled_sources",
          ...(ktoUnavailable ? ["kto_provider_unavailable"] : []),
          ...(snapshotUnavailable ? ["kakao_catalog_unavailable"] : []),
        ]),
        resultState: "insufficient_eligible_places",
        requestedStopCount: request.trip.desiredStopCount ?? pace.desiredStopCount,
        feasibleStopCount: 0,
        resultExplanation:
          "요청 지역과 유형에는 후보가 있었지만 확인된 반려동물 동반 근거와 운영시간 기준을 모두 통과한 장소가 부족합니다.",
        recoveryActions: [
          "change_categories",
          ...(request.trip.districtId ? ["widen_district" as const] : []),
          "select_places_manually",
          "allow_verification_required_candidates",
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
    const personalization = {
      environmentPreference: normalized.environmentPreference ?? "any",
      petCount: personalizationRequest.petCount,
      petActivityLevel: personalizationRequest.petActivityLevel,
      walkingTolerance: personalizationRequest.walkingTolerance,
      crowdPreference: personalizationRequest.crowdPreference,
      tripMood: personalizationRequest.tripMood,
      categoryPriorities: personalizationRequest.categoryPriorities,
      recentlySelectedCandidateIds: personalizationRequest.recentlySelectedCandidateIds,
      rerollVariant: personalizationRequest.rerollVariant,
    };
    const desiredSupplementCategories = hybridMode
      ? inferHybridSupplementCategories({ request, selected: anchors.filter(
          (candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate),
        ) })
      : new Set<UsefulTourCategory>(usefulCategories);
    const selectedProviderIdentities = new Set(
      anchors.flatMap((candidate) => candidate?.providerIdentities.map(
        ({ provider, id }) => `${provider}:${id}`,
      ) ?? []),
    );
    const optionalCandidates = hybridMode && (request.autoFill ?? true) && anchors.length < pace.maxStops
      ? fused.candidates.filter((candidate) =>
          !selectedIdSet.has(candidate.canonicalId) &&
          candidate.source === "tourism_service2" &&
          candidate.ktoCandidate !== null &&
          candidate.category !== "shopping" &&
          desiredSupplementCategories.has(candidate.category) &&
          !candidate.providerIdentities.some(({ provider, id }) =>
            selectedProviderIdentities.has(`${provider}:${id}`)))
      : [];
    const targetCapacity = requestedCapacity;
    const hybridCandidates = hybridMode
      ? selectHybridShortlist({
          departure: request.departure,
          anchors: anchors.filter(
            (candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate),
          ),
          optional: optionalCandidates,
          desiredCategories: desiredSupplementCategories,
          capacity: targetCapacity,
        })
      : [];
    const canonicalCandidates = hybridMode ? hybridCandidates : fused.candidates;
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
    const adapted = adaptedAll.slice(0, ROUTE_SOLVER_V1_CONFIG.maxCandidates);
    const adaptedIds = new Set(adapted.map(({ node }) => node.id));
    const candidateById = new Map(
      canonicalCandidates
        .filter(({ canonicalId }) => adaptedIds.has(canonicalId))
        .map((candidate) => [candidate.canonicalId, candidate]),
    );
    const departure = {
      id: "departure",
      kind: "departure" as const,
      name: request.departure.label,
      latitude: request.departure.latitude,
      longitude: request.departure.longitude,
    };
    const matrix = await travelTimeProvider.buildMatrix({
      departure,
      candidates: adapted.map(({ node }) => node),
      travelMode: "driving",
      priority: "TIME",
      avoid: [],
      requestedDepartureAt: null,
    });
    dependencies.signal?.throwIfAborted();
    const tripRequest: RouteOptimizationTripRequest = {
      date: request.trip.date,
      startTime: request.trip.startTime,
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
    const feasibilityInput: RouteOptimizationInput = {
      departure,
      candidates: adapted,
      matrix,
      tripRequest,
    };
    const feasibility = analyzeRouteFeasibilityV2(feasibilityInput);
    const dateTimeFeasibleIds = new Set(
      canonicalCandidates
        .filter((candidate) =>
          candidate.scheduleStatus === "known" ||
          candidate.selectionOrigin === "user_selected"
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
    const candidateFunnel = buildCandidateFunnelDiagnostics({
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
      candidates: adapted.map(({ node, category }) => ({ id: node.id, category })),
      requestedStopCount: targetCapacity,
      mandatorySelectedPlaceIds: selectedPlaceIds,
      seenCandidateIds: personalizationRequest.recentlySelectedCandidateIds,
      requiredCategories: tripRequest.selectedCategories,
      feasibleCandidateIds:
        feasibility.status === "ready" ? feasibility.feasibleCandidateIds : [],
      requiredRoadEdgesResolved:
        feasibility.status === "ready" && feasibility.feasibleCandidateIds.length > 0,
      feasibilityReasonCodes: feasibility.limitingReasonCodes,
    });
    if (feasibility.status !== "ready") {
      const detailedFailure = {
        ...recommendationFailure("insufficient_feasible_route", feasibility.limitingReasonCodes),
        resultState: "insufficient_feasible_route" as const,
        requestedStopCount: targetCapacity,
        feasibleStopCount: 0,
        resultExplanation:
          `요청 ${targetCapacity}곳 중 운영시간, 실제 이동시간, 대기 한도를 함께 만족하는 장소 조합은 0곳입니다. 제한 요인: ${feasibility.limitingReasonCodes.join(", ")}.`,
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
      tripRequest: {
        ...tripRequest,
        desiredStopCount: feasibility.targetStopCount,
        minimumStopCount: feasibility.targetStopCount,
        minimumRequestedCategoryCount: feasibility.requiredRequestedCategoryCount,
      },
    };
    const optimized = await routeOptionsOptimizer(optimizationInput, {
      travelTimeProvider,
      recentRouteSignatures: normalized.recentRouteSignatures,
      recentlySelectedCandidateIds: personalizationRequest.recentlySelectedCandidateIds,
      deterministicSeed: normalized.generationSeed,
      rerollVariant: personalizationRequest.rerollVariant,
    });
    dependencies.signal?.throwIfAborted();
    if (optimized.status !== "ready") {
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
          "동반 조건을 통과한 장소는 있지만 요청한 운영시간과 실제 이동시간을 만족하는 경로를 만들지 못했습니다.",
        recoveryActions: [
          "reduce_requested_stops" as const,
          "change_time_window" as const,
          "change_categories" as const,
          ...(request.trip.districtId ? ["widen_district" as const] : []),
        ],
        diversity,
        ...(dependencies.includeDiagnostics ? {
          diagnostics: {
            candidateFunnel,
            candidatePipeline: {
              stageA: pipeline?.diagnostics.stageACount ?? 0,
              stageB: pipeline?.diagnostics.stageBCount ?? 0,
              detailedEvaluations: pipeline?.diagnostics.detailedEvaluationCount ?? 0,
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
    const evaluatedRouteOptions = optimized.options.map((option) => routeFromOptionV2({
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
    const routeOptions = evaluatedRouteOptions.filter(
      ({ confirmationStatus }) => confirmationStatus === "ready",
    );
    if (routeOptions.length === 0) {
      const pendingRouteOptions = evaluatedRouteOptions.slice(0, 1);
      const confirmationRequirements = [...new Map(
        pendingRouteOptions
          .flatMap(({ stops }) => stops)
          .filter(({ conditionAcknowledged }) => conditionAcknowledged === false)
          .map((stop) => [stop.placeId, {
            placeId: stop.placeId,
            title: stop.title,
            selectionOrigin: stop.selectionOrigin ?? "automatic_recommendation",
            conditionEligibility: stop.petConditionEligibility!,
          }]),
      ).values()];
      return {
        ...recommendationFailure("confirmation_required", [
          "route_condition_acknowledgement_missing",
        ]),
        resultState: "confirmation_required",
        requestedStopCount: requestedTarget,
        feasibleStopCount: pendingRouteOptions[0]?.routeSummary.stopCount ?? 0,
        resultExplanation:
          "경로는 계산됐지만 자동으로 확인할 수 없는 반려동물 동반 조건이 있습니다. 각 조건의 원문을 확인하고 동의하기 전에는 저장하거나 확정할 수 없습니다.",
        recoveryActions: ["acknowledge_route_conditions"],
        selectionMode: hybridMode ? "hybrid" : "automatic",
        routeOptions: pendingRouteOptions,
        confirmationRequirements,
        diversity,
      };
    }
    const route = routeOptions[0]!;
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
    );
    return {
      status: "ready",
      apiVersion: ROUTE_RECOMMENDATION_API_VERSION,
      contractVersion: ROUTE_RECOMMENDATION_CONTRACT_V2,
      engineVersion: ROUTE_RECOMMENDATION_ENGINE_V2,
      objectiveVersion: "route-objective-v1",
      solverVersion: "route-solver-v1",
      editSessionId,
      region: request.trip.regionId,
      requestFingerprint: requestFingerprintV2({
        normalized,
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
      resultState,
      requestedStopCount: requestedTarget,
      feasibleStopCount: route.routeSummary.stopCount,
      resultReasonCodes,
      resultExplanation: resultState === "ready"
        ? "요청한 방문지 수를 충족하는 경로입니다."
        : resultState === "ready_with_reduced_stops"
          ? `요청 ${requestedTarget}곳 중 ${route.routeSummary.stopCount}곳이 현재 운영시간, 실제 이동시간, 대기 한도를 함께 만족하는 최대 경로입니다. 제한 요인: ${feasibility.limitingReasonCodes.join(", ")}.`
          : `요청 ${requestedTarget}곳 중 현재 조건에서 안전하게 제안할 수 있는 장소는 1곳입니다. 제한 요인: ${feasibility.limitingReasonCodes.join(", ")}.`,
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
        ...feasibility.limitingReasonCodes,
        ...(ktoUnavailable ? ["kto_provider_partial_failure"] : []),
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
          candidateFunnel,
          candidatePipeline: {
            stageA: pipeline?.diagnostics.stageACount ?? 0,
            stageB: pipeline?.diagnostics.stageBCount ?? 0,
            detailedEvaluations: pipeline?.diagnostics.detailedEvaluationCount ?? 0,
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
    "travelTimeProvider" | "now" | "editSessionSecret"
  > = {},
): Promise<ManualRouteValidationResponseV1> {
  const now = dependencies.now ?? (() => new Date());
  const nowMs = now().getTime();
  const session = parseEditSession(
    editSessionId,
    nowMs,
    dependencies.editSessionSecret,
  );
  if (!session) {
    return recommendationFailure("invalid_request", ["edit_session_expired"]);
  }
  const candidates = orderedPlaceIds.map((id) =>
    session.candidates.find(({ node }) => node.id === id),
  );
  if (candidates.some((candidate) => !candidate)) {
    return recommendationFailure("invalid_request", ["manual_route_contains_unknown_place"]);
  }
  const ordered = candidates as ManualEditCandidate[];
  const conditionRevalidationFailed = ordered.some((candidate) => {
    const analysis = candidate.originalStop.petConditionEligibility;
    if (!analysis) return true;
    return applyCanonicalPetConditionPolicy({
      analysis,
      flow: "revalidation",
      includeVerificationRequired: true,
      acknowledged: candidate.originalStop.conditionAcknowledged === true,
      preserveUserSelection:
        candidate.originalStop.selectionOrigin === "user_selected",
    }).decision !== "allow";
  });
  if (conditionRevalidationFailed) {
    return recommendationFailure("confirmation_required", [
      "manual_route_condition_revalidation_required",
    ]);
  }
  const provider = dependencies.travelTimeProvider ?? new KakaoTravelTimeProvider();
  const requestedDepartureAt = new Date(
    tripStartMs(session.tripRequest),
  ).toISOString();
  let validation: OrderedRouteValidationResult;
  try {
    validation = await provider.validateOrderedRoute({
      departure: session.departure,
      orderedStops: ordered.map(({ node }) => node),
      roundTrip: session.tripRequest.roundTrip,
      requestedDepartureAt,
      priority: "TIME",
      avoid: [],
      includeGeometry: true,
    });
  } catch {
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
    totalVisitSeconds += candidate.dwellDurationMinutes * 60;
    totalWaitSeconds += appended.visit.waitSeconds;
    stops.push({
      ...original,
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
  return {
    status: "ready",
    apiVersion: ROUTE_RECOMMENDATION_API_VERSION,
    route: {
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
    },
    warnings: ["manual_route_revalidated"],
  };
}
