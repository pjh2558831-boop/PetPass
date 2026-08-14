import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const CAPTURE_EVIDENCE = process.env.CAPTURE_WEEKENDOG_EVIDENCE === "1";
const USE_LIVE_KAKAO = process.env.RUN_LIVE_KAKAO_E2E === "1";
const HOMEPAGE_API = "**/api/tour/homepage";
const EVIDENCE_DIRECTORY = path.resolve(
  process.cwd(),
  "verification-evidence",
  "weekendog-homepage-2026-08-14",
);
const EVIDENCE_FILES = [
  "homepage-1440-full.png",
  "homepage-1440-hero-map.png",
  "homepage-1440-places-process.png",
  "homepage-1440-lower.png",
  "homepage-768-full.png",
  "homepage-390-full.png",
  "homepage-provider-loading.png",
  "homepage-provider-error.png",
] as const;

function evidencePath(fileName: (typeof EVIDENCE_FILES)[number]) {
  return path.join(EVIDENCE_DIRECTORY, fileName);
}

async function installFakeKakaoMap(page: Page) {
  await page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const addListener = (target: object, name: string, handler: Listener) => {
      const targetListeners =
        listeners.get(target) ?? new Map<string, Set<Listener>>();
      const eventListeners = targetListeners.get(name) ?? new Set<Listener>();
      eventListeners.add(handler);
      targetListeners.set(name, eventListeners);
      listeners.set(target, targetListeners);
    };

    class LatLng {
      constructor(
        private readonly latitude: number,
        private readonly longitude: number,
      ) {}
      getLat() {
        return this.latitude;
      }
      getLng() {
        return this.longitude;
      }
    }

    class Bounds {
      extend() {}
      getNorthEast() {
        return new LatLng(35.3, 129.3);
      }
      getSouthWest() {
        return new LatLng(35, 129);
      }
    }

    class FakeMap {
      private center: LatLng;

      constructor(
        readonly container: HTMLElement,
        options: { center: LatLng },
      ) {
        this.center = options.center;
        container.dataset.fakeMapReady = "true";
      }
      getBounds() {
        return new Bounds();
      }
      getCenter() {
        return this.center;
      }
      panTo(value: LatLng) {
        this.center = value;
      }
      relayout() {}
      setBounds() {}
    }

    class Marker {
      setImage() {}
      setMap() {}
      setPosition() {}
      setZIndex() {}
    }

    class Overlay {
      constructor(
        private readonly options: { map: FakeMap; content: HTMLElement },
      ) {
        options.map.container.append(options.content);
      }
      setMap(map: FakeMap | null) {
        if (!map) this.options.content.remove();
      }
    }

    class Polyline {
      private readonly element: HTMLElement;

      constructor(options: { map: FakeMap; path: LatLng[] }) {
        this.element = document.createElement("div");
        this.element.dataset.providerPolyline = String(options.path.length);
        options.map.container.append(this.element);
      }
      setMap(map: FakeMap | null) {
        if (!map) this.element.remove();
      }
    }

    class Clusterer {
      addMarkers() {}
      clear() {}
    }

    window.kakao = {
      maps: {
        load: (callback: () => void) => callback(),
        event: {
          addListener,
          removeListener(target: object, name: string, handler: Listener) {
            listeners.get(target)?.get(name)?.delete(handler);
          },
        },
        LatLng,
        LatLngBounds: Bounds,
        Map: FakeMap,
        CustomOverlay: Overlay,
        Marker,
        MarkerImage: class {},
        MarkerClusterer: Clusterer,
        Point: class {},
        Polyline,
        Size: class {},
      } as unknown as NonNullable<Window["kakao"]>["maps"],
    };
  });
}

async function settleEvidencePage(page: Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal, [data-next-badge-root] { display: none !important; } body > header { position: static !important; }",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );
    window.scrollTo(0, 0);
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}

