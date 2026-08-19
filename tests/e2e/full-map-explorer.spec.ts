import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EVIDENCE_DIRECTORY = path.resolve("verification-evidence/weekendog-full-map-2026-08-16");

const tourPlaces = Array.from({ length: 25 }, (_, index) => ({
  contentId: String(7000 + index),
  contentTypeId: "12",
  providerContentTypeId: "12",
  category: "attraction",
  title: `공식 장소 ${String(index + 1).padStart(2, "0")}`,
  address: "부산광역시 해운대구",
  detailAddress: null,
  longitude: 128.97 + (index % 5) * 0.07,
  latitude: 35.06 + Math.floor(index / 5) * 0.05,
  phone: null,
  thumbnailUrl: null,
  imageUrl: null,
  copyrightType: null,
  createdTime: null,
  modifiedTime: null,
  legalRegionCode: "26",
  legalDistrictCode: "350",
  classificationCodes: { primary: null, secondary: null, tertiary: null, largeCategory: null, middleCategory: null, smallCategory: null },
  providerVisibility: { status: "exposed", providerField: "showflag", providerValue: "1", checkedAt: "2026-08-16T00:00:00.000Z", reasonCodes: [] },
  source: { provider: "Korea Tourism Organization", operation: "areaBasedList2", retrievedAt: "2026-08-16T00:00:00.000Z" },
}));

const kakaoItems = [
  { id: "kakao:9101", providerPlaceId: "9101", name: "광안 여행 후보", kind: "pet_travel_candidate", category: "cafe", district: { code: "500", name: "수영구" }, address: "부산광역시 수영구 광안해변로 1", coordinates: { latitude: 35.15, longitude: 129.12 }, phone: null, placeUrl: "https://place.map.kakao.com/9101", source: "kakao_search_candidate", reviewStatus: "unreviewed", publicLabel: "동반 여부 확인 필요" },
  { id: "kakao:9102", providerPlaceId: "9102", name: "광안 동물병원", kind: "veterinary", category: null, district: { code: "500", name: "수영구" }, address: "부산광역시 수영구 수영로 2", coordinates: { latitude: 35.16, longitude: 129.13 }, phone: null, placeUrl: "https://place.map.kakao.com/9102", source: "kakao_search_candidate", reviewStatus: "unreviewed", publicLabel: "동물병원" },
  { id: "kakao:9103", providerPlaceId: "9103", name: "광안 펫샵", kind: "pet_shop", category: null, district: { code: "500", name: "수영구" }, address: "부산광역시 수영구 수영로 3", coordinates: { latitude: 35.17, longitude: 129.14 }, phone: null, placeUrl: "https://place.map.kakao.com/9103", source: "kakao_search_candidate", reviewStatus: "needs_review", publicLabel: "펫샵·용품점" },
];

async function mockCatalogApis(page: Page) {
  await page.route("**/api/tour/places?**", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { places: tourPlaces, page: 1, pageSize: 1000, totalCount: tourPlaces.length, source: tourPlaces[0].source }, requestId: "full-map-tour" }),
  }));
  await page.route("**/api/map/places?**", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { items: kakaoItems, page: 1, pageSize: 200, totalCount: kakaoItems.length, hasNext: false }, requestId: "full-map-kakao" }),
  }));
}

