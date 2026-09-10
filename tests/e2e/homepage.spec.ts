import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { HomepagePlacesSnapshot } from "@/types/homepage-places";
import { REGION_CONFIGS } from "@/lib/regions/config";
import {
  chooseConfirmedDeparture,
  continueToTrip,
} from "./planner-test-helpers";
import {
  cardFromMarker,
  enrichmentSnapshot,
  fulfillInitial,
  GENERATE_API_PATH,
  HOMEPAGE_ENRICHMENT_API,
  HOMEPAGE_INITIAL_API,
  initialSnapshot,
  installFakeMap,
  installHomepageImageFixture,
  MAP_FAILURE_TEST,
  marker,
  mockHomepage,
  mockNationwideHomepage,
  nationwideHomepageSnapshot,
  mockHomepageCardDetails,
  NETWORK_TEST,
  OFFICIAL_ALLOWED,
  OFFICIAL_NEUTRAL,
  SNAPSHOT,
} from "./homepage-test-helpers";

async function chooseHomepageRegion(page: Page) {
  await page.locator(".home-region-overview").getByRole("button", { name: "부산", exact: true }).click();
  await page.locator(".home-map-filters summary").click();
  await expect(page.getByRole("combobox", { name: "홈 지도 지역", exact: true })).toHaveValue("busan");
}

async function showHomepageMapMode(page: Page) {
  if ((page.viewportSize()?.width ?? 1_024) > 900) return;
  await page
    .getByRole("group", { name: "홈 장소 지도 또는 목록 보기" })
    .getByRole("button", { name: "지도", exact: true })
    .click();
  await expect(page.locator(".homepage-workbench__map")).toBeVisible();
}

