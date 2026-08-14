import { describe, expect, it, vi } from "vitest";
import type {
  KakaoCollectionCandidate,
  KakaoCollectionClassificationAdapter,
  KakaoCollectionProvider,
  KakaoCollectionQuery,
} from "@/lib/kakao/collection/contracts";
import {
  CollectionPlanLimitError,
  KakaoCollectionProviderError,
} from "@/lib/kakao/collection/errors";
import type {
  CheckpointKakaoCollectionQueryInput,
  KakaoCollectionRepository,
  KakaoCollectionRunAggregate,
} from "@/lib/kakao/collection/repository";
import {
  KAKAO_COLLECTION_LIMITS,
  PhysicalRequestBudget,
  assertCollectionPlanWithinCap,
  executeKakaoCollection,
  runWithBoundedRetry,
} from "@/lib/kakao/collection/runner";
import type { KakaoPlaceSearchResult } from "@/types/kakao";

function query(key: string): KakaoCollectionQuery {
  return {
    key,
    text: `query ${key}`,
    district: { code: "500", name: "district" },
    family: "general",
    candidateKind: "pet_travel_candidate",
    categoryHint: "other",
  };
}

function result(id: string): KakaoPlaceSearchResult {
  return {
    id,
    name: `place ${id}`,
    address: "Busan district 1",
    categoryName: "Cafe",
    coordinates: { longitude: 129.1, latitude: 35.1 },
  };
}

function candidate(value: KakaoPlaceSearchResult): KakaoCollectionCandidate {
  return {
    providerPlaceId: value.id,
    name: value.name,
    categoryName: value.categoryName ?? "Category",
    addressName: value.address,
    coordinates: value.coordinates,
    district: { code: "500", name: "district" },
    candidateKind: "pet_travel_candidate",
    normalizedCategory: "other",
    placeUrl: `https://place.map.kakao.com/${value.id}`,
  };
}

const classification: KakaoCollectionClassificationAdapter = {
  validateDistrict: () => true,
  classify: (value) => candidate(value),
};

function repository(input: {
  completed?: string[];
  providerCallCount?: number;
  provider429Count?: number;
  timeoutCount?: number;
  providerErrorCount?: number;
  aggregate?: KakaoCollectionRunAggregate;
} = {}): {
  value: KakaoCollectionRepository;
  checkpoints: CheckpointKakaoCollectionQueryInput[];
  finalized: ReturnType<typeof vi.fn>;
  partial: ReturnType<typeof vi.fn>;
} {
  const checkpoints: CheckpointKakaoCollectionQueryInput[] = [];
  const finalized = vi.fn(async () => input.aggregate);
  const partial = vi.fn(async () => undefined);
  return {
    checkpoints,
    finalized,
    partial,
    value: {
      startRun: async () => ({
        runId: "run-1",
        completedQueryKeys: new Set(),
        providerCallCount: 0,
        provider429Count: input.provider429Count ?? 0,
        timeoutCount: input.timeoutCount ?? 0,
        providerErrorCount: input.providerErrorCount ?? 0,
      }),
      resumeRun: async () => ({
        runId: "run-1",
        completedQueryKeys: new Set(input.completed ?? []),
        providerCallCount: input.providerCallCount ?? 1,
        provider429Count: input.provider429Count ?? 0,
        timeoutCount: input.timeoutCount ?? 0,
        providerErrorCount: input.providerErrorCount ?? 0,
      }),
      checkpointQuery: async (checkpoint) => {
        checkpoints.push(checkpoint);
      },
      markPartial: partial,
      markFailed: vi.fn(async () => undefined),
      finalizeCompletedRun: finalized,
    },
  };
}