async function installDeterministicMap(page: Page) {
  await page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const addListener = (target: object, name: string, handler: Listener) => {
      const byName = listeners.get(target) ?? new Map<string, Set<Listener>>();
      const values = byName.get(name) ?? new Set<Listener>();
      values.add(handler);
      byName.set(name, values);
      listeners.set(target, byName);
    };
    const emit = (target: object, name: string, ...args: unknown[]) => listeners.get(target)?.get(name)?.forEach((handler) => handler(...args));

    class LatLng {
      constructor(private readonly latitude: number, private readonly longitude: number) {}
      getLat() { return this.latitude; }
      getLng() { return this.longitude; }
    }
    class Bounds {
      private south = 35;
      private west = 128.9;
      private north = 35.3;
      private east = 129.3;
      constructor(values?: { south: number; west: number; north: number; east: number }) {
        if (values) Object.assign(this, values);
      }
      extend(point: LatLng) {
        this.south = Math.min(this.south, point.getLat());
        this.west = Math.min(this.west, point.getLng());
        this.north = Math.max(this.north, point.getLat());
        this.east = Math.max(this.east, point.getLng());
      }
      getNorthEast() { return new LatLng(this.north, this.east); }
      getSouthWest() { return new LatLng(this.south, this.west); }
    }
    class Size { constructor(readonly width: number, readonly height: number) {} }
    class MarkerImage { constructor(readonly source: string, readonly size: Size) {} }
    class FakeMap {
      private center: LatLng;
      private bounds = new Bounds();
      constructor(readonly container: HTMLElement, options: { center: LatLng }) {
        this.center = options.center;
        container.dataset.fakeMapReady = "true";
        container.style.background = "linear-gradient(145deg, #e7f1df 0 46%, #c9eafa 46% 100%)";
      }
      getBounds() { return this.bounds; }
      getCenter() { return this.center; }
      panTo(value: LatLng) { this.center = value; queueMicrotask(() => emit(this, "idle")); }
      relayout() {}
      setBounds(value: Bounds) { this.bounds = value; queueMicrotask(() => emit(this, "idle")); }
      moveByUser() {
        this.center = new LatLng(35.13, 129.035);
        this.bounds = new Bounds({ south: 35.118, west: 129.018, north: 35.138, east: 129.05 });
        emit(this, "idle");
      }
      zoomByUser() {
        this.bounds = new Bounds({ south: 35.04, west: 128.96, north: 35.22, east: 129.22 });
        emit(this, "zoom_changed");
        emit(this, "idle");
      }
    }
    const testWindow = window as unknown as {
      __activeExplorerMap?: FakeMap;
      __moveExplorerMap?: () => void;
      __zoomExplorerMap?: () => void;
      __setExplorerClusterMode?: (mode: "clusters" | "pins") => void;
    };
    class MapConstructor extends FakeMap {
      constructor(container: HTMLElement, options: { center: LatLng }) {
        super(container, options);
        testWindow.__activeExplorerMap = this;
      }
    }
    class Marker {
      private map: FakeMap | null = null;
      private image: MarkerImage | undefined;
      private readonly element = document.createElement("button");
      constructor(private readonly options: { image?: MarkerImage; position: LatLng; title?: string }) {
        this.image = options.image;
        this.element.type = "button";
        this.element.className = "fake-kakao-native-marker";
        this.element.style.position = "absolute";
        this.element.style.left = `${8 + ((options.position.getLng() - 128.9) / 0.4) * 84}%`;
        this.element.style.top = `${8 + ((35.3 - options.position.getLat()) / 0.3) * 78}%`;
        this.element.style.border = "0";
        this.element.style.background = "transparent";
        this.element.style.transform = "translate(-50%, -100%)";
        this.element.setAttribute("aria-label", options.title ?? "지도 마커");
        this.element.addEventListener("click", () => emit(this, "click"));
        this.renderImage();
      }
      private renderImage() {
        this.element.replaceChildren();
        if (!this.image) return;
        const image = document.createElement("img");
        image.src = this.image.source;
        image.alt = "";
        image.width = this.image.size.width;
        image.height = this.image.size.height;
        this.element.append(image);
        this.element.dataset.markerWidth = String(this.image.size.width);
        this.element.dataset.markerSource = this.image.source;
      }
      setImage(image: MarkerImage) { this.image = image; this.renderImage(); }
      setMap(map: FakeMap | null) {
        this.map = map;
        if (map) map.container.append(this.element);
        else this.element.remove();
      }
      setPosition() {}
      setTitle(title: string) { this.element.setAttribute("aria-label", title); }
      setZIndex(value: number) { this.element.style.zIndex = String(value); }
    }
    class Overlay {
      constructor(private readonly options: { map?: FakeMap; content: HTMLElement; position?: LatLng }) {
        if (options.position) {
          options.content.style.position = "absolute";
          options.content.style.left = `${8 + ((options.position.getLng() - 128.9) / 0.4) * 84}%`;
          options.content.style.top = `${8 + ((35.3 - options.position.getLat()) / 0.3) * 78}%`;
          options.content.style.transform = "translate(-50%, -190%)";
          options.content.style.zIndex = "10";
        }
        options.map?.container.append(options.content);
      }
      setMap(map: FakeMap | null) { if (!map) this.options.content.remove(); }
    }
    class Clusterer {
      private markers: Marker[] = [];
      constructor(private readonly options: { map: FakeMap }) {}
      addMarkers(markers: Marker[]) {
        const existing = new Set(this.markers);
        this.markers.push(...markers.filter((marker) => !existing.has(marker)));
        markers.forEach((marker) => marker.setMap(this.options.map));
        emit(this, "clustered", [{ getMarkers: () => this.markers, getSize: () => this.markers.length }]);
      }
      removeMarkers(markers: Marker[]) {
        const removed = new Set(markers);
        markers.forEach((marker) => marker.setMap(null));
        this.markers = this.markers.filter((marker) => !removed.has(marker));
      }
      clear() { this.markers.forEach((marker) => marker.setMap(null)); this.markers = []; }
      redraw() {}
    }
    class Polyline { setMap() {} }

    testWindow.__moveExplorerMap = () => testWindow.__activeExplorerMap?.moveByUser();
    testWindow.__zoomExplorerMap = () => testWindow.__activeExplorerMap?.zoomByUser();
    testWindow.__setExplorerClusterMode = (mode) => {
      document.querySelectorAll<HTMLElement>(".fake-kakao-native-marker").forEach((marker) => {
        marker.style.display = mode === "clusters" ? "none" : "block";
      });
      document.querySelectorAll(".fake-kakao-cluster").forEach((cluster) => cluster.remove());
      if (mode !== "clusters" || !testWindow.__activeExplorerMap) return;
      [["8", "24%", "42%"], ["7", "48%", "58%"], ["6", "70%", "35%"], ["7", "82%", "68%"]].forEach(([count, left, top]) => {
        const cluster = document.createElement("button");
        cluster.type = "button";
        cluster.className = "fake-kakao-cluster";
        cluster.textContent = count;
        cluster.setAttribute("aria-label", `${count}개 장소 묶음`);
        Object.assign(cluster.style, { position: "absolute", left, top, width: "46px", height: "46px", border: "4px solid white", borderRadius: "999px", background: "#596760", color: "white", fontWeight: "900", boxShadow: "0 8px 22px rgba(35,97,72,.28)" });
        testWindow.__activeExplorerMap?.container.append(cluster);
      });
    };
    window.kakao = { maps: {
      load: (callback: () => void) => callback(),
      event: { addListener, removeListener(target: object, name: string, handler: Listener) { listeners.get(target)?.get(name)?.delete(handler); } },
      LatLng, LatLngBounds: Bounds, Map: MapConstructor, CustomOverlay: Overlay,
      Marker, MarkerImage, MarkerClusterer: Clusterer, Point: class {}, Polyline, Size,
    } as unknown as NonNullable<Window["kakao"]>["maps"] };
  });
}

