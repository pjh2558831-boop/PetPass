import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  HomepageLayerSnapshot,
  HomepageMapMarker,
  HomepagePlaceCard,
  HomepagePlaceLayer,
  HomepagePlacesSnapshot,
} from "@/types/homepage-places";

const HOMEPAGE_API = "**/api/homepage/places";
const GENERATE_API_PATH = "/api/itineraries/generate";
const RETRIEVED_AT = "2026-08-15T02:00:00.000Z";
const NETWORK_TEST = "loads one provider-neutral snapshot and only one canonical Kakao SDK";

const LAYER_COUNTS: Record<HomepagePlaceLayer, HomepageLayerSnapshot> = {
  official: { state: "ready", count: 37, markerCount: 2, enabledByDefault: true },
  kakao_candidate: { state: "ready", count: 120, markerCount: 1, enabledByDefault: true },
  veterinary: { state: "ready", count: 42, markerCount: 1, enabledByDefault: false },
  pet_shop: { state: "ready", count: 18, markerCount: 1, enabledByDefault: false },
};

function marker(
  id: string,
  layer: HomepagePlaceLayer,
  name: string,
  coordinates: { latitude: number; longitude: number },
  overrides: Partial<HomepageMapMarker> = {},
): HomepageMapMarker {
  const labels = {
    official: ["한국관광공사", "상세에서 동반 조건 확인"],
    kakao_candidate: ["카카오 검색 후보", "동반 여부 확인 필요"],
    veterinary: ["동물병원", "진료 시간 확인 필요"],
    pet_shop: ["펫샵·용품점", "운영 정보 확인 필요"],
  } as const;
  return {
    id,
    layer,
    name,
    category: layer === "veterinary" ? "veterinary" : layer === "pet_shop" ? "pet_shop" : "attraction",
    district: "해운대구",
    address: "부산광역시 해운대구 테스트로 1",
    coordinates,
    sourceLabel: labels[layer][0],
    statusLabel: labels[layer][1],
    isAllowed: false,
    href: layer === "official" ? `/places/${id.slice(5)}?contentTypeId=12` : `https://place.map.kakao.com/${id.split(":")[1]}`,
    imageUrl: null,
    ...overrides,
  };
}

function cardFromMarker(value: HomepageMapMarker): HomepagePlaceCard {
  return {
    id: value.id,
    layer: value.layer,
    name: value.name,
    category: value.category,
    categoryLabel: value.category === "veterinary"
      ? "동물병원"
      : value.category === "pet_shop" ? "반려동물 용품" : value.category === "cafe" ? "카페" : "관광·문화",
    district: value.district,
    address: value.address,
    phone: value.layer === "veterinary" || value.layer === "pet_shop" ? "051-123-4567" : null,
    sourceLabel: value.sourceLabel,
    statusLabel: value.statusLabel,
    warning: value.layer === "official" ? null : "방문 전 현재 정보를 확인해 주세요.",
    isAllowed: value.isAllowed,
    href: value.href,
    external: value.href?.startsWith("http") ?? false,
    imageUrl: value.imageUrl,
  };
}

const OFFICIAL_ALLOWED = marker(
  "tour:homepage-allowed-walk",
  "official",
  "해운대 달맞이 산책로",
  { latitude: 35.1587, longitude: 129.16 },
  { isAllowed: true, statusLabel: "동반 가능" },
);
const OFFICIAL_NEUTRAL = marker(
  "tour:homepage-neutral-park",
  "official",
  "부산 시민공원 산책길",
  { latitude: 35.1686, longitude: 129.0572 },
);
const KAKAO_CANDIDATE = marker(
  "kakao:101",
  "kakao_candidate",
  "광안리 반려견 검색 후보",
  { latitude: 35.1532, longitude: 129.1187 },
  { category: "cafe", district: "수영구" },
);
const VETERINARY = marker(
  "kakao:102",
  "veterinary",
  "부산 반려동물 동물병원",
  { latitude: 35.17, longitude: 129.18 },
);
const PET_SHOP = marker(
  "kakao:103",
  "pet_shop",
  "부산 반려동물 용품점",
  { latitude: 35.18, longitude: 129.19 },
);