describe("Kakao collection request limits and retry", () => {
  it("allows a 1,500-call plan and rejects a 1,503-call plan", () => {
    expect(() => assertCollectionPlanWithinCap(500)).not.toThrow();
    expect(() => assertCollectionPlanWithinCap(501)).toThrow(
      CollectionPlanLimitError,
    );
  });

  it("counts every retry as a physical request, stops after two retries, and honors Retry-After", async () => {
    const budget = new PhysicalRequestBudget(10);
    const sleep = vi.fn(async (milliseconds: number) => {
      void milliseconds;
    });
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new KakaoCollectionProviderError("RATE_LIMITED", true, 429, 900),
      )
      .mockRejectedValueOnce(
        new KakaoCollectionProviderError("PROVIDER_SERVER_ERROR", true, 503),
      )
      .mockResolvedValue("ok");

    await expect(
      runWithBoundedRetry({
        operation,
        budget,
        maxRetries: 2,
        retryBaseDelayMs: 250,
        sleep,
      }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(budget.used).toBe(3);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
      900,
      500,
    ]);
  });

  it("does not exceed the physical cap while attempting a retry", async () => {
    const budget = new PhysicalRequestBudget(2);
    const operation = vi.fn(async () => {
      throw new KakaoCollectionProviderError("PROVIDER_SERVER_ERROR", true, 503);
    });
    await expect(
      runWithBoundedRetry({
        operation,
        budget,
        maxRetries: 2,
        retryBaseDelayMs: 0,
        sleep: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: "REQUEST_CAP_EXCEEDED" });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(budget.used).toBe(2);
  });
});

