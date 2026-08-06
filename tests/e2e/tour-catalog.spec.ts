import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Catalog tests exercise the real Tourism Route Handler and its upstream mock.
  // Isolate unrelated directions calls so parallel tests do not consume its rate limit.
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

test("uses all Busan by default and exposes every verified district", async ({
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
  await expect(page.getByText("장소 13곳")).toBeVisible();
  await expect(page.getByText("부산 전체", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("부산 여행 편집숍")).toHaveCount(0);
});

test("changes the upstream district scope and renders a truthful empty state", async ({
  page,
}) => {
  await page.goto("/results");
  await expect(page.getByText("장소 13곳")).toBeVisible();

  const districtResponse = page.waitForResponse((response) =>
    response.url().includes("districtCode=350"),
  );
  await page.getByLabel("부산 세부 지역").selectOption("350");
  expect((await districtResponse).status()).toBe(200);
  await expect(page.getByText("장소 3곳")).toBeVisible();
  await expect(page.getByText("해운대구 실시간 관광 데이터")).toBeVisible();

  const festivalResponse = page.waitForResponse(
    (response) =>
      response.url().includes("districtCode=350") &&
      response.url().includes("contentTypeId=15"),
  );
  await page.getByRole("button", { name: "축제·행사" }).click();
  expect((await festivalResponse).status()).toBe(200);
  await expect(
    page.getByText("해운대구에서 이 유형으로 제공된 장소가 없습니다."),
  ).toBeVisible();
});

test("keeps shopping opt-in and known requested types out of 기타", async ({
  page,
}) => {
  await page.goto("/results");
  await expect(page.getByText("장소 13곳")).toBeVisible();
  await expect(page.getByText("기타", { exact: true })).toHaveCount(0);

  const attractionLink = page.getByRole("link", {
    name: "해운대 해수욕장 원문 상세 보기",
  });
  await expect(attractionLink).toHaveAttribute(
    "href",
    "/places/1001?contentTypeId=12",
  );

  const shoppingResponse = page.waitForResponse((response) =>
    response.url().includes("contentTypeId=38"),
  );
  await page.getByRole("button", { name: "쇼핑(선택)" }).click();
  expect((await shoppingResponse).status()).toBe(200);
  await expect(page.getByText("장소 1곳")).toBeVisible();
  await expect(page.getByText("부산 여행 편집숍")).toBeVisible();
  await expect(page.getByText("쇼핑", { exact: true })).toBeVisible();
  await expect(page.getByText("기타", { exact: true })).toHaveCount(0);
});

test("paginates the completed provider catalog instead of hiding later pages", async ({
  page,
}) => {
  await page.goto("/results");
  await expect(page.getByText("1 / 2페이지 · 현재 12곳")).toBeVisible();

  const secondPageResponse = page.waitForResponse((response) =>
    response.url().includes("page=2"),
  );
  await page.getByRole("button", { name: "다음" }).click();
  const response = await secondPageResponse;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    ok: boolean;
    data?: { page?: number; totalCount?: number; places?: unknown[] };
  };
  expect(body).toMatchObject({
    ok: true,
    data: { page: 2, totalCount: 13 },
  });
  expect(body.data?.places).toHaveLength(1);
  await expect(page.getByText("2 / 2페이지 · 현재 1곳")).toBeVisible();
});

test("saves an official planner district code and uses it on results", async ({
  page,
}) => {
  await page.goto("/planner/trip");
  const plannerDistrict = page.getByLabel("세부 지역");
  await expect(plannerDistrict).toHaveValue("all");
  await expect(plannerDistrict.locator("option")).toHaveCount(17);
  await plannerDistrict.selectOption("230");

  const scopedResponse = page.waitForResponse((response) =>
    response.url().includes("districtCode=230"),
  );
  await page.getByRole("button", { name: "추천 경로 보기" }).click();
  expect((await scopedResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect(page.getByLabel("여행 범위")).toHaveValue("230");
  await page.getByRole("tab", { name: "전체 장소" }).click();
  await expect(page.getByLabel("부산 세부 지역")).toHaveValue("230");
  await expect(page.getByText("장소 2곳")).toBeVisible();
});
