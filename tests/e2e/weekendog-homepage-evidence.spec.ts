import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const CAPTURE_EVIDENCE = process.env.CAPTURE_WEEKENDOG_EVIDENCE === "1";
const USE_LIVE_KAKAO = process.env.RUN_LIVE_KAKAO_E2E === "1";
const HOMEPAGE_API = "**/api/homepage/places";
const EVIDENCE_DIRECTORY = path.resolve(
  process.cwd(),
  "verification-evidence",
  "weekendog-homepage-fine-ui-2026-08-15",
);
const EVIDENCE_FILES = [
  "homepage-1440-full.png",
  "header-photo-hero.png",
  "hero-second-slide.png",
  "mixed-source-map.png",
  "map-facilities-enabled.png",
  "places-official-candidate.png",
  "places-veterinary-shop.png",
  "official-partner-logos.png",
  "homepage-768-tablet.png",
  "homepage-390-mobile.png",
  "hero-reduced-motion-manual.png",
  "kakao-catalog-unavailable.png",
] as const;

const SNAPSHOT = {
  official: {
    totalCount: 37,
    markerCount: 2,
    omittedCoordinateCount: 1,
    categoryCounts: [
      { label: "관광지", count: 30 },
      { label: "문화시설", count: 7 },
    ],
    featuredState: "ready",
    retrievedAt: "2026-08-15T02:00:00.000Z",
  },
  layers: {
    official: { state: "ready", count: 37, markerCount: 2, enabledByDefault: true },
    kakao_candidate: { state: "ready", count: 120, markerCount: 1, enabledByDefault: true },
    veterinary: { state: "ready", count: 42, markerCount: 1, enabledByDefault: false },
    pet_shop: { state: "ready", count: 18, markerCount: 1, enabledByDefault: false },
  },
  markers: [
    { id: "tour:101", layer: "official", name: "해운대 달맞이 산책로", categoryLabel: "관광지", district: "해운대구", address: "부산광역시 해운대구", coordinates: { latitude: 35.1587, longitude: 129.16 }, sourceLabel: "한국관광공사", statusLabel: "동반 가능", warning: null, isAllowed: true, href: "/places/101?contentTypeId=12", external: false, imageUrl: null, phone: null },
    { id: "tour:102", layer: "official", name: "부산 시민공원 산책길", categoryLabel: "관광지", district: "부산진구", address: "부산광역시 부산진구", coordinates: { latitude: 35.1686, longitude: 129.0572 }, sourceLabel: "한국관광공사", statusLabel: "상세에서 동반 조건 확인", warning: null, isAllowed: false, href: "/places/102?contentTypeId=12", external: false, imageUrl: null, phone: null },
    { id: "kakao:201", layer: "kakao_candidate", name: "광안리 반려견 검색 후보", categoryLabel: "카페", district: "수영구", address: "부산광역시 수영구", coordinates: { latitude: 35.1532, longitude: 129.1187 }, sourceLabel: "카카오 검색 후보", statusLabel: "동반 여부 확인 필요", warning: "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.", isAllowed: false, href: "https://place.map.kakao.com/201", external: true, imageUrl: null, phone: null },
    { id: "kakao:202", layer: "veterinary", name: "부산 반려동물 동물병원", categoryLabel: "동물병원", district: "해운대구", address: "부산광역시 해운대구", coordinates: { latitude: 35.17, longitude: 129.18 }, sourceLabel: "동물병원", statusLabel: "진료 시간 확인 필요", warning: "운영 시간과 진료 가능 여부를 방문 전 확인해 주세요.", isAllowed: false, href: "https://place.map.kakao.com/202", external: true, imageUrl: null, phone: "051-123-4567" },
    { id: "kakao:203", layer: "pet_shop", name: "부산 반려동물 용품점", categoryLabel: "반려동물 용품", district: "수영구", address: "부산광역시 수영구", coordinates: { latitude: 35.18, longitude: 129.19 }, sourceLabel: "펫샵·용품점", statusLabel: "운영 정보 확인 필요", warning: "취급 품목과 운영 시간은 방문 전 확인해 주세요.", isAllowed: false, href: "https://place.map.kakao.com/203", external: true, imageUrl: null, phone: "051-987-6543" },
  ],
  cards: [] as Array<Record<string, unknown>>,
};

