import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  discoverKakaoPlaces,
  rectangleFromCenter,
} from "@/lib/kakao/discovery";
import {
  deduplicateKakaoMapPlaces,
  normalizeKakaoMapPlace,
} from "@/lib/map-places/kakao-ingest";
import type { Database, TablesInsert } from "@/types/database";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import {
  KAKAO_DISCOVERY_CATEGORIES,
  type KakaoDiscoveryCategory,
} from "@/types/kakao";

const COLLECTOR_VERSION = "kakao-busan-district-v2";
const BATCH_SIZE = 100;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function batches<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function run() {
  requiredEnvironmentValue("KAKAO_REST_API_KEY");
  const supabase = createClient<Database>(
    requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironmentValue("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const startedAt = new Date().toISOString();
  const { data: runRow, error: runError } = await supabase
    .from("map_ingest_runs")
    .insert({
      region_id: BUSAN_REGION_CONFIG.id,
      provider: "kakao",
      status: "running",
      collector_version: COLLECTOR_VERSION,
      started_at: startedAt,
    })
    .select("id")
    .single();
  if (runError || !runRow) throw new Error("수집 실행 기록을 시작하지 못했습니다.");

  try {
    const collected: TablesInsert<"map_places">[] = [];
    let attemptedQueryCount = 0;
    let saturatedQueryCount = 0;
    let partial = false;

    for (const district of BUSAN_REGION_CONFIG.districts) {
      for (const category of KAKAO_DISCOVERY_CATEGORIES) {
        const response = await discoverKakaoPlaces({
          category: category as KakaoDiscoveryCategory,
          mode: "district",
          rectangle: rectangleFromCenter(district.searchCenter),
          district: {
            code: district.legalDongDistrictCode,
            name: district.name,
          },
          center: district.searchCenter,
        });
        attemptedQueryCount += response.metadata.externalCallCount;
        saturatedQueryCount += response.metadata.saturated ? 1 : 0;
        partial ||= response.metadata.partial;
        const retrievedAt = new Date().toISOString();
        collected.push(
          ...response.candidates.map((candidate) =>
            normalizeKakaoMapPlace(candidate, category, retrievedAt),
          ),
        );
      }
    }

    const rows = deduplicateKakaoMapPlaces(collected);
    const { data: existing, error: existingError } = await supabase
      .from("map_places")
      .select("provider_place_id")
      .eq("region_id", BUSAN_REGION_CONFIG.id)
      .eq("provider", "kakao");
    if (existingError) throw new Error("기존 카카오 장소 식별자를 조회하지 못했습니다.");
    const existingIds = new Set(
      (existing ?? []).map(({ provider_place_id }) => provider_place_id),
    );

    for (const batch of batches(rows, BATCH_SIZE)) {
      const { error } = await supabase
        .from("map_places")
        .upsert(batch, { onConflict: "provider,provider_place_id" });
      if (error) throw new Error("카카오 장소를 저장하지 못했습니다.");
    }

    const insertedRowCount = rows.filter(
      ({ provider_place_id }) => !existingIds.has(provider_place_id),
    ).length;
    const completedAt = new Date().toISOString();
    let deactivatedRowCount = 0;
    if (!partial) {
      const { data: deactivated, error: deactivateError } = await supabase
        .from("map_places")
        .update({ is_active: false, updated_at: completedAt })
        .eq("region_id", BUSAN_REGION_CONFIG.id)
        .eq("provider", "kakao")
        .eq("is_active", true)
        .lt("fetched_at", startedAt)
        .select("id");
      if (deactivateError) {
        throw new Error("더 이상 발견되지 않는 카카오 장소를 비활성화하지 못했습니다.");
      }
      deactivatedRowCount = deactivated?.length ?? 0;
    }
    const { error: completionError } = await supabase
      .from("map_ingest_runs")
      .update({
        status: partial ? "partial" : "completed",
        completed_at: completedAt,
        attempted_query_count: attemptedQueryCount,
        discovered_row_count: rows.length,
        inserted_row_count: insertedRowCount,
        updated_row_count: rows.length - insertedRowCount,
        deactivated_row_count: deactivatedRowCount,
        saturated_query_count: saturatedQueryCount,
      })
      .eq("region_id", BUSAN_REGION_CONFIG.id)
      .eq("id", runRow.id);
    if (completionError) throw new Error("수집 완료 기록을 저장하지 못했습니다.");

    console.log(
      JSON.stringify({
        status: partial ? "partial" : "completed",
        stored: rows.length,
        inserted: insertedRowCount,
        updated: rows.length - insertedRowCount,
        deactivated: deactivatedRowCount,
        externalCalls: attemptedQueryCount,
        saturatedSearches: saturatedQueryCount,
      }),
    );
  } catch (error) {
    await supabase
      .from("map_ingest_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        sanitized_error_summary:
          error instanceof Error ? error.message.slice(0, 300) : "수집 실패",
      })
      .eq("region_id", BUSAN_REGION_CONFIG.id)
      .eq("id", runRow.id);
    throw error;
  }
}

void run();
