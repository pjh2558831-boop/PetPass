import { expect, test, type Page } from "@playwright/test";
import { chooseConfirmedDeparture, continueToDay, continueToTrip } from "@/tests/e2e/planner-test-helpers";

const kakaoItems = [
  {
    id: "kakao:9001", providerPlaceId: "9001", name: "광안 반려 카페", kind: "pet_travel_candidate", category: "cafe",
    district: { code: "500", name: "수영구" }, address: "부산광역시 수영구 광안해변로 10",
    coordinates: { latitude: 35.15, longitude: 129.11 }, phone: null,
    placeUrl: "https://place.map.kakao.com/9001", source: "kakao_search_candidate",
    reviewStatus: "unreviewed", publicLabel: "동반 여부 확인 필요",
  },
  {
    id: "kakao:9002", providerPlaceId: "9002", name: "광안 동물병원", kind: "veterinary", category: null,
    district: { code: "500", name: "수영구" }, address: "부산광역시 수영구 수영로 20",
    coordinates: { latitude: 35.16, longitude: 129.12 }, phone: "051-000-0000",
    placeUrl: "https://place.map.kakao.com/9002", source: "kakao_search_candidate",
    reviewStatus: "unreviewed", publicLabel: "동물병원",
  },
  {
    id: "kakao:9003", providerPlaceId: "9003", name: "광안 펫샵", kind: "pet_shop", category: null,
    district: { code: "500", name: "수영구" }, address: "부산광역시 수영구 수영로 30",
    coordinates: { latitude: 35.17, longitude: 129.13 }, phone: null,
    placeUrl: "https://place.map.kakao.com/9003", source: "kakao_search_candidate",
    reviewStatus: "needs_review", publicLabel: "펫샵·용품점",
  },
];

async function mockKakaoCatalog(page: Page) {
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "UPSTREAM_ERROR", message: "fallback contract test", retryable: true },
        requestId: "e2e-snapshot-fallback",
      }),
    });
  });
  await page.route("**/api/map/places?**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("region")).toBe("busan");
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { region: { id: "busan", displayName: "부산" }, items: requestedPage === 1 ? kakaoItems : [], page: requestedPage, pageSize: 200, totalCount: 3, hasNext: false },
        requestId: "e2e-public-kakao-catalog",
      }),
    });
  });
}

async function showListMode(page: Page) {
  if ((page.viewportSize()?.width ?? 1_024) > 1_024) return;
  const listMode = page.getByRole("button", { name: "목록", exact: true });
  await expect(listMode).toBeVisible();
  await listMode.click();
}

async function openCatalogFilters(page: Page) {
  const trigger = page
    .locator(".explorer-toolbar-filter")
    .getByRole("button", { name: "필터", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const dropdown = page.getByRole("region", { name: "장소 필터" });
  await expect(dropdown).toBeVisible();
  return dropdown;
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `petpass-e2e-${testInfo.project.name}-${testInfo.workerIndex}` });
  await mockKakaoCatalog(page);
  await page.route("**/api/kakao/directions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { totalDistanceMeters: 1000, totalDurationSeconds: 600, coordinates: [{ latitude: 35.1596, longitude: 129.1603 }, { latitude: 35.1582, longitude: 129.1782 }], sections: [{ distanceMeters: 1000, durationSeconds: 600 }] }, requestId: "e2e-catalog-directions-isolation" }) });
  });
});

test("starts category-first and keeps optional facility records available", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  const district = page.getByRole("combobox", { name: "부산 세부 지역 검색" });
  await expect(district).toHaveValue("부산 전체");
  await expect(page.locator("#district-options-busan option")).toHaveCount(17);
  const categoryPanel = await openCatalogFilters(page);
  for (const label of ["관광지", "식당", "카페", "숙소"]) {
    await expect(categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "true");
  }
  for (const label of ["쇼핑", "동물병원", "펫샵·용품점"]) {
    await expect(categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(page.getByLabel("장소 출처 범례")).toContainText("한국관광공사");
  await expect(page.getByLabel("장소 출처 범례")).toContainText("카카오맵");
  await categoryPanel.getByRole("button", { name: /^동물병원/ }).click();
  await categoryPanel.getByRole("button", { name: /^펫샵·용품점/ }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await showListMode(page);
  await expect(page.getByText("광안 동물병원", { exact: true })).toBeVisible();
  await expect(page.getByText("광안 펫샵", { exact: true })).toBeVisible();
  await expect(page.getByText("반려동물 편의시설", { exact: true })).toHaveCount(0);
  await expect(page.getByText("동반 가능", { exact: true })).toHaveCount(0);
});

test("keeps all providers visible while the category dropdown is open", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  const dropdown = await openCatalogFilters(page);
  await expect(dropdown.getByText("출처", { exact: true })).toHaveCount(0);
  await expect(dropdown.getByRole("button", { name: /^한국관광공사/u })).toHaveCount(0);
  await expect(dropdown.getByRole("button", { name: /^카카오맵/u })).toHaveCount(0);
  await expect(page.getByLabel("장소 출처 범례")).toContainText("한국관광공사");
  await expect(page.getByLabel("장소 출처 범례")).toContainText("카카오맵");
  await expect(page).not.toHaveURL(/layers=/u);
});

test("filters both authoritative providers by district locally without Kakao discovery", async ({ page }) => {
  const discoveryRequests: string[] = [];
  const baseCatalogRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/places/discovery") discoveryRequests.push(request.url());
    if (
      url.pathname === "/api/map/places/snapshot" ||
      url.pathname === "/api/map/places" ||
      (url.pathname === "/api/tour/places" && url.searchParams.get("view") === "markers")
    ) baseCatalogRequests.push(request.url());
  });
  await page.goto("/results?tab=catalog&region=busan&page=1");
  await showListMode(page);
  await expect(page.getByRole("heading", { name: /총 \d+곳/u })).toBeVisible();
  await expect.poll(() => baseCatalogRequests.length).toBe(3);
  const beforeDistrictChange = baseCatalogRequests.length;
  await page
    .getByRole("combobox", { name: "부산 세부 지역 검색" })
    .fill("수영구");
  await expect(page).toHaveURL(/district=500/u);
  await expect(page.getByRole("heading", { name: /총 \d+곳/u })).toBeVisible();
  expect(baseCatalogRequests).toHaveLength(beforeDistrictChange);
  expect(discoveryRequests).toEqual([]);
});

