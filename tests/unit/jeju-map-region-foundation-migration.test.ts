import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260819115703_jeju_map_region_foundation.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Jeju map region foundation migration", () => {
  it("uses text lookup tables and composite district identity", () => {
    expect(sql).toContain("create table public.regions");
    expect(sql).toContain("region_id text primary key");
    expect(sql).toContain("legal_dong_code text not null unique");
    expect(sql).toContain("create table public.region_districts");
    expect(sql).toContain("primary key (region_id, district_code)");
    expect(sql).not.toMatch(/create\s+type[^;]+enum/iu);

    expect(sql).toContain("('busan', '부산', '26', true)");
    expect(sql).toContain("('jeju', '제주', '50', false)");
    for (const district of BUSAN_REGION_CONFIG.districts) {
      expect(sql).toContain(
        `('busan', '${district.legalDongDistrictCode}', '${district.name}')`,
      );
    }
    expect(sql).toContain("('jeju', '110', '제주시')");
    expect(sql).toContain("('jeju', '130', '서귀포시')");
  });

  it("fails closed before backfilling every region-scoped table", () => {
    const validationAt = sql.indexOf("existing map data is not exclusively Busan");
    const placeBackfillAt = sql.indexOf(
      "update public.map_places set region_id = 'busan'",
    );
    expect(validationAt).toBeGreaterThan(-1);
    expect(placeBackfillAt).toBeGreaterThan(validationAt);

    for (const table of [
      "map_places",
      "map_ingest_runs",
      "map_ingest_run_queries",
      "map_place_query_hits",
    ]) {
      expect(sql).toContain(`alter table public.${table} add column region_id text`);
      expect(sql).toContain(`update public.${table} set region_id = 'busan'`);
      expect(sql).toContain(
        `alter table public.${table} alter column region_id set not null`,
      );
    }
  });

  it("enforces region-aware districts and cross-table ingestion ownership", () => {
    expect(sql).toMatch(
      /foreign key \(\s*region_id,\s*district_code,\s*district_name\s*\)/u,
    );
    expect(sql).toMatch(
      /foreign key \(\s*region_id,\s*district_code,\s*district\s*\)/u,
    );
    expect(sql).toMatch(
      /foreign key \(region_id, collection_run_id\)\s+references public\.map_ingest_runs \(region_id, id\)/u,
    );
    expect(sql).toMatch(
      /foreign key \(region_id, candidate_id\)\s+references public\.map_places \(region_id, id\)/u,
    );
    expect(sql).toMatch(
      /foreign key \(\s*region_id,\s*last_seen_run_id\s*\) references public\.map_ingest_runs \(region_id, id\)/u,
    );
    expect(sql).toMatch(
      /foreign key \(\s*region_id,\s*pending_publication_run_id\s*\) references public\.map_ingest_runs \(region_id, id\)/u,
    );
  });

  it("keeps Kakao collection Busan-only while making row validation region-aware", () => {
    expect(sql).toContain("kakao_collection_enabled boolean not null");
    expect(sql).toContain("Kakao collection is disabled for region");
    expect(sql).toContain("'kakao-busan-query-registry-v1'");
    expect(sql).toContain("'kakao-busan-query-registry-v2'");
    expect(sql).toContain("new.region_id := 'busan'");
    expect(sql).toContain("when 'busan' then");
    expect(sql).toContain("when 'jeju' then");
    expect(sql).toContain("map_places_kakao_catalog_shape_check");
  });

  it("scopes public Busan RPCs and stale reconciliation by region", () => {
    for (const functionName of [
      "get_public_map_catalog_v2",
      "get_public_map_place_location_v1",
      "get_map_places_in_bounds",
    ]) {
      const start = sql.indexOf(
        `create or replace function public.${functionName}`,
      );
      expect(start, `${functionName} must be replaced`).toBeGreaterThan(-1);
      const end = sql.indexOf("$$;", start);
      expect(sql.slice(start, end)).toContain("place.region_id = 'busan'");
    }
    const v1Start = sql.indexOf(
      "create or replace function public.get_public_map_catalog_v1",
    );
    const v1End = sql.indexOf("$$;", v1Start);
    expect(sql.slice(v1Start, v1End)).toContain(
      "from public.get_public_map_catalog_v2(",
    );

    const finalizeStart = sql.indexOf(
      "create or replace function public.finalize_kakao_catalog_run_v1",
    );
    const finalizeEnd = sql.indexOf("$$;", finalizeStart);
    const finalizeSql = sql.slice(finalizeStart, finalizeEnd);
    expect(finalizeSql).toContain("place.region_id = v_run.region_id");
    expect(finalizeSql).toContain("hit.region_id = v_run.region_id");
  });

  it("locks down lookup tables and adds only region-led access indexes", () => {
    for (const table of ["regions", "region_districts"]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(sql).toContain(
        `revoke all on table public.${table} from public, anon, authenticated, service_role`,
      );
      expect(sql).toContain(
        `grant select on table public.${table} to service_role`,
      );
    }
    expect(sql).toContain('create policy "map regions are service-readable"');
    expect(sql).toContain(
      'create policy "map region districts are service-readable"',
    );
    expect(sql).not.toMatch(
      /grant\s+select[^;]+public\.(?:regions|region_districts)[^;]+to\s+(?:anon|authenticated)/iu,
    );
    expect(sql).toMatch(
      /map_places_kakao_public_catalog_idx on public\.map_places \(\s*region_id/u,
    );
    expect(sql).toMatch(
      /map_ingest_runs_provider_started_idx\s+on public\.map_ingest_runs \(region_id/u,
    );
    expect(sql).toContain(
      "registry_version = 'kakao-' || region_id || '-query-registry-v1'",
    );
    expect(sql).toMatch(
      /alter policy "sanitized public map catalog rows are readable"[\s\S]+region_id = 'busan'/u,
    );
  });
});
