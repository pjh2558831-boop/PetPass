import { describe, expect, it, vi, afterEach } from "vitest";
import { normalizeNaverEvents } from "@/lib/naver/events";

const now = new Date("2026-09-09T03:00:00Z");
const item = { title: "2026 반려동물 박람회", link: "https://example.com/pet", description: "일정: 2026.09.08 ~ 09.10 | 장소: 수원 전시장" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Naver event search evidence", () => {
  it("uses explicit date ranges, preserves sources and prioritizes ongoing events", () => {
    const result = normalizeNaverEvents({ items: [
      { ...item, title: "미래 반려동물 박람회", description: "2026년 9월 11일(금) ~ 13일(일)" }, item, item,
    ] }, now);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ status: "ongoing", startDate: "2026-09-08", endDate: "2026-09-10", venueLabel: "수원 전시장", source: "네이버 검색", sourceText: item.description });
    expect(result[1]).toMatchObject({ status: "upcoming", endDate: "2026-09-13" });
  });
  it.each([
    "2025.09.08 ~ 09.10", "9월 8일 ~ 10일", "2026.09.09 게시, 오늘 진행 중", "2026.02.30 ~ 2026.09.10", "2026.09.08 ~ 09.10 행사 취소",
    "2026.09.08 ~ 09.10 / 다음 행사 2026.09.11 ~ 09.13", "2026.09.10 ~ 09.08",
  ])("excludes expired, unknown, ambiguous or cancelled dates: %s", description => {
    expect(normalizeNaverEvents({ items: [{ ...item, description }] }, now)).toEqual([]);
  });
  it("rejects invalid contracts, non-pet results and unsafe links", () => {
    expect(() => normalizeNaverEvents({ items: "bad" }, now)).toThrow();
    expect(normalizeNaverEvents({ items: [{ ...item, link: "javascript:alert(1)" }, { ...item, title: "트럼펫 축제" }] }, now)).toEqual([]);
  });
  it("excludes general trade fairs and stops venue text at the next field", () => {
    const result = normalizeNaverEvents({ items: [
      { ...item, title: "국제할랄박람회", description: "2026.09.08 ~ 09.10 / 전시 품목: 반려동물 사료 및 용품" },
      { ...item, description: "2026.09.08 ~ 09.10 / 장소: 송도컨벤시아 / 대상: 반려견 보호자" },
    ] }, now);
    expect(result).toHaveLength(1);
    expect(result[0].venueLabel).toBe("송도컨벤시아");
  });
  it("fetches current-month search and only matching provider thumbnails", async () => {
    vi.resetModules();
    vi.useFakeTimers(); vi.setSystemTime(now);
    vi.stubEnv("NAVER_API_HUB_ACCESS_KEY_ID", "synthetic-id"); vi.stubEnv("NAVER_API_HUB_SECRET_KEY", "synthetic-secret");
    const fetcher = vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith("webkr") ? { items: [item] } : { items: [{ title: "관계없는 사진", thumbnail: "https://example.com/wrong.jpg" }, { title: item.title, thumbnail: "https://search.pstatic.net/photo.jpg" }] })));
    vi.stubGlobal("fetch", fetcher);
    const { getNaverEventFeed } = await import("@/lib/naver/events");
    const feed = await getNaverEventFeed();
    expect(feed).toMatchObject({ state: "ready", items: [{ imageUrl: "https://search.pstatic.net/photo.jpg", imageSourceLabel: "관련 이미지 · NAVER 검색" }] });
    expect(fetcher.mock.calls[0][0].searchParams.get("query")).toContain("2026 9월");
    await getNaverEventFeed(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});


it("isolates a disabled web search API from working news and image searches", async () => {
  vi.resetModules();
  vi.stubEnv("NAVER_API_HUB_ACCESS_KEY_ID", "synthetic-id");
  vi.stubEnv("NAVER_API_HUB_SECRET_KEY", "synthetic-secret");
  const fetcher = vi.fn(async (url: URL) => url.pathname.endsWith("webkr")
    ? new Response(JSON.stringify({ error: { errorCode: 401, message: "API disabled" } }), { status: 401 })
    : new Response(JSON.stringify({ items: [] })));
  vi.stubGlobal("fetch", fetcher);
  const { naverSearch } = await import("@/lib/naver/search");
  await expect(naverSearch("webkr", { query: "test", display: "1" })).rejects.toMatchObject({ code: "AUTHENTICATION" });
  await expect(naverSearch("news", { query: "test", display: "1" })).resolves.toEqual({ items: [] });
  await expect(naverSearch("image", { query: "test", display: "1" })).resolves.toEqual({ items: [] });
  await expect(naverSearch("webkr", { query: "test", display: "1" })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