async function showHomepageListMode(page: Page) {
  if ((page.viewportSize()?.width ?? 1_024) > 900) return;
  await page
    .getByRole("group", { name: "홈 장소 지도 또는 목록 보기" })
    .getByRole("button", { name: "목록", exact: true })
    .click();
  await expect(page.locator(".homepage-workbench__list")).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  await mockNationwideHomepage(page);
  await mockHomepageCardDetails(page);
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
test("filters the selected region from browser memory without optional dataset requests", async ({ page }) => {
  await mockHomepage(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const snapshotRequests: string[] = [];
  let optionalRequests = 0;
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/map/places/snapshot") snapshotRequests.push(url.searchParams.get("region")!);
    if (url.pathname === "/api/homepage/places/optional") optionalRequests++;
  });
  await page.goto("/");
  await expect(page.getByText("전국 17개 시·도 중 17개 지역 조회 완료", { exact: true })).toHaveCount(0);
  await page.locator(".home-region-overview").getByRole("button", { name: "부산", exact: false }).click();
  await page.locator(".home-map-filters summary").click();
  const mapCanvas = page.locator(".homepage-map-canvas-wrap .map-canvas");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  expect(new Set(snapshotRequests).size).toBe(1);
  const type = page.getByRole("combobox", { name: "홈 지도 장소 유형", exact: true });
  await expect(type.locator('option[value="shopping"]')).toHaveCount(0);
  await type.selectOption("cafe");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "2");
  await type.selectOption("all");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  await type.selectOption("cafe");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "2");
  await expect(page.locator('.homepage-map-canvas-wrap [data-clusterer-instance-count]')).toHaveAttribute("data-clusterer-instance-count", "1");
  expect(snapshotRequests).toHaveLength(1);
  expect(optionalRequests).toBe(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
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
  await chooseHomepageRegion(page);
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
  await chooseHomepageRegion(page);
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
  await chooseHomepageRegion(page);
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
  await expect(page.locator(".homepage-carousel-loading")).toBeVisible();
  await expect.poll(() => requested).toBe(true);
  const beforeAbort = await page.evaluate(() => Number(sessionStorage.getItem("homepage-abort-count") ?? "0"));
  const navigation = Promise.all([
    page.waitForURL(/\/planner\/pet/u),
    page
      .getByRole("banner")
      .getByRole("link", { name: "맞춤 일정", exact: true })
      .click(),
  ]);
  await page.waitForURL(/\/planner\/pet/u);
  await expect.poll(() => page.evaluate(
    () => Number(sessionStorage.getItem("homepage-abort-count") ?? "0"),
  )).toBeGreaterThan(beforeAbort);
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

test("uses one eager coastal hero image with explicit manual carousel controls", async ({ page }) => {
  const requestedFeaturedImages = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    const source = url.searchParams.get("url") ?? url.pathname;
    if (source.includes("coastal-dog-v4.webp")) {
      requestedFeaturedImages.add(source);
    }
  });
  await mockHomepage(page);
  await page.goto("/");
  const heroPhoto = page.locator(".weekendoog-hero-photo-frame");
  await expect(heroPhoto.locator("img")).toHaveCount(1);
  await expect(heroPhoto.locator("img")).toHaveAttribute("alt", "차창 밖으로 얼굴을 내민 골든리트리버와 푸른 해안도로 여행 풍경");
  await expect(heroPhoto.locator("img")).toHaveAttribute("loading", "eager");
  await expect(heroPhoto.getByRole("group", { name: "여행 이미지 선택" }).getByRole("button", { name: /^여행 이미지 [12]$/u })).toHaveCount(2);
  await expect.poll(() => requestedFeaturedImages.size).toBe(1);
  await expect(heroPhoto.getByRole("button", { name: "여행 이미지 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(heroPhoto.getByRole("button", { name: "다음 여행 이미지", exact: true })).toBeVisible();
  await expect(page.locator(".weekendoog-hero-slide")).toHaveCount(0);
});

test("uses compact hero copy and three local official partner marks", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");

  const hero = page.locator(".weekendoog-hero");
  await expect(hero).toContainText(
    "지도에서 찾고, 일정으로 이어지는",
  );
  await expect(hero).toContainText(
    "WEEKENDOG의 특별한 여행을 만들어보세요.",
  );
  await expect(hero.getByText("공식 데이터 기반 반려동물 여행", { exact: true })).toHaveCount(0);

  const launcher = page.getByRole("form", { name: "여행 만들기 빠른 시작" });
  await expect(launcher.locator(".hero-planner-label").getByText("여행 지역", { exact: true })).toBeVisible();
  await expect(launcher.getByRole("combobox", { name: "여행 지역" })).toHaveValue(REGION_CONFIGS.find(region => region.routeCapabilities.fullyAutomaticRecommendation)!.id);
  await expect(launcher.getByRole("button", { name: "여행지 찾기" })).toBeVisible();
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
  await trust.scrollIntoViewIfNeeded();
  await expect.poll(() => marks.evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const partnerAspectRatios = await marks.evaluateAll((images) => images.map((image) => {
    const element = image as HTMLImageElement;
    return Number((element.naturalWidth / element.naturalHeight).toFixed(2));
  }));
  expect(partnerAspectRatios.every((ratio) => Number.isFinite(ratio) && ratio > 0)).toBe(true);
  expect(new Set(partnerAspectRatios).size).toBeGreaterThan(1);
});

test("keeps the desktop launcher inside the hero and sources below discovery", async ({ page }, testInfo) => {
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
  expect(launcherBox!.width).toBeCloseTo(1000, 0);
  expect(launcherBox!.x).toBeGreaterThan(layoutBox!.x);
  expect(launcherBox!.y).toBeGreaterThanOrEqual(copyBox!.y + copyBox!.height);
  expect(launcherBox!.y).toBeLessThan(layoutBox!.y + layoutBox!.height);
  expect(launcherBox!.y + launcherBox!.height).toBeLessThanOrEqual(layoutBox!.y + layoutBox!.height);
  expect(trustBox!.y).toBeGreaterThan(layoutBox!.y + layoutBox!.height);
  expect(contactBox!.y).toBeGreaterThanOrEqual(trustBox!.y + trustBox!.height);
  expect(contactBox!.height).toBeGreaterThanOrEqual(88);
  await expect(page.getByText(
    "실제 개인화 결과가 아니며 장소·시간은 조건에 따라 달라집니다.",
    { exact: true },
  )).toHaveCount(0);
  await expect(page.getByRole("link", { name: /이 조건으로 내 일정 만들기/u })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "이메일로 문의하기" })).toHaveAttribute("href", "mailto:weekendog2@gmail.com");
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
  let fail = true;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  await page.route("**/api/map/places/snapshot?**", async route => {
    const region = new URL(route.request().url()).searchParams.get("region")!;
    calls.push(region);
    await gate;
    await route.fulfill(fail
      ? { status: 503, json: { ok: false } }
      : { json: nationwideHomepageSnapshot(SNAPSHOT, region) });
  });
  await page.goto("/");
  await chooseHomepageRegion(page);
  await expect(page.getByText("부산 장소를 불러오는 중입니다.", { exact: true })).toBeVisible();
  await expect(page.locator(".homepage-workbench-heading strong")).toHaveText("불러오는 중");
  await expect(page.locator(".homepage-workbench-row--skeleton")).toHaveCount(0);
  await expect(page.getByText("37곳", { exact: true })).toHaveCount(0);
  release();
  const error = page.getByRole("status").filter({ hasText: "부산 장소를 불러오지 못했습니다." });
  await expect(error).toBeVisible();
  await expect(page.locator(".homepage-map-section")).toBeVisible();
  await expect(page.getByText("부산 장소를 불러오는 중입니다.")).toHaveCount(0);
  await expect(page.locator(".homepage-workbench-heading strong")).toHaveText("조회 실패");
  expect((await error.boundingBox())!.height).toBeLessThanOrEqual(220);
  fail = false;
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator(".homepage-workbench-heading strong")).toHaveText("5곳");
  await expect(page.getByText("전국 17개 시·도 중 17개 지역 조회 완료", { exact: true })).toHaveCount(0);
  expect(calls).toEqual(["busan", "busan"]);
});

