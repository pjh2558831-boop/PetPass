import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260819133943_jeju_kto_catalog_ingestion.sql";
const sql = readFileSync(migrationPath, "utf8");

describe("Jeju KTO catalog ingestion migration", () => {
  it("adds isolated KTO checkpoints and staging with browser access denied", () => {
    expect(sql).toContain("create table public.map_tour_ingest_checkpoints");
    expect(sql).toContain("create table public.map_tour_ingest_stage_places");
    expect(sql).toContain("alter table public.map_tour_ingest_checkpoints enable row level security");
    expect(sql).toContain("alter table public.map_tour_ingest_stage_places enable row level security");
    expect(sql).toContain("revoke all on table public.map_tour_ingest_checkpoints from public, anon, authenticated");
    expect(sql).toContain("revoke all on table public.map_tour_ingest_stage_places from public, anon, authenticated");
  });

  it("authorizes full tour runs without reusing the Kakao registry", () => {
    expect(sql).toContain("provider = 'tour'");
    expect(sql).toContain("and region_id = 'jeju'");
    expect(sql).toContain("registry_version = 'tour-' || region_id || '-service2-v1'");
    expect(sql).not.toContain("kakao-jeju-query-registry");
  });

  it("scopes checkpoint, upsert, finalization, and stale deactivation by region and provider", () => {
    expect(sql).toContain("create or replace function public.commit_tour_catalog_checkpoint_v1");
    expect(sql).toContain("create or replace function public.finalize_tour_catalog_run_v1");
    expect(sql).toContain("stage.region_id = v_run.region_id");
    expect(sql).toContain("stage.provider = v_run.provider");
    expect(sql).toContain("place.region_id = v_run.region_id");
    expect(sql).toContain("place.provider = v_run.provider");
    expect(sql).toContain("place.provider_place_id = stage.provider_place_id");
    expect(sql).toContain("on conflict (provider, provider_place_id) do update");
    expect(sql).toContain("where map_places.region_id = v_run.region_id");
    expect(sql).toContain("and map_places.provider = v_run.provider");
    expect(sql).toContain("if v_upserted <> v_stage_count then");
  });

  it("keeps write RPCs service-only and uses an empty search path", () => {
    expect(sql.match(/security invoker/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(sql.match(/set search_path = ''/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("grant execute on function public.start_tour_catalog_run_v1");
    expect(sql).toContain("grant execute on function public.commit_tour_catalog_checkpoint_v1");
    expect(sql).toContain("grant execute on function public.finalize_tour_catalog_run_v1");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });
});
