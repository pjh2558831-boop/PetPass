import { expect, test } from "@playwright/test";
import { getMapEnabledRegionConfigs } from "@/lib/regions/config";
import { installFakeMap, mockHomepage, nationwideHomepageSnapshot } from "./homepage-test-helpers";

test("nationwide home loads only the zoomed region, caches revisits and preserves selection", async ({ page }) => {
  await installFakeMap(page);
  await mockHomepage(page);
  const regions = getMapEnabledRegionConfigs();
  let failSeoul = true;
  const calls: string[] = [];
  await page.route("**/api/map/places/snapshot?**", (route) => {
    const id = new URL(route.request().url()).searchParams.get("region");
    const region = regions.find((value) => value.id === id)!;
    calls.push(region.id);
    if (region.id === "seoul" && failSeoul) return route.fulfill({ status: 503, json: { ok: false } });
    const index = regions.indexOf(region);
    const items = ["tourism", "kakao"].map((layer, offset) => ({
      id: `${offset ? "kakao" : "tour"}:${90000 + index * 2 + offset}`,
      name: `${region.displayName} ${offset ? "조건부 카페" : "공식 관광지"}`,
      layer, category: offset ? "cafe" : "attraction", districtCode: region.districts[0]!.legalDongDistrictCode,
      coordinates: region.defaultMapCenter,
      petAccessVerdict: offset ? "conditional" : "allowed",
      publicLabel: offset ? "조건 확인 필요" : "동반 가능",
      ...(offset ? { petConditions: "테라스만 가능" } : {}),
    }));
    return route.fulfill({ json: { ok: true, data: {
      contractVersion: 1, region: region.id, scope: "default", dataset: "core",
      generatedAt: "2026-09-08T00:00:00Z", publicationVersion: "p1-aaaaaaaaaaaaaaaa",
      dataVersion: "v1-aaaaaaaaaaaaaaaa", totalCount: 2,
      providerCounts: { tour: 1, kakao: 1 }, categoryCounts: { attraction: 1, cafe: 1 },
      freshness: { status: "fresh" }, items,
    } } });
  });
  await page.goto("/");
  const workbench = page.locator(".homepage-map-section");
  await expect(workbench.locator(".homepage-workbench-heading strong")).toHaveText("17개 지역");
  await expect(workbench.locator(".kakao-map-marker--region")).toHaveCount(17);
  expect(calls).toEqual([]);
  await page.locator(".home-region-overview").getByRole("button", { name: "부산", exact: false }).click();
  await expect(workbench.locator(".homepage-workbench-row")).toHaveCount(2);
  expect(calls).toEqual(["busan"]);
  await expect(workbench.locator(".map-canvas")).toHaveAttribute("data-location-count", "2");
  const seoul = regions.find(region => region.id === "seoul")!;
  await workbench.locator('[data-fake-map-ready="true"]').evaluate((node, detail) => node.dispatchEvent(new CustomEvent("test:viewport", { detail })), { ...seoul.defaultMapCenter, level: 9 });
  await expect(page.getByText("서울 장소를 불러오지 못했습니다.", { exact: true })).toBeVisible();
  expect(calls).toEqual(["busan", "seoul"]);
  failSeoul = false;
  await workbench.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(workbench.locator(".homepage-workbench-row")).toHaveCount(2);
  expect(calls).toEqual(["busan", "seoul", "seoul"]);
  await page.locator(".home-map-filters summary").click();
  await page.getByLabel("홈 지도 장소 유형", { exact: true }).selectOption("cafe");
  await expect(workbench.locator(".homepage-workbench-row")).toHaveCount(1);
  await workbench.getByRole("checkbox", { name: "서울 조건부 카페 일정에 담기" }).check();
  await expect(page.locator(".home-selected-itinerary")).toBeVisible();
  await workbench.locator('[data-fake-map-ready="true"]').evaluate((node, detail) => node.dispatchEvent(new CustomEvent("test:viewport", { detail })), { ...seoul.defaultMapCenter, level: 12 });
  await expect(workbench.locator(".homepage-workbench-heading strong")).toHaveText("17개 지역");
  await expect(workbench.locator(".kakao-map-marker--region")).toHaveCount(17);
  await expect(page.locator(".home-selected-itinerary__item")).toHaveCount(1);
  await page.locator(".home-region-overview").getByRole("button", { name: "부산", exact: false }).click();
  await expect(workbench.locator(".homepage-workbench-row")).toHaveCount(1);
  expect(calls.filter(id => id === "busan")).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  console.log(JSON.stringify({ initialSnapshotRequests: 0, overviewMarkers: 17, regionalMarkers: 2, loadedRegions: [...new Set(calls)] }));
});


test("ignores an old regional response after returning to the nationwide overview", async ({ page }) => {
  await installFakeMap(page);
  await mockHomepage(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/map/places/snapshot?**", async route => {
    await gate;
    await route.fulfill({ json: nationwideHomepageSnapshot() }).catch(() => undefined);
  });
  await page.goto("/");
  const requested = page.waitForRequest("**/api/map/places/snapshot?**");
  await page.locator(".home-region-overview").getByRole("button", { name: "부산", exact: false }).click();
  await requested;
  await expect(page.getByText("부산 장소를 불러오는 중입니다.", { exact: true })).toBeVisible();
  await expect(page.locator(".home-region-navigation")).toHaveCount(0);
  await page.locator(".home-map-filters summary").click();
  await page.getByLabel("홈 지도 지역", { exact: true }).selectOption("all");
  release();
  await expect(page.locator(".homepage-live-ready")).toHaveAttribute("data-active-region", "overview");
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(0);
  await expect(page.locator(".home-region-overview button")).toHaveCount(17);
});
