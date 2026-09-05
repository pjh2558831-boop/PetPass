import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { HomepagePlacesSnapshot } from "@/types/homepage-places";
import type { HomepageOptionalDatasetId } from "@/types/homepage-optional";
import {
  chooseConfirmedDeparture,
  continueToTrip,
} from "./planner-test-helpers";
import {
  cardFromMarker,
  completedHomepageSnapshot,
  enrichmentSnapshot,
  fulfillInitial,
  GENERATE_API_PATH,
  HOMEPAGE_COMPLETION_API,
  HOMEPAGE_ENRICHMENT_API,
  HOMEPAGE_INITIAL_API,
  HOMEPAGE_OPTIONAL_API,
  initialSnapshot,
  initialSnapshotWithCompletion,
  installFakeMap,
  installHomepageImageFixture,
  MAP_FAILURE_TEST,
  marker,
  mockHomepage,
  NETWORK_TEST,
  OFFICIAL_ALLOWED,
  OFFICIAL_NEUTRAL,
  optionalSnapshot,
  SNAPSHOT,
} from "./homepage-test-helpers";

async function showHomepageMapMode(page: Page) {
  if ((page.viewportSize()?.width ?? 1_024) >= 1_180) return;
  await page
    .getByRole("group", { name: "홈 장소 지도 또는 목록 보기" })
    .getByRole("button", { name: "지도", exact: true })
    .click();
  await expect(page.locator(".homepage-workbench__map")).toBeVisible();
}

async function showHomepageListMode(page: Page) {
  if ((page.viewportSize()?.width ?? 1_024) >= 1_180) return;
  await page
    .getByRole("group", { name: "홈 장소 지도 또는 목록 보기" })
    .getByRole("button", { name: "목록", exact: true })
    .click();
  await expect(page.locator(".homepage-workbench__list")).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  await installHomepageImageFixture(page);
  if (testInfo.title !== NETWORK_TEST && testInfo.title !== MAP_FAILURE_TEST) {
    await installFakeMap(page);
  }
});
test(NETWORK_TEST, async ({ page }) => {
  let initialRequests = 0;
  let enrichmentRequests = 0;
  let optionalRequests = 0;
  const sdkRequests: string[] = [];
  const forbidden: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/homepage/places/initial" && url.searchParams.get("scope") === "default") initialRequests += 1;
    if (url.pathname === "/api/homepage/places/enrichment") enrichmentRequests += 1;
    if (url.pathname === "/api/homepage/places/optional") optionalRequests += 1;
    if (url.hostname === "dapi.kakao.com" && url.pathname === "/v2/maps/sdk.js") sdkRequests.push(url.toString());
    if (["/api/tour/homepage", "/api/map/places", "/api/places/discovery", "/api/itineraries/generate", "/api/directions", "/api/kakao/directions"].includes(url.pathname) || url.hostname.includes("supabase") || url.hostname.includes("apis.data.go.kr")) forbidden.push(url.toString());
  });
  await mockHomepage(page);
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.kakao={maps:{load:function(callback){callback();}}};",
  }));
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect.poll(() => initialRequests).toBe(1);
  await expect.poll(() => enrichmentRequests).toBe(1);
  expect(optionalRequests).toBe(0);
  await expect.poll(() => sdkRequests.length).toBe(1);
  await expect.poll(() => page.evaluate(() =>
    performance.getEntriesByType("measure")
      .map(({ name }) => name)
      .filter((name) => name.startsWith("weekendog:homepage:initial:")),
  )).toEqual(expect.arrayContaining([
    "weekendog:homepage:initial:headers",
    "weekendog:homepage:initial:download",
    "weekendog:homepage:initial:parse",
    "weekendog:homepage:initial:react_commit",
  ]));
  const sdk = new URL(sdkRequests[0]);
  expect(sdk.searchParams.get("autoload")).toBe("false");
  expect(new Set(sdk.searchParams.get("libraries")?.split(","))).toEqual(new Set(["services", "clusterer"]));
  expect(forbidden).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
