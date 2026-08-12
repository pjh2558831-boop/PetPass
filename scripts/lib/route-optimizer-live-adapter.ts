import "server-only";

import { KakaoMobilityClient } from "@/lib/kakao/directions";
import { KakaoTravelTimeProvider } from "@/lib/kakao/travel-time-provider";
import { runCandidatePipelineV1 } from "@/lib/recommendation/candidate-pipeline";
import { adaptEligibleCandidateForRouteV1 } from "@/lib/recommendation/optimizer/candidate-adapter";
import { buildAllGreedyBaselinesV1 } from "@/lib/recommendation/optimizer/baselines";
import { optimizeRouteV1 } from "@/lib/recommendation/optimizer/route-optimizer";
import type { RouteOptimizationInput } from "@/lib/recommendation/types/route-optimizer";
import { MemoryTravelTimeCache } from "@/lib/travel/cache";
import { TourRequestCache } from "@/lib/tour-api/cache";
import { TourApiClient } from "@/lib/tour-api/client";
import { collectTourCatalog } from "@/lib/tour-api/catalog-service";
import { KoreaTourismService } from "@/lib/tour-api/service";
import {
  createTravelMatrixLiveContext,
  LIVE_KAKAO_PROVIDER_BOUNDS,
  LIVE_TOUR_PROVIDER_BOUNDS,
  travelMatrixLiveDeparture,
} from "@/scripts/lib/travel-matrix-live-adapter";
import { createBoundedProviderFetch, type ProviderResponseObservation } from "@/scripts/lib/tour-contract-audit";
import type { RouteOptimizerLiveReport } from "@/scripts/lib/route-optimizer-live-verification";

