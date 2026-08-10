import { expect, test, type Page, type TestInfo } from "@playwright/test";

const GEOCODE_PATH = "/api/kakao/local/geocode";
const GENERATE_PATH = "/api/itineraries/generate";

type GeneratedBody = {
  ok: true;
  data: {
    request: {
      start: { label: string | null };
    };
    itineraries: Array<{
      id: string;
      title: string;
      stops: Array<{
        stableIdentity: string;
        title: string;
      }>;
    }>;
  };
};

async function openPetPlanner(page: Page, testInfo: TestInfo) {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `planner-flow-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.title.replace(/\W+/gu, "-")}`,
  });
  await page.goto("/planner/pet");
  await expect(
    page.getByRole("heading", { name: "함께 여행할 반려동물을 알려주세요" }),
  ).toBeVisible();
}

async function expectPlannerStep(page: Page, label: string) {
  const progress = page.getByRole("navigation", { name: "여행 만들기 단계" });
  await expect(progress).toBeVisible();
  const activeStep = progress.locator('li[aria-current="step"]:visible');
  await expect(activeStep).toHaveCount(1);
  await expect(activeStep).toContainText(label);
}

async function continueToTrip(page: Page) {
  await page.getByRole("button", { name: "여행 조건 정하기" }).click();
  await expect(page).toHaveURL(/\/planner\/trip$/u);
  await expectPlannerStep(page, "여행 조건");
}

async function chooseDepartureWithKeyboard(
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
  const response = await responsePromise;
  expect(response.status()).toBe(200);

  const listbox = page.getByRole("listbox", { name: "출발지 주소 검색 결과" });
  await expect(listbox).toBeVisible();
  const options = listbox.getByRole("option");
  await expect(options).toHaveCount(2);
  await input.press("ArrowDown");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");

  await expect(page.getByText("선택한 출발지", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("부산광역시 연제구 중앙대로 1001");
}

async function expectNoHorizontalOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        return Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth;
      }),
    )
    .toBeLessThanOrEqual(1);
}

test("hands the exact selected generated strategy to the itinerary", async ({
  page,
}, testInfo) => {
  await openPetPlanner(page, testInfo);
  await expectPlannerStep(page, "반려동물 정보");

  await page.getByRole("textbox", { name: "반려동물 이름" }).fill("코이");
  await continueToTrip(page);

  await chooseDepartureWithKeyboard(page);

  const generationRequests: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationRequests.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  const generationResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "추천 경로 만들기" }).evaluate((node) => {
    const button = node as HTMLButtonElement;
    button.click();
    button.click();
  });

  const generationResponse = await generationResponsePromise;
  expect(generationResponse.status()).toBe(200);
  const generationBody = (await generationResponse.json()) as GeneratedBody;
  expect(generationBody.ok).toBe(true);
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect.poll(() => generationRequests.length).toBe(1);
  expect(generationRequests[0]).toMatchObject({
    scope: { type: "busan" },
    start: {
      label: "부산광역시 연제구 중앙대로 1001",
      coordinates: { latitude: 35.1796, longitude: 129.0756 },
    },
    travelDate: "2026-08-15",
    startTime: "10:00",
    planning: { desiredStopCount: 3 },
    petSize: "SMALL",
    petEquipment: {
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: false,
    },
    indoorAccessPreference: "any",
    selectedCategories: ["attraction", "food"],
    includeShopping: false,
    generationSeed: "initial",
    recentRouteSignatures: [],
  });

  await expect(page.getByRole("tab", { name: "추천 코스" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "이 조건으로 계산한 추천이에요" }),
  ).toBeVisible();
  await expect(page.getByText(/코이 · 강아지 · 소형/u)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "데모 경로로 일정 만들기" }),
  ).toHaveCount(0);

  expect(generationBody.data.itineraries.length).toBeGreaterThan(1);
  const selectedStrategyIndex = 1;
  const selectedItinerary = generationBody.data.itineraries[selectedStrategyIndex]!;
  const originLabel = generationBody.data.request.start.label;
  expect(originLabel).toBe("부산광역시 연제구 중앙대로 1001");

  const strategyTabs = page
    .getByRole("tablist", { name: "추천 경로 전략" })
    .getByRole("tab");
  await expect(strategyTabs).toHaveCount(generationBody.data.itineraries.length);
  await strategyTabs.nth(selectedStrategyIndex).click();
  await expect(strategyTabs.nth(selectedStrategyIndex)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: selectedItinerary.title, exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /이 경로로 상세 일정 보기/u })
    .click();
  await expect(page).toHaveURL(/\/itinerary$/u);
  await expect(
    page.getByRole("heading", {
      name: `코이와 함께하는 ${selectedItinerary.title}`,
      exact: true,
    }),
  ).toBeVisible();

  const itineraryStops = page
    .getByRole("list", {
      name: `${selectedItinerary.title} 상세 방문 순서`,
    })
    .locator(":scope > li");
  await expect(itineraryStops).toHaveCount(selectedItinerary.stops.length);
  for (const [index, stop] of selectedItinerary.stops.entries()) {
    await expect(itineraryStops.nth(index)).toContainText(stop.title);
  }
  await expect(
    itineraryStops.first().getByText(
      `${originLabel} → ${selectedItinerary.stops[0]!.title}`,
      { exact: true },
    ),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  const restoredStrategyTabs = page
    .getByRole("tablist", { name: "추천 경로 전략" })
    .getByRole("tab");
  await expect(restoredStrategyTabs.nth(selectedStrategyIndex)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: selectedItinerary.title, exact: true }),
  ).toBeVisible();
  await expect.poll(() => generationRequests.length).toBe(1);

  await page
    .getByRole("link", { name: "여행 조건 수정", exact: true })
    .click();
  await expect(page).toHaveURL(/\/planner\/trip$/u);
  await page.getByLabel("시작 시간").fill("10:15");
  await page.goBack();
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect(
    page.getByRole("heading", { name: "확정된 여행 조건이 없습니다." }),
  ).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "추천 경로 전략" }),
  ).toHaveCount(0);
  await expect.poll(() => generationRequests.length).toBe(1);
});