async function captureFullPage(
  page: Page,
  fileName: (typeof EVIDENCE_FILES)[number],
) {
  await settleEvidencePage(page);
  await page.screenshot({
    path: evidencePath(fileName),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
}

async function captureRange(
  page: Page,
  startSelector: string | null,
  endSelector: string,
  fileName: (typeof EVIDENCE_FILES)[number],
) {
  await settleEvidencePage(page);
  const start = startSelector
    ? await page.locator(startSelector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
      })
    : 0;
  const end = await page.locator(endSelector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom + window.scrollY;
  });
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Evidence viewport is unavailable.");
  const top = Math.max(0, Math.floor(start - 24));
  const documentHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  const bottom = Math.min(documentHeight, Math.ceil(end + 24));
  const captureHeight = Math.max(1, bottom - top);

  await page.setViewportSize({ width: viewport.width, height: captureHeight });
  await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), top);
  await page.screenshot({
    path: evidencePath(fileName),
    fullPage: false,
    animations: "disabled",
    caret: "hide",
  });
  await page.setViewportSize(viewport);
}

test.describe("WEEKENDOG homepage visual evidence", () => {
  test.skip(
    !CAPTURE_EVIDENCE,
    "Set CAPTURE_WEEKENDOG_EVIDENCE=1 to write visual evidence.",
  );
  test.skip(({ isMobile }) => Boolean(isMobile), "Capture once in desktop Chromium.");

  test("writes the eight approved evidence views", async ({ context, page }) => {
    test.setTimeout(120_000);
    await rm(EVIDENCE_DIRECTORY, { recursive: true, force: true });
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

    // Normal evidence uses the configured E2E server/upstream mock directly.
    // It intentionally does not browser-intercept /api/tour/homepage.
    if (!USE_LIVE_KAKAO) await installFakeKakaoMap(page);
    await page.setViewportSize({ width: 1_440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".homepage-live-ready")).toBeVisible();
    await expect(page.locator(".homepage-place-card").first()).toBeVisible();
    if (USE_LIVE_KAKAO) {
      await expect(
        page.locator("[data-kakao-map-initialized='true']"),
      ).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              Array.from(
                document.querySelectorAll<HTMLImageElement>(
                  ".kakao-map-canvas img",
                ),
              ).some((image) => image.complete && image.naturalWidth > 0),
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
    } else {
      await expect(page.locator("[data-fake-map-ready='true']")).toBeVisible();
    }

    await captureFullPage(page, "homepage-1440-full.png");
    await captureRange(
      page,
      null,
      ".homepage-map-shell",
      "homepage-1440-hero-map.png",
    );
    await captureRange(
      page,
      ".homepage-places-section",
      ".recommendation-process-section",
      "homepage-1440-places-process.png",
    );
    await captureRange(
      page,
      ".weekendoog-lower-section",
      ".weekendoog-trust-section",
      "homepage-1440-lower.png",
    );

    await page.setViewportSize({ width: 768, height: 1_024 });
    await captureFullPage(page, "homepage-768-full.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await captureFullPage(page, "homepage-390-full.png");

    const loadingPage = await context.newPage();
    await loadingPage.setViewportSize({ width: 1_440, height: 900 });
    let releaseLoading!: () => void;
    const loadingGate = new Promise<void>((resolve) => {
      releaseLoading = resolve;
    });
    await loadingPage.route(HOMEPAGE_API, async (route) => {
      await loadingGate;
      await route.abort("aborted");
    });
    await loadingPage.goto("/");
    await expect(
      loadingPage.getByLabel("공식 관광 지도 불러오는 중"),
    ).toBeVisible();
    await captureFullPage(loadingPage, "homepage-provider-loading.png");
    releaseLoading();
    await loadingPage.close();

    const errorPage = await context.newPage();
    await errorPage.setViewportSize({ width: 1_440, height: 900 });
    await errorPage.route(HOMEPAGE_API, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: "한국관광공사 응답을 지금 확인할 수 없습니다.",
            retryable: true,
          },
          requestId: "weekendog-evidence-error",
        }),
      });
    });
    await errorPage.goto("/");
    await expect(errorPage.locator(".homepage-live-error")).toBeVisible();
    await captureFullPage(errorPage, "homepage-provider-error.png");
    await errorPage.close();

    const pngFiles = (await readdir(EVIDENCE_DIRECTORY))
      .filter((fileName) => fileName.endsWith(".png"))
      .sort();
    expect(pngFiles).toEqual([...EVIDENCE_FILES].sort());
  });
});
