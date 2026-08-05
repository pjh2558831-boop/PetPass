import { expect, test, type Page } from "@playwright/test";
import { installTourListMock } from "./tour-mock";

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
            const images = map ? Array.from(map.querySelectorAll("img")) : [];
            const bodyText = document.body.textContent ?? "";
            return {
              sdkReady: Boolean(window.kakao?.maps?.Map),
              sdkScriptCount: document.querySelectorAll(
                'script[src*="dapi.kakao.com/v2/maps/sdk.js"]',
              ).length,
              mapHasHeight: (map?.getBoundingClientRect().height ?? 0) > 250,
              mapHasInternalDom: (map?.querySelectorAll("div").length ?? 0) > 5,
              tileLoaded: images.some(
                (image) => image.complete && image.naturalWidth > 0,
              ),
              markerCountReady:
                document.querySelectorAll(".kakao-map-marker").length >=
                minimumMarkers,
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
      sdkScriptCount: 1,
      mapHasHeight: true,
      mapHasInternalDom: true,
      tileLoaded: true,
      markerCountReady: true,
      polylinePathReady: true,
      unauthorizedDomainAbsent: true,
      nextErrorOverlayAbsent: true,
    });
}

async function expectResponsiveMap(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
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
        const markers = Array.from(
          document.querySelectorAll<HTMLElement>(".kakao-map-marker"),
        );
        return {
          mapHasHeight: (mapRect?.height ?? 0) > 250,
          noHorizontalOverflow:
            document.documentElement.scrollWidth <= window.innerWidth + 1,
          searchFits:
            !search || search.getBoundingClientRect().right <= window.innerWidth + 1,
          markersInsideMap:
            Boolean(mapRect) &&
            markers.length > 0 &&
            markers.every((marker) => {
              const rect = marker.getBoundingClientRect();
              return (
                rect.right >= mapRect!.left - 8 &&
                rect.left <= mapRect!.right + 8 &&
                rect.bottom >= mapRect!.top - 8 &&
                rect.top <= mapRect!.bottom + 8
              );
            }),
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
      markersInsideMap: true,
      tilesStillLoaded: true,
      polylinePathStillPresent: true,
    });
}

