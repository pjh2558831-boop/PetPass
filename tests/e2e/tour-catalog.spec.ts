import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `petpass-e2e-${testInfo.project.name}-${testInfo.workerIndex}`,
  });
  // Catalog tests exercise the real Tourism Route Handler and its upstream mock.
  // Isolate unrelated directions calls so parallel tests do not consume its rate limit.
  await page.route("**/api/kakao/directions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          totalDistanceMeters: 1_000,
          totalDurationSeconds: 600,
          coordinates: [
            { latitude: 35.1596, longitude: 129.1603 },
            { latitude: 35.1582, longitude: 129.1782 },
          ],
          sections: [{ distanceMeters: 1_000, durationSeconds: 600 }],
        },
        requestId: "e2e-catalog-directions-isolation",
      }),
    });
  });
});

test("uses all Busan by default and exposes every verified district", async ({
  page,
}) => {
  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/tour/places?") &&
      !response.url().includes("districtCode="),
  );
  await page.goto("/results");
  expect((await listResponse).status()).toBe(200);

  const district = page.getByLabel("부산 세부 지역");
  await expect(district).toHaveValue("all");
  await expect(district.locator("option")).toHaveCount(17);
  await expect(
    page.getByRole("heading", { name: "장소 13곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("제공자 전체 13곳", { exact: true })).toBeVisible();
  await expect(page.getByText("현재 목록 1–12곳", { exact: true })).toBeVisible();
  await expect(page.getByText("지도 13곳 표시", { exact: true })).toBeVisible();
  await expect(page.getByText("부산 전체", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("활성 검색 범위: 부산 전체 · 3개 기준점 · 각 최대 20km"),
  ).toBeVisible();
  await expect(page.getByText("부산 여행 편집숍")).toHaveCount(0);
});

test("updates the visible Kakao area with the selected district", async ({
  page,
}) => {
  const localSearchRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/places/discovery")) {
      localSearchRequests.push(request.url());
    }
  });
  await page.goto("/results");
  await expect(
    page.getByRole("heading", { name: "장소 13곳", exact: true }),
  ).toBeVisible();

  await page.getByLabel("부산 세부 지역").selectOption("500");
  await expect(
    page.getByText("활성 검색 범위: 부산 · 수영구 중심 · 반경 8km"),
  ).toBeVisible();
  expect(localSearchRequests).toEqual([]);

  await page.getByRole("button", { name: "음식점", exact: true }).click();
  const searchResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/places/discovery"),
  );
  await page.getByRole("button", { name: "추가 후보 찾기", exact: true }).click();
  const searchResponse = await searchResponsePromise;
  expect(searchResponse.status()).toBe(200);
  const searchUrl = new URL(searchResponse.url());
  expect(searchUrl.searchParams.get("districtCode")).toBe("500");
  expect(searchUrl.searchParams.get("category")).toBe("food");
  expect(searchUrl.searchParams.has("query")).toBe(false);
  expect(searchUrl.searchParams.has("page")).toBe(false);
  const searchBody = (await searchResponse.json()) as {
    ok: boolean;
    data?: { candidates?: unknown[]; searchArea?: { mode?: string } };
  };
  expect(searchBody.ok).toBe(true);
  expect(searchBody.data?.candidates?.length).toBeGreaterThan(0);
  expect(searchBody.data?.searchArea?.mode).toBe("district");
});

test("labels a non-Haeundae live detail from its address", async ({ page }) => {
  await page.goto("/places/1106?contentTypeId=12");
  await expect(page.getByRole("heading", { name: "광안 해변길" })).toBeVisible();
  await expect(page.getByText("부산 · 수영구", { exact: true })).toBeVisible();
  await expect(page.getByText("부산 · 해운대구", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "출처와 정보 신뢰도" })).toBeVisible();
  await expect(page.getByText(/정보 신뢰도: (높음|보통|낮음)/u)).toBeVisible();
  await expect(page.getByText("관광공사 공식 데이터", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("정보 오류 제보문 만들기")).toBeVisible();
});

