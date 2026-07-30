import { expect, test } from "@playwright/test";

test("creates and edits the Busan small-dog demo itinerary", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /함께 들어갈 수 있는 곳/ }),
  ).toBeVisible();

  await page.getByRole("link", { name: "부산 데모 여행 만들기" }).click();
  await page.getByLabel("반려동물 이름").fill("콩이");
  await page.getByRole("button", { name: "여행 조건 정하기" }).click();

  await expect(page).toHaveURL(/\/planner\/trip$/);
  await page.getByRole("button", { name: "추천 경로 보기" }).click();

  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("콩이 · 소형 반려동물 · 이동장 있음")).toBeVisible();
  await page.getByRole("button", { name: "이 경로로 일정 만들기" }).click();

  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.getByRole("heading", { name: "콩이와 부산 바다 하루" })).toBeVisible();
  await page.getByRole("button", { name: "대체 장소로 교체" }).click();
  await expect(page.getByText(/동백 정원 카페\(으\)로 교체했어요/)).toBeVisible();
  await expect(page.getByRole("link", { name: "동백 정원 카페" })).toBeVisible();
});

test("opens a place detail with source evidence", async ({ page }) => {
  await page.goto("/places/demo-busan-terrace-table");
  await expect(page.getByRole("heading", { name: "마린 테라스 식탁" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "동반 이용 판정" })).toBeVisible();
  await expect(page.getByText(/소형 반려견은 야외 테라스/)).toBeVisible();
  await expect(page.getByText("로컬 데모 데이터")).toBeVisible();
});

test("fails closed instead of substituting demo data for a missing live key", async ({
  request,
}) => {
  const response = await request.get(
    "/api/tour?operation=areaBasedList2&areaCode=26&numOfRows=5&pageNo=1",
  );
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: {
      code: "CONFIGURATION_REQUIRED",
      retryable: false,
    },
  });
});