const SNAPSHOT: HomepagePlacesSnapshot = {
  official: {
    totalCount: 37,
    markerCount: 2,
    omittedCoordinateCount: 1,
    categoryCounts: [
      { category: "attraction", label: "관광지", count: 37 },
    ],
    featuredState: "ready",
    retrievedAt: RETRIEVED_AT,
  },
  layers: LAYER_COUNTS,
  markers: [OFFICIAL_ALLOWED, OFFICIAL_NEUTRAL, KAKAO_CANDIDATE, VETERINARY, PET_SHOP],
  cards: [
    cardFromMarker(OFFICIAL_ALLOWED),
    cardFromMarker(KAKAO_CANDIDATE),
    cardFromMarker(VETERINARY),
    cardFromMarker(PET_SHOP),
  ],
};

async function fulfillHomepage(route: Route, snapshot = SNAPSHOT) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: snapshot, requestId: "homepage-e2e" }),
  });
}

async function mockHomepage(page: Page, snapshot = SNAPSHOT) {
  await page.route(HOMEPAGE_API, (route) => fulfillHomepage(route, snapshot));
}

async function installFakeMap(page: Page) {
  await page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const addListener = (target: object, name: string, handler: Listener) => {
      const targetListeners = listeners.get(target) ?? new Map<string, Set<Listener>>();
      const values = targetListeners.get(name) ?? new Set<Listener>();
      values.add(handler);
      targetListeners.set(name, values);
      listeners.set(target, targetListeners);
    };
    const emit = (target: object, name: string, ...args: unknown[]) => {
      listeners.get(target)?.get(name)?.forEach((handler) => handler(...args));
    };
    class LatLng {
      constructor(private latitude: number, private longitude: number) {}
      getLat() { return this.latitude; }
      getLng() { return this.longitude; }
    }
    class Bounds {
      extend() {}
      getNorthEast() { return new LatLng(35.3, 129.3); }
      getSouthWest() { return new LatLng(35, 129); }
    }
    class FakeMap {
      private center: LatLng;
      constructor(readonly container: HTMLElement, options: { center: LatLng }) {
        this.center = options.center;
        container.dataset.fakeMapReady = "true";
      }
      getBounds() { return new Bounds(); }
      getCenter() { return this.center; }
      panTo(value: LatLng) { this.center = value; }
      relayout() {}
      setBounds() {}
    }
    class Marker {
      private readonly element = document.createElement("button");
      constructor(options: { title?: string }) {
        this.element.type = "button";
        this.element.className = "fake-kakao-native-marker";
        this.element.setAttribute("aria-label", options.title ?? "지도 마커");
        this.element.addEventListener("click", () => emit(this, "click"));
      }
      setImage() {}
      setMap(map: FakeMap | null) {
        if (map) map.container.append(this.element);
        else this.element.remove();
      }
      setPosition() {}
      setTitle(title: string) { this.element.setAttribute("aria-label", title); }
      setZIndex() {}
    }
    class Overlay {
      constructor(private options: { map: FakeMap; content: HTMLElement }) {
        options.map.container.append(options.content);
      }
      setMap(map: FakeMap | null) { if (!map) this.options.content.remove(); }
    }
    class Polyline { setMap() {} }
    class Clusterer {
      private markers: Marker[] = [];
      constructor(private options: { map: FakeMap }) {}
      addMarkers(markers: Marker[]) {
        this.markers = markers;
        markers.forEach((marker) => marker.setMap(this.options.map));
      }
      clear() { this.markers.forEach((marker) => marker.setMap(null)); this.markers = []; }
      redraw() {}
    }
    window.kakao = { maps: {
      load: (callback: () => void) => callback(),
      event: { addListener, removeListener(target: object, name: string, handler: Listener) { listeners.get(target)?.get(name)?.delete(handler); } },
      LatLng, LatLngBounds: Bounds, Map: FakeMap, CustomOverlay: Overlay, Marker,
      MarkerImage: class {}, MarkerClusterer: Clusterer, Point: class {},
      Polyline, Size: class {},
    } as unknown as NonNullable<Window["kakao"]>["maps"] };
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title !== NETWORK_TEST) await installFakeMap(page);
});

