import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");

const expectedMigrationFiles = [
  "20260811103029_initial_map_storage.sql",
  "20260814161159_add_provider_visibility.sql",
  "20260814161532_kakao_busan_catalog_v1.sql",
  "20260818161218_category_first_catalog_v2.sql",
  "20260818165915_optimize_public_map_catalog_v2.sql",
  "20260819115703_jeju_map_region_foundation.sql",
  "20260819130604_public_map_catalog_region_api.sql",
  "20260819133943_jeju_kto_catalog_ingestion.sql",
  "20260819141913_public_map_catalog_provider_region_v2.sql",
  "20260819162536_harden_legacy_map_rpcs.sql",
  "20260820032918_fix_tour_catalog_start_coalesce.sql",
  "20260823131927_add_auth_profiles.sql",
  "20260823134126_add_saved_pet_profiles.sql",
  "20260823135016_harden_auth_profile_privileges.sql",
  "20260823135158_combine_profile_select_policies.sql",
  "20260823142200_harden_profile_avatar_bucket.sql",
  "20260824123000_add_multi_pet_profiles_and_profile_editing.sql",
  "20260824123100_harden_profile_cooldown_function_privileges.sql",
  "20260826132941_add_seoul_kto_catalog_foundation.sql",
  "20260827034108_add_seoul_kto_shopping_dataset.sql",
  "20260827053833_harden_legacy_map_rpc_after_shopping.sql",
] as const;

const productionStatementHashes = {
  "20260811103029_initial_map_storage.sql": {
    normalization: "whitespace",
    md5: "013a7641a779667d9802c72f0fe357db",
  },
  "20260814161159_add_provider_visibility.sql": {
    normalization: "line-endings",
    md5: "5ce4bb42e8eef3b006f6326c5b0dfe77",
  },
  "20260814161532_kakao_busan_catalog_v1.sql": {
    normalization: "line-endings",
    md5: "e4fb773def5b5deb56b53be014eb5086",
  },
  "20260818161218_category_first_catalog_v2.sql": {
    normalization: "line-endings",
    md5: "e0517576323d5b632f7533f25ead4512",
  },
  "20260818165915_optimize_public_map_catalog_v2.sql": {
    normalization: "line-endings",
    md5: "c49a679035251249f9863348f8b9d2e2",
  },
} as const;

function normalizeLineEndings(sql: string): string {
  return sql.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd();
}

function hashProductionStatement(
  sql: string,
  normalization: "line-endings" | "whitespace",
): string {
  const normalized = normalizeLineEndings(sql);
  const source =
    normalization === "whitespace" ? normalized.replaceAll(/\s/gu, "") : normalized;
  return createHash("md5").update(source, "utf8").digest("hex");
}

function readMigration(fileName: string): string {
  return readFileSync(join(migrationDirectory, fileName), "utf8");
}

function viewportPredicate(sql: string): string {
  const normalized = normalizeLineEndings(sql);
  const start = normalized.indexOf("and (p_district_codes is null");
  const end = normalized.indexOf("\n  ),\n  counted as", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end);
}

describe("pre-region production migration history", () => {
  it("uses the production-applied versions once and keeps region migrations later", () => {
    const files = readdirSync(migrationDirectory)
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();
    expect(files).toEqual(expectedMigrationFiles);

    const versions = files.map((fileName) => fileName.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort());
    expect(
      versions.slice(5).every((version) => version > "20260818165915"),
    ).toBe(true);
  });

  it("matches the authoritative production statement payloads", () => {
    for (const [fileName, evidence] of Object.entries(
      productionStatementHashes,
    )) {
      expect(
        hashProductionStatement(
          readMigration(fileName),
          evidence.normalization,
        ),
        fileName,
      ).toBe(evidence.md5);
    }
  });

  it("keeps the original viewport OR in category-first and introduces CASE only later", () => {
    const categoryFirstPredicate = viewportPredicate(
      readMigration("20260818161218_category_first_catalog_v2.sql"),
    );
    const optimizedPredicate = viewportPredicate(
      readMigration("20260818165915_optimize_public_map_catalog_v2.sql"),
    );

    expect(categoryFirstPredicate).toContain(
      "and (\n        (p_south is null and p_west is null",
    );
    expect(categoryFirstPredicate).toContain(
      "or (\n          p_south between -90 and 90",
    );
    expect(categoryFirstPredicate).not.toContain("and case");

    expect(optimizedPredicate).toContain("and case");
    expect(optimizedPredicate).toContain(
      "when p_south is null and p_west is null and p_north is null and p_east is null then true",
    );
    expect(optimizedPredicate).toContain("else false");
  });
});