test("loads Shopping once, keeps the usable map visible, and reselects from browser memory", async ({ page }, testInfo) => {
  let optionalRequests = 0;
  const initialCookieHeaders: Array<string | undefined> = [];
  const enrichmentCookieHeaders: Array<string | undefined> = [];
  const optionalCookieHeaders: Array<string | undefined> = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  let releaseShopping!: () => void;
  const shoppingGate = new Promise<void>((resolve) => { releaseShopping = resolve; });
  await page.route(HOMEPAGE_INITIAL_API, (route) => {
    initialCookieHeaders.push(route.request().headers().cookie);
    return fulfillInitial(route);
  });
  await page.route(HOMEPAGE_ENRICHMENT_API, (route) => {
    enrichmentCookieHeaders.push(route.request().headers().cookie);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: enrichmentSnapshot(),
        requestId: "homepage-shopping-enrichment",
      }),
    });
  });
  await page.route(HOMEPAGE_OPTIONAL_API, async (route) => {
    optionalRequests += 1;
    optionalCookieHeaders.push(route.request().headers().cookie);
    const dataset = new URL(route.request().url()).searchParams.get("dataset") as HomepageOptionalDatasetId;
    if (dataset === "optional-kto-shopping") await shoppingGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: optionalSnapshot(SNAPSHOT, dataset),
        requestId: "homepage-shopping-optional",
      }),
    });
  });

  await page.context().addCookies([{
    name: "petpass-test-session",
    value: "private",
    url: "http://localhost:3000",
  }]);
  await page.goto("/");
  const mapCanvas = page.locator(".homepage-map-canvas-wrap .map-canvas");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  await expect.poll(() => enrichmentCookieHeaders.length).toBe(1);
  expect(initialCookieHeaders).toEqual(["petpass-test-session=private"]);
  expect(enrichmentCookieHeaders).toEqual(["petpass-test-session=private"]);
  expect(optionalRequests).toBe(0);

  await showHomepageMapMode(page);
  const filterButton = page.getByRole("button", { name: "필터", exact: true });
  await filterButton.click();
  const filters = page.getByRole("region", { name: "지도 장소 필터" });
  await filters.getByRole("button", { name: /^쇼핑/u }).click();
  await expect(filters.getByText("쇼핑 데이터를 불러오는 중", { exact: true })).toBeVisible();
  await expect(page.locator(".homepage-live-loading")).toHaveCount(0);
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  await filters.getByRole("button", { name: "적용하기" }).click();
  expect(optionalRequests).toBe(1);
  expect(optionalCookieHeaders).toEqual(["petpass-test-session=private"]);

  releaseShopping();
  await expect(mapCanvas).toHaveAttribute("data-location-count", "6");
  await filterButton.click();
  await expect(filters.getByRole("button", { name: /^쇼핑/u })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "적용하기" }).click();
  await expect(mapCanvas).toHaveAttribute("data-location-count", "6");
  expect(optionalRequests).toBe(1);

  await filterButton.click();
  await filters.getByRole("button", { name: /^쇼핑/u }).click();
  await expect(filters.getByRole("button", { name: /^쇼핑/u })).toHaveAttribute("aria-pressed", "false");
  await filters.getByRole("button", { name: "적용하기" }).click();
  await expect.poll(() => pageErrors).toEqual([]);
  await expect.poll(() => consoleErrors).toEqual([]);
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  await filterButton.click();
  await filters.getByRole("button", { name: /^쇼핑/u }).click();
  await expect(filters.getByRole("button", { name: /^쇼핑/u })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "적용하기" }).click();
  await expect(mapCanvas).toHaveAttribute("data-location-count", "6");
  expect(optionalRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const entries = performance.getEntriesByName("weekendog:homepage:filter:feedback", "measure");
    return entries.length > 0 && entries.every((entry) => entry.duration < 150);
  })).toBe(true);
  const browserMetrics = await page.evaluate(() => ({
    measures: Object.fromEntries(
      performance.getEntriesByType("measure")
        .filter(({ name }) => name.startsWith("weekendog:homepage:optional:") ||
          name.startsWith("weekendog:homepage:filter:") ||
          name.startsWith("weekendog:homepage:map:"))
        .map(({ name, duration }) => [name, Number(duration.toFixed(2))]),
    ),
    markerUpdateMs: Number(
      document.querySelector("[data-marker-update-ms]")?.getAttribute("data-marker-update-ms"),
    ),
  }));
  const metrics = { ...browserMetrics, optionalRequests };
  await testInfo.attach("homepage-shopping-metrics.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
});

test("renders the base map while KTO enrichment is delayed by ten seconds", async ({ page }, testInfo) => {
  await page.clock.install();
  let releaseEnrichment!: () => void;
  let enrichmentRequested = false;
  const enrichmentGate = new Promise<void>((resolve) => { releaseEnrichment = resolve; });
  await page.route(HOMEPAGE_INITIAL_API, (route) => fulfillInitial(route));
  await page.route(HOMEPAGE_ENRICHMENT_API, async (route) => {
    enrichmentRequested = true;
    await enrichmentGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: enrichmentSnapshot(),
        requestId: "homepage-delayed-enrichment",
      }),
    }).catch(() => undefined);
  });

  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect(page.locator(".homepage-map-canvas-wrap .map-canvas")).toHaveAttribute(
    "data-location-count",
    "5",
  );
  const initializedMap = page.locator(".homepage-map-canvas-wrap [data-marker-registry-size]");
  await expect(initializedMap).toHaveAttribute("data-kakao-map-initialized", "true");
  await expect(initializedMap).toHaveAttribute("data-marker-registry-size", "5");
  await expect(initializedMap).toHaveAttribute("data-marker-update-ms", /\d/u);
  const deterministicMetrics = await page.evaluate(() => ({
    measures: Object.fromEntries(
      performance.getEntriesByType("measure")
        .filter(({ name }) => name.startsWith("weekendog:homepage:initial:"))
        .map(({ name, duration }) => [name, Number(duration.toFixed(2))]),
    ),
    markerUpdateMs: Number(
      document.querySelector("[data-marker-update-ms]")?.getAttribute("data-marker-update-ms"),
    ),
  }));
  await testInfo.attach("homepage-progressive-metrics.json", {
    body: JSON.stringify(deterministicMetrics, null, 2),
    contentType: "application/json",
  });
  await expect.poll(() => enrichmentRequested).toBe(true);
  await page.clock.runFor(10_000);
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect(page.locator(".homepage-map-canvas-wrap .map-canvas")).toHaveAttribute(
    "data-location-count",
    "5",
  );
  releaseEnrichment();
});

test("renders initial markers without waiting for images", async ({ page }) => {
  let releaseImages!: () => void;
  let imageRequested = false;
  const imageGate = new Promise<void>((resolve) => { releaseImages = resolve; });
  const holdImage = async (route: Route) => {
    imageRequested = true;
    await imageGate;
    await route.abort().catch(() => undefined);
  };
  await page.route("**/_next/image?**", holdImage);
  await page.route("**/images/home/**", holdImage);
  await mockHomepage(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => imageRequested).toBe(true);
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect(page.locator(".homepage-map-canvas-wrap [data-marker-registry-size]")).toHaveAttribute(
    "data-marker-registry-size",
    "5",
  );
  releaseImages();
});