test(NETWORK_TEST, async ({ page }) => {
  let homepageRequests = 0;
  const sdkRequests: string[] = [];
  const forbidden: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/homepage/places") homepageRequests += 1;
    if (url.hostname === "dapi.kakao.com" && url.pathname === "/v2/maps/sdk.js") sdkRequests.push(url.toString());
    if (["/api/tour/homepage", "/api/map/places", "/api/places/discovery", "/api/itineraries/generate", "/api/directions", "/api/kakao/directions"].includes(url.pathname) || url.hostname.includes("supabase")) forbidden.push(url.toString());
  });
  await mockHomepage(page);
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js**", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.kakao={maps:{load:function(callback){callback();}}};",
  }));
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  await expect.poll(() => homepageRequests).toBe(1);
  await expect.poll(() => sdkRequests.length).toBe(1);
  const sdk = new URL(sdkRequests[0]);
  expect(sdk.searchParams.get("autoload")).toBe("false");
  expect(new Set(sdk.searchParams.get("libraries")?.split(","))).toEqual(new Set(["services", "clusterer"]));
  expect(forbidden).toEqual([]);
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
  await page.route(HOMEPAGE_API, async (route) => {
    requested = true;
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: SNAPSHOT, requestId: "homepage-abort" }),
    })
      .catch(() => undefined);
  });

  await page.goto("/");
  await expect(page.locator(".homepage-live-loading")).toBeVisible();
  await expect.poll(() => requested).toBe(true);
  const navigation = Promise.all([
    page.waitForURL(/\/planner\/pet/u),
    page.getByRole("link", { name: "여행 만들기", exact: true }).first().click(),
  ]);
  await page.waitForURL(/\/planner\/pet/u);
  await expect.poll(() => page.evaluate(
    () => Number(sessionStorage.getItem("homepage-abort-count") ?? "0"),
  )).toBeGreaterThan(0);
  release();
  await navigation;
});

test("uses one eager hero image, lazy later slides, manual controls, and six-second autoplay", async ({ page }) => {
  await page.clock.install();
  const requestedHeroImages = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    const source = url.searchParams.get("url") ?? url.pathname;
    if (source.includes("/images/home/hero/")) requestedHeroImages.add(source);
  });
  await mockHomepage(page);
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "부산 반려견 여행 사진" });
  await expect(carousel.getByRole("button", { name: /번 여행 사진 보기/u })).toHaveCount(10);
  const first = carousel.locator("img").first();
  await expect(first).toHaveAttribute("alt", /노란 튤립밭/u);
  await expect(first).toHaveAttribute("fetchpriority", "high");
  await expect.poll(() => requestedHeroImages.size).toBe(1);

  await page.clock.runFor(6_100);
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 10");
  await expect(carousel.locator(".weekendoog-hero-slide.is-active img")).toHaveAttribute("loading", "lazy");
  await expect.poll(() => requestedHeroImages.size).toBe(2);

  await carousel.hover();
  await page.clock.runFor(12_100);
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 10");
  await carousel.getByRole("button", { name: "이전 여행 사진" }).click();
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("01 / 10");
  await carousel.press("End");
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("10 / 10");
  await carousel.press("Home");
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("01 / 10");
});

test("uses compact hero copy and three local official partner marks", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");

  const hero = page.locator(".weekendoog-hero");
  await expect(hero).toContainText(
    "공식 반려동물 동반 정보와 이동 동선을 바탕으로",
  );
  await expect(hero).toContainText(
    "가장 자연스러운 하루 일정을 제안해드려요.",
  );
  await expect(hero.getByText("공식 데이터 기반 반려동물 여행", { exact: true })).toHaveCount(0);

  const launcher = page.getByRole("form", { name: "여행 만들기 빠른 시작" });
  await expect(launcher.getByText("어디로 떠날까요?", { exact: true })).toBeVisible();
  await expect(launcher.getByText("언제 갈까요?", { exact: true })).toHaveCount(0);
  await expect(launcher.getByText("누구와 함께?", { exact: true })).toHaveCount(0);
  await expect(
    launcher.getByText("날짜와 반려동물 정보는 다음 화면에서 이어서 입력합니다.", {
      exact: true,
    }),
  ).toHaveCount(0);

  const trust = page.locator(".weekendoog-public-data-card");
  const marks = trust.locator(".weekendoog-partner-mark img");
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
  await expect(trust).toHaveAttribute("data-layout", "partner-strip");
});

