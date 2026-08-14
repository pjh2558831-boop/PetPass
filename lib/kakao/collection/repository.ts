import "server-only";

import type {
  KakaoCollectionQuery,
  KakaoCollectionQueryCandidate,
} from "@/lib/kakao/collection/contracts";
import type { KakaoCollectionSummary } from "@/lib/kakao/collection/runner";

export type KakaoCollectionRunId = string | number;

export interface KakaoCollectionRunSession {
  runId: KakaoCollectionRunId;
  completedQueryKeys: ReadonlySet<string>;
  providerCallCount: number;
  provider429Count: number;
  timeoutCount: number;
  providerErrorCount: number;
}

export interface StartKakaoCollectionRunInput {
  registryVersion: string;
  plannedQueryCount: number;
  queries: readonly KakaoCollectionQuery[];
  isFullCatalogRun: boolean;
}

export interface ResumeKakaoCollectionRunInput
  extends Omit<StartKakaoCollectionRunInput, "isFullCatalogRun" | "queries"> {
  runId: KakaoCollectionRunId;
  plannedQueryKeys: readonly string[];
}

export interface CheckpointKakaoCollectionQueryInput {
  runId: KakaoCollectionRunId;
  query: KakaoCollectionQuery;
  candidates: readonly KakaoCollectionQueryCandidate[];
  stats: KakaoCollectionQueryStats;
  runProviderCallCount: number;
  runProvider429Count: number;
  runTimeoutCount: number;
  runProviderErrorCount: number;
  completedAt: string;
}

export interface KakaoCollectionQueryStats {
  lastCompletedPage: number;
  providerCallCount: number;
  providerResultCount: number;
  acceptedResultCount: number;
  rejectedResultCount: number;
  duplicateResultCount: number;
  outOfDistrictResultCount: number;
  invalidCoordinateResultCount: number;
  classificationRejectionCount: number;
  provider429Count: number;
  timeoutCount: number;
  providerErrorCount: number;
  saturated: boolean;
}

export interface KakaoCollectionRunAggregate {
  completedQueryCount: number;
  providerCallCount: number;
  providerResultCount: number;
  acceptedResultCount: number;
  duplicateResultCount: number;
  outOfDistrictResultCount: number;
  invalidCoordinateResultCount: number;
  classificationRejectionCount: number;
  provider429Count: number;
  timeoutCount: number;
  providerErrorCount: number;
  veterinaryRejectedCount: number;
  petShopRejectedCount: number;
  insertedRowCount: number;
  updatedRowCount: number;
  deactivatedRowCount: number;
  preservedReviewRowCount: number;
  saturatedQueryCount: number;
  uniquePlaceCount: number;
  candidateKindCounts: Record<string, number>;
  normalizedCategoryCounts: Record<string, number>;
  districtCounts: Record<string, number>;
}

export interface KakaoCollectionRepository {
  startRun(
    input: StartKakaoCollectionRunInput,
  ): Promise<KakaoCollectionRunSession>;
  resumeRun(
    input: ResumeKakaoCollectionRunInput,
  ): Promise<KakaoCollectionRunSession>;
  checkpointQuery(input: CheckpointKakaoCollectionQueryInput): Promise<void>;
  markPartial(
    runId: KakaoCollectionRunId,
    summary: KakaoCollectionSummary,
  ): Promise<KakaoCollectionRunAggregate | void>;
  markFailed(
    runId: KakaoCollectionRunId,
    summary: KakaoCollectionSummary,
  ): Promise<KakaoCollectionRunAggregate | void>;
  finalizeCompletedRun(
    runId: KakaoCollectionRunId,
    summary: KakaoCollectionSummary,
  ): Promise<KakaoCollectionRunAggregate | void>;
}