test("keeps stored markers visible when KTO enrichment fails", async ({ page }) => {
  await page.route(HOMEPAGE_INITIAL_API, (route) => fulfillInitial(route));
  await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({
      ok: false,
      error: {
        code: "UPSTREAM_QUOTA",
        message: "공식 상세 정보가 잠시 지연되고 있습니다.",
        retryable: true,
      },
      requestId: "homepage-enrichment-failure",
    }),
  }));

  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect(page.locator(".homepage-map-canvas-wrap .map-canvas")).toHaveAttribute(
    "data-location-count",
    "5",
  );
  await expect(page.locator(".homepage-live-error")).toHaveCount(0);
});

test("aborts an abandoned homepage snapshot request on navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Abort instrumentation is verified once in desktop Chromium.");
  await page.addInitScript(() => {
    const NativeAbortController = window.AbortController;
    window.AbortController = class extends NativeAbortController {
      override abort(reason?: unknown) {
        const count = Number(sessionStorage.getItem("homepage-abort-count") ?? "0");
        sessionStorage.setItem("homepage-abort-count", String(count + 1));
        super.abort(reason);
      }
    };
  });
  let release!: () => void;
  let requested = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(HOMEPAGE_INITIAL_API, async (route) => {
    requested = true;
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: initialSnapshot(), requestId: "homepage-abort" }),
    })
      .catch(() => undefined);
  });
  await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.abort());

  await page.goto("/");
  await expect(page.locator(".homepage-live-loading")).toBeVisible();
  await expect.poll(() => requested).toBe(true);
  const navigation = Promise.all([
    page.waitForURL(/\/planner\/pet/u),
    page
      .getByRole("form", { name: "여행 만들기 빠른 시작" })
      .getByRole("button", { name: "장소 없이 알아서 추천받기" })
      .click(),
  ]);
  await page.waitForURL(/\/planner\/pet/u);
  await expect.poll(() => page.evaluate(
    () => Number(sessionStorage.getItem("homepage-abort-count") ?? "0"),
  )).toBeGreaterThan(0);
  release();
  await navigation;
});

test("aborts and ignores late enrichment after navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Abort instrumentation is verified once in desktop Chromium.");
  await page.addInitScript(() => {
    const NativeAbortController = window.AbortController;
    window.AbortController = class extends NativeAbortController {
      override abort(reason?: unknown) {
        const count = Number(sessionStorage.getItem("homepage-abort-count") ?? "0");
        sessionStorage.setItem("homepage-abort-count", String(count + 1));
        super.abort(reason);
      }
    };
  });
  let releaseEnrichment!: () => void;
  let enrichmentRequested = false;
  const enrichmentGate = new Promise<void>((resolve) => { releaseEnrichment = resolve; });
  await page.route(HOMEPAGE_INITIAL_API, (route) => fulfillInitial(route));
  await page.route(HOMEPAGE_ENRICHMENT_API, async (route) => {
    enrichmentRequested = true;
    await enrichmentGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: enrichmentSnapshot(),
        requestId: "homepage-late-enrichment",
      }),
    }).catch(() => undefined);
  });

  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect.poll(() => enrichmentRequested).toBe(true);
  await page
    .getByRole("form", { name: "여행 만들기 빠른 시작" })
    .getByRole("button", { name: "장소 없이 알아서 추천받기" })
    .click();
  await expect(page).toHaveURL(/\/planner\/pet/u);
  await expect.poll(() => page.evaluate(
    () => Number(sessionStorage.getItem("homepage-abort-count") ?? "0"),
  )).toBeGreaterThan(0);
  releaseEnrichment();
  await expect(page.getByRole("heading", { name: "여행 정보 입력" })).toBeVisible();
});

test("uses one eager static Busan hero image without carousel controls", async ({ page }) => {
  const requestedFeaturedImages = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    const source = url.searchParams.get("url") ?? url.pathname;
    if (source.includes("weekendog-busan-city-ver2")) {
      requestedFeaturedImages.add(source);
    }
  });
  await mockHomepage(page);
  await page.goto("/");
  const heroPhoto = page.locator(".weekendoog-hero-photo-frame");
  await expect(heroPhoto.locator("img")).toHaveCount(1);
  await expect(heroPhoto.locator("img")).toHaveAttribute("alt", /부산 해변과 광안대교/u);
  await expect(heroPhoto.locator("img")).toHaveAttribute("loading", "eager");
  await expect(heroPhoto.getByText("부산 해변과 해안 도심", { exact: true })).toBeVisible();
  await expect.poll(() => requestedFeaturedImages.size).toBe(1);
  await expect(heroPhoto.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".weekendoog-hero-slide")).toHaveCount(0);
});