test("paginates cards by 12 while keeping all filtered places on the map", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  await showListMode(page);
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  const mapCount = await page.locator(".map-canvas").getAttribute("data-location-count");
  expect(Number(mapCount)).toBeGreaterThan(12);
  const firstPageCardId = await page.locator('[id^="place-card-"]').first().getAttribute("id");
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("2");
  await expect(page.locator('[id^="place-card-"]').first()).not.toHaveAttribute("id", firstPageCardId ?? "");

  let filterMenu = await openCatalogFilters(page);
  await filterMenu.getByRole("button", { name: /^관광지/ }).click();
  await filterMenu.getByRole("button", { name: /^식당/ }).click();
  await filterMenu.getByRole("button", { name: /^숙소/ }).click();
  await filterMenu.getByRole("button", { name: "적용하기" }).click();
  await showListMode(page);
  await expect(page).toHaveURL(/categories=cafe/u);
  await expect(page.getByRole("heading", { name: /총 \d+곳/ })).toBeVisible();
  await expect(page.getByText("광안 반려 카페", { exact: true })).toBeVisible();
  await expect(page.getByText("광안 동물병원")).toHaveCount(0);
  filterMenu = await openCatalogFilters(page);
  await filterMenu.getByRole("button", { name: /^동물병원/ }).click();
  await filterMenu.getByRole("button", { name: "적용하기" }).click();
  await showListMode(page);
  await expect(page.getByText("광안 동물병원")).toBeVisible();
  filterMenu = await openCatalogFilters(page);
  await filterMenu.getByRole("button", { name: /^펫샵·용품점/ }).click();
  await filterMenu.getByRole("button", { name: "적용하기" }).click();
  await showListMode(page);
  await expect(page.getByText("광안 펫샵")).toBeVisible();
});

test("supports all, default reset, recommendation, and popularity fallback", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  let panel = await openCatalogFilters(page);
  for (const label of ["쇼핑", "동물병원", "펫샵·용품점"]) {
    await panel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await panel.getByRole("button", { name: "적용하기" }).click();
  await expect(page).toHaveURL(/categories=attraction%2Cfood%2Ccafe%2Caccommodation%2Cshopping%2Cveterinary%2Cpet_shop/u);
  panel = await openCatalogFilters(page);
  await panel.getByRole("button", { name: "초기화", exact: true }).click();
  await panel.getByRole("button", { name: "적용하기" }).click();
  await expect(page).not.toHaveURL(/categories=/u);
  await showListMode(page);
  const sort = page.getByLabel("정렬");
  await expect(sort).toHaveValue("recommendation");
  await sort.selectOption("popularity");
  await expect(page.getByText("이용 데이터가 쌓이는 동안 추천순을 함께 반영합니다.")).toBeVisible();
  await expect(page.getByText(/인기 배지/u)).toHaveCount(0);
});

test("labels a non-Haeundae live detail from its address", async ({ page }) => {
  await page.goto("/places/1106?contentTypeId=12&region=busan");
  await expect(page.getByRole("heading", { name: "광안 해변길" })).toBeVisible();
  await expect(page.getByText("부산 · 수영구", { exact: true })).toBeVisible();
});

test("keeps an official planner district code in memory and uses it on results", async ({ page }) => {
  let requestBody: { trip?: { districtId?: string | null } } | null = null;
  await page.route("**/api/itineraries/generate", async (route) => {
    requestBody = route.request().postDataJSON() as typeof requestBody;
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ status: "insufficient_eligible_places", apiVersion: "route-recommendation-response-v1", reasonCodes: ["synthetic_district_boundary"], userMessage: "입력한 조건을 모두 충족하는 공식 동반 장소가 충분하지 않습니다.", retryable: false }) });
  });
  await page.goto("/planner/pet");
  await continueToTrip(page);
  const plannerDistrict = page.getByRole("combobox", { name: "세부 지역", exact: true });
  await expect(plannerDistrict.locator("option")).toHaveCount(17);
  await plannerDistrict.selectOption("230");
  await chooseConfirmedDeparture(page);
  await continueToDay(page);
  const generationResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/itineraries/generate" && response.request().method() === "POST");
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  expect((await generationResponse).status()).toBe(422);
  await expect(page).toHaveURL(/\/results\?tab=recommendations/u);
  expect(requestBody).toMatchObject({ trip: { districtId: "230" } });
  await expect(page.getByRole("alert", { name: "일정을 표시할 수 없어요" })).toBeVisible();
});
