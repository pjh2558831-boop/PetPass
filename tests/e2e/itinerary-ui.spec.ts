import { expect, test } from "@playwright/test";
import { GENERATE_PATH } from "./planner-test-helpers";

test("keeps the detailed-itinerary page openly empty when no route was explicitly selected", async ({
  page,
}) => {
  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationRequests.push(request.url());
    }
  });

  await page.goto("/itinerary");
  await expect(
    page.getByRole("heading", { name: "아직 저장된 일정이 없습니다." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "아직 저장된 일정이 없습니다." }),
  ).toBeFocused();
  await expect(page.getByText("선택된 추천 경로가 없습니다.")).toHaveCount(0);
  await expect(page.getByText(/맞춤 일정을 만든 뒤 이 브라우저에 저장하면/u)).toBeVisible();
  await expect(page.locator("main .surface-card, main .surface-panel")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "여행 정보 입력하기" }),
  ).toHaveAttribute("href", "/planner/pet");
  expect(generationRequests).toEqual([]);
});