test("uses compact hero copy and three local official partner marks", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");

  const hero = page.locator(".weekendoog-hero");
  await expect(hero).toContainText(
    "공식 반려동물 동반 정보를 확인하고 실제 이동시간을 고려해",
  );
  await expect(hero).toContainText(
    "우리 아이와 함께할 하루 일정을 만듭니다.",
  );
  await expect(hero.getByText("공식 데이터 기반 반려동물 여행", { exact: true })).toHaveCount(0);

  const launcher = page.getByRole("form", { name: "여행 만들기 빠른 시작" });
  await expect(launcher.locator(".hero-planner-label").getByText("여행 지역", { exact: true })).toBeVisible();
  await expect(launcher.getByRole("combobox", { name: "여행 지역" })).toHaveValue("busan");
  await expect(launcher.getByRole("button", { name: "장소 찾아 일정 만들기" })).toBeVisible();
  await expect(launcher.getByText("빠른 지역 선택", { exact: true })).toHaveCount(0);
  await expect(launcher.getByText("언제 갈까요?", { exact: true })).toHaveCount(0);
  await expect(launcher.getByText("누구와 함께?", { exact: true })).toHaveCount(0);
  await expect(
    launcher.getByText("날짜와 반려동물 정보는 다음 화면에서 이어서 입력합니다.", {
      exact: true,
    }),
  ).toHaveCount(0);

  const trust = page.locator(".weekendoog-public-data");
  const marks = trust.locator(".weekendoog-partner-item img");
  await expect(marks).toHaveCount(3);
  const sources = await marks.evaluateAll((images) =>
    images.map((image) => decodeURIComponent(image.getAttribute("src") ?? "")),
  );
  expect(sources[0]).toContain(
    "/brand/partners/kto-horizontal-ko-transparent.png",
  );
  expect(sources[1]).toContain("/brand/partners/kakaomap-horizontal-ko.png");
  expect(sources[2]).toContain(
    "/brand/partners/mois-horizontal-ko-transparent-trimmed.png",
  );
  await expect(trust).toContainText("관광 장소와 반려동물 동반 정보");
  await expect(trust).toContainText("지도 표시와 실제 이동시간");
  await expect(trust.locator(".weekendoog-partner-row")).toHaveCount(1);
  const partnerAspectRatios = await marks.evaluateAll((images) => images.map((image) => {
    const element = image as HTMLImageElement;
    return Number((element.naturalWidth / element.naturalHeight).toFixed(2));
  }));
  expect(partnerAspectRatios.every((ratio) => Number.isFinite(ratio) && ratio > 0)).toBe(true);
  expect(new Set(partnerAspectRatios).size).toBeGreaterThan(1);
});

test("crosses the desktop launcher over the hero edge and keeps annotated dimensions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop annotation only");
  await page.setViewportSize({ width: 1403, height: 986 });
  await mockHomepage(page);
  await page.goto("/");

  await expect(page.locator(".weekendoog-hero")).toBeVisible();

  const layoutBox = await page.locator(".weekendoog-hero-layout").boundingBox();
  const copyBox = await page.locator(".weekendoog-hero-copy").boundingBox();
  const launcherBox = await page.locator(".weekendoog-hero-launcher").boundingBox();
  const trustBox = await page.locator(".weekendoog-public-data").boundingBox();
  const contactBox = await page.locator(".weekendoog-contact-card").boundingBox();

  expect(layoutBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(launcherBox).not.toBeNull();
  expect(trustBox).not.toBeNull();
  expect(contactBox).not.toBeNull();
  expect(launcherBox!.width).toBeCloseTo(720, 0);
  expect(launcherBox!.x).toBeGreaterThan(layoutBox!.x);
  expect(launcherBox!.y).toBeGreaterThanOrEqual(copyBox!.y + copyBox!.height);
  expect(launcherBox!.y).toBeLessThan(layoutBox!.y + layoutBox!.height);
  expect(launcherBox!.y + launcherBox!.height).toBeGreaterThan(layoutBox!.y + layoutBox!.height);
  expect(trustBox!.height).toBeGreaterThanOrEqual(140);
  expect(trustBox!.height).toBeLessThanOrEqual(180);
  expect(contactBox!.height).toBeGreaterThanOrEqual(60);
  expect(contactBox!.height).toBeLessThanOrEqual(90);
  await expect(page.getByText(
    "실제 개인화 결과가 아니며 장소·시간은 조건에 따라 달라집니다.",
    { exact: true },
  )).toHaveCount(1);
  await expect(page.getByRole("link", { name: /이 조건으로 내 일정 만들기/u })).toHaveAttribute(
    "href",
    "/planner/pet",
  );
});

test("keeps the single hero photograph static under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await mockHomepage(page);
  await page.goto("/");
  const heroPhoto = page.locator(".weekendoog-hero-photo-frame img");
  const source = await heroPhoto.getAttribute("src");
  await page.clock.fastForward(12_100);
  await expect(heroPhoto).toHaveCount(1);
  await expect(heroPhoto).toHaveAttribute("src", source ?? "");
  await expect(page.locator(".weekendoog-hero-slide-status")).toHaveCount(0);
});

test("keeps loading and provider failures truthful and retryable", async ({ page }) => {
  let requestCount = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(HOMEPAGE_INITIAL_API, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await gate;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "UPSTREAM_ERROR", message: "공식 응답을 확인할 수 없습니다.", retryable: true }, requestId: "error" }) });
      return;
    }
    await fulfillInitial(route);
  });
  await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: enrichmentSnapshot(),
      requestId: "homepage-retry-enrichment",
    }),
  }));
  await page.goto("/");
  await expect(page.getByLabel("부산 장소 작업 화면 불러오는 중")).toBeVisible();
  await expect(page.getByText("장소 수를 확인하고 있어요", { exact: true })).toBeVisible();
  await expect(page.locator(".homepage-workbench-row--skeleton")).toHaveCount(5);
  await expect(page.getByText("37곳", { exact: true })).toHaveCount(0);
  release();
  const error = page.locator(".homepage-workbench-error");
  await expect(error).toBeVisible();
  await expect(page.locator(".homepage-map-section")).toBeVisible();
  await expect(page.getByText("장소 수를 확인하고 있어요")).toHaveCount(0);
  const errorBox = await error.boundingBox();
  expect(errorBox).not.toBeNull();
  expect(errorBox!.height).toBeLessThanOrEqual(220);
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "함께 갈 곳을 지도와 목록에서 고르세요" })).toBeVisible();
  await expect(page.getByText("5곳", { exact: true })).toBeVisible();
  expect(requestCount).toBe(2);
});