SNAPSHOT.cards = SNAPSHOT.markers.map(({ coordinates, ...card }) => {
  void coordinates;
  return card;
});

async function fulfillSnapshot(route: Route, data: unknown = SNAPSHOT) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data, requestId: "weekendog-evidence" }),
  });
}

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

  test("writes the twelve fine UI evidence views", async ({ context, page }) => {
    test.setTimeout(120_000);
    await rm(EVIDENCE_DIRECTORY, { recursive: true, force: true });
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

    await page.route(HOMEPAGE_API, (route) => fulfillSnapshot(route));
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
    await captureRange(page, null, ".weekendoog-hero", "header-photo-hero.png");

    const hero = page.getByRole("region", { name: "부산 반려견 여행 사진" });
    await hero.getByRole("button", { name: "다음 여행 사진" }).click();
    await expect(hero.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 11");
    await captureRange(page, null, ".weekendoog-hero", "hero-second-slide.png");

    await captureRange(page, ".homepage-map-section", ".homepage-map-section", "mixed-source-map.png");
    await page.getByRole("button", { name: /동물병원\s*42/u }).click();
    await page.getByRole("button", { name: /펫샵·용품점\s*18/u }).click();
    await captureRange(page, ".homepage-map-section", ".homepage-map-section", "map-facilities-enabled.png");

    await captureRange(page, ".homepage-places-section", ".homepage-places-section", "places-official-candidate.png");
    const filters = page.getByRole("group", { name: "장소 출처 필터" });
    await filters.getByRole("button", { name: "동물병원" }).click();
    await captureRange(page, ".homepage-places-section", ".homepage-places-section", "places-veterinary-shop.png");
    await captureRange(page, ".weekendoog-trust-section", ".weekendoog-trust-section", "official-partner-logos.png");
    await filters.getByRole("button", { name: "전체", exact: true }).click();

    await page.setViewportSize({ width: 768, height: 1_024 });
    await captureFullPage(page, "homepage-768-tablet.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await captureFullPage(page, "homepage-390-mobile.png");

    const reducedPage = await context.newPage();
    await reducedPage.emulateMedia({ reducedMotion: "reduce" });
    await reducedPage.setViewportSize({ width: 1_440, height: 900 });
    await reducedPage.route(HOMEPAGE_API, (route) => fulfillSnapshot(route));
    if (!USE_LIVE_KAKAO) await installFakeKakaoMap(reducedPage);
    await reducedPage.goto("/");
    const reducedHero = reducedPage.getByRole("region", { name: "부산 반려견 여행 사진" });
    await reducedHero.getByRole("button", { name: "다음 여행 사진" }).click();
    await expect(reducedHero.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 11");
    await captureRange(reducedPage, null, ".weekendoog-hero", "hero-reduced-motion-manual.png");
    await reducedPage.close();

    const unavailablePage = await context.newPage();
    await unavailablePage.setViewportSize({ width: 1_440, height: 900 });
    const unavailableSnapshot = {
      ...SNAPSHOT,
      layers: {
        ...SNAPSHOT.layers,
        kakao_candidate: { state: "unavailable", count: null, markerCount: null, enabledByDefault: true },
        veterinary: { state: "unavailable", count: null, markerCount: null, enabledByDefault: false },
        pet_shop: { state: "unavailable", count: null, markerCount: null, enabledByDefault: false },
      },
      markers: SNAPSHOT.markers.filter(({ layer }) => layer === "official"),
      cards: SNAPSHOT.cards.filter((card) => card.layer === "official"),
    };
    await unavailablePage.route(HOMEPAGE_API, (route) => fulfillSnapshot(route, unavailableSnapshot));
    if (!USE_LIVE_KAKAO) await installFakeKakaoMap(unavailablePage);
    await unavailablePage.goto("/");
    await expect(unavailablePage.getByText("카카오 장소 데이터 준비 중").first()).toBeVisible();
    await captureRange(unavailablePage, ".homepage-map-section", ".homepage-places-section", "kakao-catalog-unavailable.png");
    await unavailablePage.close();

    const pngFiles = (await readdir(EVIDENCE_DIRECTORY))
      .filter((fileName) => fileName.endsWith(".png"))
      .sort();
    expect(pngFiles).toEqual([...EVIDENCE_FILES].sort());
  });
});
