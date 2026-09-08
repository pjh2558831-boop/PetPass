import { expect, test } from "@playwright/test";
import { getMapEnabledRegionConfigs } from "@/lib/regions/config";
import { installFakeMap, mockHomepage } from "./homepage-test-helpers";

test("nationwide home keeps regional successes, retries failures and synchronizes filters and selection", async ({ page }) => {
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
  await expect(page.getByText("전국 17개 시·도 중 16개 지역 조회 완료", { exact: false })).toBeVisible();
  await expect(workbench.locator(".homepage-workbench-heading strong")).toHaveText("32곳");
  await expect(workbench.locator(".homepage-workbench-row")).toHaveCount(12);
  failSeoul = false;
  await workbench.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByText("전국 17개 시·도 중 17개 지역 조회 완료", { exact: true })).toBeVisible();
  expect(calls.filter((id) => id !== "seoul")).toHaveLength(16);
  await page.getByLabel("홈 지도 지역", { exact: true }).selectOption("seoul");
  await expect(workbench.locator(".homepage-workbench-row")).toHaveCount(2);
  await page.getByLabel("홈 지도 장소 유형", { exact: true }).selectOption("cafe");
  await expect(workbench.locator(".homepage-workbench-row")).toHaveCount(1);
  await expect(workbench.getByText("조건 확인 필요 · 테라스만 가능 · 방문 전 확인 필요", { exact: true })).toBeVisible();
  await workbench.getByRole("button", { name: "서울 조건부 카페 지도에서 보기", exact: true }).click();
  await expect(workbench.locator('[data-map-focused="true"]')).toHaveCount(1);
  await expect(workbench.getByRole("checkbox", { name: "서울 조건부 카페 일정에 담기" })).toBeVisible();
  await workbench.getByRole("checkbox", { name: "서울 조건부 카페 일정에 담기" }).check();
  await expect(page.locator(".home-selected-itinerary")).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1180) {
    await page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" }).getByRole("button", { name: "지도", exact: true }).click();
  }
  await expect(workbench.locator('[data-kakao-map-initialized="true"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
