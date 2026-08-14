import "server-only";

import type {
  KakaoCollectionCandidate,
  KakaoCollectionClassificationAdapter,
  KakaoCollectionProvider,
  KakaoCollectionQuery,
  KakaoCollectionQueryCandidate,
} from "@/lib/kakao/collection/contracts";
import {
  CollectionClassificationError,
  CollectionConfigurationError,
  CollectionPlanLimitError,
  CollectionRepositoryError,
  CollectionRequestCapError,
  KakaoCollectionProviderError,
  collectionErrorCode,
  isRetryableCollectionError,
  type CollectionErrorCode,
} from "@/lib/kakao/collection/errors";
import type {
  KakaoCollectionQueryStats,
  KakaoCollectionRepository,
  KakaoCollectionRunAggregate,
  KakaoCollectionRunId,
  KakaoCollectionRunSession,
} from "@/lib/kakao/collection/repository";
import type { KakaoPlaceSearchResult } from "@/types/kakao";
import { BUSAN_COLLECTION_COORDINATE_BOUNDS } from "@/lib/kakao/collection/validation";

export const KAKAO_COLLECTION_LIMITS = {
  concurrency: 2,
  pageSize: 15,
  pageableResultLimit: 45,
  plannedPagesPerQuery: 3,
  requestCap: 1_500,
  maxRetries: 2,
  requestTimeoutMs: 8_000,
  retryBaseDelayMs: 250,
} as const;

export interface KakaoCollectionLimits {
  concurrency: number;
  pageSize: number;
  pageableResultLimit: number;
  plannedPagesPerQuery: number;
  requestCap: number;
  maxRetries: number;
  requestTimeoutMs: number;
  retryBaseDelayMs: number;
}

export type KakaoCollectionExecutionMode = "dry-run" | "apply" | "resume";

export interface KakaoCollectionQueryFailure {
  queryKey: string;
  code: CollectionErrorCode;
}

export interface KakaoCollectionSummary {
  mode: KakaoCollectionExecutionMode;
  status: "completed" | "partial" | "failed";
  registryVersion: string;
  runId?: string | number;
  plannedQueryCount: number;
  completedQueryCount: number;
  providerCallCount: number;
  providerCallsThisExecution: number;
  retryCount: number;
  rateLimitCount: number;
  timeoutCount: number;
  providerErrorCount: number;
  rawResultCount: number;
  classifiedResultCount: number;
  uniqueCandidateCount: number;
  duplicateResultCount: number;
  externalDistrictCount: number;
  invalidCoordinateCount: number;
  classificationRejectedCount: number;
  veterinaryRejectedCount: number;
  petShopRejectedCount: number;
  insertedRowCount: number;
  updatedRowCount: number;
  deactivatedRowCount: number;
  preservedReviewRowCount: number;
  saturatedQueryCount: number;
  supabaseWritePlannedCount: number;
  candidateKindCounts: Record<string, number>;
  normalizedCategoryCounts: Record<string, number>;
  districtCounts: Record<string, number>;
  queryFailures: KakaoCollectionQueryFailure[];
}

export interface ExecuteKakaoCollectionInput {
  mode: KakaoCollectionExecutionMode;
  registryVersion: string;
  queries: readonly KakaoCollectionQuery[];
  provider: KakaoCollectionProvider;
  classification: KakaoCollectionClassificationAdapter;
  repository?: KakaoCollectionRepository;
  resumeRunId?: KakaoCollectionRunId;
  isFullCatalogRun?: boolean;
  limits?: KakaoCollectionLimits;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

interface QueryOutcome extends KakaoCollectionQueryStats {
  candidates: KakaoCollectionQueryCandidate[];
  retryCount: number;
  rawResultCount: number;
  classifiedResultCount: number;
  externalDistrictCount: number;
  invalidCoordinateCount: number;
  classificationRejectedCount: number;
  veterinaryRejectedCount: number;
  petShopRejectedCount: number;
}

export function plannedMaximumProviderCalls(
  queryCount: number,
  limits: KakaoCollectionLimits = KAKAO_COLLECTION_LIMITS,
): number {
  return queryCount * limits.plannedPagesPerQuery;
}

export function assertCollectionPlanWithinCap(
  queryCount: number,
  limits: KakaoCollectionLimits = KAKAO_COLLECTION_LIMITS,
): void {
  const plannedRequests = plannedMaximumProviderCalls(queryCount, limits);
  if (plannedRequests > limits.requestCap) {
    throw new CollectionPlanLimitError(plannedRequests, limits.requestCap);
  }
}

export class PhysicalRequestBudget {
  private consumed: number;

