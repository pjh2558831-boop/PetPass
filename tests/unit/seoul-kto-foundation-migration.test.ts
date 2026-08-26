import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260826132941_add_seoul_kto_catalog_foundation.sql";
const sql = readFileSync(migrationPath, "utf8");

describe("Seoul KTO catalog foundation migration", () => {
  it("seeds Seoul and every audited legal-dong district without changing composite identity", () => {
    expect(sql).toContain("('seoul', '서울', '11'");
    expect(sql.match(/\('seoul', '[0-9]{3}', '[^']+'\)/gu)).toHaveLength(25);
    expect(sql).toContain("('seoul', '110', '종로구')");
    expect(sql).toContain("('seoul', '740', '강동구')");
    expect(sql).not.toMatch(/drop\s+constraint\s+region_districts_region_code_name_key/iu);
  });

  it("adds generic KTO capability metadata while keeping Kakao disabled for Seoul", () => {
    expect(sql).toContain("add column kto_catalog_enabled boolean");
    expect(sql).toContain("add column kto_collection_enabled boolean");
    expect(sql).toContain("kakao_collection_enabled");
    expect(sql).toContain("Kakao collection is disabled for region");
    expect(sql).toContain("KTO collection is disabled for region");
  });

  it("generalizes KTO run, checkpoint, bounds, and finalization scope", () => {
    expect(sql).toContain("create or replace function public.start_tour_catalog_run_v1");
    expect(sql).toContain("create or replace function public.commit_tour_catalog_checkpoint_v1");
    expect(sql).toContain("create or replace function public.finalize_tour_catalog_run_v1");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("place.region_id = v_run.region_id");
    expect(sql).toContain("place.provider = v_run.provider");
    expect(sql).toContain("if v_run.is_full_catalog_run then");
    expect(sql).toContain("map_tour_stage_validate_region_v2");
  });

  it("keeps write paths service-only and browser lookup access revoked", () => {
    expect(sql.match(/security invoker/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(sql.match(/set search_path = ''/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("revoke all on table public.regions from public, anon, authenticated");
    expect(sql).not.toMatch(/grant\s+.+\s+to\s+(anon|authenticated)/iu);
  });
});
