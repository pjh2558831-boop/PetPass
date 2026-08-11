import { expect, test } from "@playwright/test";
import {
  GENERATE_PATH,
  chooseConfirmedDeparture,
  continueToTrip,
  expectNoHorizontalOverflow,
  generateConfirmedRecommendations,
  openPetPlanner,
} from "./planner-test-helpers";

type GeneratedBody = {
  ok: true;
  data: {
    itineraries: Array<{
      id: string;
      signature: string;
      profile: string;
      title: string;
      geometry: unknown[];
      stops: Array<{
        stableIdentity: string;
        title: string;
        petAccess: { verdict: string };
      }>;
      totalDistanceMeters: number;
      totalDurationSeconds: number;
      estimatedElapsedDurationMinutes: number;
    }>;
  };
};

test("switches result views with roving keyboard tabs", async ({ page }) => {
  await page.goto("/results");
  const viewTabs = page
    .getByRole("tablist", { name: "장소 및 추천 보기" })
    .getByRole("tab");
  await expect(viewTabs).toHaveCount(2);
  await expect(viewTabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(viewTabs.first()).toHaveAttribute("tabindex", "0");
  await expect(viewTabs.nth(1)).toHaveAttribute("tabindex", "-1");

  await viewTabs.first().press("End");
  await expect(viewTabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(viewTabs.nth(1)).toHaveAttribute("tabindex", "0");
  await expect(viewTabs.nth(1)).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "확정된 여행 조건이 없습니다." }),
  ).toBeVisible();

  await viewTabs.nth(1).press("Home");
  await expect(viewTabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(viewTabs.first()).toBeFocused();
});

test("shows a deliberate empty state for direct recommendation entry", async ({
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

  await page.goto("/results?tab=recommendations");
  await expect(
    page.getByRole("heading", { name: "확정된 여행 조건이 없습니다." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "여행 정보 입력하기" }),
  ).toHaveAttribute("href", "/planner/pet");
  await expect(page.getByRole("heading", { name: /코스/u })).toHaveCount(0);
  expect(generationRequests).toEqual([]);
});

test("renders only actual returned strategies in deterministic response order", async ({
  page,
}, testInfo) => {
  const body = (await generateConfirmedRecommendations(page, testInfo, {
    stopCount: "3",
  })) as GeneratedBody;
  expect(body.ok).toBe(true);
  expect(body.data.itineraries.length).toBeGreaterThan(0);
  expect(body.data.itineraries.length).toBeLessThanOrEqual(3);

  const strategyTabs = page
    .getByRole("tablist", { name: "추천 경로 전략" })
    .getByRole("tab");
  await expect(strategyTabs).toHaveCount(body.data.itineraries.length);
  for (const [index, itinerary] of body.data.itineraries.entries()) {
    await expect(strategyTabs.nth(index)).toContainText(itinerary.title);
  }
  await expect(strategyTabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("선택됨", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      name: body.data.itineraries[0]?.title,
      exact: true,
    }),
  ).toBeVisible();

  await expect(page.getByText(/평점|리뷰|날씨|인기|방문자|매칭률/u)).toHaveCount(0);
  await expect(page.getByText(/추천 1위|베스트 경로/u)).toHaveCount(0);
});

test("switches strategies by keyboard, updates exact route and map data, and sends no new POST", async ({
  page,
}, testInfo) => {
  const generationPayloads: unknown[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationPayloads.push(request.postDataJSON());
    }
  });
  const body = (await generateConfirmedRecommendations(page, testInfo, {
    stopCount: "3",
  })) as GeneratedBody;
  expect(body.data.itineraries.length).toBe(3);
  await expect.poll(() => generationPayloads.length).toBe(1);

  const strategyTabs = page
    .getByRole("tablist", { name: "추천 경로 전략" })
    .getByRole("tab");
  await strategyTabs.first().press("ArrowRight");
  const second = body.data.itineraries[1]!;
  await expect(strategyTabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(strategyTabs.nth(1)).toBeFocused();
  await expect(
    page.getByRole("heading", { name: second.title, exact: true }),
  ).toBeVisible();
  const map = page.locator(".kakao-map-canvas");
  await expect(map).toHaveAttribute(
    "data-location-count",
    String(second.stops.length),
  );
  await expect(map).toHaveAttribute(
    "data-route-point-count",
    String(second.geometry.length >= 2 ? second.geometry.length : 0),
  );

  await strategyTabs.nth(1).press("End");
  const third = body.data.itineraries[2]!;
  await expect(strategyTabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: third.title, exact: true }),
  ).toBeVisible();
  await expect.poll(() => generationPayloads.length).toBe(1);
});