test("keeps search and selected places while retrying a partial completion", async ({ page }) => {
  const initial = initialSnapshotWithCompletion();
  const completionCookieHeaders: Array<string | undefined> = [];
  let completionRequests = 0;
  await page.context().addCookies([{
    name: "petpass-test-session",
    value: "private",
    url: "http://localhost:3000",
  }]);
  await page.route(HOMEPAGE_INITIAL_API, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: initial, requestId: "homepage-partial-initial" }),
  }));
  await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: enrichmentSnapshot(), requestId: "homepage-partial-enrichment" }),
  }));
  await page.route(HOMEPAGE_COMPLETION_API, (route) => {
    completionRequests += 1;
    completionCookieHeaders.push(route.request().headers().cookie);
    if (completionRequests === 1) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "UPSTREAM_TIMEOUT", message: "나머지 장소 응답이 지연됩니다.", retryable: true },
          requestId: "homepage-partial-error",
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: completedHomepageSnapshot(initial),
        requestId: "homepage-partial-retry",
      }),
    });
  });

  await page.goto("/");
  const partialNotice = page.locator(".homepage-workbench-notice--warning");
  await expect(partialNotice).toBeVisible();
  await page.getByRole("tab", { name: "검색", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "불러온 장소 검색" });
  await search.fill("해운대");
  await page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" }).check();
  await expect(page.getByText("선택한 장소 1곳", { exact: true })).toBeVisible();

  await partialNotice.getByRole("button", { name: "다시 시도" }).click();
  await expect.poll(() => completionRequests).toBe(2);
  await expect(partialNotice).toHaveCount(0);
  await expect(search).toHaveValue("해운대");
  await expect(page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" })).toBeChecked();
  expect(completionCookieHeaders).toEqual([
    "petpass-test-session=private",
    "petpass-test-session=private",
  ]);
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(page.getByText("완료 응답으로 추가된 카페", { exact: true })).toBeVisible();
});

test(MAP_FAILURE_TEST, async ({ page }) => {
  await mockHomepage(page);
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) => route.abort("failed"));
  await page.goto("/");

  await showHomepageMapMode(page);
  await expect(page.locator("[data-map-error-category]")).toBeVisible();
  await showHomepageListMode(page);
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(5);
  await page.getByRole("tab", { name: "검색", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "불러온 장소 검색" });
  await search.fill("광안리");
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "광안리 바다 전망 카페 일정에 담기" }).check();
  await expect(page.getByText("선택한 장소 1곳", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "더 많은 장소 보기" })).toHaveAttribute(
    "href",
    "/results?tab=catalog&region=busan",
  );
});

test("renders mixed source markers, dynamic counts, truthful selection, and facility toggles", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  const mapCanvas = page.locator(".homepage-map-canvas-wrap .map-canvas");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  await expect(mapCanvas).toHaveAttribute("data-route-point-count", "0");
  await expect(page.getByLabel("지도 마커 범례")).toHaveCount(0);
  await expect(page.getByText("지도 레이어", { exact: true })).toHaveCount(0);
  await expect(page.getByText("BUSAN PLACE MAP", { exact: true })).toHaveCount(0);
  await expect(page.locator(".homepage-map-filter-panel")).toHaveCount(0);
  await showHomepageMapMode(page);
  const filterButton = page.getByRole("button", { name: "필터", exact: true });
  await expect(filterButton).toHaveAttribute("aria-expanded", "false");
  await filterButton.click();
  const mapFilters = page.getByRole("region", { name: "지도 장소 필터" });
  await expect(mapFilters).toBeVisible();
  const triggerBox = await filterButton.boundingBox();
  const dropdownBox = await mapFilters.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(dropdownBox).not.toBeNull();
  expect(triggerBox!.width).toBeGreaterThanOrEqual(76);
  expect(dropdownBox!.x).toBeGreaterThanOrEqual(0);
  expect(dropdownBox!.x + dropdownBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(mapFilters.getByText("출처", { exact: true })).toHaveCount(0);
  await expect(mapFilters.getByRole("button", { name: /^공식 장소/u })).toHaveCount(0);
  for (const label of ["관광지", "식당", "카페", "숙소"]) {
    await expect(mapFilters.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "true");
  }
  for (const label of ["쇼핑", "동물병원", "펫샵·용품점"]) {
    await expect(mapFilters.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "false");
  }
  await page.keyboard.press("Escape");
  await expect(filterButton).toHaveAttribute("aria-expanded", "false");
  await expect(filterButton).toBeFocused();
  await filterButton.click();
  await mapFilters.getByRole("button", { name: /^동물병원/u }).click();
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  await mapFilters.getByRole("button", { name: "적용하기" }).click();
  await expect(mapCanvas).toHaveAttribute("data-location-count", "6");
  const hospitalMarker = page.getByRole("button", { name: /부산 반려동물 동물병원 · 동물병원$/u });
  await hospitalMarker.evaluate((element) => (element as HTMLButtonElement).click());
  const selected = page.locator('.homepage-workbench-row[data-map-focused="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("동물병원");
  await expect(selected).not.toContainText("동반 가능");
  await expect(selected).not.toContainText("24시간");

  await showHomepageListMode(page);
  const officialRow = page.locator(".homepage-workbench-row").filter({ hasText: "해운대 달맞이 산책로" });
  await officialRow.getByRole("button", { name: "해운대 달맞이 산책로 지도에서 보기" }).click();
  await expect(officialRow).toHaveAttribute("data-map-focused", "true");
  await expect(page.locator('.homepage-workbench-row[data-map-focused="true"]')).toHaveCount(1);
});

test("keeps supporting discovery truthful without a duplicate filter system or large placeholders", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "부산 장소 카드" });
  await expect(carousel.locator(".homepage-place-card")).toHaveCount(4);
  await expect(carousel).toContainText("해운대 달맞이 산책로");
  await expect(carousel).toContainText("광안리 반려견 검색 후보");
  await expect(carousel).not.toContainText("부산 반려동물 동물병원");
  await expect(carousel.getByText(
    "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
    { exact: true },
  )).toHaveCount(0);
  await expect(carousel.getByRole("link", { name: /광안리 반려견 검색 후보 카카오 장소 정보/u })).toHaveAttribute("href", "https://place.map.kakao.com/101");
  await expect(page.getByRole("group", { name: "장소 출처 필터" })).toHaveCount(0);
  await expect(carousel.locator(".homepage-place-card--text-only")).toHaveCount(4);
  await expect(carousel.locator(".catalog-card-placeholder")).toHaveCount(0);
  const cards = carousel.locator(".homepage-place-card");
  for (let index = 0; index < await cards.count(); index += 1) {
    expect(await cards.nth(index).locator(".homepage-place-card__label").count()).toBeLessThanOrEqual(2);
  }
  await expect(page.locator(".weekendoog-home")).not.toContainText(/평점|별점|리뷰|후기|인기 순위|24시간/u);
});

