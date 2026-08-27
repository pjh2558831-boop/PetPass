import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260827034108_add_seoul_kto_shopping_dataset.sql";
const sql = readFileSync(migrationPath, "utf8");

describe("Seoul KTO shopping dataset migration", () => {
  it("declares regional dataset capability and explicit list-only evidence state", () => {
    expect(sql).toContain("kto_catalog_datasets text[]");
    expect(sql).toContain("kto_list_only_content_type_ids integer[]");
    expect(sql).toContain("catalog_dataset text");
    expect(sql).toContain("evidence_collection_mode text");
    expect(sql).toContain("array['core', 'shopping']::text[]");
    expect(sql).toContain("array[38]::integer[]");
    expect(sql).not.toContain("region_id = 'seoul' and");
  });

  it("stages and publishes both datasets through one region/provider run", () => {
    expect(sql).toContain("create or replace function public.commit_tour_catalog_checkpoint_v1");
    expect(sql).toContain("create or replace function public.finalize_tour_catalog_run_v1");
    expect(sql).toContain("stage.catalog_dataset");
    expect(sql).toContain("stage.evidence_collection_mode");
    expect(sql).toContain("all configured KTO datasets must be staged before full finalization");
    expect(sql).toContain("if v_run.is_full_catalog_run then");
    expect(sql).toContain("place.region_id = v_run.region_id");
    expect(sql).toContain("place.provider = v_run.provider");
  });

  it("filters the dataset before pagination in a versioned service-only RPC", () => {
    expect(sql).toContain("create function public.get_public_map_catalog_by_region_v3");
    expect(sql).toContain("place.catalog_dataset = p_catalog_dataset");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/grant\s+execute[^;]+to\s+(anon|authenticated)/iu);
  });

  it("keeps staging private and capability validation generic", () => {
    expect(sql).toContain("map_tour_stage_validate_region_v3");
    expect(sql).toContain("new.catalog_dataset = any(v_region.kto_catalog_datasets)");
    expect(sql).toContain("new.content_type_id = any(v_region.kto_list_only_content_type_ids)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).not.toMatch(/create\s+index/iu);
  });
});
