import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export const GENERATE_PATH = "/api/itineraries/generate";
export const DEPARTURE_PATH = "/api/kakao/local/departure";

export function futureTripDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000));
}

async function selectLabelledControl(control: Locator) {
  if (await control.isChecked()) return;
  await control.locator("xpath=ancestor::label[1]").click();
  await expect(control).toBeChecked();
}

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
      name: "여행 정보 입력",
    }),
  ).toBeVisible();
}

export async function continueToTrip(page: Page) {
  const name = page.getByRole("textbox", { name: "반려동물 이름" });
  if ((await name.inputValue()).trim() === "") await name.fill("보리");
  const checkedSpecies = page.locator('input[name="species"]:checked');
  if ((await checkedSpecies.count()) === 0) {
    await selectLabelledControl(page.getByRole("radio", { name: "강아지", exact: true }));
  }
  const checkedSize = page.locator('input[name="size"]:checked');
  if ((await checkedSize.count()) === 0) {
    await selectLabelledControl(page.getByRole("radio", { name: /^소형/u }));
  }
  await page.getByRole("button", { name: "출발지와 시간 입력" }).click();
  await expect(page.getByRole("heading", { name: "출발지와 시간" })).toBeVisible();
  await page.getByLabel("여행 날짜").fill(futureTripDate());
  await page.getByLabel("시작 시간").fill("10:00");
  await expect(page).toHaveURL(/\/planner\/pet(?:\?.*)?$/u);
}

export async function continueToDay(page: Page) {
  await page.getByRole("button", { name: "원하는 하루 입력" }).click();
  await expect(page.getByRole("heading", { name: "원하는 하루" })).toBeVisible();
  await selectLabelledControl(page.getByRole("checkbox", { name: "관광지", exact: true }));
  await selectLabelledControl(page.getByRole("checkbox", { name: "음식점", exact: true }));
  await expect(page).toHaveURL(/\/planner\/pet$/u);
}

export async function chooseConfirmedDeparture(
  page: Page,
  query = "부산광역시청",
) {
  // The departure fixture is in Busan; nationwide planning no longer defaults there.
  await page.getByLabel("여행 지역", { exact: true }).selectOption("26");
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === DEPARTURE_PATH &&
      url.searchParams.get("query") === query &&
      response.request().method() === "GET"
    );
  });
  const input = page.getByRole("combobox", { name: "출발지" });
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
  await continueToDay(page);
  if (options.stopCount) {
    const paceName =
      Number(options.stopCount) <= 2
        ? "여유롭게"
        : Number(options.stopCount) >= 5
          ? "알차게"
          : "적당히";
    await page.getByRole("radio", { name: paceName }).check({ force: true });
  }
  await options.beforeGenerate?.(page);

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
  );
  const button = page.getByRole("button", { name: "여행 추천 받기" });
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
  await expect(page).toHaveURL(/\/results\?tab=recommendations&region=busan$/u);
  await expect(
    page.getByRole("heading", {
      name: /에서 시작하는 \d곳 일정/u,
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
