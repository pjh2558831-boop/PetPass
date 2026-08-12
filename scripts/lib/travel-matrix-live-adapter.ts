import "server-only";

import { runCandidatePipelineV1 } from "@/lib/recommendation/candidate-pipeline";
import type {
  CandidatePipelineRequestContext,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import { KakaoMobilityClient } from "@/lib/kakao/directions";
import { KakaoTravelTimeProvider } from "@/lib/kakao/travel-time-provider";
import { MemoryTravelTimeCache } from "@/lib/travel/cache";
import type { TravelNode } from "@/lib/travel/types";
import { TourRequestCache } from "@/lib/tour-api/cache";
import { TourApiClient } from "@/lib/tour-api/client";
import { collectTourCatalog } from "@/lib/tour-api/catalog-service";
import { KoreaTourismService } from "@/lib/tour-api/service";
import {
  createBoundedProviderFetch,
  type ProviderResponseObservation,
} from "@/scripts/lib/tour-contract-audit";
import type { TravelMatrixLiveExecution } from "@/scripts/lib/travel-matrix-live-verification";

export const LIVE_TOUR_PROVIDER_BOUNDS = {
  requestCap: 120,
  concurrency: 3,
  timeoutMs: 8_000,
  retryCount: 1,
} as const;

export const LIVE_KAKAO_PROVIDER_BOUNDS = {
  requestCap: 84,
  concurrency: 3,
  timeoutMs: 8_000,
  retryCount: 1,
} as const;

const BUSAN_BOUNDS = {
  west: 128.75,
  south: 34.95,
  east: 129.4,
  north: 35.5,
} as const;

const categories: UsefulTourCategory[] = [
  "attraction",
  "culture",
  "festival",
  "leisure",
  "food",
];

export function createTravelMatrixLiveContext(runAsOf: string): CandidatePipelineRequestContext {
  return {
    request: {
      scope: { type: "busan", regionCode: "26", regionName: "부산 전체" },
      start: {
        coordinates: { latitude: 35.1796, longitude: 129.0756 },
        label: "Bounded verification origin",
      },
      travelDate: runAsOf.slice(0, 10),
      tripType: "DAY_TRIP",
      tripPace: "packed",
      startTime: "10:00",
      planningMode: "stop_count",
      desiredDurationMinutes: null,
      desiredStopCount: 5,
      petSpecies: "DOG",
      petSize: "SMALL",
      acceptsOutdoorOnly: true,
      petEquipment: { hasCarrier: true, hasLeash: true, hasMuzzle: true },
      indoorAccessPreference: "any",
      selectedCategories: categories,
      includeShopping: false,
      generationSeed: "travel-matrix-v1-live-natural-stage2",
      recentRouteSignatures: [],
    },
    minStops: 4,
    maxStops: 5,
    tripType: "DAY_TRIP",
    petProfile: {
      species: "DOG",
      size: "SMALL",
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: true,
      acceptsOutdoorOnly: true,
    },
    tripRequest: {
      scope: { regionCode: "26", districtCode: null, bounds: BUSAN_BOUNDS },
      selectedCategories: categories,
      includeShopping: false,
      indoorAccessPreference: "any",
    },
  };
}

export function travelMatrixLiveDeparture(): TravelNode {
  return {
    id: "verification-origin",
    kind: "departure",
    name: "Bounded verification origin",
    latitude: 35.1796,
    longitude: 129.0756,
  };
}

function categoryCounts(values: readonly { category: string }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value.category] = (result[value.category] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

export async function runLiveTravelMatrixV1(): Promise<TravelMatrixLiveExecution> {
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
  const selection = await runCandidatePipelineV1({
    context: createTravelMatrixLiveContext(runAsOf),
    catalog: catalog.places,
    tourService,
    licenseMatcher: null,
    now: () => new Date(runAsOf),
  });
  if (selection.candidates.length === 0) {
    throw new Error("LIVE_TRAVEL_MATRIX_NO_NATURAL_STAGE2_CANDIDATES");
  }
  const selected = selection.candidates.slice(0, 15);
  const nodes: TravelNode[] = selected.map((candidate) => ({
    id: candidate.contentId,
    kind: "place",
    name: candidate.summary.title ?? `Tourism place ${candidate.contentId}`,
    latitude: candidate.coordinates.latitude,
    longitude: candidate.coordinates.longitude,
  }));

  const kakaoObservations: ProviderResponseObservation[] = [];
  const kakaoBounded = createBoundedProviderFetch({
    requestCap: LIVE_KAKAO_PROVIDER_BOUNDS.requestCap,
    concurrency: LIVE_KAKAO_PROVIDER_BOUNDS.concurrency,
    timeoutMs: LIVE_KAKAO_PROVIDER_BOUNDS.timeoutMs,
    onObservation: (observation) => kakaoObservations.push(observation),
  });
  const client = new KakaoMobilityClient({
    fetchImpl: kakaoBounded.fetchImpl,
    timeoutMs: LIVE_KAKAO_PROVIDER_BOUNDS.timeoutMs,
    retryCount: LIVE_KAKAO_PROVIDER_BOUNDS.retryCount,
  });
  const cache = new MemoryTravelTimeCache();
  const travelProvider = new KakaoTravelTimeProvider({
    client,
    cache,
    now: () => new Date(runAsOf),
  });
  const matrixInput = {
    departure: travelMatrixLiveDeparture(),
    candidates: nodes,
    travelMode: "driving" as const,
    priority: "TIME" as const,
    avoid: [],
    requestedDepartureAt: null,
  };
  const cold = await travelProvider.buildMatrix(matrixInput);
  const warm = await travelProvider.buildMatrix(matrixInput);

  const orderedStops = nodes.slice(0, 5);
  const currentRoute = await travelProvider.validateOrderedRoute({
    departure: travelMatrixLiveDeparture(),
    orderedStops,
    requestedDepartureAt: null,
    priority: "TIME",
    avoid: [],
    includeGeometry: true,
  });
  const futureRoute = await travelProvider.validateOrderedRoute({
    departure: travelMatrixLiveDeparture(),
    orderedStops,
    requestedDepartureAt: new Date(
      new Date(runAsOf).getTime() + 2 * 60 * 60 * 1_000,
    ).toISOString(),
    priority: "TIME",
    avoid: [],
    includeGeometry: true,
  });
  const asymmetry = cold.nodeIds.some((fromId) =>
    cold.nodeIds.some((toId) => {
      if (fromId === toId) return false;
      const forward = cold.edges[fromId][toId];
      const reverse = cold.edges[toId][fromId];
      return (
        forward.status === "resolved" &&
        reverse.status === "resolved" &&
        (forward.distanceMeters !== reverse.distanceMeters ||
          forward.durationSeconds !== reverse.durationSeconds)
      );
    }),
  );
  const kakaoStats = kakaoBounded.stats();
  const tourStats = tourBounded.stats();
  const authorizationOrQuotaIssue = kakaoObservations.some(
    ({ httpStatus }) =>
      httpStatus === 401 || httpStatus === 403 || httpStatus === 429,
  );
  const report: TravelMatrixLiveExecution = {
    version: "travel-matrix-v1-live-verification",
    runAsOf,
    scope: "busan",
    stage2Selection: {
      candidateCount: nodes.length,
      contentIds: nodes.map(({ id }) => id).sort(),
      categories: categoryCounts(selected),
      tourProviderCalls: tourStats.providerCalls,
      tourMaxObservedConcurrency: tourStats.maxObservedConcurrency,
      tourRequestCap: tourStats.requestCap,
    },
    kakaoBounds: {
      requestCap: kakaoStats.requestCap,
      providerCalls: kakaoStats.providerCalls,
      concurrency: kakaoStats.concurrency,
      maxObservedConcurrency: kakaoStats.maxObservedConcurrency,
      timeoutMs: kakaoStats.timeoutMs,
    },
    coldMatrix: {
      nodeCount: cold.diagnostics.nodeCount,
      expectedDirectedEdges: cold.diagnostics.expectedDirectedEdges,
      resolvedEdges: cold.diagnostics.resolvedEdges,
      unresolvedEdges: cold.diagnostics.unresolvedEdges,
      batchCalls: cold.diagnostics.multiDestinationRequests,
      fallbackCalls: cold.diagnostics.directionsFallbackRequests,
      providerCalls: cold.diagnostics.providerCalls,
      cacheHits: cold.diagnostics.persistentCacheHits,
      complete: cold.complete,
    },
    warmMatrix: {
      providerCalls: warm.diagnostics.providerCalls,
      persistentCacheHits: warm.diagnostics.persistentCacheHits,
      unresolvedEdges: warm.diagnostics.unresolvedEdges,
      complete: warm.complete,
    },
    asymmetricReversePairObserved: asymmetry,
    currentRoute: {
      status: currentRoute.status,
      sectionCount: currentRoute.sections.length,
      geometryPointCount: currentRoute.geometry.length,
      providerCalls: currentRoute.diagnostics.providerCalls,
    },
    futureRoute: {
      status: futureRoute.status,
      temporalBasis: futureRoute.temporalBasis,
      sectionCount: futureRoute.sections.length,
      geometryPointCount: futureRoute.geometry.length,
      providerCalls: futureRoute.diagnostics.providerCalls,
    },
    providerIssues: {
      matrixFailures: cold.diagnostics.providerFailures,
      matrixTimeouts: cold.diagnostics.timeouts,
      authorizationOrQuotaIssue,
    },
    gateChecks: {
      naturalStage2CandidatesUsed: nodes.length > 0 && nodes.length <= 15,
      asymmetricMatrixObserved: asymmetry,
      coldMatrixComplete: cold.complete,
      warmReplayCompleteWithoutProviderCalls: warm.complete && warm.diagnostics.providerCalls === 0,
      currentRouteValidated: currentRoute.status === "validated",
      futureRouteValidated: futureRoute.status === "validated",
      geometryExtracted: currentRoute.geometry.length >= 2 && futureRoute.geometry.length >= 2,
      requestCapRespected: kakaoStats.providerCalls <= kakaoStats.requestCap,
      concurrencyRespected: kakaoStats.maxObservedConcurrency <= kakaoStats.concurrency,
      noAuthorizationOrQuotaIssue: !authorizationOrQuotaIssue,
    },
  };
  return report;
}