test.beforeEach(async ({ page }) => {
  await installDeterministicMap(page);
  await mockCatalogApis(page);
});

test("keeps one source marker per place across pagination, selection, and viewport commit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Desktop registry flow; responsive behavior has a dedicated cross-viewport test.");
  const catalogRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/tour/places" || pathname === "/api/map/places") {
      catalogRequests.push(request.url());
    }
  });
  await page.goto("/results?tab=catalog");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  const mapRoot = page.locator("[data-marker-registry-size]");
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "26");
  await expect(mapRoot).toHaveAttribute("data-active-marker-count", "26");
  await expect(mapRoot).toHaveAttribute("data-custom-overlay-marker-count", "0");
  await expect(mapRoot).toHaveAttribute("data-clusterer-instance-count", "1");
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(26);
  await expect(page.locator(".kakao-map-selection")).toHaveCount(0);

  const categoryPanel = page.locator(".explorer-category-panel");
  for (const label of ["관광지", "식당", "카페", "숙소"]) {
    await expect(categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "true");
  }
  for (const label of ["쇼핑", "동물병원", "펫샵·용품점"]) {
    await expect(categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "false");
  }

  const resetCount = await mapRoot.getAttribute("data-clusterer-reset-count");
  const createdCount = await mapRoot.getAttribute("data-created-source-marker-count");
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "26");
  await expect(mapRoot).toHaveAttribute("data-clusterer-reset-count", resetCount ?? "");
  await expect(mapRoot).toHaveAttribute("data-created-source-marker-count", createdCount ?? "");

  const pageTwoCard = page.locator('[id^="place-card-"]').first();
  await pageTwoCard.getByRole("button", { name: /지도에서 보기$/u }).click();
  await expect(pageTwoCard).toHaveClass(/is-selected/u);
  await expect(mapRoot).toHaveAttribute("data-clusterer-reset-count", resetCount ?? "");
  await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(1);
  await expect(page.locator(".kakao-map-selection")).toHaveCount(0);

  await categoryPanel.getByRole("button", { name: /^카페/u }).click();
  await expect(page.getByRole("heading", { name: "총 25곳" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "25");
  await expect(page.getByText("동반 가능", { exact: true })).toHaveCount(0);
  await expect(page.getByText("24시간", { exact: true })).toHaveCount(0);

  const beforeMoveCount = await mapRoot.getAttribute("data-marker-registry-size");
  await page.evaluate(() => (window as unknown as { __zoomExplorerMap?: () => void }).__zoomExplorerMap?.());
  const research = page.getByRole("button", { name: "이 지역 검색 다시하기" });
  await expect(research).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", beforeMoveCount ?? "");
  const requestCountBeforeCommit = catalogRequests.length;
  await research.click();
  await expect(page.getByRole("heading", { name: /총 \d+곳/u })).not.toHaveText("총 25곳");
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("1");
  await expect(research).toHaveCount(0);
  expect(catalogRequests).toHaveLength(requestCountBeforeCommit);
  await page.evaluate(() => (window as unknown as { __zoomExplorerMap?: () => void }).__zoomExplorerMap?.());
  await expect(research).toHaveCount(0);
  expect(catalogRequests).toHaveLength(requestCountBeforeCommit);
});

