import { expect, test } from "@playwright/test";
import { installFakeMap, mockHomepage } from "./homepage-test-helpers";

// Synthetic evidence only. No actual article text or event payload is persisted.
const news = { state: "ready", items: Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: `합성 테스트 ${i + 1} 반려동물과 함께하는 생활 안전 소식과 길게 이어지는 제목`, originalUrl: `https://example.com/news/${i}`, sourceLabel: "example.com", providedAt: "2026-09-09T01:00:00Z" })) };
const events = { state: "ready", items: Array.from({ length: 3 }, (_, i) => ({ id: String(i), title: `합성 테스트 ${i + 1} 반려동물 박람회`, startDate: "2026-09-12", endDate: i === 1 ? null : "2026-09-14", regionLabel: "부산광역시", venueLabel: "부산광역시 해운대구 합성 테스트로 100", imageUrl: i === 0 ? "/images/home/hero/01-corgi-tulips.png" : null, informationUrl: i === 0 ? "https://example.com/event" : null, status: "upcoming", source: "한국관광공사", checkedAt: "2026-09-09T01:00:00Z" })) };

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-10T03:00:00Z"));
  await installFakeMap(page);
  await mockHomepage(page);
});

for (const width of [1440, 768, 390, 320]) {
  test(`synthetic content layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const calls = { news: 0, events: 0 };
    await page.route("**/api/content/pet-news", route => { calls.news++; return route.fulfill({ json: { ok: true, data: news } }); });
    await page.route("**/api/content/pet-events", route => { calls.events++; return route.fulfill({ json: { ok: true, data: events } }); });
    await page.goto("/");
    await expect(page.locator(".weekendoog-home")).toBeVisible();
    expect(calls).toEqual({ news: 0, events: 0 });
    const section = page.getByRole("region", { name: "반려동물 뉴스와 행사" });
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("ol > li")).toHaveCount(5);
    const carousel = section.getByRole("region", { name: "30일 이내 반려동물 행사" });
    await expect(carousel.getByRole("group", { name: "1 / 3", exact: true })).toBeVisible();
    await expect(carousel.getByRole("heading", { name: events.items[0].title, exact: true })).toBeVisible();
    await expect(section.getByRole("heading", { name: "반려동물 뉴스", exact: true })).toBeVisible();
    await expect(section.getByText("반려동물 입장 조건과 일정 변경 여부는 행사 안내를 확인해 주세요.", { exact: true })).toHaveCount(0);
    expect(calls).toEqual({ news: 1, events: 1 });
    const left = await section.locator('[aria-labelledby="pet-news-heading"]').boundingBox();
    const right = await section.locator('[aria-labelledby="pet-events-heading"]').boundingBox();
    expect(left && right).toBeTruthy();
    if (width > 800) expect(left!.y).toBe(right!.y);
    else expect(right!.y).toBeGreaterThan(left!.y + left!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator("main").evaluate(el => el.nextElementSibling?.tagName)).toBe("FOOTER");
    expect(await section.evaluate(el => el.nextElementSibling?.classList.contains("home-landscape"))).toBe(true);
    await expect(page.locator(".weekendoog-home > .home-bottom-info:last-child")).toHaveCount(1);
    for (const link of await section.getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(link).toHaveAttribute("target", "_blank");
      await link.focus();
      await expect(link).toBeFocused();
      expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
    }
    await section.screenshot({ path: `verification-evidence/homepage-content/synthetic-${width}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await section.scrollIntoViewIfNeeded();
    expect(calls).toEqual({ news: 1, events: 1 });
    expect(errors).toEqual([]);
  });
}

test("independent loading, empty and failure states", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/content/pet-news", async route => { await hold; await route.fulfill({ json: { ok: true, data: { state: "unavailable", items: [] } } }); });
  await page.route("**/api/content/pet-events", route => route.fulfill({ json: { ok: true, data: events } }));
  await page.goto("/");
  const section = page.getByRole("region", { name: "반려동물 뉴스와 행사" });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText("소식을 불러오는 중입니다.")).toBeVisible();
  await expect(section.getByRole("region", { name: "30일 이내 반려동물 행사" }).getByRole("heading", { name: events.items[0].title, exact: true })).toBeVisible();
  release();
  await expect(section.getByText("소식을 불러오지 못했습니다.")).toBeVisible();
  await section.screenshot({ path: "verification-evidence/homepage-content/synthetic-news-failure.png" });
  await page.route("**/api/content/pet-news", route => route.fulfill({ json: { ok: true, data: news } }));
  await page.route("**/api/content/pet-events", route => route.fulfill({ json: { ok: true, data: { state: "unavailable", items: [] } } }));
  await page.reload();
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator("li")).toHaveCount(5);
  await expect(section.getByText("행사 정보를 불러오지 못했습니다.")).toBeVisible();
  await page.route("**/api/content/*", route => route.fulfill({ json: { ok: true, data: { state: "empty", items: [] } } }));
  await page.reload();
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText("현재 표시할 반려동물 소식이 없습니다.")).toBeVisible();
  await expect(section.getByText("조회 기간에 확인된 반려동물 행사가 없습니다.")).toBeVisible();
  await expect(section.getByRole("link")).toHaveCount(0);
  await section.screenshot({ path: "verification-evidence/homepage-content/synthetic-empty.png" });
  await page.goto("/planner/pet");
  await expect(section).toHaveCount(0);
});

test("search event card keeps its source and handles unavailable images", async ({ page }) => {
  await page.route("**/api/content/pet-news", route => route.fulfill({ json: { ok: true, data: news } }));
  await page.route("**/api/content/pet-events", route => route.fulfill({ json: { ok: true, data: { state: "ready", items: [{ ...events.items[0], source: "네이버 검색", imageUrl: "https://search.pstatic.net/test-unavailable.jpg", imageSourceLabel: "관련 이미지 · NAVER 검색" }] } } }));
  await page.route("https://search.pstatic.net/test-unavailable.jpg", route => route.abort());
  await page.goto("/");
  const section = page.getByRole("region", { name: "반려동물 뉴스와 행사" });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText("네이버 검색 · 예정", { exact: true })).toBeVisible();
  await expect(section.getByText("반려동물과 함께하는 만남", { exact: true })).toBeVisible();
  await expect(section.locator("ol > li")).toHaveCount(5);
  await expect(section.getByText("네이버 뉴스에서 보기", { exact: false })).toHaveCount(0);
});
