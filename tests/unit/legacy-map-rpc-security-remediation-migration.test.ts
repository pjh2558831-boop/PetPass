import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationNames = readdirSync("supabase/migrations").filter((name) =>
  name.endsWith("_harden_legacy_map_rpcs.sql"),
);

if (migrationNames.length !== 1) {
  throw new Error(
    `Expected one legacy RPC hardening migration, found ${migrationNames.length}.`,
  );
}

const sql = readFileSync(
  `supabase/migrations/${migrationNames[0]}`,
  "utf8",
).toLowerCase();
const compactSql = sql
  .replace(/\s+/gu, " ")
  .replace(/\(\s+/gu, "(")
  .replace(/\s+\)/gu, ")")
  .trim();

const legacyCatalogV2Signature =
  "public.get_public_map_catalog_v2(double precision, double precision, double precision, double precision, text[], text[], text[], bigint, integer)";
const legacyLocationV1Signature =
  "public.get_public_map_place_location_v1(text)";

describe("legacy public map RPC security remediation migration", () => {
  it("hardens the two RPCs required by the deployed Busan application in place", () => {
    for (const signature of [legacyCatalogV2Signature, legacyLocationV1Signature]) {
      expect(compactSql).toContain(`alter function ${signature} security invoker`);
      expect(compactSql).toMatch(
        new RegExp(
          `alter function ${signature.replace(/[()[\].+*?^$\\|]/gu, "\\$&")}\\s+set search_path\\s*=\\s*''`,
          "u",
        ),
      );
      expect(compactSql).toContain(`revoke all on function ${signature}`);
      expect(compactSql).toContain(`grant execute on function ${signature} to anon`);
    }
  });

  it("uses RLS and narrow column grants for the retained anon contracts", () => {
    expect(compactSql).toContain("grant select (");
    expect(compactSql).toContain("on table public.map_places to anon");
    expect(compactSql).toContain("on table public.map_place_query_hits to anon");
    expect(compactSql).toContain(
      "create policy \"published busan query hits are anon-readable\"",
    );
    expect(compactSql).toContain("place.region_id = 'busan'");
    expect(compactSql).toContain("place.provider = 'kakao'");
    expect(compactSql).toContain("place.public_visibility");
    expect(sql).not.toMatch(/grant\s+select\s+on\s+(?:table\s+)?public\.map_places\s+to\s+anon/u);
    expect(sql).not.toMatch(
      /grant\s+select\s+on\s+(?:table\s+)?public\.map_place_query_hits\s+to\s+anon/u,
    );
  });

  it("limits retained legacy execution to the anon compatibility caller", () => {
    expect(compactSql).toContain(
      `revoke all on function ${legacyCatalogV2Signature} from public, anon, authenticated, service_role`,
    );
    expect(compactSql).toContain(
      `revoke all on function ${legacyLocationV1Signature} from public, anon, authenticated, service_role`,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.get_public_map_catalog_v2[\s\S]+?to (?:authenticated|service_role)/u,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.get_public_map_place_location_v1[\s\S]+?to (?:authenticated|service_role)/u,
    );
  });

  it("removes only RPCs proven unused by both main and the feature branch", () => {
    expect(compactSql).toContain("drop function public.get_map_places_in_bounds(");
    expect(compactSql).toContain("drop function public.get_public_map_catalog_v1(");
    expect(compactSql).toContain(
      "drop function public.get_public_map_catalog_by_region_v1(",
    );
    expect(compactSql).not.toContain(
      "drop function public.get_public_map_catalog_by_region_v2(",
    );
    expect(compactSql).not.toContain(
      "drop function public.get_public_map_place_location_by_region_v1(",
    );
  });

  it("does not alter catalog or ingestion table data", () => {
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\b/u);
    expect(sql).not.toMatch(/drop\s+table/u);
  });
});