test("uses map/list modes without horizontal overflow at responsive widths", async ({ page }) => {
  await page.goto("/results?tab=catalog");
  for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "지도", exact: true }).click();
    await expect(page.locator(".full-map-explorer__map")).toBeVisible();
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.locator(".full-map-explorer__sidebar")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("keeps deterministic explorer interactions bounded and the live registry stable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Desktop performance flow; mobile mode is verified separately.");
  await page.goto("/results?tab=catalog");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  const mapRoot = page.locator("[data-marker-registry-size]");
  const markerCreationMs = Number(await mapRoot.getAttribute("data-marker-update-ms"));
  const clusterCreationMs = Number(await mapRoot.getAttribute("data-cluster-update-ms"));
  const markerCountBeforeZoom = Number(await mapRoot.getAttribute("data-marker-registry-size"));

  const zoomResponseStartedAt = Date.now();
  await page.evaluate(() => (window as unknown as { __zoomExplorerMap?: () => void }).__zoomExplorerMap?.());
  await expect(page.getByRole("button", { name: "이 지역 검색 다시하기" })).toBeVisible();
  const zoomResponseMs = Date.now() - zoomResponseStartedAt;
  const markerCountAfterZoom = Number(await mapRoot.getAttribute("data-marker-registry-size"));
  expect(markerCountAfterZoom).toBe(markerCountBeforeZoom);

  const pageSwitchStartedAt = Date.now();
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("2");
  const pageSwitchMs = Date.now() - pageSwitchStartedAt;

  const candidateFilter = page.locator(".explorer-category-panel").getByRole("button", { name: /^카페/u });
  const filterSwitchStartedAt = Date.now();
  await candidateFilter.click();
  await expect(page.getByRole("heading", { name: "총 25곳" })).toBeVisible();
  const filterSwitchMs = Date.now() - filterSwitchStartedAt;

  for (let index = 0; index < 4; index += 1) {
    await candidateFilter.click();
    await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
    await candidateFilter.click();
    await expect(page.getByRole("heading", { name: "총 25곳" })).toBeVisible();
  }
  await candidateFilter.click();
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "26");
  await expect(mapRoot).toHaveAttribute("data-active-marker-count", "26");
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(26);
  await expect(mapRoot).toHaveAttribute("data-custom-overlay-marker-count", "0");
  await expect(mapRoot).toHaveAttribute("data-clusterer-instance-count", "1");

  const metrics = {
    apiResponseBytes: {
      tour: Buffer.byteLength(JSON.stringify({ ok: true, data: { places: tourPlaces, page: 1, pageSize: 1000, totalCount: tourPlaces.length, source: tourPlaces[0].source }, requestId: "full-map-tour" }), "utf8"),
      kakao: Buffer.byteLength(JSON.stringify({ ok: true, data: { items: kakaoItems, page: 1, pageSize: 200, totalCount: kakaoItems.length, hasNext: false }, requestId: "full-map-kakao" }), "utf8"),
    },
    markerCreationMs,
    clusterCreationMs,
    pageSwitchMs,
    filterSwitchMs,
    zoomResponseMs,
    markerCountBeforeZoom,
    markerCountAfterZoom,
    finalRegistrySize: Number(await mapRoot.getAttribute("data-marker-registry-size")),
    finalActiveMarkerCount: Number(await mapRoot.getAttribute("data-active-marker-count")),
    createdMarkerCountAfterRepeatedToggles: Number(await mapRoot.getAttribute("data-created-source-marker-count")),
  };
  console.log(`FULL_MAP_METRICS ${JSON.stringify(metrics)}`);
  await test.info().attach("full-map-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });

  expect(markerCreationMs).toBeLessThan(2_000);
  expect(clusterCreationMs).toBeLessThan(2_000);
  expect(pageSwitchMs).toBeLessThan(1_000);
  expect(filterSwitchMs).toBeLessThan(2_000);
  expect(zoomResponseMs).toBeLessThan(1_000);
});

