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
    "2026.09.08 ~ 09.10 / 다음 행사 2026.09.11 ~ 09.13", "2026.09.10 ~ 09.08", "2026.09.10 ~ 09.12 대행 용역 입찰",
  ])("excludes expired, unknown, ambiguous or cancelled dates: %s", description => {
    expect(normalizeNaverEvents({ items: [{ ...item, description }] }, now)).toEqual([]);
  });
  it("keeps every matching event through day 30 without the former three-item cap", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ ...item, title: `2026 반려동물 박람회 ${i}`, link: `https://example.com/${i}`, description: "2026.10.09 ~ 10.10" }));
    const result = normalizeNaverEvents({ items: [...rows, { ...item, description: "2026.10.10 ~ 10.11" }] }, now);
    expect(result).toHaveLength(5);
  });
  it("rejects invalid contracts, non-pet results and unsafe links", () => {
    expect(() => normalizeNaverEvents({ items: "bad" }, now)).toThrow();
    expect(normalizeNaverEvents({ items: [{ ...item, link: "javascript:alert(1)" }, { ...item, title: "트럼펫 축제" }] }, now)).toEqual([]);
  });
  it.each([
    "https://blog.naver.com/person/123",
    "https://cafe.naver.com/petcafe/123",
    "https://someone.tistory.com/entry/event",
    "https://www.instagram.com/p/event",
  ])("excludes personal posts from event results: %s", link => {
    expect(normalizeNaverEvents({ items: [{ ...item, link }] }, now)).toEqual([]);
  });
  it("excludes general trade fairs and stops venue text at the next field", () => {
    const result = normalizeNaverEvents({ items: [
      { ...item, title: "국제할랄박람회", description: "2026.09.08 ~ 09.10 / 전시 품목: 반려동물 사료 및 용품" },
      { ...item, description: "2026.09.08 ~ 09.10 / 장소: 송도컨벤시아 / 대상: 반려견 보호자" },
    ] }, now);
    expect(result).toHaveLength(1);
    expect(result[0].venueLabel).toBe("송도컨벤시아");
  });
  it("includes cat and pet shows and uses explicitly labelled exhibition dates instead of registration dates", () => {
    const rows = [
      { ...item, title: "2026 부산캣쇼", description: "사전등록기간: 2026.08.01 ~ 09.10; 전시기간: 2026.09.11 ~ 09.13; 개최장소: 벡스코" },
      { ...item, title: "2026 서울펫쇼", link: "https://example.com/show", description: "2026.10.02 ~ 10.04" },
    ];
    const result = normalizeNaverEvents({ items: rows }, now);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startDate: "2026-09-11", endDate: "2026-09-13", venueLabel: "벡스코" });
  });
  it("deduplicates the same named fair and date across search title variants", () => {
    const rows = [
      { ...item, title: "2026 케이펫페어 송도 - 행사 안내" },
      { ...item, title: "-2026 케이펫페어 송도 K-PET FAIR SONGDO", link: "https://example.com/second" },
      { ...item, title: "2026 케이펫페어 수원", link: "https://example.com/other-city" },
    ];
    expect(normalizeNaverEvents({ items: rows }, now)).toHaveLength(2);
  });
  it("uses the event name adjacent to its explicit date when a search title is a generic schedule", () => {
    const rows = [
      { ...item, title: "케이펫페어 2026 일정", description: "케이펫페어 대구 시즌2 2026년 10월 2일 ~ 10월 4일" },
      { ...item, title: "2026 케이펫페어 대구", description: "2026.10.02 ~ 10.04" },
    ];
    const result = normalizeNaverEvents({ items: rows }, now);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("2026 케이펫페어 대구 시즌2");
  });
  it("rejects a historical event title paired with a different year's date", () => {
    expect(normalizeNaverEvents({ items: [{ ...item, title: "2025 춘천 반려동물 페스티벌", description: "2026.10.09 ~ 10.11" }] }, now)).toEqual([]);
  });
  it("fetches current-month search and only matching provider thumbnails", async () => {
    vi.resetModules();
    vi.useFakeTimers(); vi.setSystemTime(now);
    vi.stubEnv("NAVER_API_HUB_ACCESS_KEY_ID", "synthetic-id"); vi.stubEnv("NAVER_API_HUB_SECRET_KEY", "synthetic-secret");
    const fetcher = vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith("webkr") ? { items: [{ ...item, title: item.title + " - 행사 혜택 안내" }] } : { items: [{ title: "2025 반려동물 박람회", thumbnail: "https://search.pstatic.net/old.jpg" }, { title: "관계없는 사진", thumbnail: "https://example.com/wrong.jpg" }, { title: item.title, thumbnail: "https://search.pstatic.net/photo.jpg", link: "https://media.s3.amazonaws.com/poster.jpg" }] })));
    vi.stubGlobal("fetch", fetcher);
    const { getNaverEventFeed } = await import("@/lib/naver/events");
    const feed = await getNaverEventFeed();
    expect(feed).toMatchObject({ state: "ready", items: [{ imageUrl: "https://media.s3.amazonaws.com/poster.jpg", imageSourceLabel: "관련 이미지 · NAVER 검색" }] });
    expect(fetcher.mock.calls[0][0].searchParams.get("query")).toContain("2026 9월");
    const queries = fetcher.mock.calls.map(([url]) => url).filter(url => url.pathname.endsWith("webkr")).map(url => url.searchParams.get("query"));
    expect(queries).toHaveLength(8);
    expect(queries.some(query => query?.includes("9월 국내 캣쇼"))).toBe(true);
    expect(queries.some(query => query?.includes("10월 국내 펫페어"))).toBe(true);
    await getNaverEventFeed(); expect(fetcher).toHaveBeenCalledTimes(9);
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