function categories(values: readonly { category: string }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value.category] = (result[value.category] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function canonical(result: Awaited<ReturnType<typeof optimizeRouteV1>>): string {
  return JSON.stringify(
    result.status === "ready"
      ? { status: result.status, score: result.score, stops: result.stops.map((item) => item.placeId), breakdown: result.scoreBreakdown, warnings: result.warnings }
      : { status: result.status, reasons: result.reasonCodes },
  );
}

export async function runLiveRouteOptimizerV1(): Promise<RouteOptimizerLiveReport> {
  const runAsOf = new Date().toISOString();
  const tourBounded = createBoundedProviderFetch({
    requestCap: LIVE_TOUR_PROVIDER_BOUNDS.requestCap,
    concurrency: LIVE_TOUR_PROVIDER_BOUNDS.concurrency,
    timeoutMs: LIVE_TOUR_PROVIDER_BOUNDS.timeoutMs,
  });
  const tourService = new KoreaTourismService(
    new TourApiClient({
      fetchImpl: tourBounded.fetchImpl,
      timeoutMs: LIVE_TOUR_PROVIDER_BOUNDS.timeoutMs,
      transientRetryCount: LIVE_TOUR_PROVIDER_BOUNDS.retryCount,
    }),
    new TourRequestCache(),
    () => new Date(runAsOf),
  );
  const catalog = await collectTourCatalog(tourService, { regionCode: "26" });
  const context = createTravelMatrixLiveContext(runAsOf);
  context.request.tripPace = "balanced";
  context.request.desiredStopCount = 3;
  context.minStops = 3;
  context.maxStops = 4;
  const stage2 = await runCandidatePipelineV1({
    context,
    catalog: catalog.places,
    tourService,
    licenseMatcher: null,
    now: () => new Date(runAsOf),
  });
  const selected = stage2.candidates.slice(0, 15);
  if (selected.length < context.minStops) throw new Error("LIVE_ROUTE_OPTIMIZER_INSUFFICIENT_NATURAL_STAGE2_CANDIDATES");
  const candidates = selected.map((candidate) => adaptEligibleCandidateForRouteV1({ candidate }));
  const kakaoObservations: ProviderResponseObservation[] = [];
  const kakaoBounded = createBoundedProviderFetch({
    requestCap: LIVE_KAKAO_PROVIDER_BOUNDS.requestCap,
    concurrency: LIVE_KAKAO_PROVIDER_BOUNDS.concurrency,
    timeoutMs: LIVE_KAKAO_PROVIDER_BOUNDS.timeoutMs,
    onObservation: (observation) => kakaoObservations.push(observation),
  });
  const travelProvider = new KakaoTravelTimeProvider({
    client: new KakaoMobilityClient({
      fetchImpl: kakaoBounded.fetchImpl,
      timeoutMs: LIVE_KAKAO_PROVIDER_BOUNDS.timeoutMs,
      retryCount: LIVE_KAKAO_PROVIDER_BOUNDS.retryCount,
    }),
    cache: new MemoryTravelTimeCache(),
    now: () => new Date(runAsOf),
  });
  const departure = travelMatrixLiveDeparture();
  const matrix = await travelProvider.buildMatrix({
    departure,
    candidates: candidates.map((candidate) => candidate.node),
    travelMode: "driving",
    priority: "TIME",
    avoid: [],
    requestedDepartureAt: null,
  });
  const input: RouteOptimizationInput = {
    departure,
    candidates,
    matrix,
    tripRequest: {
      date: context.request.travelDate,
      startTime: context.request.startTime,
      timezone: "Asia/Seoul" as const,
      tripType: "day_trip" as const,
      tripPace: "balanced" as const,
      selectedCategories: [...new Set(candidates.map((candidate) => candidate.category))],
      roundTrip: false,
    },
  };
  const optimized = await optimizeRouteV1(input, { travelTimeProvider: travelProvider });
  const replay = await optimizeRouteV1(input, { travelTimeProvider: travelProvider });
  const baselineRows = buildAllGreedyBaselinesV1(input).map(({ name, route }) => ({
    name,
    score: route?.score ?? null,
    stopIds: route?.orderedPlaceIds ?? [],
    totalDrivingSeconds: route?.totalDrivingSeconds ?? null,
  }));
  const tourStats = tourBounded.stats();
  const kakaoStats = kakaoBounded.stats();
  const authorizationOrQuotaIssue = kakaoObservations.some(
    (item) => item.httpStatus === 401 || item.httpStatus === 403 || item.httpStatus === 429,
  );
  const ready = optimized.status === "ready";
  return {
    version: "route-optimizer-v1-live-verification",
    runAsOf,
    scope: "busan",
    stage2: {
      candidateCount: selected.length,
      contentIds: selected.map((item) => item.contentId).sort(),
      categories: categories(selected),
      providerCalls: tourStats.providerCalls,
    },
    matrix: {
      nodeCount: matrix.diagnostics.nodeCount,
      resolvedEdges: matrix.diagnostics.resolvedEdges,
      expectedEdges: matrix.diagnostics.expectedDirectedEdges,
      complete: matrix.complete,
      providerCalls: matrix.diagnostics.providerCalls,
    },
    solver: {
      status: optimized.status,
      stopIds: ready ? optimized.stops.map((item) => item.placeId) : [],
      score: ready ? optimized.score : null,
      totalDrivingSeconds: ready ? optimized.schedule.totalDrivingSeconds : null,
      totalDistanceMeters: ready ? optimized.schedule.totalDistanceMeters : null,
      selectedCategoryCount: ready
        ? new Set(
            optimized.stops.map(
              (stop) => candidates.find((candidate) => candidate.node.id === stop.placeId)!.category,
            ),
          ).size
        : 0,
      geometryPointCount: ready ? optimized.geometry.length : 0,
      matrixTemporalBasis: ready
        ? optimized.schedule.matrixTemporalBasis
        : optimized.diagnostics.matrixTemporalBasis,
      finalValidationTemporalBasis: ready
        ? optimized.schedule.finalValidationTemporalBasis
        : "unknown",
      validationAttempts: optimized.diagnostics.validationAttempts,
      validationFailures: optimized.diagnostics.validationFailures,
      exactSearchCompleted: optimized.diagnostics.exactSearchCompleted,
      beamFallbackUsed: optimized.diagnostics.beamFallbackUsed,
      deterministicReplay: canonical(optimized) === canonical(replay),
    },
    baselines: baselineRows,
    bounds: {
      tourCalls: tourStats.providerCalls,
      tourCap: tourStats.requestCap,
      kakaoCalls: kakaoStats.providerCalls,
      kakaoCap: kakaoStats.requestCap,
      maxObservedConcurrency: Math.max(tourStats.maxObservedConcurrency, kakaoStats.maxObservedConcurrency),
      concurrencyCap: Math.max(tourStats.concurrency, kakaoStats.concurrency),
      timeoutMs: Math.max(tourStats.timeoutMs, kakaoStats.timeoutMs),
    },
    gateChecks: {
      naturalStage2CandidatesUsed: selected.length >= context.minStops,
      providerMatrixComplete: matrix.complete,
      finalRouteReady: ready,
      finalValidationSucceeded: ready && optimized.diagnostics.validatedRoutes > 0,
      minimumStopsSatisfied: ready && optimized.stops.length >= context.minStops,
      usefulCategoryCoverage:
        ready &&
        new Set(
          optimized.stops.map(
            (stop) => candidates.find((candidate) => candidate.node.id === stop.placeId)!.category,
          ),
        ).size >= Math.min(2, new Set(candidates.map((candidate) => candidate.category)).size),
      providerGeometryPresent: ready && optimized.geometry.length > 1,
      deterministicReplay: canonical(optimized) === canonical(replay),
      requestCapsRespected: tourStats.providerCalls <= tourStats.requestCap && kakaoStats.providerCalls <= kakaoStats.requestCap,
      concurrencyRespected: tourStats.maxObservedConcurrency <= tourStats.concurrency && kakaoStats.maxObservedConcurrency <= kakaoStats.concurrency,
      noAuthorizationOrQuotaIssue: !authorizationOrQuotaIssue,
    },
  };
}
