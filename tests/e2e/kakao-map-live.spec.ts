import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";

const PRODUCTION_URL = "https://pet-pass-two.vercel.app";

function collectSanitizedBrowserErrors(page: Page) {
  const errors: string[] = [];
  let expectedTourImage404Count = 0;
  const sanitize = (message: string) =>
    message.replace(/[a-f0-9]{32}/gi, "[redacted-key]");

  const isExpectedTourImage404 = (message: ConsoleMessage) => {
    if (!message.text().includes("404")) return false;
    const locationUrl = message.location().url;
    try {
      const url = new URL(locationUrl);
      const upstream =
        url.pathname === "/_next/image"
          ? new URL(url.searchParams.get("url") ?? "")
          : url;
      return upstream.hostname === "tong.visitkorea.or.kr";
    } catch {
      return false;
    }
  };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (isExpectedTourImage404(message)) {
      expectedTourImage404Count += 1;
      return;
    }
    errors.push(sanitize(message.text()));
  });
  page.on("pageerror", (error) => errors.push(sanitize(error.message)));
  return {
    errors,
    expectedTourImage404Count: () => expectedTourImage404Count,
  };
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
      polylinePathStillPresent: expectPolyline,
    });
}

test("localhost renders Kakao maps and search without a fixed demo itinerary", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.RUN_LIVE_KAKAO_E2E !== "1",
    "Set RUN_LIVE_KAKAO_E2E=1 with the dedicated live config.",
  );
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

  const listResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/tour/places?"),
  );
  await page.goto(`http://localhost:3000/results?verify=${Date.now()}`);
  const listResponse = await listResponsePromise;
  expect(listResponse.status()).toBe(200);
  const listBody = (await listResponse.json()) as {
    ok: boolean;
    data?: {
      places?: Array<{
        contentId: string;
        title: string;
        latitude: number | null;
        longitude: number | null;
      }>;
    };
  };
  expect(listBody.ok).toBe(true);
  const livePlaces = listBody.data?.places ?? [];
  const validPlaces = livePlaces.filter(
    (place) =>
      Number.isFinite(place.latitude) && Number.isFinite(place.longitude),
  );
  expect(validPlaces.length).toBeGreaterThan(0);
  try {
    await expectKakaoMapReady(page, validPlaces.length, false);
  } catch (error) {
    console.error(`KAKAO_NETWORK=${JSON.stringify(kakaoNetwork)}`);
    throw error;
  }
  await expectResponsiveMap(page, 1_440, 900, false);
  const clustererRoot = page.locator("[data-clusterer-ready=true]");
  const clusterCountBeforeClick = Number(
    await clustererRoot.getAttribute("data-cluster-count"),
  );
  expect(clusterCountBeforeClick).toBeGreaterThan(0);
  await expectResponsiveMap(page, 768, 900, false);
  await expectResponsiveMap(page, 390, 844, false);
  await expect(
    page.getByText(
      new RegExp(
        `현재 필터의 좌표 확인 장소 ${validPlaces.length}곳을 모두 표시합니다`,
        "u",
      ),
    ),
  ).toBeVisible();
  await expect(
    page.getByText(`지도 ${validPlaces.length}곳 표시`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/데모 일정 이동/)).toHaveCount(0);

  const liveMarker = page.locator(
    `.kakao-map-marker[data-location-id="${validPlaces[0]!.contentId}"]`,
  );
  await expect(liveMarker).toHaveCount(1);
  await page
    .getByRole("button", {
      name: `${validPlaces[0]!.title} 지도에서 보기`,
      exact: true,
    })
    .click();
  await expect(page.locator(".kakao-map-info")).toContainText(
    validPlaces[0]!.title,
  );
  await expect(
    page.locator(`#place-card-${validPlaces[0]!.contentId}`),
  ).toHaveClass(/ring-2/u);

  await page.getByLabel("부산 세부 지역").selectOption("500");
  await page.getByRole("button", { name: "음식점", exact: true }).click();
  const searchResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/places/discovery"),
  );
  await page.getByRole("button", { name: "추가 후보 찾기", exact: true }).click();
  const searchResponse = await searchResponsePromise;
  expect(searchResponse.status()).toBe(200);
  const searchBody = (await searchResponse.json()) as {
    ok: boolean;
    data?: { candidates?: Array<{ placeUrl?: string }> };
  };
  expect(searchBody.ok).toBe(true);
  const candidates = searchBody.data?.candidates ?? [];
  expect(candidates.length).toBeGreaterThan(0);
  candidates.forEach((candidate) => {
    if (candidate.placeUrl) {
      expect(parseKakaoPlaceUrl(candidate.placeUrl)).toBe(candidate.placeUrl);
    }
  });

  const searchRegion = page.getByRole("region", { name: "추가 장소 후보 찾기" });
  const resultButtons = searchRegion.locator("li button");
  const resultCount = await resultButtons.count();
  expect(resultCount).toBeGreaterThan(0);
  await expect(
    searchRegion.getByRole("button", { name: "주변 후보 함께 보기" }),
  ).toHaveAttribute("aria-pressed", "false");
  const catalogMarkerCount = await page.locator(".kakao-map-marker").count();
  const selectedResult = resultButtons.nth(0);
  await selectedResult.click();
  await expect(selectedResult).toHaveAttribute("aria-pressed", "true");
  await expect(
    searchRegion.getByRole("button", { name: "주변 후보 함께 보기" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".kakao-map-info")).toBeVisible();
  await expect(page.locator(".kakao-map-marker")).toHaveCount(
    catalogMarkerCount + resultCount,
  );
  await expect(searchRegion.getByText("카카오 검색 후보").first()).toBeVisible();
  await expect(searchRegion.getByText("동반 여부 확인 필요").first()).toBeVisible();

  const configuredSearchCount = localSearchRequests.length;
  await page.waitForTimeout(500);
  expect(localSearchRequests).toHaveLength(configuredSearchCount);

  expect(browserErrors.errors).toEqual([]);
  console.log(
    `LIVE_KAKAO_EXPECTED_TOUR_IMAGE_404=${browserErrors.expectedTourImage404Count()}`,
  );
  console.log(`LIVE_KAKAO_CATALOG_PLACES=${livePlaces.length}`);
  console.log(`LIVE_KAKAO_VALID_COORDINATES=${validPlaces.length}`);
  console.log(`LIVE_KAKAO_DISCOVERY_CANDIDATES=${candidates.length}`);
  console.log(
    `LIVE_KAKAO_CANONICAL_LINKS=${candidates.filter((candidate) => candidate.placeUrl).length}`,
  );
  console.log(
    `LIVE_KAKAO_ABSENT_LINKS=${candidates.filter((candidate) => !candidate.placeUrl).length}`,
  );
});

test("a complete Kakao SDK request failure keeps the map error state", async ({
  page,
}) => {
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) =>
    route.abort("failed"),
  );
  await page.goto(`http://localhost:3000/results?sdk-failure=${Date.now()}`);

  const alert = page.locator('.kakao-map-canvas [role="alert"]');
  await expect(alert).toContainText("카카오 지도 SDK를 불러오지 못했습니다");
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
  expect(browserErrors.errors).toEqual([]);
});