test("localhost renders Kakao maps, search results and a recalculated route", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installTourListMock(page);
  const browserErrors = collectSanitizedBrowserErrors(page);
  const kakaoNetwork = collectKakaoNetwork(page);

  await page.goto(`http://localhost:3000/?verify=${Date.now()}`);
  await expect(page.getByRole("heading", { name: /함께 들어갈 수 있는 곳/ })).toBeVisible();
  try {
    await expectKakaoMapReady(page, 3, false);
  } catch (error) {
    console.error(`KAKAO_NETWORK=${JSON.stringify(kakaoNetwork)}`);
    throw error;
  }

  const directionsResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kakao/directions") &&
      response.request().method() === "POST",
  );
  await page.goto(`http://localhost:3000/results?verify=${Date.now()}`);
  const directionsResponse = await directionsResponsePromise;
  expect(directionsResponse.status()).toBe(200);
  const directionsBody = (await directionsResponse.json()) as {
    ok: boolean;
    data?: { coordinates?: unknown[]; totalDistanceMeters?: number };
  };
  expect(directionsBody.ok).toBe(true);
  expect(directionsBody.data?.coordinates?.length).toBeGreaterThan(1);
  expect(directionsBody.data?.totalDistanceMeters).toBeGreaterThan(0);

  await expectKakaoMapReady(page, 5, true);
  /* Legacy demo-copy assertions replaced by live-summary copy below.
  await expect(page.getByText(/실시간 이동 \d/)).toBeVisible();
  await expect(page.getByText(/차량 약 \d/)).toBeVisible();

  const firstMarker = page.locator(
    '.kakao-map-marker[aria-label="청사포 바다 산책길 지도 마커"]',
  );
  await expect(firstMarker).toHaveCount(1);
  await firstMarker.click();
  await expect(page.locator(".kakao-map-info")).toContainText(
    "청사포 바다 산책길",
  );

  */
  await expect(page.getByText(/데모 일정 이동 \d/)).toBeVisible();
  await expect(page.getByText(/차량 약/)).toBeVisible();

  const firstLiveMarker = page.locator(
    '.kakao-map-marker[aria-label^="해운대 해수욕장"]',
  );
  await expect(firstLiveMarker).toHaveCount(1);
  await firstLiveMarker.click();
  await expect(page.locator(".kakao-map-info")).toContainText("해운대 해수욕장");

  const searchResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/kakao/local/search"),
  );
  await page.getByRole("searchbox", { name: "카카오 장소 검색" }).fill("해운대 카페");
  const searchResponse = await searchResponsePromise;
  expect(searchResponse.status()).toBe(200);
  const searchBody = (await searchResponse.json()) as {
    ok: boolean;
    data?: unknown[];
  };
  expect(searchBody.ok).toBe(true);
  expect(searchBody.data?.length).toBeGreaterThan(0);

  const searchRegion = page.getByRole("region", { name: "주변 장소 직접 찾기" });
  const resultButtons = searchRegion.locator("li button");
  const resultCount = await resultButtons.count();
  expect(resultCount).toBeGreaterThan(0);
  const selectedResult = resultButtons.nth(0);
  await selectedResult.click();
  await expect(selectedResult).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".kakao-map-info")).toBeVisible();
  await expect(page.locator(".kakao-map-marker")).toHaveCount(6);

  const itineraryDirectionsPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kakao/directions") &&
      response.request().method() === "POST",
  );
  await page.goto(`http://localhost:3000/itinerary?verify=${Date.now()}`);
  await itineraryDirectionsPromise;
  await expectKakaoMapReady(page, 3, true);
  const distanceBefore = await page.locator("dd").first().textContent();
  const routePathsBefore = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<SVGPathElement>(".kakao-map-canvas path"),
    )
      .filter((path) =>
        (path.getAttribute("style") ?? "").includes("rgb(35, 97, 72)"),
      )
      .map((path) => path.getAttribute("d") ?? "")
      .filter(Boolean),
  );
  expect(routePathsBefore.length).toBeGreaterThan(0);

  const recalculatedResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/kakao/directions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "마린 테라스 식탁 한 칸 위로" })
    .click();
  const recalculatedResponse = await recalculatedResponsePromise;
  expect(recalculatedResponse.status()).toBe(200);
  const recalculatedBody = (await recalculatedResponse.json()) as {
    ok: boolean;
    data?: { coordinates?: unknown[] };
  };
  expect(recalculatedBody.ok).toBe(true);
  expect(recalculatedBody.data?.coordinates?.length).toBeGreaterThan(1);
  await expect(page.locator("dd").first()).not.toHaveText(distanceBefore ?? "");
  await expectKakaoMapReady(page, 3, true);
  const routePathsAfter = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<SVGPathElement>(".kakao-map-canvas path"),
    )
      .filter((path) =>
        (path.getAttribute("style") ?? "").includes("rgb(35, 97, 72)"),
      )
      .map((path) => path.getAttribute("d") ?? "")
      .filter(Boolean),
  );
  expect(routePathsAfter.length).toBeGreaterThan(0);
  expect(routePathsAfter).not.toEqual(routePathsBefore);
  for (const previousPath of routePathsBefore) {
    expect(routePathsAfter).not.toContain(previousPath);
  }

  expect(browserErrors).toEqual([]);
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
    apiResponse.url().includes("/api/kakao/local/search"),
  );
  await page.getByRole("searchbox", { name: "카카오 장소 검색" }).fill("해운대 카페");
  const searchResponse = await searchResponsePromise;
  expect(searchResponse.status()).toBe(200);
  const searchRegion = page.getByRole("region", { name: "주변 장소 직접 찾기" });
  const resultButtons = searchRegion.locator("li button");
  const resultCount = await resultButtons.count();
  expect(resultCount).toBeGreaterThan(0);
  const selectedResult = resultButtons.nth(0);
  await selectedResult.click();
  await expect(selectedResult).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".kakao-map-info")).toBeVisible();
  await expect(page.locator(".kakao-map-marker")).toHaveCount(6);

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
  expect(browserErrors).toEqual([]);
});