test("keeps search and selected places through a regional failure and cache return", async ({ page }) => {
  await mockHomepage(page);
  const calls: string[] = [];
  const cookies: Array<string | undefined> = [];
  let failSeoul = true;
  await page.route("**/api/map/places/snapshot?**", route => {
    const region = new URL(route.request().url()).searchParams.get("region")!;
    calls.push(region);
    cookies.push(route.request().headers().cookie);
    if (region === "seoul" && failSeoul) return route.fulfill({ status: 503, json: { ok: false } });
    const response = nationwideHomepageSnapshot(SNAPSHOT, region);
    if (region === "seoul") {
      response.data.items = [{ id: "kakao:98001", name: "완료 응답으로 추가된 카페", layer: "kakao", category: "cafe",
        districtCode: "110", coordinates: { latitude: 37.573, longitude: 126.979 },
        petAccessVerdict: "unknown", publicLabel: "동반 여부 확인 필요" }];
      response.data.totalCount = 1;
      response.data.providerCounts = { tour: 0, kakao: 1 };
      response.data.categoryCounts = { cafe: 1 };
    }
    return route.fulfill({ json: response });
  });
  await page.context().addCookies([{ name: "petpass-test-session", value: "private", url: "http://localhost:3000" }]);
  await page.goto("/");
  await chooseHomepageRegion(page);
  await page.getByRole("tab", { name: "검색", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "불러온 장소 검색" });
  await search.fill("해운대");
  await page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" }).check();
  await expect(page.getByText("선택한 장소 1곳", { exact: true })).toBeVisible();
  const region = page.getByRole("combobox", { name: "홈 지도 지역", exact: true });
  await region.selectOption("seoul");
  const partialNotice = page.getByRole("status").filter({ hasText: "서울 장소를 불러오지 못했습니다." });
  await expect(partialNotice).toBeVisible();
  await expect(search).toHaveValue("해운대");
  await expect(page.getByText("선택한 장소 1곳", { exact: true })).toBeVisible();
  failSeoul = false;
  await partialNotice.getByRole("button", { name: "다시 시도" }).click();
  await expect(partialNotice).toHaveCount(0);
  await expect(page.getByText("전국 17개 시·도 중 17개 지역 조회 완료", { exact: true })).toHaveCount(0);
  expect(calls.filter(region => region === "seoul")).toHaveLength(2);
  expect(calls.filter(region => region !== "seoul")).toEqual(["busan"]);
  expect(cookies.every(cookie => cookie === undefined)).toBe(true);
  await expect(search).toHaveValue("해운대");
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(page.getByText("완료 응답으로 추가된 카페", { exact: true })).toBeVisible();
  await region.selectOption("busan");
  await expect(page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" })).toBeChecked();
  expect(calls).toEqual(["busan", "seoul", "seoul"]);
});

test(MAP_FAILURE_TEST, async ({ page }) => {
  await mockHomepage(page);
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) => route.abort("failed"));
  await page.goto("/");
  await chooseHomepageRegion(page);

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

test("renders mixed source markers, dynamic counts and truthful selection through current category filters", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  await chooseHomepageRegion(page);
  const mapCanvas = page.locator(".homepage-map-canvas-wrap .map-canvas");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  await expect(mapCanvas).toHaveAttribute("data-route-point-count", "0");
  await expect(page.getByLabel("지도 마커 범례")).toHaveCount(0);
  const type = page.getByRole("combobox", { name: "홈 지도 장소 유형", exact: true });
  await expect(type).toHaveValue("all");
  await expect(type.locator('option[value="veterinary"], option[value="pet_shop"]')).toHaveCount(0);
  await type.selectOption("cafe");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "2");
  await page.getByRole("button", { name: "광안리 반려견 검색 후보 지도에서 보기", exact: true }).click();
  const selected = page.locator('.homepage-workbench-row[data-map-focused="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("카카오 검색 후보");
  await expect(selected).toContainText("동반 여부 확인 필요");
  await expect(selected).not.toContainText("24시간");
  await type.selectOption("all");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "5");
  const officialRow = page.locator(".homepage-workbench-row").filter({ hasText: "해운대 달맞이 산책로" });
  await officialRow.getByRole("button", { name: "해운대 달맞이 산책로 지도에서 보기" }).click();
  await expect(officialRow).toHaveAttribute("data-map-focused", "true");
  await expect(officialRow).toContainText("한국관광공사");
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
  await expect(carousel.locator(".catalog-card-placeholder")).toHaveCount(4);
  for (const placeholder of await carousel.locator(".catalog-card-placeholder").all()) {
    await expect(placeholder).toBeHidden();
    expect(await placeholder.boundingBox()).toBeNull();
  }
  const cards = carousel.locator(".homepage-place-card");
  for (let index = 0; index < await cards.count(); index += 1) {
    expect(await cards.nth(index).locator(".homepage-place-card__label").count()).toBeLessThanOrEqual(2);
  }
  await expect(page.locator(".weekendoog-home")).not.toContainText(/평점|별점|리뷰|후기|인기 순위|24시간/u);
});

