import "server-only";

import { createClient } from "@supabase/supabase-js";
import { CollectionRepositoryError } from "@/lib/kakao/collection/errors";
import type {
  CheckpointKakaoCollectionQueryInput,
  KakaoCollectionRepository,
  KakaoCollectionRunId,
  KakaoCollectionRunAggregate,
  ResumeKakaoCollectionRunInput,
  StartKakaoCollectionRunInput,
} from "@/lib/kakao/collection/repository";
import type { KakaoCollectionSummary } from "@/lib/kakao/collection/runner";

const PETPASS_SUPABASE_PROJECT_REF = "inucorualcworpzqxjiu";
const KAKAO_BUSAN_COLLECTOR_VERSION = "kakao-busan-collector-v1";
const KAKAO_BUSAN_REGION_ID = "busan";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new CollectionRepositoryError();
  return value;
}

function petPassSupabaseUrl(): string {
  const value = requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CollectionRepositoryError();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${PETPASS_SUPABASE_PROJECT_REF}.supabase.co`
  ) {
    throw new CollectionRepositoryError();
  }
  return url.origin;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function runId(value: unknown): KakaoCollectionRunId | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function safeRunId(value: KakaoCollectionRunId): string {
  const normalized = String(value).trim();
  if (!/^\d+$/u.test(normalized)) throw new CollectionRepositoryError();
  return normalized;
}

export function toKakaoCatalogCandidatePayload(
  input: CheckpointKakaoCollectionQueryInput,
): Array<Record<string, string | number | null>> {
  return input.candidates.map(({ candidate, page, resultRank }) => ({
    provider_place_id: candidate.providerPlaceId,
    name: candidate.name,
    category_name: candidate.categoryName,
    category_group_code: candidate.categoryGroupCode ?? null,
    category_group_name: candidate.categoryGroupName ?? null,
    normalized_category: candidate.normalizedCategory,
    candidate_kind: candidate.candidateKind,
    lot_address: candidate.addressName,
    road_address: candidate.roadAddressName ?? null,
    district_code: candidate.district.code,
    district_name: candidate.district.name,
    longitude: candidate.coordinates.longitude,
    latitude: candidate.coordinates.latitude,
    phone: candidate.phone ?? null,
    source_url: candidate.placeUrl,
    page,
    result_rank: resultRank,
    discovered_at: input.completedAt,
  }));
}

function sanitizedErrorSummary(summary: KakaoCollectionSummary): string {
  return JSON.stringify({
    status: summary.status,
    completedQueryCount: summary.completedQueryCount,
    providerCallsThisExecution: summary.providerCallsThisExecution,
    provider429Count: summary.rateLimitCount,
    timeoutCount: summary.timeoutCount,
    providerErrorCount: summary.providerErrorCount,
    queryFailures: summary.queryFailures,
  }).slice(0, 1_000);
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function createSupabaseKakaoCollectionRepository(): KakaoCollectionRepository {
  const supabase = createClient(
    petPassSupabaseUrl(),
    requiredEnvironmentValue("SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { headers: { "X-Client-Info": "petpass-kakao-collector-v1" } },
    },
  );

  async function startRun(input: StartKakaoCollectionRunInput) {
    const startedAt = new Date().toISOString();
    const queryRows = input.queries.map((query) => ({
      query_key: query.key,
      query_text: query.text,
      district_code: query.district.code,
      district: query.district.name,
      candidate_kind: query.candidateKind,
      normalized_category: query.categoryHint ?? null,
      category_group_code: query.categoryGroupCode ?? null,
    }));
    const startFunction = input.registryVersion === "kakao-busan-query-registry-v2"
      ? "start_kakao_catalog_delta_run_v2"
      : "start_kakao_catalog_run_v1";
    const { data, error } = await supabase.rpc(
      startFunction,
      {
        p_registry_version: input.registryVersion,
        p_collector_version: KAKAO_BUSAN_COLLECTOR_VERSION,
        p_queries: queryRows,
        p_is_full_catalog_run: input.isFullCatalogRun,
        p_started_at: startedAt,
      },
    );
    const row = Array.isArray(data) ? record(data[0]) : record(data);
    const id = runId(row?.run_id);
    const plannedQueryCount = nonnegativeInteger(row?.planned_query_count);
    if (
      error ||
      id === null ||
      plannedQueryCount !== input.plannedQueryCount
    ) {
      throw new CollectionRepositoryError();
    }

    return {
      runId: id,
      completedQueryKeys: new Set<string>(),
      providerCallCount: 0,
      provider429Count: 0,
      timeoutCount: 0,
      providerErrorCount: 0,
    };
  }

  async function resumeRun(input: ResumeKakaoCollectionRunInput) {
    const requestedRunId = safeRunId(input.runId);
    const { data, error } = await supabase
      .from("map_ingest_runs")
      .select(
        "id,provider,status,registry_version,planned_query_count,provider_call_count,provider_429_count,timeout_count,provider_error_count",
      )
      .eq("id", requestedRunId)
      .eq("region_id", KAKAO_BUSAN_REGION_ID)
      .eq("provider", "kakao")
      .single();
    const row = record(data);
    const id = runId(row?.id);
    const plannedQueryCount = nonnegativeInteger(row?.planned_query_count);
    const providerCallCount = nonnegativeInteger(row?.provider_call_count);
    const provider429Count = nonnegativeInteger(row?.provider_429_count);
    const timeoutCount = nonnegativeInteger(row?.timeout_count);
    const providerErrorCount = nonnegativeInteger(row?.provider_error_count);
    if (
      error ||
      id === null ||
      row?.registry_version !== input.registryVersion ||
      plannedQueryCount !== input.plannedQueryCount ||
      providerCallCount === null ||
      provider429Count === null ||
      timeoutCount === null ||
      providerErrorCount === null ||
      row?.status !== "partial" &&
      row?.status !== "running" &&
      row?.status !== "failed"
    ) {
      throw new CollectionRepositoryError();
    }

    const { data: queryData, error: queryError } = await supabase
      .from("map_ingest_run_queries")
      .select("query_key,status")
      .eq("region_id", KAKAO_BUSAN_REGION_ID)
      .eq("collection_run_id", id);
    if (queryError || !Array.isArray(queryData)) {
      throw new CollectionRepositoryError();
    }
    const plannedKeys = new Set(input.plannedQueryKeys);
    const storedRows = queryData
      .map(record)
      .filter((value): value is Record<string, unknown> => value !== null);
    if (
      storedRows.length !== plannedKeys.size ||
      storedRows.some(
        (queryRow) =>
          typeof queryRow.query_key !== "string" ||
          !plannedKeys.has(queryRow.query_key),
      )
    ) {
      throw new CollectionRepositoryError();
    }
    const completedQueryKeys = new Set(
      storedRows
        .filter((queryRow) => queryRow.status === "completed")
        .map((queryRow) => queryRow.query_key as string),
    );

    if (row.status === "partial" || row.status === "failed") {
      const { error: updateError } = await supabase
        .from("map_ingest_runs")
        .update({
          status: "running",
          completed_at: null,
          sanitized_error_summary: null,
        })
        .eq("id", id)
        .eq("region_id", KAKAO_BUSAN_REGION_ID)
        .eq("status", row.status);
      if (updateError) throw new CollectionRepositoryError();
    }

    return {
      runId: id,
      completedQueryKeys,
      providerCallCount,
      provider429Count,
      timeoutCount,
      providerErrorCount,
    };
  }

  async function checkpointQuery(input: CheckpointKakaoCollectionQueryInput) {
    const { stats } = input;
    const { error } = await supabase.rpc("commit_kakao_catalog_query_v1", {
      p_run_id: safeRunId(input.runId),
      p_query_key: input.query.key,
      p_candidates: toKakaoCatalogCandidatePayload(input),
      p_last_completed_page: stats.lastCompletedPage,
      p_provider_call_count: stats.providerCallCount,
      p_provider_result_count: stats.providerResultCount,
      p_accepted_result_count: stats.acceptedResultCount,
      p_rejected_result_count: stats.rejectedResultCount,
      p_saturated: stats.saturated,
      p_duplicate_result_count: stats.duplicateResultCount,
      p_out_of_district_result_count: stats.outOfDistrictResultCount,
      p_invalid_coordinate_result_count: stats.invalidCoordinateResultCount,
      p_classification_rejection_count: stats.classificationRejectionCount,
      p_provider_429_count: stats.provider429Count,
      p_timeout_count: stats.timeoutCount,
      p_provider_error_count: stats.providerErrorCount,
      p_run_provider_call_count: input.runProviderCallCount,
      p_run_provider_429_count: input.runProvider429Count,
      p_run_timeout_count: input.runTimeoutCount,
      p_run_provider_error_count: input.runProviderErrorCount,
      p_completed_at: input.completedAt,
    });
    if (error) throw new CollectionRepositoryError();
  }

  async function loadRunAggregate(
    id: KakaoCollectionRunId,
  ): Promise<KakaoCollectionRunAggregate> {
    const { data, error } = await supabase
      .from("map_ingest_runs")
      .select(
        "completed_query_count,provider_call_count,provider_result_count,accepted_result_count,duplicate_result_count,out_of_district_result_count,invalid_coordinate_result_count,classification_rejection_count,provider_429_count,timeout_count,provider_error_count,inserted_row_count,updated_row_count,deactivated_row_count,preserved_review_row_count,saturated_query_count,unique_place_count,pet_travel_count,veterinary_count,pet_shop_count",
      )
      .eq("id", safeRunId(id))
      .eq("region_id", KAKAO_BUSAN_REGION_ID)
      .single();
    const run = record(data);
    if (error || !run) throw new CollectionRepositoryError();

    const numericFields = [
      "completed_query_count",
      "provider_call_count",
      "provider_result_count",
      "accepted_result_count",
      "duplicate_result_count",
      "out_of_district_result_count",
      "invalid_coordinate_result_count",
      "classification_rejection_count",
      "provider_429_count",
      "timeout_count",
      "provider_error_count",
      "inserted_row_count",
      "updated_row_count",
      "deactivated_row_count",
      "preserved_review_row_count",
      "saturated_query_count",
      "unique_place_count",
      "pet_travel_count",
      "veterinary_count",
      "pet_shop_count",
    ] as const;
    const counts = Object.fromEntries(
      numericFields.map((field) => [field, nonnegativeInteger(run[field])]),
    ) as Record<(typeof numericFields)[number], number | null>;
    if (numericFields.some((field) => counts[field] === null)) {
      throw new CollectionRepositoryError();
    }

    const normalizedCategoryCounts: Record<string, number> = {};
    const districtCounts: Record<string, number> = {};
    let veterinaryRejectedCount = 0;
    let petShopRejectedCount = 0;
    const { data: queryData, error: queryError } = await supabase
      .from("map_ingest_run_queries")
      .select("candidate_kind,classification_rejection_count")
      .eq("region_id", KAKAO_BUSAN_REGION_ID)
      .eq("collection_run_id", safeRunId(id))
      .eq("status", "completed");
    if (queryError || !Array.isArray(queryData)) {
      throw new CollectionRepositoryError();
    }
    for (const value of queryData) {
      const query = record(value);
      const rejected = nonnegativeInteger(query?.classification_rejection_count);
      if (!query || rejected === null) throw new CollectionRepositoryError();
      if (query.candidate_kind === "veterinary") {
        veterinaryRejectedCount += rejected;
      }
      if (query.candidate_kind === "pet_shop") {
        petShopRejectedCount += rejected;
      }
    }
    const pageSize = 1_000;
    for (let from = 0; ; from += pageSize) {
      const { data: placeData, error: placeError } = await supabase
        .from("map_places")
        .select("normalized_category,district_name")
        .eq("region_id", KAKAO_BUSAN_REGION_ID)
        .eq("provider", "kakao")
        .eq("last_seen_run_id", safeRunId(id))
        .range(from, from + pageSize - 1);
      if (placeError || !Array.isArray(placeData)) {
        throw new CollectionRepositoryError();
      }
      for (const value of placeData) {
        const place = record(value);
        if (!place) continue;
        if (typeof place.normalized_category === "string") {
          increment(normalizedCategoryCounts, place.normalized_category);
        }
        if (typeof place.district_name === "string") {
          increment(districtCounts, place.district_name);
        }
      }
      if (placeData.length < pageSize) break;
    }

    const uniquePlaceCount = counts.unique_place_count as number;
    const acceptedResultCount = counts.accepted_result_count as number;
    return {
      completedQueryCount: counts.completed_query_count as number,
      providerCallCount: counts.provider_call_count as number,
      providerResultCount: counts.provider_result_count as number,
      acceptedResultCount,
      duplicateResultCount: Math.max(
        counts.duplicate_result_count as number,
        acceptedResultCount - uniquePlaceCount,
      ),
      outOfDistrictResultCount:
        counts.out_of_district_result_count as number,
      invalidCoordinateResultCount:
        counts.invalid_coordinate_result_count as number,
      classificationRejectionCount:
        counts.classification_rejection_count as number,
      provider429Count: counts.provider_429_count as number,
      timeoutCount: counts.timeout_count as number,
      providerErrorCount: counts.provider_error_count as number,
      veterinaryRejectedCount,
      petShopRejectedCount,
      insertedRowCount: counts.inserted_row_count as number,
      updatedRowCount: counts.updated_row_count as number,
      deactivatedRowCount: counts.deactivated_row_count as number,
      preservedReviewRowCount: counts.preserved_review_row_count as number,
      saturatedQueryCount: counts.saturated_query_count as number,
      uniquePlaceCount,
      candidateKindCounts: {
        pet_travel_candidate: counts.pet_travel_count as number,
        veterinary: counts.veterinary_count as number,
        pet_shop: counts.pet_shop_count as number,
      },
      normalizedCategoryCounts,
      districtCounts,
    };
  }

  async function finalize(
    id: KakaoCollectionRunId,
    status: "completed" | "partial" | "failed",
    summary: KakaoCollectionSummary,
  ) {
    const { error } = await supabase.rpc("finalize_kakao_catalog_run_v1", {
      p_run_id: safeRunId(id),
      p_status: status,
      p_sanitized_error_summary:
        status === "completed" ? null : sanitizedErrorSummary(summary),
      p_run_provider_call_count: summary.providerCallCount,
      p_run_provider_429_count: summary.rateLimitCount,
      p_run_timeout_count: summary.timeoutCount,
      p_run_provider_error_count: summary.providerErrorCount,
      p_completed_at: new Date().toISOString(),
    });
    if (error) throw new CollectionRepositoryError();
    return loadRunAggregate(id);
  }

  return {
    startRun,
    resumeRun,
    checkpointQuery,
    markPartial: (id, summary) => finalize(id, "partial", summary),
    markFailed: (id, summary) => finalize(id, "failed", summary),
    finalizeCompletedRun: (id, summary) => finalize(id, "completed", summary),
  };
}
