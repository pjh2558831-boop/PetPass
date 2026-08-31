import { expect, test } from "@playwright/test";
import { installDetailMock } from "./license-mock";

test("shows a high-confidence general-restaurant match", async ({ page }) => {
  await installDetailMock(page, "matched_high", "general_restaurants");
  await page.goto("/places/1005?contentTypeId=39&region=busan");
  await expect(page.getByRole("heading", { name: "인허가 정보" })).toBeVisible();
  await expect(page.getByText("인허가 기록 일치")).toBeVisible();
  await expect(page.getByText("확인된 세부 유형: 일반음식점")).toBeVisible();
});

test("shows a high-confidence rest-cafe match", async ({ page }) => {
  await installDetailMock(page, "matched_high", "rest_cafes");
  await page.goto("/places/1005?contentTypeId=39&region=busan");
  await expect(page.getByText("확인된 세부 유형: 휴게음식점")).toBeVisible();
});

test("does not present one ambiguous candidate as confirmed", async ({ page }) => {
  await installDetailMock(page, "ambiguous");
  await page.goto("/places/1005?contentTypeId=39&region=busan");
  await expect(page.getByText("일치 가능한 인허가 기록이 여러 개입니다")).toBeVisible();
  await expect(page.getByText("아래 후보 중 하나를 확정하지 않았습니다.")).toBeVisible();
  await expect(page.getByText("확인된 세부 유형:")).toHaveCount(0);
});

test("shows the required no-result clarification without prohibited labels", async ({ page }) => {
  await installDetailMock(page, "not_found");
  await page.goto("/places/1005?contentTypeId=39&region=busan");
  await expect(page.getByText("공공데이터에서 일치 기록을 찾지 못했습니다")).toBeVisible();
  await expect(
    page.getByText("일치 기록이 검색되지 않았다는 의미이며, 무허가 업소라는 뜻은 아닙니다."),
  ).toBeVisible();
  await expect(page.getByText("무허가", { exact: true })).toHaveCount(0);
  await expect(page.getByText("불법", { exact: true })).toHaveCount(0);
});

test("keeps Tourism and pet evidence visible when licensing is unavailable", async ({ page }) => {
  await installDetailMock(page, "unavailable");
  await page.goto("/places/1005?contentTypeId=39&region=busan");
  await expect(page.getByRole("heading", { name: "마린 테라스 식탁" })).toBeVisible();
  await expect(page.getByText("현재 인허가 정보를 확인할 수 없습니다").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "반려동물 동반 안내" })).toBeVisible();
});

test("hides licensing for non-food details and makes no licensing request", async ({ page }) => {
  let licensingRequests = 0;
  page.on("request", (request) => {
    if (/\/api\/licenses|general_restaurants|rest_cafes/u.test(request.url())) {
      licensingRequests += 1;
    }
  });
  await installDetailMock(page, "not_applicable");
  await page.goto("/places/1001?contentTypeId=12&region=busan");
  await expect(page.getByRole("heading", { name: "해운대 해수욕장" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "인허가 정보" })).toHaveCount(0);
  expect(licensingRequests).toBe(0);
});

test("preserves the existing Kakao marker-to-detail interaction", async ({ page }) => {
  await installDetailMock(page, "matched_high", "general_restaurants");
  await page.route("**/api/map/places/snapshot?**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({
      ok: false,
      error: { code: "UPSTREAM_ERROR", message: "legacy interaction fallback", retryable: true },
      requestId: "licensing-snapshot-fallback",
    }),
  }));
  await page.goto("/results?tab=catalog&region=busan&page=1");
  if ((page.viewportSize()?.width ?? 1_024) < 1_024) {
    const listMode = page.getByRole("button", { name: "목록", exact: true });
    await expect(listMode).toBeVisible();
    await listMode.click();
  }
  const detailLink = page.getByRole("link", {
    name: /부산 반려동물 식당 원문 상세 보기/,
  });
  await detailLink.focus();
  await detailLink.press("Enter");
  await expect(page.getByRole("heading", { name: "인허가 정보" })).toBeVisible();
  await expect(page.getByRole("region", { name: "마린 테라스 식탁 위치" })).toBeVisible();
});
