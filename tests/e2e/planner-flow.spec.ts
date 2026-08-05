import { expect, test } from "@playwright/test";
import { installTourListMock } from "./tour-mock";

test("creates the existing demo itinerary after loading live-style Tourism summaries", async ({
  page,
}) => {
  await installTourListMock(page);
  await page.goto("/planner/pet");
  await page.getByRole("textbox", { name: "반려동물 이름" }).fill("코이");
  await page.getByRole("button", { name: "여행 조건 정하기" }).click();

  await expect(page).toHaveURL(/\/planner\/trip$/);
  await page.getByRole("button", { name: "추천 경로 보기" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByText("장소 5곳")).toBeVisible();
  await expect(page.getByText(/소형 반려동물 · 이동장 있음/)).toBeVisible();
  await page.getByRole("button", { name: "데모 경로로 일정 만들기" }).click();

  await expect(page).toHaveURL(/\/itinerary$/);
  await expect(page.getByRole("heading", { name: /코이와 부산 바다 하루/ })).toBeVisible();
});

test("keeps the existing demo detail evidence screen working", async ({ page }) => {
  await page.goto("/places/demo-busan-terrace-table");
  await expect(page.getByRole("heading", { name: "마린 테라스 식탁" })).toBeVisible();
  await expect(page.locator("blockquote")).toBeVisible();
  await expect(page.getByLabel("로컬 데모 데이터")).toBeVisible();
});

test("returns a structured validation error without substituting demo data", async ({
  request,
}) => {
  const response = await request.get("/api/tour/places?contentTypeId=12");
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: { code: "INVALID_REQUEST", retryable: false },
  });
});