  constructor(
    readonly cap: number,
    initialConsumed = 0,
  ) {
    if (!Number.isInteger(initialConsumed) || initialConsumed < 0) {
      throw new CollectionConfigurationError(
        "기존 provider 호출 수가 올바르지 않습니다.",
      );
    }
    if (initialConsumed > cap) throw new CollectionRequestCapError(cap);
    this.consumed = initialConsumed;
  }

  consume(): number {
    if (this.consumed >= this.cap) {
      throw new CollectionRequestCapError(this.cap);
    }
    this.consumed += 1;
    return this.consumed;
  }

  get used(): number {
    return this.consumed;
  }
}

export async function runWithBoundedRetry<T>(input: {
  operation: () => Promise<T>;
  budget: PhysicalRequestBudget;
  maxRetries: number;
  retryBaseDelayMs: number;
  sleep: (milliseconds: number) => Promise<void>;
  onRetry?: (error: unknown, retryNumber: number) => void;
  onAttempt?: () => void;
}): Promise<T> {
  let retryNumber = 0;
  while (true) {
    input.budget.consume();
    input.onAttempt?.();
    try {
      return await input.operation();
    } catch (error) {
      if (
        !isRetryableCollectionError(error) ||
        retryNumber >= input.maxRetries
      ) {
        throw error;
      }
      retryNumber += 1;
      input.onRetry?.(error, retryNumber);
      const exponentialDelay =
        input.retryBaseDelayMs * 2 ** Math.max(0, retryNumber - 1);
      const retryAfterDelay =
        error instanceof KakaoCollectionProviderError
          ? (error.retryAfterMs ?? 0)
          : 0;
      await input.sleep(Math.max(exponentialDelay, retryAfterDelay));
    }
  }
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function candidateKindPriority(candidate: KakaoCollectionCandidate): number {
  if (candidate.candidateKind === "veterinary") return 3;
  if (candidate.candidateKind === "pet_shop") return 2;
  return 1;
}

const NORMALIZED_CATEGORY_PRIORITY = new Map<string, number>([
  ["cafe", 8],
  ["food", 7],
  ["accommodation", 6],
  ["attraction", 5],
  ["park_walk", 4],
  ["leisure", 3],
  ["camping", 2],
  ["other", 1],
]);

function shouldReplaceCandidate(
  existing: KakaoCollectionCandidate,
  incoming: KakaoCollectionCandidate,
): boolean {
  const kindDifference =
    candidateKindPriority(incoming) - candidateKindPriority(existing);
  if (kindDifference !== 0) return kindDifference > 0;
  const categoryDifference =
    (incoming.normalizedCategory
      ? (NORMALIZED_CATEGORY_PRIORITY.get(incoming.normalizedCategory) ?? 0)
      : 0) -
    (existing.normalizedCategory
      ? (NORMALIZED_CATEGORY_PRIORITY.get(existing.normalizedCategory) ?? 0)
      : 0);
  if (categoryDifference !== 0) return categoryDifference > 0;

  const stableIncoming = [
    incoming.district.code,
    incoming.categoryGroupCode ?? "",
    incoming.categoryName,
    incoming.name,
  ].join("\u0000");
  const stableExisting = [
    existing.district.code,
    existing.categoryGroupCode ?? "",
    existing.categoryName,
    existing.name,
  ].join("\u0000");
  return stableIncoming.localeCompare(stableExisting, "en") < 0;
}

function validCoordinates(result: KakaoPlaceSearchResult): boolean {
  const { longitude, latitude } = result.coordinates;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= BUSAN_COLLECTION_COORDINATE_BOUNDS.west &&
    longitude <= BUSAN_COLLECTION_COORDINATE_BOUNDS.east &&
    latitude >= BUSAN_COLLECTION_COORDINATE_BOUNDS.south &&
    latitude <= BUSAN_COLLECTION_COORDINATE_BOUNDS.north
  );
}

function validCandidate(candidate: KakaoCollectionCandidate): boolean {
  return (
    /^\d{1,128}$/u.test(candidate.providerPlaceId) &&
    candidate.name.trim().length > 0 &&
    candidate.categoryName.trim().length > 0 &&
    candidate.addressName.trim().length > 0 &&
    candidate.district.code.trim().length > 0 &&
    candidate.district.name.trim().length > 0 &&
    candidate.placeUrl ===
      `https://place.map.kakao.com/${candidate.providerPlaceId}` &&
    (candidate.candidateKind === "pet_travel_candidate"
      ? candidate.normalizedCategory !== null
      : candidate.normalizedCategory === null) &&
    Number.isFinite(candidate.coordinates.longitude) &&
    Number.isFinite(candidate.coordinates.latitude)
  );
}

async function collectQuery(input: {
  query: KakaoCollectionQuery;
  provider: KakaoCollectionProvider;
  classification: KakaoCollectionClassificationAdapter;
  limits: KakaoCollectionLimits;
  budget: PhysicalRequestBudget;
  sleep: (milliseconds: number) => Promise<void>;
  onRetry: (error: unknown, retryNumber: number) => void;
}): Promise<QueryOutcome> {
  const candidates = new Map<string, KakaoCollectionQueryCandidate>();
  const outcome: QueryOutcome = {
    candidates: [],
    lastCompletedPage: 0,
    providerCallCount: 0,
    providerResultCount: 0,
    acceptedResultCount: 0,
    rejectedResultCount: 0,
    duplicateResultCount: 0,
    outOfDistrictResultCount: 0,
    invalidCoordinateResultCount: 0,
    classificationRejectionCount: 0,
    provider429Count: 0,
    timeoutCount: 0,
    providerErrorCount: 0,
    saturated: false,
    retryCount: 0,
    rawResultCount: 0,
    classifiedResultCount: 0,
    externalDistrictCount: 0,
    invalidCoordinateCount: 0,
    classificationRejectedCount: 0,
    veterinaryRejectedCount: 0,
    petShopRejectedCount: 0,
  };

  for (let page = 1; page <= input.limits.plannedPagesPerQuery; page += 1) {
    const response = await runWithBoundedRetry({
      operation: () =>
        input.provider.searchPage(
          {
            query: input.query.text,
            page,
            size: input.limits.pageSize,
            categoryGroupCode: input.query.categoryGroupCode,
          },
          { timeoutMs: input.limits.requestTimeoutMs },
        ),
      budget: input.budget,
      maxRetries: input.limits.maxRetries,
      retryBaseDelayMs: input.limits.retryBaseDelayMs,
      sleep: input.sleep,
      onAttempt: () => {
        outcome.providerCallCount += 1;
      },
      onRetry: (error, retryNumber) => {
        outcome.retryCount += 1;
        const code = collectionErrorCode(error);
        if (code === "RATE_LIMITED") outcome.provider429Count += 1;
        if (code === "PROVIDER_TIMEOUT") outcome.timeoutCount += 1;
        if (code === "PROVIDER_SERVER_ERROR" || code === "PROVIDER_ERROR") {
          outcome.providerErrorCount += 1;
        }
        input.onRetry(error, retryNumber);
      },
    });

    outcome.lastCompletedPage = page;
    outcome.providerResultCount += response.results.length;
    outcome.rawResultCount += response.results.length;
    response.results.forEach((result, index) => {
      if (!validCoordinates(result)) {
        outcome.invalidCoordinateCount += 1;
        outcome.invalidCoordinateResultCount += 1;
        outcome.rejectedResultCount += 1;
        return;
      }
      if (!input.classification.validateDistrict(result, input.query)) {
        outcome.externalDistrictCount += 1;
        outcome.outOfDistrictResultCount += 1;
        outcome.rejectedResultCount += 1;
        return;
      }

      const candidate = input.classification.classify(result, input.query);
      if (!candidate) {
        outcome.classificationRejectedCount += 1;
        outcome.classificationRejectionCount += 1;
        outcome.rejectedResultCount += 1;
        if (input.query.candidateKind === "veterinary") {
          outcome.veterinaryRejectedCount += 1;
        }
        if (input.query.candidateKind === "pet_shop") {
          outcome.petShopRejectedCount += 1;
        }
        return;
      }
      if (!validCandidate(candidate)) {
        throw new CollectionClassificationError();
      }

      outcome.classifiedResultCount += 1;
      outcome.acceptedResultCount += 1;
      if (!candidates.has(candidate.providerPlaceId)) {
        candidates.set(candidate.providerPlaceId, {
          candidate,
          page,
          resultRank: index + 1,
        });
      } else {
        outcome.duplicateResultCount += 1;
      }
    });

    const availableResults = Math.min(
      Math.max(0, response.pageableCount),
      input.limits.pageableResultLimit,
    );
    const availablePages = Math.max(
      1,
      Math.ceil(availableResults / input.limits.pageSize),
    );
    if (page === input.limits.plannedPagesPerQuery && !response.isEnd) {
      outcome.saturated = true;
    }
    if (response.isEnd || page >= availablePages) break;
  }

  outcome.candidates = [...candidates.values()];
  return outcome;
}

function emptySummary(
  input: ExecuteKakaoCollectionInput,
): KakaoCollectionSummary {
  return {
    mode: input.mode,
    status: "completed",
    registryVersion: input.registryVersion,
    plannedQueryCount: input.queries.length,
    completedQueryCount: 0,
    providerCallCount: 0,
    providerCallsThisExecution: 0,
    retryCount: 0,
    rateLimitCount: 0,
    timeoutCount: 0,
    providerErrorCount: 0,
    rawResultCount: 0,
    classifiedResultCount: 0,
    uniqueCandidateCount: 0,
    duplicateResultCount: 0,
    externalDistrictCount: 0,
    invalidCoordinateCount: 0,
    classificationRejectedCount: 0,
    veterinaryRejectedCount: 0,
    petShopRejectedCount: 0,
    insertedRowCount: 0,
    updatedRowCount: 0,
    deactivatedRowCount: 0,
    preservedReviewRowCount: 0,
    saturatedQueryCount: 0,
    supabaseWritePlannedCount: 0,
    candidateKindCounts: {},
    normalizedCategoryCounts: {},
    districtCounts: {},
    queryFailures: [],
  };
}

async function openRunSession(
  input: ExecuteKakaoCollectionInput,
): Promise<KakaoCollectionRunSession | undefined> {
  if (input.mode === "dry-run") return undefined;
  if (!input.repository) {
    throw new CollectionConfigurationError(
      "apply/resume 모드에는 Supabase 저장소가 필요합니다.",
    );
  }
  if (input.mode === "apply") {
    return input.repository.startRun({
      registryVersion: input.registryVersion,
      plannedQueryCount: input.queries.length,
      queries: input.queries,
      isFullCatalogRun: input.isFullCatalogRun === true,
    });
  }
  if (input.resumeRunId === undefined || input.resumeRunId === "") {
    throw new CollectionConfigurationError(
      "resume mode requires an explicit collection run ID.",
    );
  }
  return input.repository.resumeRun({
    runId: input.resumeRunId,
    registryVersion: input.registryVersion,
    plannedQueryCount: input.queries.length,
    plannedQueryKeys: input.queries.map((query) => query.key),
  });
}

function repositoryError(): CollectionRepositoryError {
  return new CollectionRepositoryError();
}

function applyRunAggregate(
  summary: KakaoCollectionSummary,
  aggregate: KakaoCollectionRunAggregate | void,
): void {
  if (!aggregate) return;
  summary.completedQueryCount = aggregate.completedQueryCount;
  summary.providerCallCount = aggregate.providerCallCount;
  summary.rawResultCount = aggregate.providerResultCount;
  summary.classifiedResultCount = aggregate.acceptedResultCount;
  summary.uniqueCandidateCount = aggregate.uniquePlaceCount;
  summary.duplicateResultCount = aggregate.duplicateResultCount;
  summary.externalDistrictCount = aggregate.outOfDistrictResultCount;
  summary.invalidCoordinateCount = aggregate.invalidCoordinateResultCount;
  summary.classificationRejectedCount =
    aggregate.classificationRejectionCount;
  summary.rateLimitCount = Math.max(
    summary.rateLimitCount,
    aggregate.provider429Count,
  );
  summary.timeoutCount = Math.max(summary.timeoutCount, aggregate.timeoutCount);
  summary.providerErrorCount = Math.max(
    summary.providerErrorCount,
    aggregate.providerErrorCount,
  );
  summary.veterinaryRejectedCount = aggregate.veterinaryRejectedCount;
  summary.petShopRejectedCount = aggregate.petShopRejectedCount;
  summary.insertedRowCount = aggregate.insertedRowCount;
  summary.updatedRowCount = aggregate.updatedRowCount;
  summary.deactivatedRowCount = aggregate.deactivatedRowCount;
  summary.preservedReviewRowCount = aggregate.preservedReviewRowCount;
  summary.saturatedQueryCount = aggregate.saturatedQueryCount;
  summary.supabaseWritePlannedCount = aggregate.uniquePlaceCount;
  summary.candidateKindCounts = aggregate.candidateKindCounts;
  summary.normalizedCategoryCounts = aggregate.normalizedCategoryCounts;
  summary.districtCounts = aggregate.districtCounts;
}

export async function executeKakaoCollection(
  input: ExecuteKakaoCollectionInput,
): Promise<KakaoCollectionSummary> {
  const limits = input.limits ?? KAKAO_COLLECTION_LIMITS;
  assertCollectionPlanWithinCap(input.queries.length, limits);
  const duplicateQueryKeys = input.queries.filter(
    (query, index) =>
      input.queries.findIndex((candidate) => candidate.key === query.key) !==
      index,
  );
  if (duplicateQueryKeys.length > 0) {
    throw new CollectionConfigurationError("query key가 중복되었습니다.");
  }

  const summary = emptySummary(input);
  const session = await openRunSession(input).catch(() => {
    throw repositoryError();
  });
  if (session) summary.runId = session.runId;
  summary.rateLimitCount = session?.provider429Count ?? 0;
  summary.timeoutCount = session?.timeoutCount ?? 0;
  summary.providerErrorCount = session?.providerErrorCount ?? 0;
  const plannedKeys = new Set(input.queries.map((query) => query.key));
  if (
    session &&
    [...session.completedQueryKeys].some((key) => !plannedKeys.has(key))
  ) {
    throw new CollectionConfigurationError(
      "resume run의 query 범위가 현재 계획과 일치하지 않습니다.",
    );
  }

  const initialProviderCalls = session?.providerCallCount ?? 0;
  const budget = new PhysicalRequestBudget(limits.requestCap);
  const completedKeys = new Set(session?.completedQueryKeys ?? []);
  summary.completedQueryCount = completedKeys.size;
  const pendingQueries = input.queries.filter(
    (query) => !completedKeys.has(query.key),
  );
  const candidatesByProviderPlaceId = new Map<
    string,
    KakaoCollectionCandidate
  >();
  const sleep =
    input.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const now = input.now ?? (() => new Date());
  let cursor = 0;
  let stopForCap = false;

  const mergeOutcome = (outcome: QueryOutcome) => {
    summary.rawResultCount += outcome.rawResultCount;
    summary.classifiedResultCount += outcome.classifiedResultCount;
    summary.externalDistrictCount += outcome.externalDistrictCount;
    summary.invalidCoordinateCount += outcome.invalidCoordinateCount;
    summary.classificationRejectedCount +=
      outcome.classificationRejectedCount;
    summary.veterinaryRejectedCount += outcome.veterinaryRejectedCount;
    summary.petShopRejectedCount += outcome.petShopRejectedCount;
    if (outcome.saturated) summary.saturatedQueryCount += 1;
    for (const { candidate } of outcome.candidates) {
      const existing = candidatesByProviderPlaceId.get(
        candidate.providerPlaceId,
      );
      if (
        !existing ||
        shouldReplaceCandidate(existing, candidate)
      ) {
        candidatesByProviderPlaceId.set(candidate.providerPlaceId, candidate);
      }
    }
  };

  const worker = async () => {
    while (!stopForCap) {
      const index = cursor;
      cursor += 1;
      const query = pendingQueries[index];
      if (!query) return;

      try {
        const outcome = await collectQuery({
          query,
          provider: input.provider,
          classification: input.classification,
          limits,
          budget,
          sleep,
          onRetry: (error) => {
            summary.retryCount += 1;
            const code = collectionErrorCode(error);
            if (code === "RATE_LIMITED") summary.rateLimitCount += 1;
            if (code === "PROVIDER_TIMEOUT") summary.timeoutCount += 1;
            if (
              code === "PROVIDER_SERVER_ERROR" ||
              code === "PROVIDER_ERROR"
            ) {
              summary.providerErrorCount += 1;
            }
          },
        });

        if (input.repository && session) {
          await input.repository
            .checkpointQuery({
              runId: session.runId,
              query,
              candidates: outcome.candidates,
              stats: {
                lastCompletedPage: outcome.lastCompletedPage,
                providerCallCount: outcome.providerCallCount,
                providerResultCount: outcome.providerResultCount,
                acceptedResultCount: outcome.acceptedResultCount,
                rejectedResultCount: outcome.rejectedResultCount,
                duplicateResultCount: outcome.duplicateResultCount,
                outOfDistrictResultCount: outcome.outOfDistrictResultCount,
                invalidCoordinateResultCount:
                  outcome.invalidCoordinateResultCount,
                classificationRejectionCount:
                  outcome.classificationRejectionCount,
                provider429Count: outcome.provider429Count,
                timeoutCount: outcome.timeoutCount,
                providerErrorCount: outcome.providerErrorCount,
                saturated: outcome.saturated,
              },
              runProviderCallCount: initialProviderCalls + budget.used,
              runProvider429Count: summary.rateLimitCount,
              runTimeoutCount: summary.timeoutCount,
              runProviderErrorCount: summary.providerErrorCount,
              completedAt: now().toISOString(),
            })
            .catch(() => {
              throw repositoryError();
            });
        }
        completedKeys.add(query.key);
        summary.completedQueryCount = completedKeys.size;
        mergeOutcome(outcome);
      } catch (error) {
        const code = collectionErrorCode(error);
        summary.queryFailures.push({ queryKey: query.key, code });
        if (code === "RATE_LIMITED") summary.rateLimitCount += 1;
        if (code === "PROVIDER_TIMEOUT") summary.timeoutCount += 1;
        if (
          code === "PROVIDER_ERROR" ||
          code === "PROVIDER_SERVER_ERROR"
        ) {
          summary.providerErrorCount += 1;
        }
        if (code === "REQUEST_CAP_EXCEEDED") stopForCap = true;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(limits.concurrency, pendingQueries.length || 1) },
      () => worker(),
    ),
  );

  summary.providerCallCount = initialProviderCalls + budget.used;
  summary.providerCallsThisExecution = budget.used;
  for (const candidate of candidatesByProviderPlaceId.values()) {
    increment(summary.candidateKindCounts, candidate.candidateKind);
    if (candidate.normalizedCategory !== null) {
      increment(summary.normalizedCategoryCounts, candidate.normalizedCategory);
    }
    increment(summary.districtCounts, candidate.district.name);
  }
  summary.uniqueCandidateCount = candidatesByProviderPlaceId.size;
  summary.duplicateResultCount = Math.max(
    0,
    summary.classifiedResultCount - summary.uniqueCandidateCount,
  );
  summary.supabaseWritePlannedCount = summary.uniqueCandidateCount;
  const fullyCompleted = completedKeys.size === input.queries.length;

  if (fullyCompleted && summary.queryFailures.length === 0) {
    summary.status = "completed";
    if (input.repository && session) {
      try {
        applyRunAggregate(
          summary,
          await input.repository.finalizeCompletedRun(session.runId, summary),
        );
      } catch {
        summary.status = "partial";
        summary.queryFailures.push({
          queryKey: "__reconciliation__",
          code: "SUPABASE_ERROR",
        });
        applyRunAggregate(
          summary,
          await input.repository.markPartial(session.runId, summary).catch(() => {
            throw repositoryError();
          }),
        );
      }
    }
    return summary;
  }

  summary.status = completedKeys.size === 0 ? "failed" : "partial";
  if (input.repository && session) {
    const mark =
      summary.status === "failed"
        ? input.repository.markFailed(session.runId, summary)
        : input.repository.markPartial(session.runId, summary);
    applyRunAggregate(
      summary,
      await mark.catch(() => {
        throw repositoryError();
      }),
    );
  }
  return summary;
}
