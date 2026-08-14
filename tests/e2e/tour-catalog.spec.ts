import { expect, test, type Page } from "@playwright/test";
import { chooseConfirmedDeparture, continueToTrip } from "@/tests/e2e/planner-test-helpers";

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
  await page.route("**/api/map/places?**", async (route) => {
    const url = new URL(route.request().url());
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items: requestedPage === 1 ? kakaoItems : [], page: requestedPage, pageSize: 200, totalCount: 3, hasNext: false },
        requestId: "e2e-public-kakao-catalog",
      }),
    });
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `petpass-e2e-${testInfo.project.name}-${testInfo.workerIndex}` });
  await mockKakaoCatalog(page);
  await page.route("**/api/kakao/directions", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { totalDistanceMeters: 1000, totalDurationSeconds: 600, coordinates: [{ latitude: 35.1596, longitude: 129.1603 }, { latitude: 35.1582, longitude: 129.1782 }], sections: [{ distanceMeters: 1000, durationSeconds: 600 }] }, requestId: "e2e-catalog-directions-isolation" }) });
  });
});

test("loads all four public catalog layers with honest candidate labels", async ({ page }) => {
  await page.goto("/results");
  const district = page.getByLabel("부산 세부 지역");
  await expect(district).toHaveValue("all");
  await expect(district.locator("option")).toHaveCount(17);
  await expect(page.getByRole("button", { name: /관광공사/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Kakao 여행 후보 1/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /동물병원 1/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /펫샵 1/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /관광공사/ }).click();
  await expect(page.getByText(/카카오 검색 후보입니다. 방문 전/u).first()).toBeVisible();
  await expect(page.getByText("동반 가능", { exact: true })).toHaveCount(0);
});

test("changes both authoritative providers by district without Kakao discovery", async ({ page }) => {
  const discoveryRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/places/discovery")) discoveryRequests.push(request.url()); });
  await page.goto("/results");
  const tourResponse = page.waitForResponse((response) => response.url().includes("districtCode=500"));
  const kakaoResponse = page.waitForResponse((response) => response.url().includes("/api/map/places?") && response.url().includes("district=500"));
  await page.getByLabel("부산 세부 지역").selectOption("500");
  expect((await tourResponse).status()).toBe(200);
  expect((await kakaoResponse).status()).toBe(200);
  await expect(page).toHaveURL(/district=500/u);
  expect(discoveryRequests).toEqual([]);
});

test("paginates cards by 12 while keeping all filtered places on the map", async ({ page }) => {
  await page.goto("/results");
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  const mapCount = await page.locator(".map-canvas").getAttribute("data-location-count");
  expect(Number(mapCount)).toBeGreaterThan(12);
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.locator('[id^="place-card-"]')).not.toHaveCount(12);

  await page.getByLabel("여행 장소 유형").selectOption("cafe");
  await expect(page.getByRole("heading", { name: /장소 3곳/u })).toBeVisible();
  await expect(page.getByText("광안 동물병원")).toBeVisible();
  await expect(page.getByText("광안 펫샵")).toBeVisible();
  await expect(page).toHaveURL(/category=cafe/u);
});

test("labels a non-Haeundae live detail from its address", async ({ page }) => {
  await page.goto("/places/1106?contentTypeId=12");
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
  const generationResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/itineraries/generate" && response.request().method() === "POST");
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  expect((await generationResponse).status()).toBe(422);
  await expect(page).toHaveURL(/\/results\?tab=recommendations/u);
  expect(requestBody).toMatchObject({ trip: { districtId: "230" } });
  await expect(page.getByRole("alert", { name: "일정을 표시할 수 없어요" })).toBeVisible();
});