test("aligns the desktop launcher below the hero copy and keeps annotated dimensions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop annotation only");
  await page.setViewportSize({ width: 1403, height: 986 });
  await mockHomepage(page);
  await page.goto("/");

  await expect(page.locator(".weekendoog-hero")).toBeVisible();

  const layoutBox = await page.locator(".weekendoog-hero-layout").boundingBox();
  const copyBox = await page.locator(".weekendoog-hero-copy").boundingBox();
  const launcherBox = await page.locator(".weekendoog-hero-launcher").boundingBox();
  const trustBox = await page.locator(".weekendoog-public-data-card").boundingBox();
  const contactBox = await page.locator(".weekendoog-contact-card").boundingBox();

  expect(layoutBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(launcherBox).not.toBeNull();
  expect(trustBox).not.toBeNull();
  expect(contactBox).not.toBeNull();
  expect(launcherBox!.width).toBeCloseTo(600, 0);
  expect(launcherBox!.x).toBeCloseTo(layoutBox!.x, 0);
  expect(launcherBox!.y).toBeGreaterThanOrEqual(copyBox!.y + copyBox!.height);
  expect(trustBox!.height).toBeCloseTo(200, 0);
  expect(contactBox!.height).toBeCloseTo(trustBox!.height, 0);
  await expect(page.getByText(
    "실제 개인화 결과가 아니며 장소·시간은 조건에 따라 달라집니다.",
    { exact: true },
  )).toHaveCount(0);
});

test("disables hero autoplay and transition under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await mockHomepage(page);
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "부산 반려견 여행 사진" });
  await page.clock.fastForward(12_100);
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("01 / 10");
  await carousel.getByRole("button", { name: "다음 여행 사진" }).click();
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 10");
  await expect(carousel.locator(".weekendoog-hero-slide.is-outgoing")).toHaveCount(0);
});

test("keeps loading and provider failures truthful and retryable", async ({ page }) => {
  let requestCount = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(HOMEPAGE_API, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await gate;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "UPSTREAM_ERROR", message: "공식 응답을 확인할 수 없습니다.", retryable: true }, requestId: "error" }) });
      return;
    }
    await fulfillHomepage(route);
  });
  await page.goto("/");
  await expect(page.getByLabel("부산 장소 지도 불러오는 중")).toBeVisible();
  await expect(page.getByText("37곳", { exact: true })).toHaveCount(0);
  release();
  const error = page.locator(".homepage-live-error");
  await expect(error).toBeVisible();
  await expect(page.locator(".homepage-map-section")).toHaveCount(0);
  await error.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: /부산 공식 관광 장소\s*37곳/u })).toBeVisible();
  expect(requestCount).toBe(2);
});

test("renders mixed source markers, dynamic counts, truthful selection, and facility toggles", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  const mapCanvas = page.locator(".homepage-map-canvas-wrap .map-canvas");
  await expect(mapCanvas).toHaveAttribute("data-location-count", "3");
  await expect(mapCanvas).toHaveAttribute("data-route-point-count", "0");
  await expect(page.getByLabel("지도 마커 범례")).toHaveCount(0);
  await expect(page.getByText("지도 레이어", { exact: true })).toHaveCount(0);
  await expect(page.getByText("BUSAN PLACE MAP", { exact: true })).toHaveCount(0);
  await expect(page.locator(".homepage-map-filter-panel")).toHaveCount(0);
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
  await expect(mapCanvas).toHaveAttribute("data-location-count", "3");
  await mapFilters.getByRole("button", { name: "적용하기" }).click();
  await expect(mapCanvas).toHaveAttribute("data-location-count", "4");
  const hospitalMarker = page.getByRole("button", { name: /부산 반려동물 동물병원 · 동물병원$/u });
  await hospitalMarker.evaluate((element) => (element as HTMLButtonElement).click());
  const selected = page.locator(".homepage-selected-place");
  await expect(selected).toContainText("동물병원");
  await expect(selected).not.toContainText("동반 가능");
  await expect(selected).not.toContainText("24시간");

  if ((page.viewportSize()?.width ?? 0) >= 768) {
    const mapBox = await mapCanvas.boundingBox();
    const selectedBox = await selected.boundingBox();
    const watermarkBox = await page.locator(".homepage-map-canvas-wrap .map-watermark").boundingBox();
    expect(mapBox).not.toBeNull();
    expect(selectedBox).not.toBeNull();
    expect(watermarkBox).not.toBeNull();
    expect(selectedBox!.x).toBeGreaterThanOrEqual(mapBox!.x);
    expect(selectedBox!.y).toBeGreaterThanOrEqual(mapBox!.y);
    expect(selectedBox!.x + selectedBox!.width).toBeLessThanOrEqual(mapBox!.x + mapBox!.width);
    expect(selectedBox!.y + selectedBox!.height).toBeLessThanOrEqual(mapBox!.y + mapBox!.height);
    expect(selectedBox!.y + selectedBox!.height).toBeLessThanOrEqual(watermarkBox!.y);
  }
});