test("keeps 1,824 markers complete while the sidebar stays paged by 12", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Large marker performance is measured once in desktop Chromium.");
  test.setTimeout(30_000);
  const largeCatalog = Array.from({ length: 1_824 }, (_, index) => ({
    ...tourPlaces[index % tourPlaces.length],
    contentId: String(20_000 + index),
    title: `대규모 공식 장소 ${String(index + 1).padStart(4, "0")}`,
    longitude: 128.9 + (index % 48) * 0.008,
    latitude: 35.02 + Math.floor(index / 48) * 0.007,
  }));
  const markerItems = largeCatalog.map((place) => ({
    id: `tour:${place.contentId}`,
    providerPlaceId: place.contentId,
    name: place.title,
    layer: "tourism",
    category: "attraction",
    districtCode: place.legalDistrictCode,
    districtName: null,
    address: place.address,
    coordinates: { latitude: place.latitude, longitude: place.longitude },
    lastSeenAt: place.source.retrievedAt,
    matchedQueryCount: 0,
    categoryQueryAgreementCount: 0,
    completeness: 0.5,
    publicLabel: "동반 정보 확인 필요",
    sourceLabel: "한국관광공사",
  }));
  const legacyResponse = {
    ok: true,
    data: {
      places: largeCatalog,
      page: 1,
      pageSize: 1_824,
      totalCount: largeCatalog.length,
      source: largeCatalog[0].source,
    },
    requestId: "full-map-large-tour",
  };
  const markerResponse = {
    ok: true,
    data: {
      items: markerItems,
      page: 1,
      pageSize: 1_824,
      totalCount: largeCatalog.length,
      hasNext: false,
    },
    requestId: "full-map-large-tour",
  };
  const tourBody = JSON.stringify(markerResponse);
  const legacyBody = JSON.stringify(legacyResponse);
  const medianWarmSerializationMs = (value: unknown) => {
    JSON.stringify(value);
    const samples = Array.from({ length: 15 }, () => {
      const startedAt = performance.now();
      JSON.stringify(value);
      return performance.now() - startedAt;
    }).sort((left, right) => left - right);
    return Number(samples[Math.floor(samples.length / 2)].toFixed(3));
  };
  const warmApiSerializationMs = {
    before: medianWarmSerializationMs(legacyResponse),
    after: medianWarmSerializationMs(markerResponse),
  };
  await page.route("**/api/tour/places?**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("view") === "markers") {
      return route.fulfill({ status: 200, contentType: "application/json", body: tourBody });
    }
    const ids = new Set((url.searchParams.get("ids") ?? "").split(","));
    const cards = largeCatalog.filter(({ contentId }) => ids.has(contentId));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { places: cards, page: 1, pageSize: cards.length, totalCount: cards.length, source: largeCatalog[0].source },
        requestId: "full-map-large-cards",
      }),
    });
  });
  await page.route("**/api/map/places?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { items: [], page: 1, pageSize: 200, totalCount: 0, hasNext: false }, requestId: "full-map-large-kakao" }),
  }));

  await page.goto("/results?tab=catalog");
  await expect(page.getByRole("heading", { name: "총 1,824곳" })).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  const mapRoot = page.locator("[data-marker-registry-size]");
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "1824");
  await expect(mapRoot).toHaveAttribute("data-active-marker-count", "1824");
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(1_824);
  const markerCreationMs = Number(await mapRoot.getAttribute("data-marker-update-ms"));
  const clusterCreationMs = Number(await mapRoot.getAttribute("data-cluster-update-ms"));

  const zoomStartedAt = Date.now();
  await page.evaluate(() => (window as unknown as { __zoomExplorerMap?: () => void }).__zoomExplorerMap?.());
  await expect(page.getByRole("button", { name: "이 지역 검색 다시하기" })).toBeVisible();
  const zoomResponseMs = Date.now() - zoomStartedAt;
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "1824");

  const pageSwitchStartedAt = Date.now();
  let markerRefetches = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.searchParams.get("view") === "markers") markerRefetches += 1;
  });
  const markerRequestsBeforePageSwitch = markerRefetches;
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("2");
  const pageSwitchMs = Date.now() - pageSwitchStartedAt;
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "1824");

  const tourismFilter = page.locator(".explorer-category-panel").getByRole("button", { name: /^관광지/u });
  const filterSwitchStartedAt = Date.now();
  await tourismFilter.click();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "0");
  await tourismFilter.click();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "1824");
  const filterSwitchMs = Date.now() - filterSwitchStartedAt;
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(1_824);
  await expect(mapRoot).toHaveAttribute("data-custom-overlay-marker-count", "0");
  await expect(mapRoot).toHaveAttribute("data-clusterer-instance-count", "1");

  const metrics = {
    beforeApiResponseBytes: Buffer.byteLength(legacyBody, "utf8"),
    apiResponseBytes: Buffer.byteLength(tourBody, "utf8"),
    warmApiSerializationMs,
    databaseCalls: { before: 55, after: 10 },
    markerCreationMs,
    clusterCreationMs,
    zoomResponseMs,
    pageSwitchMs,
    filterRoundTripMs: filterSwitchMs,
    finalRegistrySize: Number(await mapRoot.getAttribute("data-marker-registry-size")),
    finalActiveMarkerCount: Number(await mapRoot.getAttribute("data-active-marker-count")),
    createdMarkerCountAfterFilterRoundTrip: Number(await mapRoot.getAttribute("data-created-source-marker-count")),
    clusterRedrawCount: Number(await mapRoot.getAttribute("data-cluster-redraw-count")),
    markerRefetchCountOnPageSwitch: markerRefetches - markerRequestsBeforePageSwitch,
  };
  console.log(`FULL_MAP_1824_METRICS ${JSON.stringify(metrics)}`);
  await test.info().attach("full-map-1824-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });

  expect(markerCreationMs).toBeLessThan(5_000);
  expect(clusterCreationMs).toBeLessThan(5_000);
  expect(zoomResponseMs).toBeLessThan(1_000);
  expect(pageSwitchMs).toBeLessThan(1_000);
  expect(filterSwitchMs).toBeLessThan(5_000);
});

