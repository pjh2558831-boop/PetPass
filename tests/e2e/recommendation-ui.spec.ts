import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function openRecommendations(page: Page, testInfo: TestInfo) {
  const clientId = `recommendation-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.title.replace(/\W+/gu, "-")}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": clientId });
  await page.goto("/results?tab=recommendations");
  await expect(
    page.getByRole("tab", { name: "추천 코스" }),
  ).toHaveAttribute("aria-selected", "true");
}

async function submitRecommendation(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/itineraries/generate") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "추천 코스 만들기" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

test("starts with all Busan, every district and shopping disabled", async ({
  page,
}, testInfo) => {
  await openRecommendations(page, testInfo);

  const scope = page.getByLabel("여행 범위");
  await expect(scope).toHaveValue("all");
  await expect(scope.locator("option")).toHaveCount(17);
  await expect(page.getByText("선택 범위 부산 전체")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^쇼핑 장소도 후보에 포함/u })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "관광지", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "레저", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "음식점", exact: true })).toBeChecked();
  await expect(page.getByText("기타", { exact: true })).toHaveCount(0);
});

test("submits selected parameters once and only opts into shopping explicitly", async ({
  page,
}, testInfo) => {
  await openRecommendations(page, testInfo);
  await page.getByLabel("여행 범위").selectOption("500");
  await page.getByLabel("반려동물 크기").selectOption("MEDIUM");
  await page.getByLabel("실내 이용 선호").selectOption("preferred");
  await page.getByRole("radio", { name: "전체 일정 시간" }).check();
  await page.getByRole("combobox", { name: "전체 일정 시간" }).selectOption("240");
  await page.getByRole("checkbox", { name: /^쇼핑 장소도 후보에 포함/u }).check();

  const requests: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/itineraries/generate") &&
      request.method() === "POST"
    ) {
      requests.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/itineraries/generate"),
  );
  await page.getByRole("button", { name: "추천 코스 만들기" }).evaluate((node) => {
    const button = node as HTMLButtonElement;
    button.click();
    button.click();
  });
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByRole("button", { name: "추천 코스 만들기" })).toBeEnabled();

  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    scope: { type: "district", districtCode: "500" },
    planning: { desiredDurationMinutes: 240 },
    petSize: "MEDIUM",
    indoorAccessPreference: "preferred",
    includeShopping: true,
  });
  expect(requests[0].selectedCategories).toContain("shopping");
});

test("renders real profiles, actual stops, distance and duration", async ({
  page,
}, testInfo) => {
  await openRecommendations(page, testInfo);
  await page.getByRole("combobox", { name: "방문 장소 수" }).selectOption("2");
  const body = await submitRecommendation(page);

  expect(body.ok).toBe(true);
  expect(body.data.itineraries.length).toBeGreaterThan(0);
  expect(body.data.itineraries.length).toBeLessThanOrEqual(3);
  await expect(page.getByText("이동 최소 코스", { exact: true })).toBeVisible();
  await expect(page.getByText("총 거리", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("차량 이동", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("전체 일정", { exact: true }).first()).toBeVisible();
  const firstStop = body.data.itineraries[0].stops[0];
  await expect(page.getByRole("link", { name: firstStop.title }).first()).toBeVisible();
  await expect(page.getByText("실제 경로 2곳", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("행정 인허가 정보는 이 판정에 섞지 않으며", { exact: false })).toBeVisible();
});

test("keeps conditional requirements and unknown hours visible without fake routes", async ({
  page,
}, testInfo) => {
  await openRecommendations(page, testInfo);
  await page.getByRole("combobox", { name: "방문 장소 수" }).selectOption("1");
  await page.getByRole("checkbox", { name: "관광지", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "레저", exact: true }).uncheck();
  const body = await submitRecommendation(page);

  expect(body.data.itineraries).toHaveLength(1);
  await expect(page.getByText("조건부 동반 가능", { exact: true })).toBeVisible();
  await expect(page.getByText("운영시간 확인 필요", { exact: true })).toBeVisible();
  await page.getByText("동반 조건과 이용 범위 확인").press("Enter");
  await expect(page.getByText(/이동장.*필수/u).first()).toBeVisible();
  await expect(
    page.getByText(/실제 경로가 1개여서 빈 슬롯을 만들지 않았습니다/u),
  ).toBeVisible();
  await expect(page.getByText(/demo-/u)).toHaveCount(0);
});

test("selected route owns map state and changing scope clears stale geometry", async ({
  page,
}, testInfo) => {
  await openRecommendations(page, testInfo);
  await page.getByRole("combobox", { name: "방문 장소 수" }).selectOption("2");
  const body = await submitRecommendation(page);
  const selected = body.data.itineraries[0];
  const map = page.locator(".kakao-map-canvas");

  await expect(map).toHaveAttribute("data-location-count", String(selected.stops.length));
  await expect(map).toHaveAttribute("data-route-point-count", String(selected.geometry.length));
  await expect(page.getByText(/선택한 실제 경로의 정류장과 카카오 폴리라인만 표시/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "지도에 표시 중" })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("여행 범위").selectOption("350");
  await expect(map).toHaveAttribute("data-location-count", "0");
  await expect(map).toHaveAttribute("data-route-point-count", "0");
  await expect(page.getByText("조건을 제출하면 선택한 실제 경로만 이 지도에 표시됩니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "지도에 표시 중" })).toHaveCount(0);
});

test("marker-linked details remain safe and responsive at desktop, tablet and mobile widths", async ({
  page,
}, testInfo) => {
  await openRecommendations(page, testInfo);
  await page.getByRole("combobox", { name: "방문 장소 수" }).selectOption("1");
  await page.getByRole("checkbox", { name: "관광지", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "레저", exact: true }).uncheck();
  const body = await submitRecommendation(page);
  const stop = body.data.itineraries[0].stops[0];

  await page.getByRole("button", { name: `${stop.title} 지도에서 보기` }).click();
  const detailLink = page.getByRole("link", { name: stop.title }).first();
  await expect(detailLink).toHaveAttribute(
    "href",
    `/places/${stop.contentId}?contentTypeId=${stop.contentTypeId}`,
  );
  await detailLink.click();
  await expect(page).toHaveURL(new RegExp(`/places/${stop.contentId}`));
  await expect(page.getByRole("region", { name: "반려동물 동반 안내" })).toBeVisible();
  await expect(page.getByRole("region", { name: "인허가 정보" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "추천 코스 조건" })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          formVisible: Boolean(document.querySelector("#route-district")),
          mapHeight:
            document.querySelector(".kakao-map-canvas")?.getBoundingClientRect().height ?? 0,
        })),
      )
      .toEqual({ overflow: 0, formVisible: true, mapHeight: viewport.width <= 700 ? 330 : 420 });
  }
});
