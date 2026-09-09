import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarDate, eventStatus, kstToday, safeContentUrl, selectEvents } from "@/lib/homepage/pet-content";
import { normalizeNews, fetchPetNews } from "@/lib/naver/news";
import { fetchPetEvents } from "@/lib/tour-api/pet-events";

const today = "2026-09-09";
const event = { contentid: "1", title: "반려동물 박람회", eventstartdate: "20260909", eventenddate: "20260910", addr1: "부산광역시 해운대구", contenttypeid: "15" };
const envelope = (items: unknown[], totalCount = items.length, pageNo = 1) => JSON.stringify({ response: { header: { resultCode: "0000" }, body: { items: { item: items }, totalCount, pageNo, numOfRows: 100 } } });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("homepage content boundaries", () => {
  it("validates leap dates and KST midnight", () => {
    expect(calendarDate("20240229")).toBe("2024-02-29");
    for (const value of ["20260229", "20261301", "20260931", "bad"]) expect(calendarDate(value)).toBeNull();
    expect(kstToday(new Date("2026-09-08T15:00:00Z"))).toBe(today);
    expect(kstToday(new Date("2026-09-08T14:59:59Z"))).toBe("2026-09-08");
  });
  it("never invents ongoing dates or admission", () => {
    expect(eventStatus("2026-09-08", null, today)).toBeNull();
    expect(eventStatus("2026-09-10", null, today)).toBe("upcoming");
    expect(eventStatus(today, "2026-09-10", today)).toBe("ongoing");
    expect(eventStatus(today, "2026-09-10", "2026-09-11")).toBeNull();
    const items = selectEvents([event, event, { ...event, contentid: "2", title: "트럼펫 축제" }, { ...event, contentid: "3", title: "야외 음악제" }], today, "checked");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ regionLabel: "부산광역시", informationUrl: null, checkedAt: "checked" });
    expect(items[0]).not.toHaveProperty("petAdmission");
  });
  it("normalizes only safe news links, keeps provider order and fewer rows", () => {
    const news = normalizeNews({ items: [{ title: "<b>반려동물</b> &amp; &#xC5EC;행", originallink: "https://paper.example/a", link: "https://news.example/a", pubDate: "Wed, 09 Sep 2026 09:00:00 +0900" }, { title: "기사", originallink: "https://user:pass@example.com", link: "javascript:alert(1)" }] });
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ title: "반려동물 & 여행", sourceLabel: "paper.example", originalUrl: "https://paper.example/a" });
    expect(normalizeNews({ items: [] })).toEqual([]);
    expect(() => normalizeNews({ items: "bad" })).toThrow();
    expect(normalizeNews({ items: [{ title: "&hellip; &copy; &#128054; &amp;lt;", link: "https://example.com" }] })[0].title).toBe("… © 🐶 &lt;");
    expect(normalizeNews({ items: [{ title: "1", link: "https://example.com" }, { title: "2", link: "https://example.com" }] }).map(item => item.title)).toEqual(["1", "2"]);
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "https://a:b@example.com", "https://example.com\n", "//example.com"])("rejects unsafe URL %s", value => {
    expect(safeContentUrl(value)).toBeNull();
  });
  it("retains a future missing-end event but excludes malformed, ended and distant events", () => {
    const items = selectEvents([
      { ...event, eventstartdate: "20260910", eventenddate: "" },
      { ...event, contentid: "2", eventenddate: "20260908" },
      { ...event, contentid: "3", eventenddate: "20260229" },
      { ...event, contentid: "4", eventstartdate: "20270101", eventenddate: "" },
      { ...event, contentid: "5", eventstartdate: "20260701", eventenddate: "20261001" },
    ], today, "checked");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ endDate: null, status: "upcoming" });
  });
  it("requires credentials without calling upstream", async () => {
    const fetcher = vi.fn();
    await expect(fetchPetNews({ NODE_ENV: "test" }, fetcher)).rejects.toMatchObject({ code: "CONFIGURATION" });
    await expect(fetchPetEvents({ NODE_ENV: "test" }, fetcher)).rejects.toMatchObject({ code: "CONFIGURATION" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429])("does not retry news HTTP %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status }));
    await expect(fetchPetNews({ NODE_ENV: "test", NAVER_API_HUB_ACCESS_KEY_ID: "synthetic-id", NAVER_API_HUB_SECRET_KEY: "synthetic-secret" }, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ "X-NCP-APIGW-API-KEY-ID": "synthetic-id", "X-NCP-APIGW-API-KEY": "synthetic-secret" });
  });
  it("uses general tourism and bounds pagination without claiming completeness", async () => {
    const fetcher = vi.fn().mockImplementation(async (url: URL) => {
      const page = Number(url.searchParams.get("pageNo"));
      expect(url.pathname).toBe("/B551011/KorService2/searchFestival2");
      expect(url.searchParams.has("areaCode")).toBe(false);
      expect(url.searchParams.get("eventStartDate")).toBe("20260810");
      return new Response(envelope(Array.from({ length: 100 }, (_, i) => ({ ...event, contentid: String(page * 100 + i), title: "음악 축제" })), 9999, page));
    });
    const result = await fetchPetEvents({ NODE_ENV: "test", TOUR_API_SERVICE_KEY: "synthetic" }, fetcher, new Date("2026-09-09T00:00:00Z"));
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(result).toMatchObject({ items: [], coverageLimited: true, requests: 8 });
  });
  it("handles a legitimate empty page and rejects malformed pagination", async () => {
    const env = { NODE_ENV: "test" as const, TOUR_API_SERVICE_KEY: "synthetic" };
    const empty = await fetchPetEvents(env, vi.fn().mockResolvedValue(new Response(envelope([]))));
    expect(empty).toMatchObject({ items: [], requests: 1, coverageLimited: false });
    await expect(fetchPetEvents(env, vi.fn().mockResolvedValue(new Response(envelope([], 100, 0))))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("coalesces refreshes, expires ended cached events and preserves checkedAt", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T14:59:00Z"));
    vi.stubEnv("TOUR_API_SERVICE_KEY", "synthetic");
    const fetcher = vi.fn().mockImplementation(async () => new Response(envelope([{ ...event, eventenddate: "20260909" }])));
    vi.stubGlobal("fetch", fetcher);
    const { getPetEventFeed } = await import("@/lib/tour-api/pet-events");
    const [a, b] = await Promise.all([getPetEventFeed(), getPetEventFeed()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.items[0].checkedAt).toBe(b.items[0].checkedAt);
    vi.setSystemTime(new Date("2026-09-09T15:00:00Z"));
    expect(await getPetEventFeed()).toMatchObject({ state: "empty", items: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After and does not expose errors or credentials", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T00:00:00Z"));
    vi.stubEnv("TOUR_API_SERVICE_KEY", "synthetic");
    const fetcher = vi.fn().mockImplementation(async () => new Response("", { status: 429, headers: { "Retry-After": "86400" } }));
    vi.stubGlobal("fetch", fetcher);
    const { getPetEventFeed } = await import("@/lib/tour-api/pet-events");
    expect(await getPetEventFeed()).toEqual({ state: "unavailable", items: [] });
    vi.setSystemTime(new Date("2026-09-09T07:00:00Z"));
    await getPetEventFeed();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps the public news policy closed and rejects arbitrary searches", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { GET } = await import("@/app/api/content/pet-news/route");
    const response = await GET(new Request("https://example.com/api/content/pet-news"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, data: { state: "unavailable", items: [] } });
    expect((await GET(new Request("https://example.com/api/content/pet-news?query=anything"))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