test("changes the upstream district scope and renders a truthful empty state", async ({
  page,
}) => {
  await page.goto("/results");
  await expect(
    page.getByRole("heading", { name: "장소 13곳", exact: true }),
  ).toBeVisible();

  const districtResponse = page.waitForResponse((response) =>
    response.url().includes("districtCode=350"),
  );
  await page.getByLabel("부산 세부 지역").selectOption("350");
  expect((await districtResponse).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "장소 3곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("현재 목록 1–3곳", { exact: true })).toBeVisible();
  await expect(page.getByText("지도 3곳 표시", { exact: true })).toBeVisible();
  await expect(page.getByText("해운대구 실시간 관광 데이터")).toBeVisible();

  const festivalResponse = page.waitForResponse(
    (response) =>
      response.url().includes("districtCode=350") &&
      response.url().includes("contentTypeId=15"),
  );
  await page.getByRole("button", { name: "축제·행사" }).click();
  expect((await festivalResponse).status()).toBe(200);
  await expect(page.getByText("제공자 전체 0곳", { exact: true })).toBeVisible();
  await expect(page.getByText("지도 0곳 표시", { exact: true })).toBeVisible();
  await expect(
    page.getByText("해운대구에서 이 유형으로 제공된 장소가 없습니다."),
  ).toBeVisible();
});

test("keeps shopping opt-in and known requested types out of 기타", async ({
  page,
}) => {
  await page.goto("/results");
  await expect(
    page.getByRole("heading", { name: "장소 13곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("기타", { exact: true })).toHaveCount(0);

  const attractionLink = page.getByRole("link", {
    name: "해운대 해수욕장 원문 상세 보기",
  });
  await expect(attractionLink).toHaveAttribute(
    "href",
    "/places/1001?contentTypeId=12",
  );

  const shoppingResponse = page.waitForResponse((response) =>
    response.url().includes("contentTypeId=38"),
  );
  await page.getByRole("button", { name: "쇼핑", exact: true }).click();
  expect((await shoppingResponse).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "장소 1곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("부산 여행 편집숍")).toBeVisible();
  await expect(
    page.locator("#place-card-1501").getByText("쇼핑", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("쇼핑은 선택형 카테고리입니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: /쇼핑\(선택형\) 1/u })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("기타", { exact: true })).toHaveCount(0);

  const allResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/tour/places?") &&
      !response.url().includes("contentTypeId="),
  );
  await page.getByRole("button", { name: "전체", exact: true }).click();
  expect((await allResponse).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "장소 13곳", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("부산 여행 편집숍")).toHaveCount(0);
});

test("paginates the completed provider catalog instead of hiding later pages", async ({
  page,
}) => {
  const catalogRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/tour/places?")) {
      catalogRequests.push(request.url());
    }
  });
  await page.goto("/results");
  await expect(page.getByText("1 / 2페이지 · 현재 12곳")).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  const map = page.locator(".kakao-map-canvas");
  await expect(map).toHaveAttribute("data-location-count", "13");
  // Wait for the async Kakao controller initialization, rather than capturing
  // the server-rendered version 0 and racing its first client-side update.
  await expect(map).toHaveAttribute("data-map-version", /^[1-9]\d*$/u);
  const mapVersion = await map.getAttribute("data-map-version");
  expect(catalogRequests).toHaveLength(1);
  expect(catalogRequests[0]).toContain("page=1");
  expect(catalogRequests[0]).toContain("pageSize=1000");

  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("2 / 2페이지 · 현재 1곳")).toBeVisible();
  await expect(page.getByText("현재 목록 13–13곳", { exact: true })).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(1);
  await expect(map).toHaveAttribute("data-location-count", "13");
  await expect(map).toHaveAttribute("data-map-version", mapVersion!);
  expect(catalogRequests).toHaveLength(1);
});

test("updates category cards and map markers together without mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/results");
  await expect(page.getByText("지도 13곳 표시", { exact: true })).toBeVisible();

  const attractionResponse = page.waitForResponse((response) =>
    response.url().includes("contentTypeId=12"),
  );
  await page.getByRole("button", { name: "관광지", exact: true }).click();
  expect((await attractionResponse).status()).toBe(200);
  await expect(page.getByText("제공자 전체 8곳", { exact: true })).toBeVisible();
  await expect(page.getByText("지도 8곳 표시", { exact: true })).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(8);
  await expect(page.locator(".kakao-map-canvas")).toHaveAttribute(
    "data-location-count",
    "8",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("saves an official planner district code and uses it on results", async ({
  page,
}) => {
  await page.goto("/planner/trip");
  await expect(page.getByLabel("여행 지역").locator("option")).toHaveCount(1);
  await expect(page.getByLabel("여행 지역")).not.toContainText("제주");
  const plannerDistrict = page.getByLabel("세부 지역");
  await expect(plannerDistrict).toHaveValue("all");
  await expect(plannerDistrict.locator("option")).toHaveCount(17);
  await plannerDistrict.selectOption("230");

  const scopedResponse = page.waitForResponse((response) =>
    response.url().includes("districtCode=230"),
  );
  await page.getByRole("button", { name: "추천 경로 보기" }).click();
  expect((await scopedResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/results\?tab=recommendations$/u);
  await expect(page.getByLabel("여행 범위")).toHaveValue("230");
  await page.getByRole("tab", { name: "전체 장소" }).click();
  await expect(page.getByLabel("부산 세부 지역")).toHaveValue("230");
  await expect(
    page.getByRole("heading", { name: "장소 2곳", exact: true }),
  ).toBeVisible();
});
