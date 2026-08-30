import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  enrichmentSnapshot,
  fulfillInitial,
  HOMEPAGE_COMPLETION_API,
  HOMEPAGE_ENRICHMENT_API,
  HOMEPAGE_INITIAL_API,
  initialSnapshotWithCompletion,
  installFakeMap,
  installHomepageImageFixture,
  mockHomepage,
} from "./homepage-test-helpers";

const CAPTURE_EVIDENCE = process.env.CAPTURE_WEEKENDOG_FEATURE_EVIDENCE === "1";
const EVIDENCE_DIRECTORY = path.resolve(
  process.cwd(),
  "verification-evidence",
  "weekendog-ui-ver2",
  "feature-completion",
  "final",
);

const NORMAL_VIEWPORTS = [
  { width: 1_440, height: 1_000 },
  { width: 1_024, height: 900 },
  { width: 948, height: 1_660 },
  { width: 768, height: 1_024 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
] as const;

const EVIDENCE_FILES = [
  "homepage-normal-1440x1000.png",
  "homepage-normal-1024x900.png",
  "homepage-normal-948x1660.png",
  "homepage-normal-768x1024.png",
  "homepage-normal-390x844.png",
  "homepage-normal-320x720.png",
  "homepage-workbench-normal-1440.png",
  "homepage-workbench-search-1440.png",
  "homepage-selected-tray-2-places-1440.png",
  "homepage-discovery-official-filter-1440.png",
  "homepage-workbench-mobile-list-390.png",
  "homepage-workbench-mobile-map-390.png",
  "homepage-selected-tray-mobile-390.png",
  "homepage-workbench-mobile-list-320.png",
  "homepage-loading-workbench-1440.png",
  "homepage-partial-failure-workbench-1440.png",
  "homepage-total-failure-workbench-1440.png",
  "homepage-kakao-map-failure-workbench-1440.png",
] as const;

function evidencePath(fileName: (typeof EVIDENCE_FILES)[number]) {
  return path.join(EVIDENCE_DIRECTORY, fileName);
}

async function hideDevelopmentChrome(page: Page) {
  await page.addStyleTag({
    content: "nextjs-portal, [data-next-badge-root] { display: none !important; }",
  });
}

async function waitForVisibleAssets(page: Page) {
  await expect.poll(
    () => page.evaluate(() => {
      const images = Array.from(document.images).filter((image) => {
        const rect = image.getBoundingClientRect();
        const style = window.getComputedStyle(image);
        return style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight;
      });
      return {
        fontStatus: document.fonts.status,
        brokenImages: images
          .filter((image) => !image.complete || image.naturalWidth <= 0)
          .map((image) => image.currentSrc || image.src),
      };
    }),
    { timeout: 15_000 },
  ).toEqual({ fontStatus: "loaded", brokenImages: [] });
}

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

async function settleNormalCapture(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await waitForVisibleAssets(page);
  await expectNoDocumentOverflow(page);
}

async function captureLocator(
  page: Page,
  locator: Locator,
  fileName: (typeof EVIDENCE_FILES)[number],
) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await waitForVisibleAssets(page);
  await expectNoDocumentOverflow(page);
  await locator.screenshot({
    path: evidencePath(fileName),
    animations: "disabled",
    caret: "hide",
  });
}

