import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KAKAO_BUSAN_COLLECTION_QUERIES } from "@/lib/kakao/collection/query-registry-v1";
import {
  KAKAO_BUSAN_DELTA_QUERIES,
  KAKAO_BUSAN_DELTA_QUERY_COUNT,
  KAKAO_BUSAN_DELTA_QUERY_REGISTRY_VERSION,
} from "@/lib/kakao/collection/query-registry-v2";

describe("Kakao Busan compact delta registry V2", () => {
  it("contains only two compact templates for every Busan district", () => {
    expect(KAKAO_BUSAN_DELTA_QUERY_REGISTRY_VERSION).toBe("kakao-busan-query-registry-v2");
    expect(KAKAO_BUSAN_DELTA_QUERY_COUNT).toBe(32);
    expect(new Set(KAKAO_BUSAN_DELTA_QUERIES.map((query) => query.districtCode)).size).toBe(16);
    expect(new Set(KAKAO_BUSAN_DELTA_QUERIES.map((query) => query.key)).size).toBe(32);
    expect(KAKAO_BUSAN_DELTA_QUERIES.every((query) =>
      query.queryText.endsWith(query.family === "cafe" ? "반려동물동반 카페" : "반려동물동반 식당"),
    )).toBe(true);
    expect(KAKAO_BUSAN_DELTA_QUERIES.filter((query) => query.categoryGroupCode === "CE7")).toHaveLength(16);
    expect(KAKAO_BUSAN_DELTA_QUERIES.filter((query) => query.categoryGroupCode === "FD6")).toHaveLength(16);
  });

  it("does not duplicate the exact V1 query text", () => {
    const v1 = new Set(KAKAO_BUSAN_COLLECTION_QUERIES.map((query) => query.queryText));
    expect(KAKAO_BUSAN_DELTA_QUERIES.every((query) => !v1.has(query.queryText))).toBe(true);
  });

  it("pins delta-only no-stale semantics in the collector and migration", () => {
    const script = readFileSync("scripts/collect-kakao-busan-v2.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260818161218_category_first_catalog_v2.sql", "utf8");
    expect(script).toContain("isFullCatalogRun: false");
    expect(script).toContain("requestCap: 104");
    expect(migration).toContain("p_is_full_catalog_run is distinct from false");
  });
});