test("collapses the selected-place area until the first real selection", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  await expect(page.locator(".home-selected-itinerary")).toHaveCount(0);
  await expect(page.getByText("장소를 선택하면 이곳에서 일정 순서를 정할 수 있습니다.", { exact: true })).toBeVisible();

  await page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" }).check();
  await expect(page.getByText("장소를 선택하면 이곳에서 일정 순서를 정할 수 있습니다.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".home-selected-itinerary")).toBeVisible();
  await expect(page.getByText("선택한 장소 1곳", { exact: true })).toBeVisible();
});

test("keeps official data working when the stored Kakao catalog is unavailable", async ({ page }) => {
  const unavailable: HomepagePlacesSnapshot = {
    ...SNAPSHOT,
    layers: {
      ...SNAPSHOT.layers,
      kakao_candidate: { state: "unavailable", count: null, markerCount: null, enabledByDefault: true },
      veterinary: { state: "unavailable", count: null, markerCount: null, enabledByDefault: false },
      pet_shop: { state: "unavailable", count: null, markerCount: null, enabledByDefault: false },
    },
    markers: [OFFICIAL_ALLOWED, OFFICIAL_NEUTRAL],
    cards: [cardFromMarker(OFFICIAL_ALLOWED)],
  };
  await mockHomepage(page, unavailable);
  await page.goto("/");
  await expect(page.locator(".homepage-map-section")).toBeVisible();
  await showHomepageMapMode(page);
  await page.getByRole("button", { name: "필터", exact: true }).click();
  const mapFilters = page.getByRole("region", { name: "지도 장소 필터" });
  await expect(page.getByText("일부 공개 장소 제공자와 연결되지 않았습니다.", { exact: false })).toBeVisible();
  await expect(mapFilters.getByRole("button", { name: /동물병원\s*…/u })).toBeEnabled();
  await expect(page.getByText("0곳", { exact: true })).toHaveCount(0);
});

test("moves card focus and opens selection without itinerary generation", async ({ page }) => {
  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === GENERATE_API_PATH) generationRequests.push(request.url());
  });
  await mockHomepage(page);
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "부산 장소 카드" });
  const links = carousel.getByRole("link");
  await links.first().focus();
  await page.keyboard.press("End");
  await expect(links.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(links.first()).toBeFocused();

  const launcher = page.getByRole("form", { name: "여행 만들기 빠른 시작" });
  await launcher.getByRole("combobox", { name: "여행 지역" }).selectOption("busan");
  await launcher.getByRole("button", { name: "장소 찾아 일정 만들기" }).click();
  await expect(page).toHaveURL(/\/results\?tab=catalog&region=busan&mode=select/u);
  await expect(page.getByText("0 / 5곳 담음", { exact: true })).toHaveCount(2);
  expect(generationRequests).toEqual([]);
});

