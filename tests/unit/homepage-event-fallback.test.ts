import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tourism: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/tour-api/pet-events", () => ({ getPetEventFeed: mocks.tourism }));
vi.mock("@/lib/naver/events", () => ({ getNaverEventFeed: mocks.search }));
import { GET } from "@/app/api/content/pet-events/route";
beforeEach(() => vi.resetAllMocks());
it("supplements official events with search results when both sources have events", async () => {
  mocks.tourism.mockResolvedValue({ state: "ready", items: [{ id: "official", title: "공식 행사", startDate: "2026-09-19", endDate: null, source: "한국관광공사" }] });
  mocks.search.mockResolvedValue({ state: "ready", items: [{ id: "naver", title: "검색 행사", startDate: "2026-09-20", endDate: null, source: "네이버 검색" }] });
  const response = await GET(new Request("https://example.com/api/content/pet-events"));
  expect((await response.json()).data.items.map((item: { id: string }) => item.id)).toEqual(["official", "naver"]);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=21600, stale-while-revalidate=86400");
  expect(mocks.search).toHaveBeenCalledTimes(1);
});
it("deduplicates matching events while keeping the official record", async () => {
  const event = { title: "2026 반려동물 박람회", startDate: "2026-09-19", endDate: "2026-09-20" };
  mocks.tourism.mockResolvedValue({ state: "ready", items: [{ ...event, id: "official", source: "한국관광공사" }] });
  mocks.search.mockResolvedValue({ state: "ready", items: [{ ...event, id: "naver", source: "네이버 검색" }] });
  const response = await GET(new Request("https://example.com/api/content/pet-events"));
  expect((await response.json()).data.items.map((item: { id: string }) => item.id)).toEqual(["official"]);
});
it.each(["empty", "unavailable"])("falls back when tourism is %s", async state => {
  mocks.tourism.mockResolvedValue({ state, items: [] });
  mocks.search.mockResolvedValue({ state: "ready", items: [{ id: "naver", title: "검색 행사", startDate: "2026-09-20", endDate: null, source: "네이버 검색" }] });
  const response = await GET(new Request("https://example.com/api/content/pet-events"));
  expect((await response.json()).data.items[0].source).toBe("네이버 검색");
  expect(mocks.search).toHaveBeenCalledTimes(1);
});
it("rejects caller-supplied event queries", async () => {
  expect((await GET(new Request("https://example.com/api/content/pet-events?query=x"))).status).toBe(400);
  expect(mocks.tourism).not.toHaveBeenCalled();
});