test.describe("WEEKENDOG ui_ver2 homepage feature-completion visual evidence", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !CAPTURE_EVIDENCE,
    "Set CAPTURE_WEEKENDOG_FEATURE_EVIDENCE=1 to write feature-completion evidence.",
  );
  test.skip(({ isMobile }) => Boolean(isMobile), "Capture once in desktop Chromium.");

  test.beforeAll(async () => {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await installHomepageImageFixture(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test.afterAll(async () => {
    const files = new Set(await readdir(EVIDENCE_DIRECTORY));
    for (const fileName of EVIDENCE_FILES) {
      expect(files.has(fileName), `${fileName} was not captured`).toBe(true);
    }
  });

  test("captures all required normal viewports and populated interactions", async ({ page }) => {
    test.setTimeout(120_000);
    await installFakeMap(page);
    await mockHomepage(page);
    await page.setViewportSize(NORMAL_VIEWPORTS[0]);
    await page.goto("/");
    await hideDevelopmentChrome(page);
    await expect(page.locator(".homepage-live-ready")).toBeVisible();
    await expect(page.locator(".homepage-workbench-row")).toHaveCount(5);
    await expect(page.locator(".homepage-place-card")).toHaveCount(4);

    for (const viewport of NORMAL_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await settleNormalCapture(page);
      await expect(page.viewportSize()).toEqual(viewport);
      await page.screenshot({
        path: evidencePath(`homepage-normal-${viewport.width}x${viewport.height}.png` as (typeof EVIDENCE_FILES)[number]),
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
    }

    await page.setViewportSize({ width: 1_440, height: 1_000 });
    const workbench = page.locator(".homepage-map-section");
    await captureLocator(page, workbench, "homepage-workbench-normal-1440.png");

    await page.getByRole("tab", { name: "검색", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "불러온 장소 검색" });
    await search.fill("광안리");
    await expect(page.locator(".homepage-workbench-row")).toHaveCount(2);
    await captureLocator(page, workbench, "homepage-workbench-search-1440.png");

    await page.getByRole("button", { name: "검색어 지우기" }).click();
    await page.getByRole("tab", { name: "장소 찾기", exact: true }).click();
    for (const placeName of ["해운대 달맞이 산책로", "광안리 바다 전망 카페"]) {
      await page.getByRole("checkbox", { name: `${placeName} 일정에 담기` }).check();
    }
    const tray = page.locator(".home-selected-itinerary");
    await expect(tray.getByText("선택한 장소 2곳", { exact: true })).toBeVisible();
    const continueButton = tray.getByRole("button", { name: "선택한 장소로 일정 만들기" });
    await expect(continueButton).toBeEnabled();
    await captureLocator(page, tray, "homepage-selected-tray-2-places-1440.png");

    const discovery = page.locator(".homepage-places-section");
    await discovery.getByRole("button", { name: "공식 장소", exact: true }).click();
    await expect(discovery.locator(".homepage-place-card")).toHaveCount(3);
    await captureLocator(page, discovery, "homepage-discovery-official-filter-1440.png");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    const mobileSwitch = page.getByRole("group", { name: "홈 장소 지도 또는 목록 보기" });
    await mobileSwitch.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.locator(".homepage-workbench__list")).toBeVisible();
    await expect(page.locator(".homepage-workbench__map")).not.toBeVisible();
    await captureLocator(page, workbench, "homepage-workbench-mobile-list-390.png");

    await mobileSwitch.getByRole("button", { name: "지도", exact: true }).click();
    await expect(page.locator(".homepage-workbench__map")).toBeVisible();
    await expect(page.locator(".homepage-workbench__list")).not.toBeVisible();
    await captureLocator(page, workbench, "homepage-workbench-mobile-map-390.png");

    await expect(tray.getByText("선택한 장소 2곳", { exact: true })).toBeVisible();
    await expect(continueButton).toBeEnabled();
    await captureLocator(page, tray, "homepage-selected-tray-mobile-390.png");

    await page.setViewportSize({ width: 320, height: 720 });
    await expect(page.viewportSize()).toEqual({ width: 320, height: 720 });
    await mobileSwitch.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.locator(".homepage-workbench__list")).toBeVisible();
    await expect(page.locator(".homepage-workbench__map")).not.toBeVisible();
    await captureLocator(page, workbench, "homepage-workbench-mobile-list-320.png");
  });

  test("captures the loading workbench shell", async ({ page }) => {
    test.setTimeout(60_000);
    let releaseInitial!: () => void;
    let signalInitialRequest!: () => void;
    const initialGate = new Promise<void>((resolve) => { releaseInitial = resolve; });
    const initialRequested = new Promise<void>((resolve) => { signalInitialRequest = resolve; });
    await installFakeMap(page);
    await page.route(HOMEPAGE_INITIAL_API, async (route) => {
      signalInitialRequest();
      await initialGate;
      await fulfillInitial(route);
    });
    await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: enrichmentSnapshot(), requestId: "homepage-evidence-loading" }),
    }));
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await page.goto("/");
    await initialRequested;
    await hideDevelopmentChrome(page);
    const loading = page.getByLabel("부산 장소 작업 화면 불러오는 중");
    await expect(loading).toBeVisible();
    await expect(loading.getByText("장소 수를 확인하고 있어요", { exact: true })).toBeVisible();
    await expect(loading.locator(".homepage-workbench-row--skeleton")).toHaveCount(5);
    await captureLocator(page, loading, "homepage-loading-workbench-1440.png");
    releaseInitial();
    await expect(page.locator(".homepage-live-ready")).toBeVisible();
  });

  test("captures a partial completion failure without removing usable results", async ({ page }) => {
    const initial = initialSnapshotWithCompletion();
    await installFakeMap(page);
    await page.route(HOMEPAGE_INITIAL_API, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: initial, requestId: "homepage-evidence-partial-initial" }),
    }));
    await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: enrichmentSnapshot(), requestId: "homepage-evidence-partial-enrichment" }),
    }));
    await page.route(HOMEPAGE_COMPLETION_API, (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "UPSTREAM_TIMEOUT", message: "나머지 장소 응답이 지연됩니다.", retryable: true },
        requestId: "homepage-evidence-partial-error",
      }),
    }));
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await page.goto("/");
    await hideDevelopmentChrome(page);
    const warning = page.locator(".homepage-workbench-notice--warning");
    await expect(warning).toBeVisible();
    await expect(page.locator(".homepage-workbench-row")).toHaveCount(5);
    await captureLocator(page, page.locator(".homepage-map-section"), "homepage-partial-failure-workbench-1440.png");
  });

  test("captures the compact total provider failure", async ({ page }) => {
    await installFakeMap(page);
    await page.route(HOMEPAGE_INITIAL_API, (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "UPSTREAM_ERROR", message: "공식 응답을 확인할 수 없습니다.", retryable: true },
        requestId: "homepage-evidence-total-error",
      }),
    }));
    await page.route(HOMEPAGE_ENRICHMENT_API, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: enrichmentSnapshot(), requestId: "homepage-evidence-total-enrichment" }),
    }));
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await page.goto("/");
    await hideDevelopmentChrome(page);
    const error = page.locator(".homepage-workbench-error");
    await expect(error).toBeVisible();
    const errorBox = await error.boundingBox();
    expect(errorBox).not.toBeNull();
    expect(errorBox!.height).toBeLessThanOrEqual(220);
    await captureLocator(page, page.getByLabel("부산 장소 작업 화면 연결 오류"), "homepage-total-failure-workbench-1440.png");
  });

  test("captures Kakao SDK failure while the list remains usable", async ({ page }) => {
    await mockHomepage(page);
    await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) => route.abort("failed"));
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await page.goto("/");
    await hideDevelopmentChrome(page);
    await expect(page.locator("[data-map-error-category]")).toBeVisible();
    await expect(page.locator(".homepage-workbench-row")).toHaveCount(5);
    await page.getByRole("checkbox", { name: "해운대 달맞이 산책로 일정에 담기" }).check();
    await expect(page.getByText("선택한 장소 1곳", { exact: true })).toBeVisible();
    await captureLocator(page, page.locator(".homepage-map-section"), "homepage-kakao-map-failure-workbench-1440.png");
  });
});