test("searches loaded places and transfers an ordered three-place selection to the existing selected planner", async ({ page }) => {
  let homepageApiRequests = 0;
  const generationRequests: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/homepage/")) {
      homepageApiRequests += 1;
    }
    if (pathname === GENERATE_API_PATH && request.method() === "POST") {
      generationRequests.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  await mockHomepage(page);
  const enrichmentReady = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/homepage/places/enrichment");
  await page.goto("/");
  await enrichmentReady;
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect(page.locator(".homepage-workbench-row").first().locator("[data-image-kind]")).toBeVisible();
  await expect(page.locator(".homepage-workbench-row").first().getByText("제공된 이미지가 없어요", { exact: true })).toHaveCount(0);
  const requestsAfterReady = homepageApiRequests;

  const modes = page.getByRole("tablist", { name: "홈 장소 탐색 모드" });
  await modes.getByRole("tab", { name: "검색", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "불러온 장소 검색" });
  await search.fill("광안리");
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(2);
  await expect(page.locator(".homepage-workbench-row")).toContainText([
    "광안리 바다 전망 카페",
    "광안리 반려견 검색 후보",
  ]);
  expect(homepageApiRequests).toBe(requestsAfterReady);
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(search).toHaveValue("");
  await search.fill("카페");
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(2);
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await search.press("Escape");
  const browseMode = modes.getByRole("tab", { name: "장소 찾기", exact: true });
  await expect(browseMode).toHaveAttribute("aria-selected", "true");
  await expect(browseMode).toBeFocused();

  await page.getByRole("button", { name: "부산 시민공원 산책길 지도에서 보기" }).click();
  await expect(page.getByRole("checkbox", { name: "부산 시민공원 산책길 일정에 담기" })).not.toBeChecked();

  for (const name of ["해운대 달맞이 산책로", "광안리 바다 전망 카페", "기장 반려견 동반 숙소"]) {
    await page.getByRole("checkbox", { name: `${name} 일정에 담기` }).check();
  }
  await expect(page.getByText("선택한 장소 3곳", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "부산 시민공원 산책길 일정에 담기" })).toBeDisabled();

  const selectedItems = page.locator(".home-selected-itinerary__item");
  await expect(selectedItems).toHaveCount(3);
  await selectedItems.nth(1).getByRole("button", { name: /앞으로 이동/u }).click();
  await expect(selectedItems.nth(0)).toContainText("광안리 바다 전망 카페");
  await page.getByRole("button", { name: "기장 반려견 동반 숙소 선택에서 제거" }).click();
  await expect(page.getByText("선택한 장소 2곳", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "더 많은 장소 보기" })).toHaveAttribute(
    "href",
    "/results?tab=catalog&region=busan",
  );

  await page.getByRole("button", { name: "선택한 장소로 일정 만들기" }).click();
  await expect(page).toHaveURL(/\/planner\/pet\?mode=selected$/u);
  await expect(page.getByText("직접 고른 장소 2곳", { exact: true })).toBeVisible();
  const selectedNames = await page.evaluate(() => {
    const raw = localStorage.getItem("weekendog:plan-draft");
    if (!raw) return [];
    const value = JSON.parse(raw) as { data?: { selectedPlaces?: Array<{ name?: string }> } };
    return value.data?.selectedPlaces?.map(({ name }) => name) ?? [];
  });
  expect(selectedNames).toEqual(["광안리 바다 전망 카페", "해운대 달맞이 산책로"]);

  await continueToTrip(page);
  await chooseConfirmedDeparture(page);
  await page.getByRole("button", { name: "원하는 하루 입력" }).click();
  await expect(page.getByRole("heading", { name: "원하는 하루" })).toBeVisible();
  await expect(page).toHaveURL(/\/planner\/pet\?mode=selected$/u);
  expect(generationRequests).toEqual([]);
  await page.getByRole("button", { name: "선택한 장소로 일정 만들기" }).evaluate((node) => {
    (node as HTMLButtonElement).click();
  });
  await expect.poll(() => generationRequests.length).toBe(1);
  expect(generationRequests[0]).toMatchObject({
    selectedPlaceIds: ["tour:1103", "tour:1101"],
    autoFill: true,
  });
});

test("keeps homepage filter actions reachable inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1_937, height: 1_272 });
  await mockHomepage(page);
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await page.getByRole("button", { name: "필터", exact: true }).click();
  const panel = page.getByRole("region", { name: "지도 장소 필터" });
  const apply = panel.getByRole("button", { name: /적용하기/u });
  await expect(apply).toBeVisible();
  const applyBox = await apply.boundingBox();
  expect(applyBox).not.toBeNull();
  expect((applyBox?.y ?? 0) + (applyBox?.height ?? 0)).toBeLessThanOrEqual(1_272);
});

