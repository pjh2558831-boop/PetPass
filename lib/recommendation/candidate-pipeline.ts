import "server-only";

import {
  createTrustedTourPetAccessInput,
  evaluateTourPetAccess,
} from "@/lib/pet-access/tourism/evaluator";
import { assessPetSizeCompatibility } from "@/lib/pet-access/tourism/size-compatibility";
import {
  evaluateAutomaticRouteEligibility,
  KTO_SERVICE2_NAME,
} from "@/lib/itinerary/automatic-route-eligibility";
import { supportsRequiredIndoorAccess } from "@/lib/itinerary/indoor-access";
import { UNKNOWN_OPERATING_HOURS_WARNING } from "@/lib/itinerary/operating-hours";
import { CANDIDATE_PIPELINE_V1_CONFIG } from "@/lib/recommendation/config/candidate-pipeline-v1";
import { resolveDwellDurationV1 } from "@/lib/recommendation/config/dwell-duration-v1";
import {
  NoDataPopularityRepository,
  type PopularityRepository,
} from "@/lib/recommendation/popularity/popularity-repository";
import {
  filterStageZeroCatalogV1,
  getStageZeroRejectionReasonsV1,
  hasFreshExposedProviderVisibilityV1,
  retrieveStageACandidatesV1,
} from "@/lib/recommendation/retrieval/candidate-retriever";
import { reserveCandidateCategoriesV1 } from "@/lib/recommendation/retrieval/category-reservation";
import { assessScheduleCompatibilityV1 } from "@/lib/recommendation/schedule/schedule-compatibility";
import { scorePlaceUtilityV1 } from "@/lib/recommendation/scoring/place-utility";
import type {
  CandidatePipelineDiagnostics,
  CandidatePipelineRequestContext,
  CandidatePipelineResult,
  DetailedEligibleCandidate,
  ScheduledRouteCandidate,
  UsefulTourCategory,
} from "@/lib/recommendation/types";
import {
  createUnavailableLicenseResult,
  type LicenseMatcher,
} from "@/lib/licenses/service";
import type {
  TourPlaceService,
  TourPlaceScheduleDetail,
  TourRequestObservation,
} from "@/lib/tour-api/service";
import { computePlaceTrust } from "@/lib/trust/calculator";
import type { LicensingMatchResult } from "@/types/license";
import type { PopularityResult } from "@/lib/recommendation/popularity/popularity-calculator";
import type { PlaceTrustResult } from "@/types/place-source";
import type {
  TourPetPolicyFieldName,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";

export interface RunCandidatePipelineV1Input {
  context: CandidatePipelineRequestContext;
  catalog: readonly TourPlaceSummary[];
  tourService: TourPlaceService;
  licenseMatcher?: LicenseMatcher | null;
  popularityRepository?: PopularityRepository;
  now?: () => Date;
  /** Optional Stage 0 observation totals when catalog was collected upstream. */
  initialObservations?: readonly TourRequestObservation[];
  /** Optional server-only diagnostics hook. It cannot influence selection. */
  onCandidateTrace?: (event: CandidatePipelineTraceEvent) => void;
}

export type CandidatePipelineTraceStage =
  | "stage_zero"
  | "stage_a"
  | "schedule"
  | "stage_b"
  | "detailed_evaluation"
  | "automatic_eligibility"
  | "final_pool";

export interface CandidatePipelineTraceEvent {
  contentId: string;
  category: string;
  stage: CandidatePipelineTraceStage;
  outcome: "entered" | "excluded" | "eligible";
  reasonCodes: string[];
  warningCodes: string[];
}

function traceCandidate(
  input: RunCandidatePipelineV1Input,
  event: Omit<CandidatePipelineTraceEvent, "reasonCodes" | "warningCodes"> & {
    reasonCodes?: readonly string[];
    warningCodes?: readonly string[];
  },
): void {
  input.onCandidateTrace?.({
    ...event,
    reasonCodes: [...new Set(event.reasonCodes ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
    warningCodes: [...new Set(event.warningCodes ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
  });
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function sortedCounter(
  target: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(target).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function neutralPopularity(): PopularityResult {
  return {
    score: 0.5,
    status: "insufficient_data",
    qualityComponent: 0,
    trendComponent: 0,
    sampleWeight: 0,
    version: "popularity-v1",
  };
}

function isValidPopularityResult(
  value: PopularityResult | undefined,
): value is PopularityResult {
  return Boolean(
    value &&
      value.version === "popularity-v1" &&
      (value.status === "sufficient_data" ||
        value.status === "insufficient_data") &&
      Number.isFinite(value.score) &&
      value.score >= 0 &&
      value.score <= 1 &&
      Number.isFinite(value.qualityComponent) &&
      value.qualityComponent >= 0 &&
      value.qualityComponent <= 1 &&
      Number.isFinite(value.trendComponent) &&
      value.trendComponent >= 0 &&
      value.trendComponent <= 1 &&
      Number.isFinite(value.sampleWeight) &&
      value.sampleWeight >= 0,
  );
}

function diagnostics(): CandidatePipelineDiagnostics {
  return {
    version: CANDIDATE_PIPELINE_V1_CONFIG.version,
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
    cacheHits: 0,
    providerCalls: 0,
    providerFailures: 0,
    providerUnavailableCandidates: 0,
    skippedCandidates: 0,
    detailCallsByOperation: {},
    excludedByReason: {},
    warningsByReason: {},
    categoryDistribution: {},
  };
}

function recordObservation(
  output: CandidatePipelineDiagnostics,
  event: TourRequestObservation,
): void {
  if (event.cache === "hit" || event.cache === "coalesced") {
    output.cacheHits += 1;
  }
  if (event.liveProviderCall) {
    output.providerCalls += 1;
    if (event.operation.startsWith("detail")) {
      increment(output.detailCallsByOperation, event.operation);
    }
  }
  if (event.providerOutcome === "failed") {
    output.providerFailures += 1;
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await worker(values[index]);
      }
    }),
  );
  return results;
}

function startMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function scheduleOrder(
  left: ScheduledRouteCandidate,
  right: ScheduledRouteCandidate,
): number {
  const statusRank = {
    compatible: 3,
    unknown: 2,
    provider_unavailable: 1,
    conflict: 0,
  } as const;
  const effectiveScore = (candidate: ScheduledRouteCandidate): number =>
    candidate.retrievalScore.total -
    (candidate.scheduleCompatibility.status === "unknown"
      ? CANDIDATE_PIPELINE_V1_CONFIG.stageBUnknownPenalty
      : 0);
  return (
    effectiveScore(right) - effectiveScore(left) ||
    statusRank[right.scheduleCompatibility.status] -
      statusRank[left.scheduleCompatibility.status] ||
    right.retrievalScore.categoryCoverageNeed -
      left.retrievalScore.categoryCoverageNeed ||
    left.contentId.localeCompare(right.contentId)
  );
}

function requiredCoverage(
  stageB: readonly ScheduledRouteCandidate[],
  context: CandidatePipelineRequestContext,
): Set<UsefulTourCategory | "activity"> {
  const available = new Set(stageB.map(({ category }) => category));
  const required = new Set<UsefulTourCategory | "activity">();
  if (
    stageB.some(({ category }) =>
      ["attraction", "culture", "festival", "leisure"].includes(category),
    )
  ) {
    required.add("activity");
  }
  if (context.request.selectedCategories.includes("food") && available.has("food")) {
    required.add("food");
  }
  if (
    context.tripType === "OVERNIGHT" &&
    context.request.selectedCategories.includes("accommodation") &&
    available.has("accommodation")
  ) {
    required.add("accommodation");
  }
  return required;
}

function hasCoverage(
  values: readonly { candidate: ScheduledRouteCandidate }[],
  required: ReadonlySet<UsefulTourCategory | "activity">,
): boolean {
  return [...required].every((category) =>
    category === "activity"
      ? values.some(({ candidate: value }) =>
          ["attraction", "culture", "festival", "leisure"].includes(
            value.category,
          ),
        )
      : values.some(({ candidate }) => candidate.category === category),
  );
}

function petSizeEvidence(
  detail: TourPlaceScheduleDetail & {
    petPolicyEvidence?: {
      fields: Partial<Record<TourPetPolicyFieldName, string | null>>;
    } | null;
  },
): Array<{ id: string; sourceText: string }> {
  return Object.entries(detail.petPolicyEvidence?.fields ?? {}).flatMap(
    ([field, sourceText]) =>
      sourceText
        ? [{ id: `detailPetTour2:${field}:source`, sourceText }]
        : [],
  );
}

function timestampFreshness(
  value: string | null | undefined,
  asOf: string,
  maxAgeMs: number,
): number {
  if (!value) return 0.5;
  const timestamp = Date.parse(value);
  const snapshot = Date.parse(asOf);
  if (!Number.isFinite(timestamp) || !Number.isFinite(snapshot)) {
    return 0.5;
  }
  // The immutable snapshot is captured at pipeline start. Detail sections that
  // are fetched during this same bounded run therefore have a slightly later
  // retrieval timestamp and are still fresh. Large future skew remains neutral.
  return Math.abs(snapshot - timestamp) <= maxAgeMs ? 1 : 0.5;
}

function dataQuality(
  candidate: ScheduledRouteCandidate,
  detail: TourPlaceDetail,
  asOf: string,
): number {
  const pet = detail.normalizedPetEvidence;
  const petCompleteness = pet && typeof pet === "object" && "sourceFields" in pet
    ? Math.min(1, (pet.sourceFields as unknown[]).length / 3)
    : 0;
  const components = [
    timestampFreshness(
      detail.summary.providerVisibility?.checkedAt,
      asOf,
      CANDIDATE_PIPELINE_V1_CONFIG.visibilityFreshnessMs,
    ),
    1,
    candidate.scheduleCompatibility.status === "compatible"
      ? 1
      : candidate.scheduleCompatibility.status === "unknown"
        ? 0.5
        : 0,
    petCompleteness,
    timestampFreshness(
      detail.source.retrievedAt,
      asOf,
      CANDIDATE_PIPELINE_V1_CONFIG.detailFreshnessMs,
    ),
  ];
  return components.reduce((sum, value) => sum + value, 0) / components.length;
}

function categoryPriority(
  candidate: ScheduledRouteCandidate,
  eligibleCategoryCounts: ReadonlyMap<UsefulTourCategory, number>,
  context: CandidatePipelineRequestContext,
): number {
  const sameCategorySupply = eligibleCategoryCounts.get(candidate.category) ?? 1;
  let value = context.request.selectedCategories.includes(candidate.category)
    ? 0.7
    : 0.4;
  value += 0.15 / Math.max(1, sameCategorySupply);
  if (
    context.tripType === "OVERNIGHT" &&
    candidate.category === "accommodation"
  ) {
    value += 0.15;
  }
  if (candidate.category === "food") value += 0.1;
  return Math.min(1, value);
}

function finalPreferenceFit(
  candidate: ScheduledRouteCandidate,
  detail: TourPlaceDetail,
  context: CandidatePipelineRequestContext,
): number {
  const base = candidate.retrievalScore.preferenceFit;
  if (context.request.indoorAccessPreference === "any") return base;
  const assessment = evaluateTourPetAccess(createTrustedTourPetAccessInput(detail));
  const supportsIndoor = assessment.permittedScopes.some((scope) =>
    [
      "whole_place",
      "indoor",
      "guest_room",
      "selected_room",
      "common_area",
      "restaurant",
      "cafe",
      "lobby",
    ].includes(scope),
  );
  const explicitlyOutdoorOnly =
    assessment.restrictedScopes.includes("indoor") ||
    assessment.conditions.some(
      ({ type }) => type === "outdoor_only" || type === "indoor_restricted",
    );
  // Required indoor access is a separate positive-evidence gate in Stage C.
  // Preferred indoor access affects only the explicit indoor subfeature (10%).
  if (context.request.indoorAccessPreference === "preferred") {
    const listNeutralIndoorContribution = 0.1 * 0.5;
    const detailIndoorContribution = 0.1 * (supportsIndoor ? 1 : explicitlyOutdoorOnly ? 0 : 0.5);
    return Math.max(0, Math.min(1, base - listNeutralIndoorContribution + detailIndoorContribution));
  }
  return base;
}

interface StrictEligibleCandidateInput {
  candidate: ScheduledRouteCandidate;
  detail: TourPlaceDetail;
  assessment: ReturnType<typeof evaluateTourPetAccess>;
  sizeCompatibility: ReturnType<typeof assessPetSizeCompatibility>;
  licensing: LicensingMatchResult | null;
  eligibility: DetailedEligibleCandidate["eligibility"];
  trust: PlaceTrustResult;
  popularity: PopularityResult;
}

export interface FinalEligibleCandidateOrderV1Input {
  contentId: string;
  distanceKm: number;
  utility: { total: number; categoryPriority: number };
}

export function compareFinalEligibleCandidatesV1(
  left: FinalEligibleCandidateOrderV1Input,
  right: FinalEligibleCandidateOrderV1Input,
): number {
  return (
    right.utility.total - left.utility.total ||
    right.utility.categoryPriority - left.utility.categoryPriority ||
    left.distanceKm - right.distanceKm ||
    left.contentId.localeCompare(right.contentId)
  );
}

async function resolveLicense(
  matcher: LicenseMatcher | null | undefined,
  detail: Awaited<ReturnType<TourPlaceService["getPlaceDetail"]>>,
): Promise<LicensingMatchResult | null> {
  if (!matcher) return null;
  try {
    return await matcher.matchTourPlace(detail);
  } catch {
    return createUnavailableLicenseResult(
      detail.summary.category === "accommodation" ? "accommodation" : "food",
    );
  }
}

function trustFor(
  detail: Awaited<ReturnType<TourPlaceService["getPlaceDetail"]>>,
  licensing: LicensingMatchResult | null,
  assessment: ReturnType<typeof evaluateTourPetAccess>,
  computedAt: string,
): PlaceTrustResult {
  return computePlaceTrust({
    computedAt,
    hasAnySource: true,
    tourism: {
      hasPetSpecificEvidence: assessment.evidence.length > 0,
      retrievedAt: detail.source.retrievedAt,
    },
    sourceConflictCount: assessment.conflicts.length,
    licensingOperatingState: licensing?.operatingState ?? null,
  });
}

export async function runCandidatePipelineV1(
  input: RunCandidatePipelineV1Input,
): Promise<CandidatePipelineResult> {
  const output = diagnostics();
  const asOf = (input.now ?? (() => new Date()))().toISOString();
  output.initialCatalogCount = input.catalog.length;
  for (const event of input.initialObservations ?? []) recordObservation(output, event);
  const observe = (event: TourRequestObservation) => recordObservation(output, event);
  const exposedCatalog = input.catalog.filter((place) =>
    hasFreshExposedProviderVisibilityV1(place, asOf),
  );
  output.exposedCount = exposedCatalog.length;
  const coordinateValidCatalog = exposedCatalog.filter(
    ({ latitude, longitude }) =>
      typeof latitude === "number" &&
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      typeof longitude === "number" &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      !(latitude === 0 && longitude === 0),
  );
  output.coordinateValidCount = coordinateValidCatalog.length;
  output.categoryAcceptedCount = coordinateValidCatalog.filter(
    ({ category }) =>
      input.context.request.selectedCategories.includes(category) &&
      (category !== "shopping" || input.context.request.includeShopping),
  ).length;

  const stageZeroCatalog = filterStageZeroCatalogV1(
    input.catalog,
    input.context,
    asOf,
  );
  let stageZeroAcceptedBeforeDeduplication = 0;
  for (const place of input.catalog) {
    const reasons = getStageZeroRejectionReasonsV1(
      place,
      input.context,
      asOf,
    );
    if (reasons.length === 0) {
      stageZeroAcceptedBeforeDeduplication += 1;
    } else {
      for (const reason of reasons) increment(output.excludedByReason, reason);
    }
    traceCandidate(input, {
      contentId: place.contentId,
      category: place.category,
      stage: "stage_zero",
      outcome: reasons.length === 0 ? "entered" : "excluded",
      reasonCodes: reasons,
    });
  }
  const duplicateRecordsRemoved = Math.max(
    0,
    stageZeroAcceptedBeforeDeduplication - stageZeroCatalog.length,
  );
  if (duplicateRecordsRemoved > 0) {
    output.excludedByReason.duplicate_content_id_removed =
      duplicateRecordsRemoved;
  }
  const popularityRepository =
    input.popularityRepository ?? new NoDataPopularityRepository();
  const categoriesByContentId = Object.fromEntries(
    stageZeroCatalog.map(({ contentId, category }) => [contentId, category]),
  );
  let popularity: Awaited<
    ReturnType<PopularityRepository["getPopularitySnapshot"]>
  >;
  try {
    popularity = await popularityRepository.getPopularitySnapshot({
      contentIds: stageZeroCatalog.map(({ contentId }) => contentId),
      categoriesByContentId,
      asOf,
    });
  } catch {
    increment(output.warningsByReason, "popularity_provider_unavailable");
    popularity = await new NoDataPopularityRepository().getPopularitySnapshot({
      contentIds: stageZeroCatalog.map(({ contentId }) => contentId),
      categoriesByContentId,
      asOf,
    });
  }
  const safePopularity = new Map<string, PopularityResult>();
  for (const { contentId } of stageZeroCatalog) {
    const value = popularity.get(contentId);
    if (isValidPopularityResult(value)) {
      safePopularity.set(contentId, value);
    } else {
      if (value !== undefined) {
        increment(output.warningsByReason, "popularity_snapshot_invalid");
      }
      safePopularity.set(contentId, neutralPopularity());
    }
  }
  const popularityPrior = new Map(
    [...safePopularity].map(([contentId, value]) => [
      contentId,
      value.status === "sufficient_data" ? value.score : 0.5,
    ]),
  );
  const stageA = retrieveStageACandidatesV1({
    catalog: stageZeroCatalog,
    context: input.context,
    asOf,
    popularityPrior,
  });
  for (const candidate of stageA) {
    traceCandidate(input, {
      contentId: candidate.contentId,
      category: candidate.category,
      stage: "stage_a",
      outcome: "entered",
    });
  }
  output.stageACount = stageA.length;
  output.skippedCandidates += Math.max(0, input.catalog.length - stageA.length);

  const tripStartMinutes = startMinutes(input.context.request.startTime);
  const tripLatestDeparture =
    input.context.request.planningMode === "duration" &&
    input.context.request.desiredDurationMinutes !== null
      ? Math.min(
          24 * 60,
          tripStartMinutes + input.context.request.desiredDurationMinutes,
        )
      : 24 * 60;
  const hasStagedDetailCapability = Boolean(
    input.tourService.getPlaceScheduleDetail &&
      input.tourService.completePlaceDetail,
  );
  const scheduled = await mapWithConcurrency(
    stageA,
    CANDIDATE_PIPELINE_V1_CONFIG.detailConcurrency,
    async (candidate): Promise<ScheduledRouteCandidate> => {
      if (!hasStagedDetailCapability) {
        return {
          ...candidate,
          scheduleDetail: null,
          scheduleCompatibility: {
            status: "unknown",
            reasonCodes: [],
            warningCodes: ["schedule_staged_adapter_unavailable"],
          },
        };
      }
      try {
        const scheduleDetail = await input.tourService.getPlaceScheduleDetail!(
          candidate.contentId,
          candidate.contentTypeId,
          observe,
        );
        return {
          ...candidate,
          scheduleDetail,
          scheduleCompatibility: assessScheduleCompatibilityV1({
            detail: scheduleDetail,
            providerAvailable: scheduleDetail !== null,
            travelDate: input.context.request.travelDate,
            asOf,
            // Stage 2 has no route order, so it cannot assert a visit window.
            proposedArrivalMinutes: null,
            proposedDepartureMinutes: null,
            feasibleWindow: {
              earliestArrivalMinutes: tripStartMinutes,
              latestDepartureMinutes: tripLatestDeparture,
              dwellMinutes: resolveDwellDurationV1({
                category: candidate.contentTypeId,
              }).minutes,
            },
          }),
        };
      } catch {
        return {
          ...candidate,
          scheduleDetail: null,
          scheduleCompatibility: assessScheduleCompatibilityV1({
            detail: null,
            providerAvailable: false,
            travelDate: input.context.request.travelDate,
            asOf,
            proposedArrivalMinutes: null,
            proposedDepartureMinutes: null,
          }),
        };
      }
    },
  );
  for (const candidate of scheduled) {
    if (candidate.scheduleCompatibility.status === "provider_unavailable") {
      output.providerUnavailableCandidates += 1;
    }
    for (const reason of candidate.scheduleCompatibility.reasonCodes) {
      increment(output.excludedByReason, reason);
    }
    for (const warning of candidate.scheduleCompatibility.warningCodes) {
      increment(output.warningsByReason, warning);
    }
    traceCandidate(input, {
      contentId: candidate.contentId,
      category: candidate.category,
      stage: "schedule",
      outcome:
        candidate.scheduleCompatibility.status === "conflict" ||
        (hasStagedDetailCapability &&
          candidate.scheduleCompatibility.status === "provider_unavailable")
          ? "excluded"
          : "entered",
      reasonCodes: candidate.scheduleCompatibility.reasonCodes,
      warningCodes: candidate.scheduleCompatibility.warningCodes,
    });
  }
  const stageBAvailable = scheduled
    .filter(
      ({ scheduleCompatibility }) =>
        scheduleCompatibility.status !== "conflict" &&
        (!hasStagedDetailCapability ||
          scheduleCompatibility.status !== "provider_unavailable"),
    )
    .sort(scheduleOrder);
  const stageBSelectedIds = new Set(
    reserveCandidateCategoriesV1({
      candidates: stageBAvailable,
      limit: CANDIDATE_PIPELINE_V1_CONFIG.stageBLimit,
      selectedCategories: [
        ...new Set(input.context.request.selectedCategories),
      ].filter(
        (category): category is UsefulTourCategory =>
          category !== "transportation" && category !== "unknown",
      ),
      tripType: input.context.tripType,
      compare: scheduleOrder,
    }).map(({ contentId }) => contentId),
  );
  const stageB = stageBAvailable
    .filter(({ contentId }) => stageBSelectedIds.has(contentId))
    .sort(scheduleOrder);
  for (const candidate of stageB) {
    traceCandidate(input, {
      contentId: candidate.contentId,
      category: candidate.category,
      stage: "stage_b",
      outcome: "entered",
      warningCodes: candidate.scheduleCompatibility.warningCodes,
    });
  }
  output.stageBCount = stageB.length;
  output.skippedCandidates += Math.max(0, scheduled.length - stageB.length);

  const target = Math.min(
    CANDIDATE_PIPELINE_V1_CONFIG.maximumEligiblePoolTarget,
    input.context.maxStops +
      CANDIDATE_PIPELINE_V1_CONFIG.eligibleReserveAboveMaxStops,
  );
  const coverage = requiredCoverage(stageB, input.context);
  const eligibleInputs: StrictEligibleCandidateInput[] = [];
  for (
    let offset = 0;
    offset < stageB.length &&
    output.detailedEvaluationCount <
      CANDIDATE_PIPELINE_V1_CONFIG.maxDetailedEvaluations;
    offset += CANDIDATE_PIPELINE_V1_CONFIG.detailBatchSize
  ) {
    const batch = stageB.slice(
      offset,
      offset + CANDIDATE_PIPELINE_V1_CONFIG.detailBatchSize,
    );
    output.detailedBatchCount += 1;
    const results = await mapWithConcurrency(
      batch,
      CANDIDATE_PIPELINE_V1_CONFIG.detailConcurrency,
      async (candidate): Promise<StrictEligibleCandidateInput | null> => {
        output.detailedEvaluationCount += 1;
        traceCandidate(input, {
          contentId: candidate.contentId,
          category: candidate.category,
          stage: "detailed_evaluation",
          outcome: "entered",
        });
        let detail: Awaited<ReturnType<TourPlaceService["getPlaceDetail"]>>;
        try {
          detail = candidate.scheduleDetail && input.tourService.completePlaceDetail
            ? await input.tourService.completePlaceDetail(
                candidate.scheduleDetail,
                observe,
              )
            : await input.tourService.getPlaceDetail(
                candidate.contentId,
                candidate.contentTypeId,
                observe,
              );
        } catch {
          output.providerUnavailableCandidates += 1;
          output.skippedCandidates += 1;
          increment(output.excludedByReason, "candidate_detail_provider_unavailable");
          traceCandidate(input, {
            contentId: candidate.contentId,
            category: candidate.category,
            stage: "automatic_eligibility",
            outcome: "excluded",
            reasonCodes: ["candidate_detail_provider_unavailable"],
          });
          return null;
        }
        const assessment = evaluateTourPetAccess(
          createTrustedTourPetAccessInput(detail),
        );
        const sizeCompatibility = assessPetSizeCompatibility(
          assessment,
          input.context.petProfile.size,
          petSizeEvidence(detail),
        );
        const licensing = await resolveLicense(input.licenseMatcher, detail);
        const scheduleStatus =
          candidate.scheduleCompatibility.status === "compatible"
            ? "open"
            : "unknown";
        const eligibility = evaluateAutomaticRouteEligibility({
            providerService: KTO_SERVICE2_NAME,
            summary: candidate.summary,
            detail,
            providerVisibility:
              detail.summary.providerVisibility ?? candidate.summary.providerVisibility!,
            providerCalls: {
              list: "succeeded",
              detailCommon:
                detail.sections.common.status === "available"
                  ? "succeeded"
                  : "provider_unavailable",
              detailIntro:
                detail.sections.intro.status === "available"
                  ? "succeeded"
                  : "provider_unavailable",
              detailPet:
                detail.sections.petPolicy.status === "available"
                  ? "succeeded"
                  : "provider_unavailable",
            },
            assessment,
            petProfile: input.context.petProfile,
            tripRequest: input.context.tripRequest,
            licensing,
            operatingHours: {
              status: scheduleStatus,
              warning:
                scheduleStatus === "unknown"
                  ? UNKNOWN_OPERATING_HOURS_WARNING
                  : null,
            },
          });
          if (!eligibility.eligible) {
            output.skippedCandidates += 1;
            if (eligibility.status === "provider_unavailable") {
              output.providerUnavailableCandidates += 1;
            }
            const diagnosticReasons = eligibility.reasonCodes.filter(
              (reason) =>
                eligibility.status !== "provider_unavailable" ||
                ![
                  "pet_evidence_absent",
                  "pet_evidence_empty",
                  "pet_evidence_not_consumed",
                  "pet_access_unknown",
                  "pet_access_verification_required",
                ].includes(reason),
            );
            for (const reason of diagnosticReasons) {
              increment(output.excludedByReason, reason);
            }
          for (const warning of eligibility.warnings) {
            increment(output.warningsByReason, warning);
          }
            traceCandidate(input, {
              contentId: candidate.contentId,
              category: candidate.category,
              stage: "automatic_eligibility",
              outcome: "excluded",
              reasonCodes: eligibility.reasonCodes,
              warningCodes: eligibility.warnings,
            });
            return null;
          }
        if (
          input.context.request.indoorAccessPreference === "required" &&
          !supportsRequiredIndoorAccess(assessment)
        ) {
          output.skippedCandidates += 1;
          increment(output.excludedByReason, "indoor_access_not_confirmed");
          traceCandidate(input, {
            contentId: candidate.contentId,
            category: candidate.category,
            stage: "automatic_eligibility",
            outcome: "excluded",
            reasonCodes: ["indoor_access_not_confirmed"],
            warningCodes: eligibility.warnings,
          });
          return null;
        }
        const strictEligibility = {
          ...eligibility,
          eligible: true as const,
        };
        const trust = trustFor(detail, licensing, assessment, asOf);
        const popularityResult =
          safePopularity.get(candidate.contentId) ?? neutralPopularity();
        traceCandidate(input, {
          contentId: candidate.contentId,
          category: candidate.category,
          stage: "automatic_eligibility",
          outcome: "eligible",
          warningCodes: eligibility.warnings,
        });
        return {
          candidate,
          detail,
          assessment,
          sizeCompatibility,
          licensing,
          eligibility: strictEligibility,
          trust,
          popularity: popularityResult,
        };
      },
    );
    eligibleInputs.push(
      ...results.filter(
        (value): value is StrictEligibleCandidateInput => value !== null,
      ),
    );
    if (
      eligibleInputs.length >= target &&
      hasCoverage(eligibleInputs, coverage)
    ) {
      break;
    }
  }

  output.skippedCandidates += Math.max(
    0,
    stageB.length - output.detailedEvaluationCount,
  );
  const eligibleCategoryCounts = new Map<UsefulTourCategory, number>();
  for (const { candidate } of eligibleInputs) {
    eligibleCategoryCounts.set(
      candidate.category,
      (eligibleCategoryCounts.get(candidate.category) ?? 0) + 1,
    );
  }
  const eligible = eligibleInputs.flatMap(
    ({
      candidate,
      detail,
      assessment,
      sizeCompatibility,
      licensing,
      eligibility,
      trust,
      popularity: popularityResult,
    }): DetailedEligibleCandidate[] => {
      const utility = scorePlaceUtilityV1({
        eligibility,
        petAccessAssessment: assessment,
        informationTrust: trust,
        popularity: popularityResult,
        preferenceFit: finalPreferenceFit(candidate, detail, input.context),
        categoryPriority: categoryPriority(
          candidate,
          eligibleCategoryCounts,
          input.context,
        ),
        dataQuality: dataQuality(candidate, detail, asOf),
        warningCodes: [
          ...candidate.scheduleCompatibility.warningCodes,
          ...eligibility.warnings,
        ],
      });
      if (!utility) {
        output.skippedCandidates += 1;
        increment(output.excludedByReason, "utility_not_available");
        return [];
      }
      return [{
        ...candidate,
        scheduleDetail: candidate.scheduleDetail ?? detail,
        detail,
        assessment,
        sizeCompatibility,
        licensing,
        eligibility,
        trust,
        popularity: popularityResult,
        utility,
      }];
    },
  );
  output.eligibleCount = eligible.length;
  const candidates = eligible
    .sort(compareFinalEligibleCandidatesV1)
    .slice(0, CANDIDATE_PIPELINE_V1_CONFIG.finalEligibleLimit);
  const finalCandidateIds = new Set(candidates.map(({ contentId }) => contentId));
  for (const candidate of eligible) {
    traceCandidate(input, {
      contentId: candidate.contentId,
      category: candidate.category,
      stage: "final_pool",
      outcome: finalCandidateIds.has(candidate.contentId) ? "eligible" : "excluded",
      reasonCodes: finalCandidateIds.has(candidate.contentId)
        ? []
        : ["final_eligible_limit"],
      warningCodes: candidate.utility.warningCodes,
    });
  }
  output.skippedCandidates += Math.max(0, eligible.length - candidates.length);
  output.finalEligibleCount = candidates.length;
  for (const candidate of candidates) increment(output.categoryDistribution, candidate.category);
  // Concurrent provider completion must not leak into serialized diagnostic order.
  output.detailCallsByOperation = sortedCounter(output.detailCallsByOperation);
  output.excludedByReason = sortedCounter(output.excludedByReason);
  output.warningsByReason = sortedCounter(output.warningsByReason);
  output.categoryDistribution = sortedCounter(output.categoryDistribution);
  const reasonCounts = { ...output.excludedByReason };
  const status =
    candidates.length >= input.context.minStops
      ? "ready"
      : candidates.length === 0 && output.providerUnavailableCandidates > 0
        ? "provider_unavailable"
        : "insufficient_eligible_places";
  return {
    status,
    eligibleCount: candidates.length,
    requiredMinimum: input.context.minStops,
    eligiblePoolTarget: target,
    reasonCounts,
    candidates,
    diagnostics: output,
  };
}
