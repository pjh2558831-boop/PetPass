import { expect, test } from "@playwright/test";
import {
  chooseConfirmedDeparture,
  continueToTrip,
} from "@/tests/e2e/planner-test-helpers";

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `petpass-e2e-${testInfo.project.name}-${testInfo.workerIndex}`,
  });
  await page.route("**/api/kakao/directions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          totalDistanceMeters: 1_000,
          totalDurationSeconds: 600,
          coordinates: [
            { latitude: 35.1596, longitude: 129.1603 },
            { latitude: 35.1582, longitude: 129.1782 },
          ],
          sections: [{ distanceMeters: 1_000, durationSeconds: 600 }],
        },
        requestId: "e2e-catalog-directions-isolation",
      }),
    });
  });
});

test("loads the Busan catalog and exposes the stored-map source layers", async ({
  page,
}) => {
  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/tour/places?") &&
      !response.url().includes("districtCode="),
  );
  await page.goto("/results");
  expect((await listResponse).status()).toBe(200);

  const district = page.getByLabel("부산 세부 지역");
  await expect(district).toHaveValue("all");
  await expect(district.locator("option")).toHaveCount(17);
  await expect(
    page.getByRole("heading", { name: "장소 13곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("제공자 전체 13곳", { exact: true })).toBeVisible();
  await expect(page.getByText("현재 목록 1–12곳", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "저장된 부산 장소" })).toBeVisible();
  await expect(
    page.getByText("카카오 후보는 방문 전 동반 여부 확인"),
  ).toBeVisible();

  const kakaoLayer = page.getByRole("button", { name: "카카오 검색 0" });
  await expect(kakaoLayer).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/확인된 장소 13곳을 표시합니다/u)).toBeVisible();
});

test("changes the Tourism catalog district without calling Kakao discovery", async ({
  page,
}) => {
  const discoveryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/places/discovery")) {
      discoveryRequests.push(request.url());
    }
  });
  await page.goto("/results");
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("districtCode=500"),
  );
  await page.getByLabel("부산 세부 지역").selectOption("500");
  expect((await responsePromise).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "장소 2곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("수영구 실시간 관광 데이터")).toBeVisible();
  expect(discoveryRequests).toEqual([]);
});

test("keeps shopping opt-in and paginates the useful catalog by 12 cards", async ({
  page,
}) => {
  await page.goto("/results");
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(1);

  const shoppingResponse = page.waitForResponse((response) =>
    response.url().includes("contentTypeId=38"),
  );
  await page.getByRole("button", { name: "쇼핑", exact: true }).click();
  expect((await shoppingResponse).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "장소 1곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("쇼핑은 선택형 카테고리입니다.")).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(1);
});

test("labels a non-Haeundae live detail from its address", async ({ page }) => {
  await page.goto("/places/1106?contentTypeId=12");
  await expect(page.getByRole("heading", { name: "광안 해변길" })).toBeVisible();
  await expect(page.getByText("부산 · 수영구", { exact: true })).toBeVisible();
});

test("keeps an official planner district code in memory and uses it on results", async ({
  page,
}) => {
  let requestBody: { trip?: { districtId?: string | null } } | null = null;
  await page.route("**/api/itineraries/generate", async (route) => {
    requestBody = route.request().postDataJSON() as typeof requestBody;
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        status: "insufficient_eligible_places",
        apiVersion: "route-recommendation-response-v1",
        reasonCodes: ["synthetic_district_boundary"],
        userMessage: "입력한 조건을 모두 충족하는 공식 동반 장소가 충분하지 않습니다.",
        retryable: false,
      }),
    });
  });
  await page.goto("/planner/pet");
  await continueToTrip(page);
  const plannerDistrict = page.getByRole("combobox", {
    name: "세부 지역",
    exact: true,
  });
  await expect(plannerDistrict.locator("option")).toHaveCount(17);
  await plannerDistrict.selectOption("230");
  await chooseConfirmedDeparture(page);

  const generationResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/itineraries/generate" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  expect((await generationResponse).status()).toBe(422);
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  expect(requestBody).toMatchObject({ trip: { districtId: "230" } });
  await expect(page.getByRole("alert", { name: "일정을 표시할 수 없어요" })).toBeVisible();
});
