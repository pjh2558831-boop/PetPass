import { expect, test, type Page } from "@playwright/test";

const PRODUCTION_URL = "https://pet-pass-two.vercel.app";

function collectSanitizedBrowserErrors(page: Page) {
  const errors: string[] = [];
  const sanitize = (message: string) =>
    message.replace(/[a-f0-9]{32}/gi, "[redacted-key]");

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(sanitize(message.text()));
  });
  page.on("pageerror", (error) => errors.push(sanitize(error.message)));
  return errors;
}

function withoutRecoverableResourceErrors(errors: string[]) {
  return errors.filter(
    (error) => !error.startsWith("Failed to load resource:"),
  );
}

function collectKakaoNetwork(page: Page) {
  const events: string[] = [];
  const isMapHost = (hostname: string) =>
    hostname === "dapi.kakao.com" || hostname.endsWith("daumcdn.net");

  page.on("response", (response) => {
    const url = new URL(response.url());
    if (isMapHost(url.hostname)) {
      events.push(`${response.status()} ${url.hostname}${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (isMapHost(url.hostname)) {
      events.push(
        `FAILED ${url.hostname}${url.pathname} ${request.failure()?.errorText ?? "unknown"}`,
      );
    }
  });
  return events;
}

async function expectKakaoMapReady(
  page: Page,
  minimumMarkers: number,
  expectPolyline: boolean,
) {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ minimumMarkers, expectPolyline }) => {
            const map = document.querySelector<HTMLElement>(".kakao-map-canvas");
            const mapRoot = map?.querySelector<HTMLElement>(
              "[data-clusterer-ready=true]",
            );
            const images = map ? Array.from(map.querySelectorAll("img")) : [];
            const bodyText = document.body.textContent ?? "";
            return {
              sdkReady: Boolean(window.kakao?.maps?.Map),
              clustererConstructorReady: Boolean(
                window.kakao?.maps?.MarkerClusterer,
              ),
              sdkScriptCount: document.querySelectorAll(
                'script[src*="dapi.kakao.com/v2/maps/sdk.js"]',
              ).length,
              mapVersion: Number(map?.dataset.mapVersion ?? 0),
              mapHasHeight: (map?.getBoundingClientRect().height ?? 0) > 250,
              mapHasInternalDom: (map?.querySelectorAll("div").length ?? 0) > 5,
              clustererReady: mapRoot?.dataset.clustererReady === "true",
              tileLoaded: images.some(
                (image) => image.complete && image.naturalWidth > 0,
              ),
              markerCountReady:
                Number(mapRoot?.dataset.catalogMarkerCount ?? 0) >= minimumMarkers ||
                document.querySelectorAll(".kakao-map-marker").length >= minimumMarkers,
              polylinePathReady:
                !expectPolyline ||
                Array.from(map?.querySelectorAll<SVGPathElement>("path") ?? []).some(
                  (path) =>
                    (path.getAttribute("style") ?? "").includes(
                      "rgb(35, 97, 72)",
                    ) && (path.getAttribute("d")?.length ?? 0) > 100,
                ),
              unauthorizedDomainAbsent: !/unauthorized domain|domain mismatched/i.test(
                bodyText,
              ),
              nextErrorOverlayAbsent: !document.querySelector(
                "[data-nextjs-error-overlay], [data-nextjs-dialog]",
              ),
            };
          },
          { minimumMarkers, expectPolyline },
        ),
      { timeout: 30_000 },
    )
    .toEqual({
      sdkReady: true,
      clustererConstructorReady: true,
      sdkScriptCount: 1,
      mapVersion: 1,
      mapHasHeight: true,
      mapHasInternalDom: true,
      clustererReady: true,
      tileLoaded: true,
      markerCountReady: true,
      polylinePathReady: true,
      unauthorizedDomainAbsent: true,
      nextErrorOverlayAbsent: true,
    });
}

async function expectResponsiveMap(
  page: Page,
  width: number,
  height: number,
  expectPolyline = true,
) {
  await page.setViewportSize({ width, height });
  if (width <= 768) {
    await page
      .getByRole("group", { name: "지도 또는 목록 보기" })
      .getByRole("button", { name: "지도", exact: true })
      .click();
  }
  const fitButton = page.getByRole("button", {
    name: "표시된 장소에 지도 위치 맞추기",
  });
  await expect(fitButton).toBeEnabled();
  await fitButton.click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = document.querySelector<HTMLElement>(".kakao-map-canvas");
        const search = document.querySelector<HTMLElement>('input[type="search"]');
        const mapRect = map?.getBoundingClientRect();
        const customMarkers = Array.from(
          document.querySelectorAll<HTMLElement>(".kakao-map-marker"),
        );
        const clusterPoints = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-clusterer-ready="true"] div[style*="cursor: pointer"][style*="width: 46px"][style*="height: 46px"]',
          ),
        );
        const overlapsMap = (point: HTMLElement) => {
          const rect = point.getBoundingClientRect();
          return Boolean(
            mapRect &&
              rect.right >= mapRect.left - 8 &&
              rect.left <= mapRect.right + 8 &&
              rect.bottom >= mapRect.top - 8 &&
              rect.top <= mapRect.bottom + 8,
          );
        };
        return {
          mapHasHeight: (mapRect?.height ?? 0) > 250,
          noHorizontalOverflow:
            document.documentElement.scrollWidth <= window.innerWidth + 1,
          searchFits:
            !search || search.getBoundingClientRect().right <= window.innerWidth + 1,
          customMarkersInsideMap:
            Boolean(mapRect) &&
            customMarkers.every(overlapsMap),
          clusterPointInsideMap:
            Boolean(mapRect) &&
            clusterPoints.length > 0 &&
            clusterPoints.some(overlapsMap),
          tilesStillLoaded: Boolean(
            map &&
              Array.from(map.querySelectorAll("img")).some(
                (image) => image.complete && image.naturalWidth > 0,
              ),
          ),
          polylinePathStillPresent: Array.from(
            map?.querySelectorAll<SVGPathElement>("path") ?? [],
          ).some(
            (path) =>
              (path.getAttribute("style") ?? "").includes("rgb(35, 97, 72)") &&
              (path.getAttribute("d")?.length ?? 0) > 100,
          ),
        };
      }),
    )
    .toEqual({
      mapHasHeight: true,
      noHorizontalOverflow: true,
      searchFits: true,
      customMarkersInsideMap: true,
      clusterPointInsideMap: true,
      tilesStillLoaded: true,
      polylinePathStillPresent: expectPolyline,
    });
}

test("localhost renders current Kakao maps without a fixed demo itinerary", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `petpass-map-e2e-${testInfo.project.name}-${testInfo.workerIndex}`,
  });
  const browserErrors = collectSanitizedBrowserErrors(page);
  const kakaoNetwork = collectKakaoNetwork(page);
  const localSearchRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/places/discovery")) {
      localSearchRequests.push(request.url());
    }
  });

  await page.goto(`http://localhost:3000/?verify=${Date.now()}`);
  await expect(
    page.getByRole("heading", {
      name: /반려견과 함께, 부산 여행을 계획해보세요/,
    }),
  ).toBeVisible();
  try {
    await expectKakaoMapReady(page, 3, false);
  } catch (error) {
    console.error(`KAKAO_NETWORK=${JSON.stringify(kakaoNetwork)}`);
    throw error;
  }

  await page.goto(`http://localhost:3000/results?verify=${Date.now()}`);
  await expectKakaoMapReady(page, 13, false);
  await expectResponsiveMap(page, 1_440, 900, false);
  const clustererRoot = page.locator("[data-clusterer-ready=true]");
  const clusterCountBeforeClick = Number(
    await clustererRoot.getAttribute("data-cluster-count"),
  );
  expect(clusterCountBeforeClick).toBeGreaterThan(0);
  const clickableClusters = clustererRoot.locator(
    'div[style*="cursor: pointer"][style*="width: 46px"][style*="height: 46px"]',
  );
  expect(await clickableClusters.count()).toBeGreaterThan(0);
  await clickableClusters.last().click();
  await expect
    .poll(() =>
      clustererRoot.getAttribute("data-cluster-count").then(Number),
    )
    .not.toBe(clusterCountBeforeClick);
  await expectResponsiveMap(page, 768, 900, false);
  await expectResponsiveMap(page, 390, 844, false);
  await page.setViewportSize({ width: 1_440, height: 900 });
  const officialMapCount = Number(
    await page.locator(".kakao-map-canvas").getAttribute("data-location-count"),
  );
  expect(officialMapCount).toBeGreaterThanOrEqual(13);
  const sourceLegend = page.locator('[aria-label="장소 출처 범례"]');
  await expect(sourceLegend).toBeVisible();
  for (const source of ["한국관광공사", "카카오맵", "동물병원", "펫샵·용품점"]) {
    await expect(sourceLegend).toContainText(source);
  }
  await expect(
    page.getByRole("heading", {
      name: `총 ${officialMapCount.toLocaleString("ko-KR")}곳`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("카드는 페이지당 12개 · 지도는 현재 필터의 전체 결과", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("[data-clusterer-ready=true]")
        .getAttribute("data-cluster-count")
        .then(Number),
    )
    .toBeGreaterThan(0);
  await expect(page.getByText(/데모 일정 이동/)).toHaveCount(0);

  await page.getByRole("button", { name: "다음" }).click();
  const laterPageCardId = await page
    .locator('article[id^="place-card-"]')
    .first()
    .getAttribute("id");
  expect(laterPageCardId).toBeTruthy();
  const laterPageCard = page.locator(`#${laterPageCardId}`);
  const laterPageTitle = await laterPageCard.locator("h3").innerText();
  await laterPageCard.getByRole("button", { name: /지도에서 보기$/u }).click();
  await expect(page.locator(".kakao-map-info")).toContainText(laterPageTitle);
  await expect(laterPageCard).toHaveClass(/\bis-selected\b/u);

  await page.getByRole("button", { name: "이전" }).click();
  const firstPageCard = page.locator('article[id^="place-card-"]').first();
  const firstPageTitle = await firstPageCard.locator("h3").innerText();
  await firstPageCard.getByRole("button", { name: /지도에서 보기$/u }).click();
  await expect(page.locator(".kakao-map-info")).toContainText(firstPageTitle);
  await expect(firstPageCard).toHaveClass(/\bis-selected\b/u);

  expect(localSearchRequests).toEqual([]);

  await page.goto(`http://localhost:3000/itinerary?verify=${Date.now()}`);
  await expect(
    page.getByRole("heading", { name: "선택된 추천 경로가 없습니다." }),
  ).toBeVisible();

  expect(withoutRecoverableResourceErrors(browserErrors)).toEqual([]);
});

test("a complete Kakao SDK request failure keeps the map error state", async ({
  page,
}) => {
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) =>
    route.abort("failed"),
  );
  await page.goto(`http://localhost:3000/?sdk-failure=${Date.now()}`);

  const alert = page.locator('.kakao-map-canvas [role="alert"]');
  await expect(alert).toContainText("지도를 일시적으로 불러오지 못했습니다.");
  await expect(alert).toContainText("장소 목록은 계속 확인할 수 있어요.");
  await expect(page.locator(".homepage-workbench__list")).toBeVisible();
  await expect(page.locator(".kakao-map-canvas")).toBeVisible();
  const failureState = await page.evaluate(() => ({
    mapHeight:
      document.querySelector<HTMLElement>(".kakao-map-canvas")
        ?.getBoundingClientRect().height ?? 0,
    sdkScriptCount: document.querySelectorAll(
      'script[src*="dapi.kakao.com/v2/maps/sdk.js"]',
    ).length,
    mapConstructorReady: typeof window.kakao?.maps?.Map === "function",
  }));
  expect(failureState).toEqual({
    mapHeight: expect.any(Number),
    sdkScriptCount: 1,
    mapConstructorReady: false,
  });
  expect(failureState.mapHeight).toBeGreaterThan(250);
});

test("production renders the authenticated Kakao map responsively", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    process.env.RUN_PRODUCTION_KAKAO_E2E !== "1",
    "Set RUN_PRODUCTION_KAKAO_E2E=1 for the live Production verification.",
  );

  const browserErrors = collectSanitizedBrowserErrors(page);
  const kakaoNetwork = collectKakaoNetwork(page);
  const directionsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kakao/directions") &&
      response.request().method() === "POST",
  );
  const response = await page.goto(`${PRODUCTION_URL}/results?verify=${Date.now()}`);
  expect(response?.status()).toBe(200);
  const directionsResponse = await directionsResponsePromise;
  expect(directionsResponse.status()).toBe(200);
  const directionsBody = (await directionsResponse.json()) as {
    ok: boolean;
    data?: { coordinates?: unknown[] };
  };
  expect(directionsBody.ok).toBe(true);
  expect(directionsBody.data?.coordinates?.length).toBeGreaterThan(1);

  await expect(page.getByRole("heading", { name: /바다를 따라 여유롭게/ })).toBeVisible();
  try {
    await expectKakaoMapReady(page, 5, true);
  } catch (error) {
    console.error(`KAKAO_NETWORK=${JSON.stringify(kakaoNetwork)}`);
    throw error;
  }
  await expect(page.getByText(/실시간 이동 \d/)).toBeVisible();
  await expect(page.getByText(/차량 약 \d/)).toBeVisible();

  const searchResponsePromise = page.waitForResponse((apiResponse) =>
    apiResponse.url().includes("/api/places/discovery"),
  );
  await page.getByLabel("부산 세부 지역").selectOption("350");
  await page.getByRole("button", { name: "음식점", exact: true }).click();
  await page.getByRole("button", { name: "추가 후보 찾기", exact: true }).click();
  const searchResponse = await searchResponsePromise;
  expect(searchResponse.status()).toBe(200);
  const searchRegion = page.getByRole("region", { name: "추가 장소 후보 찾기" });
  const resultButtons = searchRegion.locator("li button");
  const resultCount = await resultButtons.count();
  expect(resultCount).toBeGreaterThan(0);
  const selectedResult = resultButtons.nth(0);
  await selectedResult.click();
  await expect(selectedResult).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".kakao-map-info")).toBeVisible();
  expect(await page.locator(".kakao-map-marker").count()).toBeGreaterThan(0);

  const screenshotDirectory = process.env.KAKAO_E2E_SCREENSHOT_DIR;
  if (testInfo.project.name === "chromium") {
    await expectResponsiveMap(page, 1_440, 900);
    if (screenshotDirectory) {
      await page
        .getByRole("region", { name: "부산 해운대 데모 경로" })
        .screenshot({ path: `${screenshotDirectory}/production-map-markers.png` });
      await page.screenshot({
        path: `${screenshotDirectory}/production-route-summary.png`,
        fullPage: true,
      });
    }
    await expectResponsiveMap(page, 768, 900);
  } else {
    await expectResponsiveMap(page, 390, 844);
    if (screenshotDirectory) {
      await page.screenshot({
        path: `${screenshotDirectory}/production-mobile-390.png`,
        fullPage: false,
      });
    }
  }

  const securityState = await page.evaluate(() => ({
    sdkScriptCount: document.querySelectorAll(
      'script[src*="dapi.kakao.com/v2/maps/sdk.js"]',
    ).length,
    unauthorizedVisible: /unauthorized domain|domain mismatched/i.test(
      document.body.textContent ?? "",
    ),
    hydrationVisible: /hydration failed|hydration mismatch/i.test(
      document.body.textContent ?? "",
    ),
  }));
  expect(securityState).toEqual({
    sdkScriptCount: 1,
    unauthorizedVisible: false,
    hydrationVisible: false,
  });
  expect(withoutRecoverableResourceErrors(browserErrors)).toEqual([]);
});
