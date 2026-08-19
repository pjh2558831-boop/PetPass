import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260819130604_public_map_catalog_region_api.sql",
  ),
  "utf8",
);

describe("region-aware public map catalog RPC migration", () => {
  it("requires an explicit region and scopes places and hit aggregates", () => {
    expect(migration).toContain(
      "create function public.get_public_map_catalog_by_region_v1(",
    );
    expect(migration).toContain("p_region_id text");
    expect(migration).toContain("where hit.region_id = p_region_id");
    expect(migration).toContain("where place.region_id = p_region_id");
    expect(migration).not.toContain("place.region_id = 'busan'");
    expect(migration).toContain(
      "create function public.get_public_map_place_location_by_region_v1(",
    );
    expect(migration).toContain("where place.region_id = p_region_id");
  });

  it("keeps the replacement RPC server-only and security-invoker", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain(
      "revoke all on function public.get_public_map_catalog_by_region_v1(",
    );
    expect(migration).toMatch(
      /from public, anon, authenticated, service_role;/u,
    );
    expect(migration).toContain(
      "grant execute on function public.get_public_map_catalog_by_region_v1(",
    );
    expect(migration).toMatch(/\)\s+to service_role;/u);
    expect(migration).not.toMatch(/\)\s+to (?:anon|authenticated);/u);
    expect(migration).toContain(
      "grant execute on function public.get_public_map_place_location_by_region_v1(",
    );
  });

  it("does not alter the Phase 1 RPC or public RLS policy", () => {
    expect(migration).not.toContain("get_public_map_catalog_v2");
    expect(migration).not.toMatch(/alter policy|create policy|drop policy/iu);
  });
});