test("collapses the selected-place area until the first real selection", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  await chooseHomepageRegion(page);
  await expect(page.locator(".home-selected-itinerary")).toHaveCount(0);
  await expect(page.getByText("지역에서 장소를 선택해 일정에 담으세요. 일정에는 같은 지역의 장소를 담을 수 있습니다.", { exact: true })).toBeVisible();

  await page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" }).check();
  await expect(page.getByText("지역에서 장소를 선택해 일정에 담으세요. 일정에는 같은 지역의 장소를 담을 수 있습니다.", { exact: true })).toHaveCount(0);
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
  await chooseHomepageRegion(page);
  await expect(page.locator(".homepage-map-section")).toBeVisible();
  const rows = page.locator(".homepage-workbench-row");
  await expect(rows).toHaveCount(2);
  await expect(rows).toContainText(["한국관광공사", "한국관광공사"]);
  const carousel = page.getByRole("region", { name: "부산 장소 카드" });
  await expect(carousel).toContainText("해운대 달맞이 산책로");
  await expect(carousel).not.toContainText("광안리 반려견 검색 후보");
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
  await launcher.getByRole("button", { name: "여행지 찾기" }).click();
  await expect(page).toHaveURL(url => url.pathname === "/");
  await expect(page.locator(".homepage-live-ready")).toHaveAttribute("data-active-region", "busan");
  await expect(page.locator(".homepage-workbench-row")).toHaveCount(5);
  await page.getByRole("region", { name: "WEEKENDOG 여행 안내" }).getByRole("link", { name: /^우리만의 일정/u }).click();
  await expect(page).toHaveURL(url => url.pathname === "/results" && url.searchParams.get("tab") === "catalog" && url.searchParams.get("region") === REGION_CONFIGS[0].id && url.searchParams.get("mode") === "select");
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
  await chooseHomepageRegion(page);
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
  await page.getByRole("button", { name: "선택한 장소로 일정 만들기" }).click();
  await expect.poll(() => generationRequests.length).toBe(1);
  expect(generationRequests[0]).toMatchObject({
    selectedPlaceIds: ["tour:1103", "tour:1101"],
    autoFill: true,
  });
});

test("keeps homepage filter actions reachable inside the viewport", async ({ page }, testInfo) => {
  await mockHomepage(page);
  await page.goto("/");
  await chooseHomepageRegion(page);
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["홈 지도 지역", "홈 지도 장소 유형"]) {
      const filter = page.getByRole("combobox", { name, exact: true });
      await filter.scrollIntoViewIfNeeded();
      await expect(filter).toBeVisible();
      const box = (await filter.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const category = page.getByRole("combobox", { name: "홈 지도 장소 유형", exact: true });
    await category.selectOption("cafe");
    await expect(page.locator(".homepage-workbench-heading strong")).toHaveText("2곳");
    await category.selectOption("all");
    await expect(page.locator(".homepage-workbench-heading strong")).toHaveText("5곳");
    await page.locator(".homepage-map-section").screenshot({ path: testInfo.outputPath("filter-" + width + ".png") });
  }
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
  await chooseHomepageRegion(page);
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
  await chooseHomepageRegion(page);
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
  const categoryFilter = page.getByRole("combobox", { name: "홈 지도 장소 유형", exact: true });
  const filterBox = (await categoryFilter.boundingBox())!;
  expect(filterBox.x).toBeGreaterThanOrEqual(0);
  expect(filterBox.x + filterBox.width).toBeLessThanOrEqual(390);
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
  await chooseHomepageRegion(page);
  await expect(page.locator(".homepage-live-ready")).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    if (viewport.width <= 900) {
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
