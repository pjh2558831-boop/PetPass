import { describe, expect, it } from "vitest";
import { loadRecommendationPublicCatalog } from "@/lib/recommendation/public-catalog";
import type { PublicMapPlaceDTO } from "@/types/public-map-place";

function place(index: number, provider: "tour" | "kakao"): PublicMapPlaceDTO {
  return { id: `${provider}:${index + 1}`, provider, providerPlaceId: String(index + 1), name: `공개 fixture ${index}`, kind: provider === "tour" ? "tourism_place" : "pet_travel_candidate", category: "attraction", district: { code: "350", name: "해운대구" }, address: "부산광역시 해운대구", coordinates: { latitude: 35.16, longitude: 129.16 }, phone: null, imageUrl: null, contentTypeId: provider === "tour" ? "12" : null, placeUrl: null, source: provider === "tour" ? "kto_official" : "kakao_search_candidate", reviewStatus: "unreviewed", publicLabel: "동반 여부 미확인", petAccessVerdict: "unknown" };
}

describe("complete public recommendation catalog", () => {
  it("preserves the first upstream failure through catalog aggregation", async () => {
    const upstream = Object.assign(new Error("private provider body"), { code: "PGRST301", httpStatus: 401 });
    await expect(loadRecommendationPublicCatalog("busan", { query: async () => { throw upstream; } }))
      .rejects.toMatchObject({ message: "public_catalog_unavailable", cause: upstream });
  });
  it("propagates cancellation to the page request without continuing to another source", async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(loadRecommendationPublicCatalog("busan", { signal: controller.signal, query: async input => {
      calls += 1;
      expect(input.signal).toBe(controller.signal);
      controller.abort(new Error("cancelled"));
      throw controller.signal.reason;
    } })).rejects.toThrow("cancelled");
    expect(calls).toBe(1);
  });
  it.each([538, 743])("reads all %i mixed rows, beyond the first page and without preference filters", async total => {
    const rows = Array.from({ length: total }, (_, index) => place(index, index % 2 ? "kakao" : "tour"));
    const result = await loadRecommendationPublicCatalog("busan", { query: async input => {
      expect(input.categories).toBeUndefined(); expect(input.kinds).toBeUndefined(); expect(input.districtCodes).toBeUndefined();
      const source = rows.filter(row => row.provider === input.providers![0]);
      const start = input.afterId ?? 0;
      const items = source.slice(start, start + input.pageSize);
      return { region: { id: "busan", displayName: "부산" }, items, page: input.page, pageSize: input.pageSize, totalCount: source.length, hasNext: start + items.length < source.length, nextCursor: start + items.length };
    } });
    expect(new Set(result.items.map(row => row.id))).toEqual(new Set(rows.map(row => row.id)));
    expect(result.unavailableSources).toEqual([]);
    expect(result.pages).toBeGreaterThan(2);
  });
  it("retains a complete provider when the other public source fails", async () => {
    const result = await loadRecommendationPublicCatalog("busan", { query: async input => {
      if (input.providers?.includes("tour")) throw new Error("catalog unavailable");
      return { region: { id: "busan", displayName: "부산" }, items: [place(1, "kakao")], page: 1, pageSize: 200, totalCount: 1, hasNext: false, nextCursor: 2 };
    } });
    expect(result.items.map(row => row.id)).toEqual(["kakao:2"]);
    expect(result.unavailableSources).toEqual(["tour:core"]);
  });
  it("does not pass an incomplete source off as the complete universe", async () => {
    await expect(loadRecommendationPublicCatalog("busan", { query: async () => ({ region: { id: "busan", displayName: "부산" }, items: [], page: 1, pageSize: 200, totalCount: 538, hasNext: true, nextCursor: 0 }) })).rejects.toThrow("public_catalog_unavailable");
  });
  it("distinguishes a healthy empty universe from unavailable data with an empty surviving source", async () => {
    const empty = { region: { id: "busan" as const, displayName: "부산" }, items: [], page: 1, pageSize: 200, totalCount: 0, hasNext: false };
    expect((await loadRecommendationPublicCatalog("busan", { query: async () => empty })).items).toEqual([]);
    await expect(loadRecommendationPublicCatalog("busan", { query: async input => {
      if (input.providers?.includes("tour")) throw new Error("unavailable");
      return empty;
    } })).rejects.toThrow("public_catalog_unavailable");
  });
});
