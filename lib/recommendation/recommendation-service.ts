import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { BUSAN_DISCOVERY_BOUNDS } from "@/lib/kakao/discovery";
import { KakaoMobilityProviderError } from "@/lib/kakao/directions";
import { KakaoTravelTimeProvider } from "@/lib/kakao/travel-time-provider";
import { getTripPaceConfig } from "@/lib/itinerary/trip-pace";
import {
  getDefaultLicenseMatchingService,
  type LicenseMatcher,
} from "@/lib/licenses/service";
import { runCandidatePipelineV1 } from "@/lib/recommendation/candidate-pipeline";
import { adaptEligibleCandidateForRouteV1 } from "@/lib/recommendation/optimizer/candidate-adapter";
import { optimizeRouteV1 } from "@/lib/recommendation/optimizer/route-optimizer";
import {
  appendScheduledVisitTiming,
  tripStartMs,
} from "@/lib/recommendation/optimizer/schedule-simulator";
import { recommendationFailure } from "@/lib/recommendation/recommendation-errors";
import { normalizeRecommendationRequest } from "@/lib/recommendation/recommendation-request";
import type {
  DetailedEligibleCandidate,
  CandidatePipelineResult,
} from "@/lib/recommendation/types";
import type {
  RecommendedRouteStop,
  RouteOptimizationCandidate,
  RouteOptimizationInput,
  RouteOptimizationResult,
  RouteOptimizationTripRequest,
} from "@/lib/recommendation/types/route-optimizer";
import type {
  OrderedRouteValidationResult,
  TravelMatrixEdge,
  TravelNode,
  TravelTimeTemporalBasis,
  TravelTimeProvider,
} from "@/lib/travel/types";
import {
  collectTourCatalog,
} from "@/lib/tour-api/catalog-service";
import {
  getCatalogContentTypeId,
  type BusanDistrictCode,
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
  ManualRouteValidationResponseV1,
  ProductRouteV1,
  RecommendedRouteStopV1,
  RouteAlternativeV1,
  RouteRecommendationReadyResponseV1,
  RouteRecommendationRequest,
  RouteRecommendationResponseV1,
} from "@/types/recommendation";
import {
  ROUTE_RECOMMENDATION_API_VERSION,
} from "@/types/recommendation";

const CATALOG_CONCURRENCY = 2;
const EDIT_SESSION_TTL_MS = 20 * 60 * 1_000;
const EDIT_SESSION_VERSION = "manual-route-edit-session-v1";
const MAX_EDIT_SESSION_TOKEN_LENGTH = 256_000;

type CandidatePipelineRunner = typeof runCandidatePipelineV1;
type OptimizerRunner = typeof optimizeRouteV1;

export interface RecommendationServiceDependencies {
  tourService?: TourPlaceService;
  licenseMatcher?: LicenseMatcher | null;
  travelTimeProvider?: TravelTimeProvider;
  candidatePipeline?: CandidatePipelineRunner;
  optimizer?: OptimizerRunner;
  collectCatalog?: typeof collectTourCatalog;
  now?: () => Date;
  includeDiagnostics?: boolean;
  editSessionSecret?: string;
}

interface ManualEditCandidate {
  node: TravelNode;
  dwellDurationMinutes: number;
  schedule: RouteOptimizationCandidate["schedule"];
  originalStop: RecommendedRouteStopV1;
}

interface EditSessionPayload {
  version: typeof EDIT_SESSION_VERSION;
  expiresAt: number;
  departure: TravelNode;
  tripRequest: RouteOptimizationTripRequest;
  searchTemporalBasis: TravelTimeTemporalBasis;
  candidates: ManualEditCandidate[];
}

function editSessionSigningKey(explicit?: string): Buffer {
  const configured = explicit?.trim() || process.env.ROUTE_EDIT_SESSION_SECRET?.trim();
  const providerMaterial = [
    process.env.TOUR_API_SERVICE_KEY?.trim(),
    process.env.KAKAO_REST_API_KEY?.trim(),
  ];
  const material = configured ||
    (providerMaterial.every(Boolean) ? providerMaterial.join("\0") : "");
  if (!material) {
    throw new TypeError("Route edit-session signing material is unavailable.");
  }
  return createHash("sha256")
    .update(`${EDIT_SESSION_VERSION}\0`, "utf8")
    .update(material, "utf8")
    .digest();
}

function signEditSession(payload: EditSessionPayload, secret?: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", editSessionSigningKey(secret))
    .update(encoded, "utf8")
    .digest("base64url");
  return `v1.${encoded}.${signature}`;
}

function parseEditSession(
  token: string,
  nowMs: number,
  secret?: string,
): EditSessionPayload | null {
  if (!token.startsWith("v1.") || token.length > MAX_EDIT_SESSION_TOKEN_LENGTH) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const encoded = parts[1]!;
  const supplied = Buffer.from(parts[2]!, "base64url");
  const expected = createHmac("sha256", editSessionSigningKey(secret))
    .update(encoded, "utf8")
    .digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<EditSessionPayload>;
    if (
      parsed.version !== EDIT_SESSION_VERSION ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= nowMs ||
      !parsed.departure ||
      !parsed.tripRequest ||
      typeof parsed.searchTemporalBasis !== "string" ||
      !Array.isArray(parsed.candidates) ||
      parsed.candidates.length === 0 ||
      parsed.candidates.length > 15 ||
      parsed.candidates.some(
        (candidate) =>
          !candidate ||
          typeof candidate.node?.id !== "string" ||
          typeof candidate.dwellDurationMinutes !== "number" ||
          !candidate.schedule ||
          candidate.originalStop?.placeId !== candidate.node.id,
      ) ||
      new Set(parsed.candidates.map(({ node }) => node.id)).size !==
        parsed.candidates.length
    ) {
      return null;
    }
    return parsed as EditSessionPayload;
  } catch {
    return null;
  }
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

function createEditSessionId(
  input: RouteOptimizationInput,
  routes: readonly ProductRouteV1[],
  searchTemporalBasis: TravelTimeTemporalBasis,
  nowMs: number,
  secret?: string,
): string {
  const byId = new Map(input.candidates.map((candidate) => [candidate.node.id, candidate]));
  const originalStops = new Map(
    routes.flatMap(({ stops }) => stops).map((stop) => [stop.placeId, stop]),
  );
  const candidates = [...originalStops].map(([placeId, originalStop]) => {
    const candidate = byId.get(placeId);
    if (!candidate) throw new TypeError("Editable route stop is missing its candidate.");
    return {
      node: candidate.node,
      dwellDurationMinutes: candidate.dwellDurationMinutes,
      schedule: candidate.schedule,
      originalStop,
    } satisfies ManualEditCandidate;
  });
  return signEditSession(
    {
      version: EDIT_SESSION_VERSION,
      expiresAt: nowMs + EDIT_SESSION_TTL_MS,
      departure: input.departure,
      tripRequest: input.tripRequest,
      searchTemporalBasis,
      candidates,
    },
    secret,
  );
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
): RouteRecommendationResponseV1 {
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

export async function generateRouteRecommendation(
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
            regionCode: normalized.scope.regionCode,
            districtCode:
              normalized.scope.type === "district"
                ? (normalized.scope.districtCode as BusanDistrictCode)
                : undefined,
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
      .slice(0, 15)
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
