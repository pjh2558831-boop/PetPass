import {
  runCandidatePipelineV1,
  type CandidatePipelineTraceEvent,
} from "@/lib/recommendation/candidate-pipeline";
import { hasFreshExposedProviderVisibilityV1 } from "@/lib/recommendation/retrieval/candidate-retriever";
import type {
  CandidatePipelineRequestContext,
  DetailedEligibleCandidate,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import { TourRequestCache } from "@/lib/tour-api/cache";
import { TourApiClient } from "@/lib/tour-api/client";
import { collectTourCatalog } from "@/lib/tour-api/catalog-service";
import {
  KoreaTourismService,
  type TourPlaceService,
  type TourRequestObservation,
  type TourRequestObserver,
} from "@/lib/tour-api/service";
import type { TourContentTypeId, TourPlaceSummary } from "@/types/place";
import {
  createBoundedProviderFetch,
  type ProviderResponseObservation,
} from "@/scripts/lib/tour-contract-audit";
import {
  STAGE1_LIVE_ELIGIBLE_CONTENT_IDS,
  type LiveCandidatePipelineExecution,
  type LiveCandidateScenarioExecution,
  type LiveFinalCandidateVerification,
  type LiveKnownSampleProgress,
  type LiveOperationAccounting,
  type LiveProviderAccounting,
  type LiveScenarioDiagnostics,
  type LiveScenarioId,
  type LiveVerificationPhase,
} from "@/scripts/lib/candidate-pipeline-live-verification";

export const LIVE_CANDIDATE_PIPELINE_BOUNDS = {
  requestCap: 240,
  concurrency: 3,
  timeoutMs: 8_000,
  retryCount: 1,
} as const;

const BUSAN_REGION_CODE = "26";
const BUSAN_BOUNDS = {
  west: 128.75,
  south: 34.95,
  east: 129.4,
  north: 35.5,
} as const;
const CONTENT_TYPE_IDS = ["12", "14", "15", "28", "32", "39"] as const satisfies
  readonly TourContentTypeId[];
const ACCOUNTED_OPERATIONS = [
  "areaBasedList2",
  "petTourSyncList2",
  "detailCommon2",
  "detailIntro2",
  "detailPetTour2",
  "licensing",
] as const;

interface LiveScenarioDefinition {
  id: LiveScenarioId;
  label: string;
  tripType: "DAY_TRIP" | "OVERNIGHT";
  tripPace: "relaxed" | "balanced" | "packed";
  minStops: number;
  maxStops: number;
  selectedCategories: readonly UsefulTourCategory[];
}

interface ScopedTourObservation extends TourRequestObservation {
  contentId: string | null;
}

const DAY_TRIP_SCENARIOS: readonly LiveScenarioDefinition[] = [
  {
    id: "relaxed_day_trip",
    label: "Relaxed Busan activity day trip",
    tripType: "DAY_TRIP",
    tripPace: "relaxed",
    minStops: 2,
    maxStops: 3,
    selectedCategories: ["attraction", "culture", "leisure"],
  },
  {
    id: "balanced_day_trip",
    label: "Balanced Busan activity and food day trip",
    tripType: "DAY_TRIP",
    tripPace: "balanced",
    minStops: 3,
    maxStops: 4,
    selectedCategories: ["attraction", "culture", "leisure", "food"],
  },
  {
    id: "packed_day_trip",
    label: "Packed Busan broad useful-category day trip",
    tripType: "DAY_TRIP",
    tripPace: "packed",
    minStops: 4,
    maxStops: 5,
    selectedCategories: [
      "attraction",
      "culture",
      "festival",
      "leisure",
      "food",
    ],
  },
] as const;

const OVERNIGHT_SCENARIO: LiveScenarioDefinition = {
  id: "overnight",
  label: "Packed Busan overnight with accommodation",
  tripType: "OVERNIGHT",
  tripPace: "packed",
  minStops: 4,
  maxStops: 5,
  selectedCategories: [
    "attraction",
    "culture",
    "leisure",
    "food",
    "accommodation",
  ],
};

function requestContext(
  scenario: LiveScenarioDefinition,
  travelDate: string,
): CandidatePipelineRequestContext {
  return {
    request: {
      scope: {
        type: "busan",
        regionCode: BUSAN_REGION_CODE,
        regionName: "부산 전체",
      },
      start: {
        // City Hall is a stable verification origin, not a claimed user location.
        coordinates: { latitude: 35.1796, longitude: 129.0756 },
        label: "Busan bounded verification origin",
      },
      travelDate,
      tripType: scenario.tripType,
      tripPace: scenario.tripPace,
      startTime: "10:00",
      planningMode: "stop_count",
      desiredDurationMinutes: null,
      desiredStopCount: scenario.maxStops,
      petSpecies: "DOG",
      petSize: "SMALL",
      acceptsOutdoorOnly: true,
      petEquipment: {
        hasCarrier: true,
        hasLeash: true,
        hasMuzzle: true,
      },
      indoorAccessPreference: "any",
      selectedCategories: [...scenario.selectedCategories],
      includeShopping: false,
      generationSeed: `candidate-pipeline-v1-live-${scenario.id}`,
      recentRouteSignatures: [],
    },
    minStops: scenario.minStops,
    maxStops: scenario.maxStops,
    tripType: scenario.tripType,
    petProfile: {
      species: "DOG",
      size: "SMALL",
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: true,
      acceptsOutdoorOnly: true,
    },
    tripRequest: {
      scope: {
        regionCode: BUSAN_REGION_CODE,
        districtCode: null,
        bounds: BUSAN_BOUNDS,
      },
      selectedCategories: [...scenario.selectedCategories],
      includeShopping: false,
      indoorAccessPreference: "any",
    },
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function scopedObserver(
  contentId: string | null,
  events: ScopedTourObservation[],
  downstream?: TourRequestObserver,
): TourRequestObserver {
  return (event) => {
    events.push({ ...event, contentId });
    downstream?.(event);
  };
}

function observedService(
  service: KoreaTourismService,
  events: ScopedTourObservation[],
): TourPlaceService {
  return {
    listPlaces: (query, observe) =>
      service.listPlaces(query, scopedObserver(null, events, observe)),
    listProviderVisibility: (query, observe) =>
      service.listProviderVisibility(
        query,
        scopedObserver(null, events, observe),
      ),
    getPlaceScheduleDetail: (contentId, contentTypeId, observe) =>
      service.getPlaceScheduleDetail(
        contentId,
        contentTypeId,
        scopedObserver(contentId, events, observe),
      ),
    completePlaceDetail: (schedule, observe) =>
      service.completePlaceDetail(
        schedule,
        scopedObserver(schedule.summary.contentId, events, observe),
      ),
    getPlaceDetail: (contentId, contentTypeId, observe) =>
      service.getPlaceDetail(
        contentId,
        contentTypeId,
        scopedObserver(contentId, events, observe),
      ),
  };
}

function emptyOperationAccounting(): LiveOperationAccounting {
  return {
    physicalCalls: 0,
    logicalOperations: 0,
    cacheHits: 0,
    failures: 0,
  };
}

function providerAccounting(
  physical: readonly ProviderResponseObservation[],
  logical: readonly ScopedTourObservation[],
): LiveProviderAccounting {
  const callsByOperation: Record<string, LiveOperationAccounting> = Object.fromEntries(
    ACCOUNTED_OPERATIONS.map((operation) => [operation, emptyOperationAccounting()]),
  );
  for (const observation of physical) {
    const entry = callsByOperation[observation.operation] ?? emptyOperationAccounting();
    entry.physicalCalls += 1;
    callsByOperation[observation.operation] = entry;
  }
  const logicalRequests = logical.filter(
    ({ providerOutcome }) => providerOutcome === undefined,
  );
  for (const observation of logicalRequests) {
    const entry = callsByOperation[observation.operation] ?? emptyOperationAccounting();
    entry.logicalOperations += 1;
    if (observation.cache === "hit" || observation.cache === "coalesced") {
      entry.cacheHits += 1;
    }
    callsByOperation[observation.operation] = entry;
  }
  for (const observation of logical.filter(
    ({ providerOutcome }) => providerOutcome === "failed",
  )) {
    const entry = callsByOperation[observation.operation] ?? emptyOperationAccounting();
    entry.failures += 1;
    callsByOperation[observation.operation] = entry;
  }
  const duplicateGroups = new Map<string, number>();
  for (const observation of logicalRequests) {
    if (!observation.operation.startsWith("detail") || !observation.contentId) continue;
    const key = `${observation.operation}:${observation.contentId}`;
    duplicateGroups.set(key, (duplicateGroups.get(key) ?? 0) + 1);
  }
  const liveLogicalMisses = logicalRequests.filter(
    ({ liveProviderCall }) => liveProviderCall,
  ).length;
  return {
    physicalProviderCalls: physical.length,
    logicalProviderOperations: logicalRequests.length,
    cacheHits: logicalRequests.filter(
      ({ cache }) => cache === "hit" || cache === "coalesced",
    ).length,
    retries: Math.max(0, physical.length - liveLogicalMisses),
    timeouts: physical.filter(
      ({ errorCode }) => Boolean(errorCode && /(?:timeout|abort)/iu.test(errorCode)),
    ).length,
    providerFailures: logical.filter(
      ({ providerOutcome }) => providerOutcome === "failed",
    ).length,
    duplicateDetailOperations: [...duplicateGroups.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
    callsByOperation: Object.fromEntries(
      Object.entries(callsByOperation).sort(([left], [right]) =>
        compareText(left, right),
      ),
    ),
  };
}

function scenarioDiagnostics(
  diagnostics: Awaited<ReturnType<typeof runCandidatePipelineV1>>["diagnostics"],
): LiveScenarioDiagnostics {
  return {
    initialCatalogCount: diagnostics.initialCatalogCount,
    exposedCount: diagnostics.exposedCount,
    coordinateValidCount: diagnostics.coordinateValidCount,
    categoryAcceptedCount: diagnostics.categoryAcceptedCount,
    stageACount: diagnostics.stageACount,
    stageBCount: diagnostics.stageBCount,
    detailedEvaluationCount: diagnostics.detailedEvaluationCount,
    detailedBatchCount: diagnostics.detailedBatchCount,
    eligibleCount: diagnostics.eligibleCount,
    finalEligibleCount: diagnostics.finalEligibleCount,
    categoryDistribution: diagnostics.categoryDistribution,
    excludedByReason: diagnostics.excludedByReason,
    warningsByReason: diagnostics.warningsByReason,
  };
}

function knownSampleProgress(
  contentId: string,
  initialCatalogIds: ReadonlySet<string>,
  traces: readonly CandidatePipelineTraceEvent[],
): LiveKnownSampleProgress {
  const events = traces.filter((event) => event.contentId === contentId);
  const at = (stage: CandidatePipelineTraceEvent["stage"]) =>
    events.filter((event) => event.stage === stage);
  const stageZero = at("stage_zero");
  const schedule = at("schedule");
  const eligibility = at("automatic_eligibility");
  const final = at("final_pool");
  const presentInInitialCatalog = initialCatalogIds.has(contentId);
  const enteredStageA = at("stage_a").some(({ outcome }) => outcome === "entered");
  const enteredStageB = at("stage_b").some(({ outcome }) => outcome === "entered");
  const receivedDetailedEvaluation = at("detailed_evaluation").some(
    ({ outcome }) => outcome === "entered",
  );
  const passedAutomaticEligibility = eligibility.some(
    ({ outcome }) => outcome === "eligible",
  );
  const finalEligiblePool = final.some(({ outcome }) => outcome === "eligible");
  let removalReason: string | null = null;
  if (!finalEligiblePool) {
    const stageZeroExcluded = stageZero.find(({ outcome }) => outcome === "excluded");
    const scheduleExcluded = schedule.find(({ outcome }) => outcome === "excluded");
    const eligibilityExcluded = eligibility.find(({ outcome }) => outcome === "excluded");
    const finalExcluded = final.find(({ outcome }) => outcome === "excluded");
    if (!presentInInitialCatalog) {
      removalReason = "not_present_in_exposed_catalog";
    } else if (stageZeroExcluded) {
      removalReason = stageZeroExcluded.reasonCodes.join(",") || "stage_zero_excluded";
    } else if (!enteredStageA) {
      removalReason = "stage_a_not_selected";
    } else if (scheduleExcluded) {
      removalReason =
        scheduleExcluded.reasonCodes.join(",") || "schedule_conflict_or_unavailable";
    } else if (!enteredStageB) {
      removalReason = "stage_b_not_selected";
    } else if (!receivedDetailedEvaluation) {
      removalReason = "adaptive_stop_before_detailed_evaluation";
    } else if (eligibilityExcluded) {
      removalReason =
        eligibilityExcluded.reasonCodes.join(",") || "automatic_eligibility_excluded";
    } else if (finalExcluded) {
      removalReason = finalExcluded.reasonCodes.join(",") || "final_pool_excluded";
    } else {
      removalReason = "not_in_final_pool";
    }
  }
  return {
    contentId,
    presentInInitialCatalog,
    enteredStageA,
    enteredStageB,
    receivedDetailedEvaluation,
    passedAutomaticEligibility,
    finalEligiblePool,
    removalReason,
  };
}

function validCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function finalCandidateVerification(
  candidate: DetailedEligibleCandidate,
  context: CandidatePipelineRequestContext,
  asOf: string,
): LiveFinalCandidateVerification {
  const visibility = candidate.detail.summary.providerVisibility;
  const evidence = candidate.detail.normalizedPetEvidence;
  const components = [
    candidate.utility.preferenceFit,
    candidate.utility.petCompatibility,
    candidate.utility.informationTrust,
    candidate.utility.popularity,
    candidate.utility.categoryPriority,
    candidate.utility.dataQuality,
  ];
  const latitude = candidate.coordinates.latitude;
  const longitude = candidate.coordinates.longitude;
  const inBounds =
    latitude >= context.tripRequest.scope.bounds.south &&
    latitude <= context.tripRequest.scope.bounds.north &&
    longitude >= context.tripRequest.scope.bounds.west &&
    longitude <= context.tripRequest.scope.bounds.east;
  return {
    contentId: candidate.contentId,
    category: candidate.category,
    sourceIsTourismService2:
      candidate.source === "tourism_service2" &&
      candidate.summary.source.provider === "Korea Tourism Organization" &&
      candidate.summary.source.operation === "areaBasedList2" &&
      candidate.detail.source.provider === "Korea Tourism Organization" &&
      candidate.detail.source.operation === "detailCommon2",
    visibilityIsFreshExposed:
      visibility?.status === "exposed" &&
      visibility.providerField === "showflag" &&
      visibility.providerValue === "1" &&
      hasFreshExposedProviderVisibilityV1(candidate.detail.summary, asOf),
    coordinatesValidAndInScope:
      validCoordinate(latitude, -90, 90) &&
      validCoordinate(longitude, -180, 180) &&
      !(latitude === 0 && longitude === 0) &&
      inBounds,
    meaningfulPetEvidence:
      (evidence?.availability === "usable" || evidence?.availability === "partial") &&
      evidence.sourceFields.length > 0,
    phase3Verdict: candidate.assessment.verdict,
    phase3EligibleState:
      candidate.assessment.evaluationState === "complete" &&
      (candidate.assessment.verdict === "allowed" ||
        candidate.assessment.verdict === "conditional"),
    mandatoryConditionsSatisfied:
      candidate.eligibility.eligible &&
      candidate.eligibility.status === "eligible" &&
      candidate.eligibility.reasonCodes.length === 0,
    licensingExplicitlyClosed: candidate.licensing?.operatingState === "closed",
    confirmedScheduleConflict:
      candidate.scheduleCompatibility.status === "conflict",
    categoryRequested: context.request.selectedCategories.includes(candidate.category),
    shoppingExplicitlySelected:
      candidate.category !== "shopping" ||
      (context.request.includeShopping &&
        context.request.selectedCategories.includes("shopping")),
    kakaoOrDemoSource: candidate.source !== "tourism_service2",
    utility: {
      version: candidate.utility.version,
      total: candidate.utility.total,
      componentsWithinRange: components.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1,
      ),
    },
    popularity: {
      version: candidate.popularity.version,
      score: candidate.popularity.score,
      status: candidate.popularity.status,
      neutralColdStart:
        candidate.popularity.version === "popularity-v1" &&
        candidate.popularity.status === "insufficient_data" &&
        candidate.popularity.score === 0.5 &&
        candidate.utility.popularity === 0.5,
    },
  };
}

function canonicalResult(candidates: readonly DetailedEligibleCandidate[]): string {
  return JSON.stringify(
    candidates.map((candidate) => ({
      contentId: candidate.contentId,
      category: candidate.category,
      eligibility: candidate.eligibility,
      utility: candidate.utility,
      popularity: candidate.popularity,
    })),
  );
}

async function runScenario(input: {
  definition: LiveScenarioDefinition;
  phase: LiveVerificationPhase;
  travelDate: string;
  asOf: string;
  catalog: readonly TourPlaceSummary[];
  service: KoreaTourismService;
  physicalObservations: ProviderResponseObservation[];
}): Promise<LiveCandidateScenarioExecution> {
  const context = requestContext(input.definition, input.travelDate);
  const logicalObservations: ScopedTourObservation[] = [];
  const traces: CandidatePipelineTraceEvent[] = [];
  const physicalStart = input.physicalObservations.length;
  const startedAt = performance.now();
  const result = await runCandidatePipelineV1({
    context,
    catalog: input.catalog,
    tourService: observedService(input.service, logicalObservations),
    licenseMatcher: null,
    now: () => new Date(input.asOf),
    onCandidateTrace: (event) => traces.push(event),
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const physical = input.physicalObservations.slice(physicalStart);
  const initialCatalogIds = new Set(input.catalog.map(({ contentId }) => contentId));
  return {
    id: input.definition.id,
    label: input.definition.label,
    phase: input.phase,
    status: result.status,
    durationMs,
    diagnostics: scenarioDiagnostics(result.diagnostics),
    accounting: providerAccounting(physical, logicalObservations),
    eligibleContentIds: result.candidates
      .map(({ contentId }) => contentId)
      .sort(compareText),
    knownSamples: STAGE1_LIVE_ELIGIBLE_CONTENT_IDS.map((contentId) =>
      knownSampleProgress(contentId, initialCatalogIds, traces),
    ),
    finalCandidates: result.candidates
      .map((candidate) => finalCandidateVerification(candidate, context, input.asOf))
      .sort((left, right) => compareText(left.contentId, right.contentId)),
    canonicalResult: canonicalResult(result.candidates),
  };
}

/**
 * Optional and live. The caller enforces exact opt-in and CI denial. Stage 1
 * IDs are referenced only after natural product retrieval for reporting.
 */
export async function runLiveCandidatePipelineV1(): Promise<LiveCandidatePipelineExecution> {
  const startedAt = performance.now();
  const runAsOf = new Date().toISOString();
  const travelDate = runAsOf.slice(0, 10);
  const now = (): Date => new Date(runAsOf);
  const physicalObservations: ProviderResponseObservation[] = [];
  const bounded = createBoundedProviderFetch({
    requestCap: LIVE_CANDIDATE_PIPELINE_BOUNDS.requestCap,
    concurrency: LIVE_CANDIDATE_PIPELINE_BOUNDS.concurrency,
    timeoutMs: LIVE_CANDIDATE_PIPELINE_BOUNDS.timeoutMs,
    onObservation: (observation) => physicalObservations.push(observation),
  });
  const client = new TourApiClient({
    fetchImpl: bounded.fetchImpl,
    timeoutMs: LIVE_CANDIDATE_PIPELINE_BOUNDS.timeoutMs,
    transientRetryCount: LIVE_CANDIDATE_PIPELINE_BOUNDS.retryCount,
  });
  const service = new KoreaTourismService(client, new TourRequestCache(), now);
  const catalogEvents: ScopedTourObservation[] = [];
  const physicalCatalogStart = physicalObservations.length;
  const categoryCatalogs = await Promise.allSettled(
    CONTENT_TYPE_IDS.map((contentTypeId) =>
      collectTourCatalog(
        service,
        { regionCode: BUSAN_REGION_CODE, contentTypeId },
        scopedObserver(null, catalogEvents),
      ),
    ),
  );
  const catalog = [
    ...new Map(
      categoryCatalogs.flatMap((outcome) =>
        outcome.status === "fulfilled"
          ? outcome.value.places.map((place) => [place.contentId, place] as const)
          : [],
      ),
    ).values(),
  ].sort((left, right) => compareText(left.contentId, right.contentId));
  if (catalog.length === 0) {
    throw new Error("LIVE_CANDIDATE_PIPELINE_CATALOG_UNAVAILABLE");
  }
  const catalogAccounting = providerAccounting(
    physicalObservations.slice(physicalCatalogStart),
    catalogEvents,
  );
  const definitions = [
    ...DAY_TRIP_SCENARIOS,
    ...(catalog.some(({ category }) => category === "accommodation")
      ? [OVERNIGHT_SCENARIO]
      : []),
  ];
  const coldScenarios: LiveCandidateScenarioExecution[] = [];
  for (const definition of definitions) {
    coldScenarios.push(
      await runScenario({
        definition,
        phase: "cold",
        travelDate,
        asOf: runAsOf,
        catalog,
        service,
        physicalObservations,
      }),
    );
  }
  const warmScenarios: LiveCandidateScenarioExecution[] = [];
  for (const definition of definitions) {
    warmScenarios.push(
      await runScenario({
        definition,
        phase: "warm",
        travelDate,
        asOf: runAsOf,
        catalog,
        service,
        physicalObservations,
      }),
    );
  }
  const stats = bounded.stats();
  return {
    runAsOf,
    bounds: {
      requestCap: stats.requestCap,
      concurrency: stats.concurrency,
      maxObservedConcurrency: stats.maxObservedConcurrency,
      timeoutMs: stats.timeoutMs,
      retryCount: LIVE_CANDIDATE_PIPELINE_BOUNDS.retryCount,
    },
    catalogAccounting,
    coldScenarios,
    warmScenarios,
    totalPhysicalProviderCalls: stats.providerCalls,
    totalDurationMs: Math.round(performance.now() - startedAt),
  };
}
