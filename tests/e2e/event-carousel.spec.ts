import { test, expect } from "@playwright/test";
import { installFakeMap, mockHomepage } from "./homepage-test-helpers";

test("all 30-day events rotate, support controls and pause", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-09T03:00:00Z") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installFakeMap(page); await mockHomepage(page);
  await page.route("**/api/content/pet-events", route => route.fulfill({ json: { ok: true, data: { state: "ready", items: Array.from({ length: 5 }, (_, i) => ({ id: `event-${i}`, title: `반려동물 행사 ${i + 1}`, startDate: "2026-09-10", endDate: "2026-09-12", status: "upcoming", source: "한국관광공사", regionLabel: "부산", venueLabel: "전시장", informationUrl: null, checkedAt: "2026-09-09T03:00:00Z" })) } } }));
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "30일 이내 반려동물 행사" });
  await page.locator("#pet-events-heading").scrollIntoViewIfNeeded();
  await expect(carousel.getByRole("heading", { name: "반려동물 행사 1", exact: true })).toBeVisible();
  await page.clock.fastForward(5100);
  await expect(carousel.getByRole("heading", { name: "반려동물 행사 2", exact: true })).toBeVisible();
  await carousel.getByRole("button", { name: "자동 넘김 일시정지" }).click();
  await page.clock.fastForward(10000);
  await expect(carousel.getByRole("heading", { name: "반려동물 행사 2", exact: true })).toBeVisible();
  for (let i = 3; i <= 5; i++) { await carousel.getByRole("button", { name: "다음 행사" }).click(); await expect(carousel.getByRole("heading", { name: `반려동물 행사 ${i}`, exact: true })).toBeVisible(); }
  await carousel.getByRole("button", { name: "다음 행사" }).click();
  await expect(carousel.getByRole("heading", { name: "반려동물 행사 1", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(carousel.getByRole("button", { name: "자동 넘김 재생" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
