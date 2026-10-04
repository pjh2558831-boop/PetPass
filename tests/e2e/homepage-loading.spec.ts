import { expect, test } from "@playwright/test";
import { installFakeMap, installHomepageImageFixture, mockHomepage, nationwideHomepageSnapshot, SNAPSHOT } from "./homepage-test-helpers";

test("compact recommendation cards load independently of map data and cache regional revisits", async ({ page }, testInfo) => {
  await mockHomepage(page);
  await installFakeMap(page);
  await installHomepageImageFixture(page);
  await page.route("https://dapi.kakao.com/**", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  let releaseMap!: () => void;
  const mapGate = new Promise<void>(resolve => { releaseMap = resolve; });
  await page.route("**/api/map/places/snapshot?**", async route => {
    await mapGate;
    const region = new URL(route.request().url()).searchParams.get("region")!;
    await route.fulfill({ json: nationwideHomepageSnapshot(SNAPSHOT, region) });
  });
  const cardRegions: string[] = [];
  const completionRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/homepage/places/initial") {
      expect(url.searchParams.get("scope")).toBe("cards");
      cardRegions.push(url.searchParams.get("region")!);
    }
    if (url.pathname === "/api/homepage/places/completion") completionRequests.push(url.pathname);
  });
  await page.goto("/");
  const recommendations = page.locator(".home-recommendations");
  await expect(recommendations.locator(".homepage-place-card").first()).toBeVisible();
  await expect(page.getByText("서울 장소를 불러오는 중입니다.", { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="preload"][as="script"][href*="dapi.kakao.com"]')).toHaveCount(1);
  releaseMap();
  await expect(page.getByText("서울 장소를 불러오는 중입니다.", { exact: true })).toHaveCount(0);
  await recommendations.getByRole("button", { name: "인천", exact: true }).click();
  await expect(recommendations.getByRole("region", { name: "인천 장소 카드" })).toBeVisible();
  await recommendations.getByRole("button", { name: "서울", exact: true }).click();
  await expect(recommendations.getByRole("region", { name: "서울 장소 카드" })).toBeVisible();
  expect(cardRegions.filter(region => region === "seoul")).toHaveLength(1);
  expect(cardRegions.filter(region => region === "incheon")).toHaveLength(1);
  expect(completionRequests).toHaveLength(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("homepage-loading.png"), fullPage: true });
});
