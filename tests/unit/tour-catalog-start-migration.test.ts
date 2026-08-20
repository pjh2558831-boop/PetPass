import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260820032918_fix_tour_catalog_start_coalesce.sql",
  "utf8",
);

describe("KTO run-start runtime remediation migration", () => {
  it("keeps the existing function contract while using SQL COALESCE syntax", () => {
    expect(migration).toContain(
      "create or replace function public.start_tour_catalog_run_v1(",
    );
    expect(migration).toContain(
      "v_district_count <> coalesce(pg_catalog.array_length(p_district_codes, 1), 0)",
    );
    expect(migration).not.toContain("pg_catalog.coalesce(");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
  });

  it("does not alter tables or broaden execution grants", () => {
    expect(migration).not.toMatch(/\balter\s+table\b/u);
    expect(migration).not.toMatch(/\bgrant\s+execute\b/u);
  });
});