test("filters truthful official, candidate, veterinary, and shop cards with safe links", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "부산 장소 카드" });
  await expect(carousel.locator(".homepage-place-card")).toHaveCount(2);
  await expect(carousel).toContainText("해운대 달맞이 산책로");
  await expect(carousel).toContainText("광안리 반려견 검색 후보");
  await expect(carousel).not.toContainText("부산 반려동물 동물병원");
  await expect(carousel.getByText(
    "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
    { exact: true },
  )).toHaveCount(0);
  await expect(carousel.getByRole("link", { name: /광안리 반려견 검색 후보 카카오 장소 정보/u })).toHaveAttribute("href", "https://place.map.kakao.com/101");
  await expect(carousel.locator(".homepage-allowed-badge")).toHaveCount(1);

  const filters = page.getByRole("group", { name: "장소 출처 필터" });
  await filters.getByRole("button", { name: "동물병원" }).click();
  await expect(carousel.locator(".homepage-place-card")).toHaveCount(1);
  await expect(carousel).toContainText("051-123-4567");
  await expect(carousel).not.toContainText("동반 가능");
  await filters.getByRole("button", { name: "펫샵" }).click();
  await expect(carousel).toContainText("펫샵·용품점");
  await expect(page.locator(".weekendoog-home")).not.toContainText(/평점|별점|리뷰|후기|인기 순위|24시간/u);
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
  await page.getByRole("button", { name: "필터", exact: true }).click();
  const mapFilters = page.getByRole("region", { name: "지도 장소 필터" });
  await expect(mapFilters.getByText("일부 카카오 장소 데이터 준비 중")).toBeVisible();
  await expect(mapFilters.getByRole("button", { name: /동물병원\s*…/u })).toBeEnabled();
  await expect(page.getByText("0곳", { exact: true })).toHaveCount(0);
});

test("moves card focus and prefills the planner without itinerary generation", async ({ page }) => {
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
  await launcher.getByLabel("부산 여행 지역").selectOption("350");
  await launcher.getByRole("button", { name: "여행 만들기" }).click();
  await expect(page).toHaveURL(/\/planner\/pet$/u);
  await expect(page.getByLabel("세부 지역")).toHaveValue("350");
  expect(generationRequests).toEqual([]);
});

test("preserves mobile order, map width, card snap width, and page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockHomepage(page);
  await page.goto("/");
  await expect(page.locator(".homepage-live-ready")).toBeVisible();
  const ctaBox = await page.locator(".weekendoog-hero-direct-cta").boundingBox();
  const launcherBox = await page.locator(".weekendoog-hero-launcher").boundingBox();
  const mediaBox = await page.locator(".weekendoog-hero-media").boundingBox();
  expect(ctaBox).not.toBeNull(); expect(launcherBox).not.toBeNull(); expect(mediaBox).not.toBeNull();
  expect(ctaBox!.y).toBeLessThan(launcherBox!.y);
  expect(launcherBox!.y).toBeLessThan(mediaBox!.y);
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
  expect(cardBox!.width).toBeGreaterThan(300);
  expect(cardBox!.width).toBeLessThan(330);
  await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
