import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const directory = join(process.cwd(), "supabase", "migrations");
  const filename = readdirSync(directory).find((name) =>
    name.endsWith("_add_public_kakao_pet_conditions.sql")
  );
  if (!filename) throw new Error("Additive Kakao pet-condition migration is missing.");
  return readFileSync(join(directory, filename), "utf8").toLocaleLowerCase("en-US");
}

describe("public Kakao pet-condition RPC contract", () => {
  it("adds a service-only v4 projection without destructive schema or data changes", () => {
    const sql = migrationSql();

    expect(sql).toContain("create function public.get_public_map_catalog_by_region_v4");
    expect(sql).toContain("pet_conditions text");
    expect(sql).toContain("verification_required boolean");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("grant execute on function public.get_public_map_catalog_by_region_v4");
    expect(sql).toMatch(/to service_role\s*;/u);
    expect(sql).toMatch(/from public, anon, authenticated\s*;/u);
    expect(sql).not.toMatch(/\b(drop|truncate|delete\s+from|alter\s+table)\b/u);
    expect(sql).not.toContain("verification_evidence");
  });

  it("extracts only the allowlisted Kakao condition note and preserves publication filters", () => {
    const sql = migrationSql();

    expect(sql).toContain("반려동물 동반 조건:");
    expect(sql).toContain("방문 전 최신 운영 정책 확인 필요");
    expect(sql).toContain("place.is_active");
    expect(sql).toContain("place.public_visibility");
    expect(sql).toContain("place.pending_publication_run_id is null");
    expect(sql).toContain("place.lifecycle_status = 'current'");
    expect(sql).toContain("place.review_status = 'confirmed'");
    expect(sql).not.toContain("place.review_status = 'rejected'");
  });
});
