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
    categoryLabel: layer === "veterinary" ? "동물병원" : layer === "pet_shop" ? "반려동물 용품" : "관광·문화",
    district: "해운대구",
    address: "부산광역시 해운대구 테스트로 1",
    coordinates,
    sourceLabel: labels[layer][0],
    statusLabel: labels[layer][1],
    warning: layer === "official" ? null : "방문 전 현재 정보를 확인해 주세요.",
    isAllowed: false,
    href: layer === "official" ? `/places/${id.slice(5)}?contentTypeId=12` : `https://place.map.kakao.com/${id.split(":")[1]}`,
    external: layer !== "official",
    imageUrl: null,
    phone: layer === "veterinary" || layer === "pet_shop" ? "051-123-4567" : null,
    ...overrides,
  };
}

function cardFromMarker(value: HomepageMapMarker): HomepagePlaceCard {
  const { coordinates, ...card } = value;
  void coordinates;
  return card;
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
  { categoryLabel: "카페", district: "수영구" },
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
      { label: "관광지", count: 30 },
      { label: "문화시설", count: 7 },
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
      setImage() {}
      setMap() {}
      setPosition() {}
      setZIndex() {}
    }
    class Overlay {
      constructor(private options: { map: FakeMap; content: HTMLElement }) {
        options.map.container.append(options.content);
      }
      setMap(map: FakeMap | null) { if (!map) this.options.content.remove(); }
    }
    class Polyline { setMap() {} }
    class Clusterer { addMarkers() {} clear() {} }
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
  await expect(carousel.getByRole("button", { name: /번 여행 사진 보기/u })).toHaveCount(11);
  const first = carousel.locator("img").first();
  await expect(first).toHaveAttribute("alt", /노란 튤립밭/u);
  await expect(first).toHaveAttribute("fetchpriority", "high");
  await expect.poll(() => requestedHeroImages.size).toBe(1);

  await page.clock.fastForward(6_100);
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 11");
  await expect(carousel.locator(".weekendoog-hero-slide.is-active img")).toHaveAttribute("loading", "lazy");
  await expect.poll(() => requestedHeroImages.size).toBe(2);

  await carousel.hover();
  await page.clock.fastForward(12_100);
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 11");
  await carousel.getByRole("button", { name: "이전 여행 사진" }).click();
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("01 / 11");
  await carousel.press("End");
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("11 / 11");
  await carousel.press("Home");
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("01 / 11");
});

test("disables hero autoplay and transition under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await mockHomepage(page);
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "부산 반려견 여행 사진" });
  await page.clock.fastForward(12_100);
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("01 / 11");
  await carousel.getByRole("button", { name: "다음 여행 사진" }).click();
  await expect(carousel.locator(".weekendoog-hero-slide-status")).toHaveText("02 / 11");
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
  await expect(page.getByRole("button", { name: /공식 장소\s*37/u })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /카카오 후보\s*120/u })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /동물병원\s*42/u })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: /동물병원\s*42/u }).click();
  await expect(mapCanvas).toHaveAttribute("data-location-count", "4");
  const hospitalMarker = page.getByRole("button", { name: /부산 반려동물 동물병원 · 동물병원 지도 마커/u });
  await hospitalMarker.click();
  const selected = page.locator(".homepage-selected-place");
  await expect(selected).toContainText("동물병원");
  await expect(selected).not.toContainText("동반 가능");
  await expect(selected).not.toContainText("24시간");
});

test("filters truthful official, candidate, veterinary, and shop cards with safe links", async ({ page }) => {
  await mockHomepage(page);
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "부산 장소 카드" });
  await expect(carousel.locator(".homepage-place-card")).toHaveCount(2);
  await expect(carousel).toContainText("해운대 달맞이 산책로");
  await expect(carousel).toContainText("광안리 반려견 검색 후보");
  await expect(carousel).not.toContainText("부산 반려동물 동물병원");
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
  await expect(page.getByText("카카오 장소 데이터 준비 중").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /카카오 후보\s*—/u })).toBeDisabled();
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
  const cardBox = await page.locator(".homepage-place-card").first().boundingBox();
  expect(cardBox).not.toBeNull();
  expect(cardBox!.width).toBeGreaterThan(300);
  expect(cardBox!.width).toBeLessThan(330);
  await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
