import { describe, expect, it, vi } from "vitest";
import { KAKAO_SEOUL_COLLECTION_QUERIES as queries } from "@/lib/kakao/collection/query-registry-seoul-v1";
import { createKakaoBusanCollectorAdapter } from "@/lib/kakao/collection/collector-adapter";
import { SEOUL_REGION_CONFIG } from "@/lib/regions/config";
import { executeKakaoCollection, KAKAO_COLLECTION_LIMITS } from "@/lib/kakao/collection/runner";

describe("Seoul collection isolation", () => {
  const adapter = createKakaoBusanCollectorAdapter(queries, SEOUL_REGION_CONFIG);
  const result = { id: "123", name: "테스트 카페", address: "서울특별시 종로구 세종로 1", categoryName: "음식점 > 카페", categoryGroupCode: "CE7", coordinates: { latitude: 37.57, longitude: 126.98 } };
  it("has exactly 31 stable queries for all 25 districts", () => {
    expect(queries).toHaveLength(775);
    expect(new Set(queries.map((q) => q.key)).size).toBe(775);
    for (const d of SEOUL_REGION_CONFIG.districts) expect(queries.filter((q) => q.districtCode === d.legalDongDistrictCode)).toHaveLength(31);
  });
  it("requires matching Seoul address, district and coordinates", () => {
    const valid = (value: typeof result) => adapter.classification.validateDistrict(value, adapter.queries[0]);
    expect(valid(result)).toBe(true);
    expect(valid({ ...result, address: "부산광역시 중구 세종로 1" })).toBe(false);
    expect(valid({ ...result, address: "서울 중구 종로구 1" })).toBe(false);
    expect(valid({ ...result, coordinates: { latitude: 35.1, longitude: 129.1 } })).toBe(false);
    expect(adapter.classification.validateDistrict({ ...result, roadAddress: "서울 중구 세종대로 1" }, adapter.queries[0])).toBe(false);
  });
  it("accepts Seoul coordinates, dedupes IDs and reports capped searches", async () => {
    const provider = { searchPage: vi.fn(async () => ({ results: [result, result], totalCount: 46, pageableCount: 2, isEnd: true })) };
    const summary = await executeKakaoCollection({ mode: "dry-run", registryVersion: "test", queries: adapter.queries.slice(0, 1), classification: adapter.classification, provider, coordinateBounds: SEOUL_REGION_CONFIG.mapBounds });
    expect(summary.uniqueCandidateCount).toBe(1);
    expect(summary.saturatedQueryCount).toBe(1);
  });
  it("keeps the physical cap for resumable plans", async () => {
    const provider = { searchPage: vi.fn(async () => ({ results: [], totalCount: 0, pageableCount: 0, isEnd: true })) };
    const summary = await executeKakaoCollection({ mode: "dry-run", registryVersion: "test", ...adapter, provider, allowResumablePlan: true, limits: { ...KAKAO_COLLECTION_LIMITS, requestCap: 2 } });
    expect(provider.searchPage).toHaveBeenCalledTimes(2);
    expect(summary.status).toBe("partial");
    expect(summary.completedQueryCount).toBe(2);
  });
});
