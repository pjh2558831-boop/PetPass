import { expect, type Page, type TestInfo } from "@playwright/test";

export const GENERATE_PATH = "/api/itineraries/generate";
export const GEOCODE_PATH = "/api/kakao/local/geocode";

export async function openPetPlanner(
  page: Page,
  testInfo: TestInfo,
  prefix: string,
) {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `${prefix}-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.title.replace(/\W+/gu, "-")}`,
  });
  await page.goto("/planner/pet");
  await expect(
    page.getByRole("heading", {
      name: "함께 여행할 반려동물을 알려주세요",
    }),
  ).toBeVisible();
}

export async function continueToTrip(page: Page) {
  await page.getByRole("button", { name: "여행 조건 정하기" }).click();
  await expect(page).toHaveURL(/\/planner\/trip$/u);
}

export async function chooseConfirmedDeparture(
  page: Page,
  query = "부산광역시청",
) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === GEOCODE_PATH &&
      url.searchParams.get("address") === query &&
      response.request().method() === "GET"
    );
  });
  const input = page.getByRole("combobox", { name: "출발지 주소" });
  await input.fill(query);
  expect((await responsePromise).status()).toBe(200);
  await page
    .getByRole("option", {
      name: /부산광역시 연제구 중앙대로 1001/u,
    })
    .click();
  await expect(input).toHaveValue("부산광역시 연제구 중앙대로 1001");
}

export async function generateConfirmedRecommendations(
  page: Page,
  testInfo: TestInfo,
  options: {
    prefix?: string;
    stopCount?: "1" | "2" | "3" | "4" | "5";
    beforeGenerate?: (page: Page) => Promise<void>;
    doubleSubmit?: boolean;
  } = {},
) {
  await openPetPlanner(page, testInfo, options.prefix ?? "phase3c");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  if (options.stopCount) {
    await page
      .getByRole("combobox", { name: "방문 장소 수" })
      .selectOption(options.stopCount);
  }
  await options.beforeGenerate?.(page);

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
  );
  const button = page.getByRole("button", { name: "추천 경로 만들기" });
  if (options.doubleSubmit) {
    await button.evaluate((node) => {
      const submit = node as HTMLButtonElement;
      submit.click();
      submit.click();
    });
  } else {
    await button.click();
  }
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect(
    page.getByRole("heading", {
      name: "보리와 함께할 부산 당일 경로를 비교해 보세요.",
    }),
  ).toBeVisible();
  return body;
}

export async function expectNoHorizontalOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        return (
          Math.max(root.scrollWidth, document.body.scrollWidth) -
          root.clientWidth
        );
      }),
    )
    .toBeLessThanOrEqual(1);
}
