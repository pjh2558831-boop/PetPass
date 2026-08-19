import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KAKAO_BUSAN_QUERY_COUNT,
  KAKAO_BUSAN_QUERY_TEMPLATES,
} from "@/lib/kakao/collection/query-registry-v1";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260814161532_kakao_busan_catalog_v1.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const providerVisibilitySql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260814161159_add_provider_visibility.sql",
  ),
  "utf8",
);

describe("Kakao Busan catalog migration", () => {
  it("uses distinct provider visibility value and provider constraints", () => {
    expect(providerVisibilitySql).toContain(
      "constraint map_places_provider_visibility_value_check check",
    );
    expect(providerVisibilitySql).toContain(
      "constraint map_places_provider_visibility_check check",
    );
    expect(
      providerVisibilitySql.match(
        /constraint map_places_provider_visibility_check check/gu,
      ),
    ).toHaveLength(1);
  });

  it("extends shared storage and creates durable query provenance", () => {
    expect(sql).toContain("alter table public.map_places");
    expect(sql).toContain("alter table public.map_ingest_runs");
    expect(sql).not.toContain("create table public.kakao_place_candidates");
    expect(sql).not.toContain("create table public.kakao_collection_runs");
    expect(sql).toContain("create table public.map_ingest_run_queries");
    expect(sql).toContain("create table public.map_place_query_hits");
    expect(sql).toContain("map_ingest_run_queries_identity_key unique");
    expect(sql).toContain("map_place_query_hits_identity_key unique");
    const openRunIndex = sql.slice(
      sql.indexOf("map_ingest_runs_one_open_kakao_catalog_v1_idx"),
      sql.indexOf("alter table public.map_places"),
    );
    expect(openRunIndex).toContain("status in ('planned', 'running', 'partial')");
    expect(openRunIndex).not.toContain("is_full_catalog_run");
  });

  it("persists zero-result completion and gates partial-run publication", () => {
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("last_completed_page = p_last_completed_page");
    expect(sql).toContain("pending_publication_run_id = p_run_id");
    expect(sql).toContain("and pending_publication_run_id is null");
    expect(sql).toContain("and place.pending_publication_run_id is null");
    expect(sql).toContain("p_status = 'completed'");
    expect(sql).toContain("pending_publication_run_id = null,");
    expect(sql).toContain("last_seen_at < v_run.started_at");
    expect(sql).toContain(
      "public_visibility is distinct from (review_status = 'confirmed')",
    );
  });

  it("locks district identity and preserves review data during upsert", () => {
    expect(sql).toContain("map_places_pending_publication_run_fkey");
    expect(sql).toContain("('440', '강서구')");
    expect(sql).toContain("('710', '기장군')");
    const conflictStart = sql.indexOf(
      "on conflict (provider, provider_place_id) do update",
    );
    const conflictEnd = sql.indexOf("with parsed as (", conflictStart);
    const conflictUpdate = sql.slice(conflictStart, conflictEnd);
    expect(conflictUpdate).toContain(
      "when winner.candidate_kind = 'veterinary' then 300",
    );
    expect(conflictUpdate).toContain(
      "when winner.candidate_kind = 'pet_shop' then 200",
    );
    expect(conflictUpdate).toContain("when 'cafe' then 8");
    expect(conflictUpdate).toContain("winner.category_group_code");
    expect(conflictUpdate).toContain("winner.is_incoming asc");
    expect(conflictUpdate).not.toMatch(/^\s*review_status\s*=/mu);
    expect(conflictUpdate).not.toMatch(/^\s*reviewed_at\s*=/mu);
    expect(conflictUpdate).not.toMatch(/^\s*reviewed_by\s*=/mu);
    expect(conflictUpdate).not.toMatch(/^\s*review_note\s*=/mu);
    expect(conflictUpdate).not.toMatch(/^\s*verification_evidence\s*=/mu);
    expect(conflictUpdate).not.toMatch(
      /when map_places\.review_status = 'confirmed' then true/u,
    );
    expect(conflictUpdate).toContain(
      "when map_places.pending_publication_run_id is null then null",
    );
    expect(conflictUpdate).toContain(
      "lifecycle_status = map_places.lifecycle_status",
    );
    expect(conflictUpdate).toContain(
      "requires_recheck = map_places.requires_recheck",
    );
  });

  it("creates functions before grants and keeps writes service-only", () => {
    const functionNames = [
      "start_kakao_catalog_run_v1",
      "commit_kakao_catalog_query_v1",
      "finalize_kakao_catalog_run_v1",
      "get_public_map_catalog_v1",
      "get_map_places_in_bounds",
    ];
    for (const functionName of functionNames) {
      const createAt = sql.indexOf(
        `create or replace function public.${functionName}`,
      );
      const revokeAt = sql.indexOf(
        `revoke all on function public.${functionName}`,
      );
      expect(createAt, `${functionName} must be created`).toBeGreaterThan(-1);
      expect(revokeAt, `${functionName} must be revoked after create`).toBeGreaterThan(
        createAt,
      );
    }
    const lastCreateAt = Math.max(
      ...functionNames.map((name) =>
        sql.indexOf(`create or replace function public.${name}`),
      ),
    );
    const firstFunctionPrivilegeAt = Math.min(
      ...functionNames.map((name) =>
        sql.indexOf(`revoke all on function public.${name}`),
      ),
    );
    expect(firstFunctionPrivilegeAt).toBeGreaterThan(lastCreateAt);
    expect(sql).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(sql).toContain(") to service_role;");
    expect(sql).toContain(
      "create policy \"sanitized public map catalog rows are readable\"",
    );
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete)[^;]*to\s+(?:anon|authenticated)/iu);
    expect(sql).not.toMatch(
      /grant\s+select(?:\s*\([^;]+\))?\s+on\s+(?:table\s+)?public\.map_places\s+to\s+(?:anon|authenticated)/iu,
    );
  });

  it("keeps the legacy bounds RPC and adds a sanitized paginated RPC", () => {
    expect(sql).toContain(
      "create or replace function public.get_map_places_in_bounds",
    );
    expect(sql).toContain(
      "create or replace function public.get_public_map_catalog_v1",
    );
    expect(sql).toContain("p_after_id bigint default null");
    expect(sql).toContain("total_count bigint");
    expect(sql).toContain("has_more boolean");
    const publicRpc = sql.slice(
      sql.indexOf("create or replace function public.get_public_map_catalog_v1"),
      sql.indexOf("create or replace function public.get_map_places_in_bounds"),
    );
    expect(publicRpc).toContain("security definer");
    expect(publicRpc).not.toContain("verification_evidence");
    expect(publicRpc).not.toContain("reviewed_by");
    expect(publicRpc).not.toContain("pet_evidence jsonb");
    expect(publicRpc).not.toContain("lifecycle_status text");
    expect(publicRpc).toContain("place.provider = 'kakao'");
    expect(publicRpc).not.toContain("place.provider = 'tour'");
    expect(publicRpc).toContain("'kakao_search_candidate'::text as source");
    expect(publicRpc).toContain(
      "or place.candidate_kind <> 'pet_travel_candidate'",
    );

    const returnContract = publicRpc.slice(
      publicRpc.indexOf("returns table ("),
      publicRpc.indexOf("language sql"),
    );
    const returnedColumns = [...returnContract.matchAll(/^\s{2}([a-z_]+)\s+/gmu)].map(
      (match) => match[1],
    );
    expect(returnedColumns).toEqual([
      "id",
      "provider_place_id",
      "name",
      "candidate_kind",
      "normalized_category",
      "district_code",
      "district_name",
      "address",
      "latitude",
      "longitude",
      "phone",
      "place_url",
      "review_status",
      "public_label",
      "source",
      "total_count",
      "has_more",
    ]);
    expect(returnContract).not.toMatch(/^\s*provider\s+text/mu);
    expect(returnContract).not.toContain("category_name text");
    expect(returnContract).not.toContain("category_group_code text");
    expect(returnContract).not.toContain("category_group_name text");
    expect(returnContract).not.toContain("image_url text");

    const legacyRpc = sql.slice(
      sql.indexOf("create or replace function public.get_map_places_in_bounds"),
      sql.indexOf("alter table public.map_places enable row level security"),
    );
    expect(legacyRpc).toContain("security definer");
    expect(legacyRpc).toContain("set search_path = ''");
    expect(legacyRpc).toContain(
      "'{\"verification_required\":true}'::jsonb as pet_evidence",
    );
    expect(legacyRpc).not.toContain("place.pet_evidence");
    expect(legacyRpc).not.toContain("place.pet_notes");
  });

  it("validates full registry coverage and bounded per-query counters", () => {
    const startRpc = sql.slice(
      sql.indexOf("create or replace function public.start_kakao_catalog_run_v1"),
      sql.indexOf("create or replace function public.commit_kakao_catalog_query_v1"),
    );
    expect(startRpc).toContain("'kakao-busan-v1:'");
    expect(startRpc).toContain("('general', 4, '펫프렌들리'");
    expect(startRpc).toContain("('outdoor_leisure', 5, '애견동반 레저'");
    expect(startRpc).toContain("('pet_shop', 4, '애완동물용품'");
    expect(startRpc).toContain("v_validated_full_query_count <> 496");
    expect(KAKAO_BUSAN_QUERY_COUNT).toBe(496);
    for (const district of BUSAN_REGION_CONFIG.districts) {
      expect(startRpc).toContain(
        `('${district.legalDongDistrictCode}', '${district.name}')`,
      );
    }
    for (const [family, templates] of Object.entries(
      KAKAO_BUSAN_QUERY_TEMPLATES,
    )) {
      templates.forEach((template, templateIndex) => {
        const category = template.normalizedCategoryHint
          ? `'${template.normalizedCategoryHint}'`
          : "null";
        const categoryGroup =
          "categoryGroupCode" in template
            ? `'${template.categoryGroupCode}'`
            : "null";
        expect(startRpc).toContain(
          `('${family}', ${templateIndex}, '${template.suffix}', '${template.candidateKind}', ${category}, ${categoryGroup})`,
        );
      });
    }

    const commitRpc = sql.slice(
      sql.indexOf("create or replace function public.commit_kakao_catalog_query_v1"),
      sql.indexOf("create or replace function public.get_public_map_catalog_v1"),
    );
    expect(commitRpc).toContain("p_provider_call_count > 9");
    expect(commitRpc).toContain("p_provider_result_count > 45");
    expect(commitRpc).toContain(
      "pg_catalog.jsonb_array_length(p_candidates) > 45",
    );
    expect(commitRpc).toContain(
      "p_accepted_result_count::bigint + p_rejected_result_count::bigint",
    );
    expect(commitRpc).toContain(
      "pg_catalog.jsonb_array_length(p_candidates)::bigint",
    );
    expect(commitRpc).toContain("p_run_provider_429_count integer default null");
    expect(commitRpc).toContain("p_run_timeout_count integer default null");
    expect(commitRpc).toContain("p_run_provider_error_count integer default null");
    expect(commitRpc).not.toContain("cannot decrease");
  });
});