it("normalizes a verbose exhibition title and matches its city, year and edition", async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("NAVER_API_HUB_ACCESS_KEY_ID", "synthetic-id");
  vi.stubEnv("NAVER_API_HUB_SECRET_KEY", "synthetic-secret");
  const title = "-2026 케이펫페어 청주 시즌2 K-PET FAIR CHEONGJU 2 2026 (사)한국펫사료";
  const fetcher = vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith("webkr")
    ? { items: [{ ...item, title }] }
    : { items: [
      { title: "2025 케이펫페어 청주 시즌2", thumbnail: "https://search.pstatic.net/old.jpg" },
      { title: "2026 케이펫페어 부산 시즌2", thumbnail: "https://search.pstatic.net/other-city.jpg" },
      { title: "2026 케이펫페어 청주 시즌1", thumbnail: "https://search.pstatic.net/other-edition.jpg" },
      { title: "케이펫페어 청주 시즌2 2026", thumbnail: "https://search.pstatic.net/correct.jpg" },
    ] })));
  vi.stubGlobal("fetch", fetcher);
  const { getNaverEventFeed } = await import("@/lib/naver/events");
  expect((await getNaverEventFeed()).items[0]).toMatchObject({ title: "2026 케이펫페어 청주 시즌2", imageUrl: "https://search.pstatic.net/correct.jpg" });
  expect(fetcher.mock.calls.find(([url]) => url.pathname.endsWith("image"))?.[0].searchParams.get("query")).toBe("2026 케이펫페어 청주 시즌2");
});

it.each([
  ["https://showala.com/ex/ex_detail.php?idx=3191", "https://showala.com/data/ex/poster", "https://showala.com/data/ex/poster", 1],
  ["https://showala.com/ex/ex_detail.php?idx=3191", "https://other.example/poster", null, 1],
  ["https://showala.com.evil.example/ex/ex_detail.php?idx=3191", "https://showala.com/data/ex/poster", null, 0],
  ["https://showala.com/ex/ex_detail.php?idx=wrong", "https://showala.com/data/ex/poster", null, 0],
])("only uses the linked exhibition's own poster: %s / %s", async (link, poster, expected, pageRequests) => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("NAVER_API_HUB_ACCESS_KEY_ID", "synthetic-id");
  vi.stubEnv("NAVER_API_HUB_SECRET_KEY", "synthetic-secret");
  const fetcher = vi.fn(async (url: URL) => url.hostname === "showala.com"
    ? new Response(`<div class="exb_img_wrap" style="background-image:url('${poster}');">`)
    : new Response(JSON.stringify({ items: url.pathname.endsWith("webkr") ? [{ ...item, link }] : [] })));
  vi.stubGlobal("fetch", fetcher);
  const { getNaverEventFeed } = await import("@/lib/naver/events");
  const feed = await getNaverEventFeed();
  expect(feed.items[0].imageUrl).toBe(expected);
  if (expected) expect(feed.items[0].imageSourceLabel).toBe("행사 포스터 · SHOWALA");
  await getNaverEventFeed();
  expect(fetcher.mock.calls.filter(([url]) => url.hostname === "showala.com")).toHaveLength(pageRequests);
});