test("keeps the textual route and makes no precise-line claim when geometry is absent", async ({
  page,
}, testInfo) => {
  await page.route("**/api/itineraries/generate", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as GeneratedBody;
    if (body.ok && body.data.itineraries[0]) {
      body.data.itineraries[0].geometry = [];
    }
    await route.fulfill({ response, json: body });
  });
  const body = (await generateConfirmedRecommendations(page, testInfo, {
    stopCount: "2",
  })) as GeneratedBody;
  const selected = body.data.itineraries[0]!;

  await expect(page.locator(".kakao-map-canvas")).toHaveAttribute(
    "data-route-point-count",
    "0",
  );
  await expect(
    page.getByText(
      "정확한 경로 geometry가 제공되지 않아 장소 위치만 표시합니다. 마커 사이를 임의의 직선으로 연결하지 않습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const stop of selected.stops) {
    await expect(page.getByText(stop.title, { exact: true }).first()).toBeVisible();
  }
  await expect(
    page.getByText("Kakao 길찾기가 반환한 실제 geometry와 방문 순서 마커를 표시합니다.", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("guards duplicate initial and reroll requests while preserving confirmed input and signatures", async ({
  page,
}, testInfo) => {
  const generationPayloads: Array<{
    generationSeed: string;
    recentRouteSignatures: string[];
    start: { label: string };
  }> = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === GENERATE_PATH &&
      request.method() === "POST"
    ) {
      generationPayloads.push(request.postDataJSON());
    }
  });
  const firstBody = (await generateConfirmedRecommendations(page, testInfo, {
    stopCount: "2",
    doubleSubmit: true,
  })) as GeneratedBody;
  await expect.poll(() => generationPayloads.length).toBe(1);
  const firstSignatures = firstBody.data.itineraries.map(
    (itinerary) => itinerary.signature,
  );

  await page.route("**/api/itineraries/generate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "다른 조합 다시 보기" })
    .evaluate((node) => {
      const button = node as HTMLButtonElement;
      button.click();
      button.click();
    });
  await expect(
    page.getByText("현재 결과를 유지한 채 다른 조합을 계산하고 있어요."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: firstBody.data.itineraries[0]?.title,
      exact: true,
    }),
  ).toBeVisible();
  expect((await responsePromise).status()).toBe(200);
  await expect.poll(() => generationPayloads.length).toBe(2);

  expect(generationPayloads[1]?.generationSeed).not.toBe("initial");
  expect(generationPayloads[1]?.recentRouteSignatures).toEqual(firstSignatures);
  expect(generationPayloads[1]?.start.label).toBe(
    "부산광역시 연제구 중앙대로 1001",
  );
  await expect(
    page.getByText(/부산광역시 연제구 중앙대로 1001/u).first(),
  ).toBeVisible();
});

test("keeps conditional and unknown verdict meanings with source-backed detail", async ({
  page,
}, testInfo) => {
  await page.route("**/api/itineraries/generate", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as GeneratedBody;
    const selectedStops = body.ok ? body.data.itineraries[0]?.stops : null;
    if (selectedStops?.[0]) {
      selectedStops[0].petAccess.verdict = "conditional";
    }
    if (selectedStops?.[1]) {
      selectedStops[1].petAccess.verdict = "unknown";
    }
    await route.fulfill({ response, json: body });
  });
  const body = (await generateConfirmedRecommendations(page, testInfo, {
    stopCount: "2",
  })) as GeneratedBody;
  expect(body.data.itineraries[0]?.stops.length).toBeGreaterThanOrEqual(2);

  await expect(page.getByText("조건부 동반 가능", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("제공된 원문에 표시된 동반 조건을 지켜야 합니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("방문 전 확인 필요", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("동반 여부를 확정할 근거가 부족해 방문 전에 시설에 확인해야 합니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/평점|리뷰|날씨|인기/u)).toHaveCount(0);
});

test("preserves textual results and route selection when the Kakao SDK fails", async ({
  page,
}, testInfo) => {
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) =>
    route.abort(),
  );
  const body = (await generateConfirmedRecommendations(page, testInfo, {
    stopCount: "2",
  })) as GeneratedBody;
  const selected = body.data.itineraries[0]!;

  await expect(page.getByRole("alert").filter({ hasText: /카카오 지도/u })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: selected.title, exact: true }),
  ).toBeVisible();
  for (const stop of selected.stops) {
    await expect(page.getByText(stop.title, { exact: true }).first()).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: /이 경로로 상세 일정 보기/u }),
  ).toBeEnabled();
});

test("recovers from an initial generation failure without losing confirmed input", async ({
  page,
}, testInfo) => {
  let attempt = 0;
  await page.route("**/api/itineraries/generate", async (route) => {
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "경로 제공자 연결이 일시적으로 불안정합니다.",
            retryable: true,
          },
          requestId: "phase3c-error",
        }),
      });
      return;
    }
    await route.continue();
  });

  await openPetPlanner(page, testInfo, "phase3c-error");
  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await page.getByRole("button", { name: "여행 추천 받기" }).click();
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  const error = page.getByRole("alert").filter({
    hasText: "경로 제공자 연결이 일시적으로 불안정합니다.",
  });
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await expect(
    page.getByText(/부산광역시 연제구 중앙대로 1001/u).first(),
  ).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === GENERATE_PATH &&
      response.request().method() === "POST" &&
      response.status() === 200,
  );
  await page
    .getByRole("button", { name: "같은 조건으로 다시 시도" })
    .click();
  await responsePromise;
  await expect(
    page.getByRole("tablist", { name: "추천 경로 전략" }),
  ).toBeVisible();
});

test("keeps comparison usable at desktop, tablet, and mobile viewports", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The explicit Phase 3C viewport matrix runs once in desktop Chromium.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await generateConfirmedRecommendations(page, testInfo, { stopCount: "3" });

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
    const map = page.locator(".kakao-map-canvas");
    await expect
      .poll(() => map.evaluate((node) => node.getBoundingClientRect().height))
      .toBe(viewport.width <= 700 ? 330 : 420);
    const strategyTabs = page
      .getByRole("tablist", { name: "추천 경로 전략" })
      .getByRole("tab");
    await expect(strategyTabs.first()).toBeVisible();
    await strategyTabs.nth(1).click();
    await expect(strategyTabs.nth(1)).toHaveAttribute("aria-selected", "true");
    const action = page.getByRole("button", {
      name: /이 경로로 상세 일정 보기/u,
    });
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeVisible();
  }
});
