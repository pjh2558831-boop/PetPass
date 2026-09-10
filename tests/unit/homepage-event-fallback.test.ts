import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tourism: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/tour-api/pet-events", () => ({ getPetEventFeed: mocks.tourism }));
vi.mock("@/lib/naver/events", () => ({ getNaverEventFeed: mocks.search }));
import { GET } from "@/app/api/content/pet-events/route";
beforeEach(() => vi.resetAllMocks());
it.each(["ready", "unavailable"])("preserves tourism %s without replacing it with search", async state => {
  mocks.tourism.mockResolvedValue({ state, items: state === "ready" ? [{ id: "official" }] : [] });
  const response = await GET(new Request("https://example.com/api/content/pet-events"));
  expect((await response.json()).data.state).toBe(state);
  expect(mocks.search).not.toHaveBeenCalled();
});
it("falls back only on a confirmed empty tourism result", async () => {
  mocks.tourism.mockResolvedValue({ state: "empty", items: [] });
  mocks.search.mockResolvedValue({ state: "ready", items: [{ id: "naver", source: "네이버 검색" }] });
  const response = await GET(new Request("https://example.com/api/content/pet-events"));
  expect((await response.json()).data.items[0].source).toBe("네이버 검색");
  expect(mocks.search).toHaveBeenCalledTimes(1);
  expect((await GET(new Request("https://example.com/api/content/pet-events?query=x"))).status).toBe(400);
  expect(mocks.tourism).toHaveBeenCalledTimes(1);
});
