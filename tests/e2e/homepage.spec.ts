import { expect, test } from "@playwright/test";

test("offers itinerary creation and immediate place discovery", async ({ page }) => {
  await page.goto("/");

  const primary = page.getByRole("link", { name: "여행 계획 시작하기" });
  const discovery = page.getByRole("link", { name: "방문 가능 장소 보기" });
  await expect(primary).toHaveAttribute("href", "/planner/pet");
  await expect(discovery).toHaveAttribute("href", "/results");

  await discovery.click();
  await expect(page).toHaveURL(/\/results$/u);
  await expect(page.getByRole("tab", { name: "전체 장소" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("keeps both homepage actions readable without mobile overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const primary = page.getByRole("link", { name: "여행 계획 시작하기" });
  const discovery = page.getByRole("link", { name: "방문 가능 장소 보기" });
  await expect(primary).toBeVisible();
  await expect(discovery).toBeVisible();
  const primaryBox = await primary.boundingBox();
  const discoveryBox = await discovery.boundingBox();
  expect(primaryBox?.width).toBeGreaterThan(300);
  expect(discoveryBox?.width).toBe(primaryBox?.width);
  expect(discoveryBox?.y).toBeGreaterThan(primaryBox?.y ?? 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
