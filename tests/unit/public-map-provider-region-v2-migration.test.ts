import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260819141913_public_map_catalog_provider_region_v2.sql",
  "utf8",
).toLowerCase();

describe("public provider-region map catalog migration", () => {
  it("keeps every public result scoped by region and provider", () => {
    expect(sql).toContain("create function public.get_public_map_catalog_by_region_v2");
    expect(sql).toContain("place.region_id = btrim(p_region_id)");
    expect(sql).toContain("place.provider = any(p_providers)");
    expect(sql).toContain("place.provider = 'tour'");
    expect(sql).toContain("place.provider = 'kakao'");
  });

  it("projects only active KTO rows and preserves evidence verdicts and images", () => {
    expect(sql).toContain("place.is_active");
    expect(sql).toContain("place.image_url");
    expect(sql).toContain("place.pet_evidence #>> '{assessment,verdict}'");
    expect(sql).toContain("'kto_official'::text");
  });

  it("is callable only by the server service role", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.get_public_map_catalog_by_region_v2");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toContain("to anon");
  });
});