test("paginates a dense home list with complete tab semantics and 44px mobile targets", async ({ page }) => {
  const denseMarkers = Array.from({ length: 14 }, (_, index) => marker(
    `tour:${1_200 + index}`,
    "official",
    `부산 밀집 장소 ${index + 1}`,
    { latitude: 35.14 + (index * 0.001), longitude: 129.1 + (index * 0.001) },
    {
      category: index === 1 ? "other" : "attraction",
      isAllowed: true,
      statusLabel: "동반 가능",
    },
  ));
  const denseSnapshot: HomepagePlacesSnapshot = {
    ...SNAPSHOT,
    official: {
      ...SNAPSHOT.official,
      totalCount: denseMarkers.length,
      markerCount: denseMarkers.length,
      omittedCoordinateCount: 0,
      categoryCounts: [{ category: "attraction", label: "관광지", count: denseMarkers.length }],
    },
    layers: {
      ...SNAPSHOT.layers,
      official: {
        state: "ready",
        count: denseMarkers.length,
        markerCount: denseMarkers.length,
        enabledByDefault: true,
      },
      kakao_candidate: { state: "empty", count: 0, markerCount: 0, enabledByDefault: true },
    },
    markers: denseMarkers,
    cards: denseMarkers.slice(0, 6).map(cardFromMarker),
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomepage(page, denseSnapshot);
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();

  const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" });
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const browseTab = page.getByRole("tab", { name: "장소 찾기" });
  const searchTab = page.getByRole("tab", { name: "검색", exact: true });
  await browseTab.focus();
  await browseTab.press("ArrowRight");
  await expect(searchTab).toBeFocused();
  await expect(searchTab).toHaveAttribute("aria-selected", "true");
  await expect(searchTab).toHaveAttribute("aria-controls", "homepage-workbench-mode-panel");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "homepage-workbench-search-tab",
  );
  await searchTab.press("ArrowLeft");
  await expect(browseTab).toBeFocused();

  const rows = page.locator(".homepage-workbench-row");
  await expect(rows).toHaveCount(12);
  await expect(rows.getByText("부산 밀집 장소 1", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "부산 밀집 장소 1 일정에 담기" })).toBeVisible();
  const unknownCategorySelection = page.getByRole("checkbox", { name: "부산 밀집 장소 2 일정에 담기" });
  await expect(unknownCategorySelection).toBeEnabled();
  await unknownCategorySelection.check();
  await expect(unknownCategorySelection).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("weekendog:plan-draft")!).data.selectedPlaces[0])).toMatchObject({
    id: "tour:1201", category: "other",
  });
  await page.getByRole("button", { name: "다음 장소", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.getByText("부산 밀집 장소 13", { exact: true })).toHaveCount(1);
  await expect(rows.getByText("부산 밀집 장소 1", { exact: true })).toHaveCount(0);
  await expect(rows.first().getByRole("button", { name: /지도에서 보기/u })).toBeFocused();

  await page.getByRole("button", { name: "이전 장소", exact: true }).click();
  await expect(unknownCategorySelection).toBeChecked();
  const firstRow = rows.first();
  const targetBoxes = await Promise.all([
    firstRow.locator(".homepage-workbench-row__check").boundingBox(),
    firstRow.locator(".homepage-workbench-row__detail").boundingBox(),
  ]);
  for (const box of targetBoxes) {
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await firstRow.getByRole("checkbox").check();
  const trayControls = page.locator(".home-selected-itinerary__controls button");
  await expect(page.locator(".home-selected-itinerary__item")).toHaveCount(2);
  await expect(trayControls).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const box = await trayControls.nth(index).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("preserves mobile order, map width, card snap width, and page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomepage(page);
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  const copyBox = await page.locator(".weekendoog-hero-copy").boundingBox();
  const launcherBox = await page.locator(".weekendoog-hero-launcher").boundingBox();
  const mediaBox = await page.locator(".weekendoog-hero-media").boundingBox();
  expect(copyBox).not.toBeNull(); expect(launcherBox).not.toBeNull(); expect(mediaBox).not.toBeNull();
  expect(copyBox!.y).toBeLessThan(mediaBox!.y);
  expect(mediaBox!.y).toBeLessThan(launcherBox!.y);
  const workbenchSwitch = page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" });
  await expect(workbenchSwitch.getByRole("button", { name: "목록" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".homepage-workbench__list")).toBeVisible();
  await expect(page.locator(".homepage-workbench__map")).not.toBeVisible();
  await workbenchSwitch.getByRole("button", { name: "지도" }).click();
  await expect(page.locator(".homepage-workbench__map")).toBeVisible();
  await workbenchSwitch.getByRole("button", { name: "목록" }).click();
  const selectedCheckbox = page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" });
  await selectedCheckbox.check();
  await workbenchSwitch.getByRole("button", { name: "지도" }).click();
  await workbenchSwitch.getByRole("button", { name: "목록" }).click();
  await expect(selectedCheckbox).toBeChecked();
  await workbenchSwitch.getByRole("button", { name: "지도" }).click();
  const mapBox = await page.locator(".homepage-map-canvas-wrap .map-canvas").boundingBox();
  expect(mapBox).not.toBeNull();
  expect(mapBox!.width).toBeLessThanOrEqual(390);
  expect(mapBox!.height).toBeGreaterThanOrEqual(320);
  const filterButton = page.getByRole("button", { name: "필터", exact: true });
  await filterButton.click();
  const dropdownBox = await page.getByRole("region", { name: "지도 장소 필터" }).boundingBox();
  expect(dropdownBox).not.toBeNull();
  expect(dropdownBox!.x).toBeGreaterThanOrEqual(0);
  expect(dropdownBox!.x + dropdownBox!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  const cardBox = await page.locator(".homepage-place-card").first().boundingBox();
  expect(cardBox).not.toBeNull();
  expect(cardBox!.width).toBeGreaterThanOrEqual(220);
  expect(cardBox!.width).toBeLessThanOrEqual(290);
  await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("keeps the live homepage inside all required viewport boundaries", async ({ page }) => {
  const viewports = [
    { width: 1_440, height: 1_000 },
    { width: 1_180, height: 900 },
    { width: 1_024, height: 900 },
    { width: 948, height: 1_660 },
    { width: 768, height: 1_024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ];
  await page.setViewportSize(viewports[0]);
  await mockHomepage(page);
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    if (viewport.width < 1_180) {
      const switcher = page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" });
      await expect(switcher).toBeVisible();
      const listButton = switcher.getByRole("button", { name: "목록" });
      if (await listButton.getAttribute("aria-pressed") !== "true") await listButton.click();
      await expect(listButton).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".homepage-workbench__list")).toBeVisible();
      await expect(page.locator(".homepage-workbench__map")).not.toBeVisible();
      await page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" })
        .getByRole("button", { name: "지도" })
        .click();
    }
    await expect(page.locator(".homepage-map-canvas-wrap .map-canvas")).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
    const mapBox = await page.locator(".homepage-map-canvas-wrap .map-canvas").boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.x).toBeGreaterThanOrEqual(0);
    expect(mapBox!.x + mapBox!.width).toBeLessThanOrEqual(viewport.width);
  }
});

test("captures the phase-b homepage lower-section evidence", async ({ page, isMobile }) => {
  test.skip(
    process.env.CAPTURE_PHASE_B_EVIDENCE !== "1" || Boolean(isMobile),
    "Set CAPTURE_PHASE_B_EVIDENCE=1 to write the Phase B review images once in desktop Chromium.",
  );
  test.setTimeout(90_000);

  const evidenceDirectory = path.resolve(
    "verification-evidence/weekendog-ui-ver2/remaining-ui/phase-b/final",
  );
  const viewports = [
    { width: 1_440, height: 1_000 },
    { width: 1_180, height: 900 },
    { width: 1_024, height: 900 },
    { width: 948, height: 1_660 },
    { width: 768, height: 1_024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ];

  await mkdir(evidenceDirectory, { recursive: true });
  await page.setViewportSize(viewports[0]);
  await mockHomepage(page);
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const switcher = page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" });
    if (viewport.width < 1_180) {
      const listButton = switcher.getByRole("button", { name: "목록", exact: true });
      if (await listButton.getAttribute("aria-pressed") !== "true") await listButton.click();
    }
    await page.locator(".homepage-map-section").scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: path.join(evidenceDirectory, `homepage-lower-${viewport.width}x${viewport.height}.png`),
      animations: "disabled",
      caret: "hide",
      fullPage: false,
    });
  }
});