describe("Kakao collection checkpoint and resume semantics", () => {
  it("checkpoints a completed zero-result query before final reconciliation", async () => {
    const store = repository();
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => ({
        results: [],
        totalCount: 0,
        pageableCount: 0,
        isEnd: true,
      })),
    };
    const summary = await executeKakaoCollection({
      mode: "apply",
      registryVersion: "v1",
      queries: [query("q1")],
      provider,
      classification,
      repository: store.value,
    });

    expect(summary).toMatchObject({
      status: "completed",
      completedQueryCount: 1,
      providerCallCount: 1,
      uniqueCandidateCount: 0,
    });
    expect(store.checkpoints).toHaveLength(1);
    expect(store.checkpoints[0].candidates).toEqual([]);
    expect(store.checkpoints[0].stats).toMatchObject({
      lastCompletedPage: 1,
      providerCallCount: 1,
      providerResultCount: 0,
      acceptedResultCount: 0,
      rejectedResultCount: 0,
    });
    expect(store.finalized).toHaveBeenCalledOnce();
  });

  it("counts coordinates outside the Busan rectangle as invalid, not out-of-district", async () => {
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => ({
        results: [
          result("1"),
          { ...result("2"), coordinates: { longitude: 127, latitude: 37.5 } },
        ],
        totalCount: 2,
        pageableCount: 2,
        isEnd: true,
      })),
    };
    const summary = await executeKakaoCollection({
      mode: "dry-run",
      registryVersion: "v1",
      queries: [query("q1")],
      provider,
      classification,
    });

    expect(summary.invalidCoordinateCount).toBe(1);
    expect(summary.externalDistrictCount).toBe(0);
    expect(summary.uniqueCandidateCount).toBe(1);
  });

  it("reports saturated dry-run queries while DB mutation counts stay zero", async () => {
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => ({
        results: [],
        totalCount: 100,
        pageableCount: 45,
        isEnd: false,
      })),
    };
    const summary = await executeKakaoCollection({
      mode: "dry-run",
      registryVersion: "v1",
      queries: [query("q1")],
      provider,
      classification,
    });

    expect(summary).toMatchObject({
      providerCallsThisExecution: 3,
      saturatedQueryCount: 1,
      insertedRowCount: 0,
      updatedRowCount: 0,
      deactivatedRowCount: 0,
      preservedReviewRowCount: 0,
    });
  });

  it("checkpoints retry and 429 counts per query instead of the global budget", async () => {
    const store = repository();
    const provider: KakaoCollectionProvider = {
      searchPage: vi
        .fn<KakaoCollectionProvider["searchPage"]>()
        .mockRejectedValueOnce(
          new KakaoCollectionProviderError("RATE_LIMITED", true, 429),
        )
        .mockResolvedValue({
          results: [result("1")],
          totalCount: 1,
          pageableCount: 1,
          isEnd: true,
        }),
    };
    const summary = await executeKakaoCollection({
      mode: "apply",
      registryVersion: "v1",
      queries: [query("q1")],
      provider,
      classification,
      repository: store.value,
      sleep: async () => undefined,
    });

    expect(summary.providerCallsThisExecution).toBe(2);
    expect(store.checkpoints[0].stats).toMatchObject({
      providerCallCount: 2,
      provider429Count: 1,
      providerResultCount: 1,
      acceptedResultCount: 1,
    });
  });

  it("stores result rank within each page instead of a global rank", async () => {
    const store = repository();
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async ({ page }) => ({
        results: [result(String(page))],
        totalCount: 30,
        pageableCount: 30,
        isEnd: page === 2,
      })),
    };
    await executeKakaoCollection({
      mode: "apply",
      registryVersion: "v1",
      queries: [query("q1")],
      provider,
      classification,
      repository: store.value,
    });

    expect(
      store.checkpoints[0].candidates.map(({ page, resultRank }) => ({
        page,
        resultRank,
      })),
    ).toEqual([
      { page: 1, resultRank: 1 },
      { page: 2, resultRank: 1 },
    ]);
  });

  it("skips checkpointed queries on resume and keeps a failed run partial without reconciliation", async () => {
    const store = repository({ completed: ["q1"] });
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => {
        throw new KakaoCollectionProviderError("PROVIDER_ERROR", false, 400);
      }),
    };
    const summary = await executeKakaoCollection({
      mode: "resume",
      resumeRunId: "run-1",
      registryVersion: "v1",
      queries: [query("q1"), query("q2")],
      provider,
      classification,
      repository: store.value,
    });

    expect(provider.searchPage).toHaveBeenCalledOnce();
    expect(store.checkpoints).toEqual([]);
    expect(summary.status).toBe("partial");
    expect(summary.completedQueryCount).toBe(1);
    expect(store.finalized).not.toHaveBeenCalled();
    expect(store.partial).toHaveBeenCalledOnce();
  });

  it("uses a fresh per-invocation request budget when resuming a cumulative 1,500-call run", async () => {
    const store = repository({ providerCallCount: 1_500 });
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => ({
        results: [],
        totalCount: 0,
        pageableCount: 0,
        isEnd: true,
      })),
    };
    const summary = await executeKakaoCollection({
      mode: "resume",
      resumeRunId: "run-1",
      registryVersion: "v1",
      queries: [query("q1")],
      provider,
      classification,
      repository: store.value,
    });

    expect(summary.providerCallCount).toBe(1_501);
    expect(summary.providerCallsThisExecution).toBe(1);
    expect(store.checkpoints[0].stats.providerCallCount).toBe(1);
    expect(store.checkpoints[0].runProviderCallCount).toBe(1_501);
  });

  it("preserves cumulative run error counters across a failed resume", async () => {
    const store = repository({
      providerCallCount: 10,
      provider429Count: 2,
      timeoutCount: 1,
      providerErrorCount: 3,
    });
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => {
        throw new KakaoCollectionProviderError("PROVIDER_ERROR", false, 400);
      }),
    };
    const summary = await executeKakaoCollection({
      mode: "resume",
      resumeRunId: "run-1",
      registryVersion: "v1",
      queries: [query("q1")],
      provider,
      classification,
      repository: store.value,
    });

    expect(summary).toMatchObject({
      status: "failed",
      providerCallCount: 11,
      providerCallsThisExecution: 1,
      rateLimitCount: 2,
      timeoutCount: 1,
      providerErrorCount: 4,
    });
  });

  it("reports whole-run aggregates after a completed resume while retaining invocation calls", async () => {
    const aggregate: KakaoCollectionRunAggregate = {
      completedQueryCount: 2,
      providerCallCount: 11,
      providerResultCount: 80,
      acceptedResultCount: 60,
      duplicateResultCount: 10,
      outOfDistrictResultCount: 5,
      invalidCoordinateResultCount: 2,
      classificationRejectionCount: 13,
      provider429Count: 1,
      timeoutCount: 2,
      providerErrorCount: 3,
      veterinaryRejectedCount: 4,
      petShopRejectedCount: 5,
      insertedRowCount: 20,
      updatedRowCount: 30,
      deactivatedRowCount: 7,
      preservedReviewRowCount: 9,
      saturatedQueryCount: 6,
      uniquePlaceCount: 50,
      candidateKindCounts: {
        pet_travel_candidate: 40,
        veterinary: 5,
        pet_shop: 5,
      },
      normalizedCategoryCounts: { cafe: 40 },
      districtCounts: { district: 50 },
    };
    const store = repository({
      completed: ["q1"],
      providerCallCount: 10,
      aggregate,
    });
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => ({
        results: [],
        totalCount: 0,
        pageableCount: 0,
        isEnd: true,
      })),
    };
    const summary = await executeKakaoCollection({
      mode: "resume",
      resumeRunId: "run-1",
      registryVersion: "v1",
      queries: [query("q1"), query("q2")],
      provider,
      classification,
      repository: store.value,
    });

    expect(summary).toMatchObject({
      status: "completed",
      providerCallsThisExecution: 1,
      providerCallCount: 11,
      rawResultCount: 80,
      uniqueCandidateCount: 50,
      insertedRowCount: 20,
      updatedRowCount: 30,
      deactivatedRowCount: 7,
      preservedReviewRowCount: 9,
      saturatedQueryCount: 6,
      candidateKindCounts: aggregate.candidateKindCounts,
      normalizedCategoryCounts: aggregate.normalizedCategoryCounts,
      districtCounts: aggregate.districtCounts,
    });
  });

  it("never runs more than two provider requests concurrently", async () => {
    let active = 0;
    let maximum = 0;
    let nextProviderId = 1;
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        await Promise.resolve();
        active -= 1;
        return {
          results: [result(String(nextProviderId++))],
          totalCount: 1,
          pageableCount: 1,
          isEnd: true,
        };
      }),
    };
    await executeKakaoCollection({
      mode: "dry-run",
      registryVersion: "v1",
      queries: [query("q1"), query("q2"), query("q3"), query("q4")],
      provider,
      classification,
      limits: { ...KAKAO_COLLECTION_LIMITS, concurrency: 2 },
    });
    expect(maximum).toBe(2);
  });

  it("deduplicates cross-query IDs with deterministic veterinary precedence", async () => {
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => ({
        results: [result("777")],
        totalCount: 1,
        pageableCount: 1,
        isEnd: true,
      })),
    };
    const precedenceClassification: KakaoCollectionClassificationAdapter = {
      validateDistrict: () => true,
      classify: (value, sourceQuery) => ({
        ...candidate(value),
        candidateKind: sourceQuery.candidateKind,
        normalizedCategory:
          sourceQuery.candidateKind === "pet_travel_candidate"
            ? "other"
            : null,
      }),
    };
    const veterinaryQuery: KakaoCollectionQuery = {
      ...query("vet"),
      candidateKind: "veterinary",
      family: "veterinary",
      categoryHint: null,
    };
    const summary = await executeKakaoCollection({
      mode: "dry-run",
      registryVersion: "v1",
      queries: [query("travel"), veterinaryQuery],
      provider,
      classification: precedenceClassification,
    });

    expect(summary.uniqueCandidateCount).toBe(1);
    expect(summary.duplicateResultCount).toBe(1);
    expect(summary.candidateKindCounts).toEqual({ veterinary: 1 });
    expect(summary.normalizedCategoryCounts).toEqual({});
  });

  it("uses deterministic category precedence for duplicate travel candidates", async () => {
    const provider: KakaoCollectionProvider = {
      searchPage: vi.fn(async () => ({
        results: [result("888")],
        totalCount: 1,
        pageableCount: 1,
        isEnd: true,
      })),
    };
    const categoryClassification: KakaoCollectionClassificationAdapter = {
      validateDistrict: () => true,
      classify: (value, sourceQuery) => ({
        ...candidate(value),
        normalizedCategory: sourceQuery.categoryHint ?? "other",
      }),
    };
    const cafeQuery: KakaoCollectionQuery = {
      ...query("cafe"),
      family: "cafe",
      categoryHint: "cafe",
    };
    const summary = await executeKakaoCollection({
      mode: "dry-run",
      registryVersion: "v1",
      queries: [query("general"), cafeQuery],
      provider,
      classification: categoryClassification,
    });

    expect(summary.uniqueCandidateCount).toBe(1);
    expect(summary.normalizedCategoryCounts).toEqual({ cafe: 1 });
  });
});