test("preserves advanced planner inputs and prevents duplicate generation", async ({
  page,
}, testInfo) => {
  await openPetPlanner(page, testInfo);
  await page.getByRole("textbox", { name: "반려동물 이름" }).fill("코이");
  const mediumSize = page.getByRole("radio", { name: /^중형/u });
  await mediumSize.locator("xpath=ancestor::label[1]").click();
  await page.getByRole("checkbox", { name: /^이동장/u }).uncheck({ force: true });
  await page.getByRole("checkbox", { name: /^입마개/u }).check({ force: true });
  await continueToTrip(page);

  await chooseDepartureWithKeyboard(page);
  await page.getByLabel("세부 지역").selectOption("500");
  await page.getByLabel("여행 날짜").fill("2026-08-21");
  await page.getByLabel("시작 시간").fill("09:30");
  await expect(page.getByRole("radio", { name: /^1박 여행/u })).toBeDisabled();
  await page
    .getByRole("radio", { name: /^전체 일정 시간/u })
    .check({ force: true });
  await page
    .getByRole("combobox", { name: "전체 일정 시간" })
    .selectOption("240");
  await page.getByRole("radio", { name: /^실내 필수/u }).check({ force: true });
  const attraction = page.getByRole("checkbox", { name: /^관광지/u });
  await attraction.locator("xpath=ancestor::label[1]").click();
  const walk = page.getByRole("checkbox", { name: /^산책/u });
  await walk.locator("xpath=ancestor::label[1]").click();
  await page
    .getByRole("checkbox", { name: /^관광형 쇼핑 후보도 포함해요/u })
    .check({ force: true });

  const generationRequests: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationRequests.push(request.postDataJSON());
    }
  });
  const generationResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "추천 경로 만들기" })
    .evaluate((node) => {
      const button = node as HTMLButtonElement;
      button.click();
      button.click();
    });

  expect((await generationResponsePromise).status()).toBe(200);
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect.poll(() => generationRequests.length).toBe(1);
  expect(generationRequests[0]).toMatchObject({
    scope: { type: "district", districtCode: "500" },
    start: {
      label: "부산광역시 연제구 중앙대로 1001",
      coordinates: { latitude: 35.1796, longitude: 129.0756 },
    },
    travelDate: "2026-08-21",
    startTime: "09:30",
    planning: { desiredDurationMinutes: 240 },
    petSize: "MEDIUM",
    petEquipment: {
      hasCarrier: false,
      hasLeash: true,
      hasMuzzle: true,
    },
    indoorAccessPreference: "required",
    selectedCategories: ["food", "leisure", "shopping"],
    includeShopping: true,
    generationSeed: "initial",
    recentRouteSignatures: [],
  });
  await expect(
    page.getByRole("heading", { name: "이 조건으로 계산한 추천이에요" }),
  ).toBeVisible();
  await expect(page.getByText(/코이 · 강아지 · 중형/u)).toBeVisible();
});

