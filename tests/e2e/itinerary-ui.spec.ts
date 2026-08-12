import { expect, test } from "@playwright/test";
import { GENERATE_PATH } from "./planner-test-helpers";

test("keeps the legacy detailed-itinerary page empty when no route was explicitly selected", async ({
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
    page.getByRole("heading", { name: "선택된 추천 경로가 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText(/새로고침하거나 주소로 바로 들어온 경우/u)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "여행 정보 입력하기" }),
  ).toHaveAttribute("href", "/planner/pet");
  expect(generationRequests).toEqual([]);
});