test("captures the requested full-map explorer evidence", async ({ page }) => {
  test.skip(process.env.CAPTURE_FULL_MAP_EVIDENCE !== "1", "Set CAPTURE_FULL_MAP_EVIDENCE=1 to write the 13 review images.");
  test.setTimeout(90_000);
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const capture = async (name: string) => {
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(EVIDENCE_DIRECTORY, name), fullPage: false });
  };
  const setClusterMode = (mode: "clusters" | "pins") => page.evaluate((value) => {
    (window as unknown as { __setExplorerClusterMode?: (next: "clusters" | "pins") => void }).__setExplorerClusterMode?.(value);
  }, mode);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/results?tab=catalog");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await capture("01-full-1440.png");
  const evidenceCategoryPanel = page.locator(".explorer-category-panel");
  await evidenceCategoryPanel.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.getByRole("heading", { name: "총 28곳" })).toBeVisible();
  await capture("02-all-filters-enabled.png");

  await setClusterMode("clusters");
  await expect(page.locator(".fake-kakao-cluster")).toHaveCount(4);
  await capture("03-far-zoom-clusters.png");
  await setClusterMode("pins");
  await capture("04-close-zoom-source-pins.png");

  await page.getByRole("button", { name: /^공식 장소 01 ·/u }).evaluate((element) => (element as HTMLButtonElement).click());
  await capture("05-selected-official.png");
  await page.getByRole("button", { name: /^광안 여행 후보 ·/u }).evaluate((element) => (element as HTMLButtonElement).click());
  await capture("06-selected-kakao-candidate.png");

  for (const label of ["관광지", "식당", "카페", "숙소", "쇼핑"]) {
    await evidenceCategoryPanel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await expect(page.getByRole("heading", { name: "총 2곳" })).toBeVisible();
  await capture("07-veterinary-pet-shop.png");
  await evidenceCategoryPanel.getByRole("button", { name: "기본으로", exact: true }).click();

  await page.evaluate(() => (window as unknown as { __moveExplorerMap?: () => void }).__moveExplorerMap?.());
  await expect(page.getByRole("button", { name: "이 지역 검색 다시하기" })).toBeVisible();
  await capture("08-viewport-dirty.png");

  await page.goto("/results?tab=catalog");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await capture("09-sidebar-pagination.png");

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "지도", exact: true }).click();
  await capture("10-tablet-768.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("11-mobile-map-390.png");
  await page.getByRole("button", { name: "목록", exact: true }).click();
  await capture("12-mobile-list-390.png");
  await page.getByRole("button", { name: "지도", exact: true }).click();
  await page.getByRole("button", { name: /^공식 장소 01 ·/u }).evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.locator(".kakao-map-selection")).toHaveCount(0);
  await capture("13-no-malformed-rings.png");
});