test("validates a trimmed name and preserves exact pet choices across both steps", async ({
  page,
}, testInfo) => {
  await openPetPlanner(page, testInfo);
  await expectPlannerStep(page, "반려동물 정보");

  const name = page.getByRole("textbox", { name: "반려동물 이름" });
  await name.fill("   ");
  await page.getByRole("button", { name: "여행 조건 정하기" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "반려동물 이름을 1자 이상 30자 이하로 입력해 주세요.",
    }),
  ).toBeVisible();
  await expect(name).toBeFocused();
  await expect(page).toHaveURL(/\/planner\/pet$/u);

  await name.fill("  코이  ");
  const cat = page.getByRole("radio", { name: /^고양이/u });
  await cat.locator("xpath=ancestor::label[1]").click();
  await expect(cat).toBeChecked();
  const mediumSize = page.getByRole("radio", { name: /^중형/u });
  await mediumSize.locator("xpath=ancestor::label[1]").click();
  await expect(mediumSize).toBeChecked();
  await page
    .getByRole("checkbox", { name: /^이동장/u })
    .uncheck({ force: true });
  await page
    .getByRole("checkbox", { name: /^목줄/u })
    .uncheck({ force: true });
  await page
    .getByRole("checkbox", { name: /^입마개/u })
    .check({ force: true });
  await page
    .getByRole("checkbox", { name: /^야외 전용 장소도 포함해요/u })
    .uncheck({ force: true });
  await continueToTrip(page);
  await expect(page.getByRole("radio", { name: /^실내 필수/u })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^상관없음/u })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /^실내 선호/u })).toBeDisabled();

  await page.getByRole("link", { name: "이전" }).click();
  await expect(page).toHaveURL(/\/planner\/pet$/u);
  await expectPlannerStep(page, "반려동물 정보");
  await expect(name).toHaveValue("코이");
  await expect(page.getByRole("radio", { name: /^고양이/u })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^중형/u })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^이동장/u })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^목줄/u })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^입마개/u })).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /^야외 전용 장소도 포함해요/u }),
  ).not.toBeChecked();
  expect(
    await page.evaluate(() => ({
      profile: localStorage.getItem("petpass:pet-profile"),
      preferences: localStorage.getItem("petpass:travel-preferences"),
    })),
  ).toEqual({ profile: null, preferences: null });

  await continueToTrip(page);
});

test("blocks unresolved departures and never selects stale or failed searches", async ({
  page,
}, testInfo) => {
  await openPetPlanner(page, testInfo);
  await continueToTrip(page);

  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationRequests.push(request.url());
    }
  });

  await page.getByRole("button", { name: "추천 경로 만들기" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "검색 결과에서 실제 출발지 주소를 선택해 주세요.",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/planner\/trip$/u);

  const input = page.getByRole("combobox", { name: "출발지 주소" });
  const slowRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === GEOCODE_PATH &&
      url.searchParams.get("address") === "부산 느린 주소"
    );
  });
  await input.fill("부산 느린 주소");
  await slowRequestPromise;

  const failedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === GEOCODE_PATH &&
      url.searchParams.get("address") === "부산 검색 실패"
    );
  });
  await input.fill("부산 검색 실패");
  expect((await failedResponsePromise).status()).toBe(502);
  await expect(page.getByText(/카카오 Local API 요청이 503 상태로 실패했습니다/u)).toBeVisible();

  await page.waitForTimeout(1_000);
  await expect(page.getByRole("option", { name: /느린 주소/u })).toHaveCount(0);
  await expect(page.getByText("선택한 출발지", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "추천 경로 만들기" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "검색 결과에서 실제 출발지 주소를 선택해 주세요.",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/planner\/trip$/u);
  expect(generationRequests).toEqual([]);
});

test("keeps both Phase 3B planner steps free of horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The explicit viewport matrix runs once in desktop Chromium.",
  );

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openPetPlanner(page, testInfo);
    await expectPlannerStep(page, "반려동물 정보");
    await expect(page.getByRole("heading", { name: "반려동물 프로필" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await continueToTrip(page);
    await expect(page.getByRole("heading", { name: "여행 조건", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "출발지 주소" })).toBeVisible();
    await expect(page.getByRole("button", { name: "추천 경로 만들기" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
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
  const response = await request.get("/api/tour/places?contentTypeId=75");
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: { code: "INVALID_REQUEST", retryable: false },
  });
});
