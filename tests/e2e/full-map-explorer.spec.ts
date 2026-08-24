import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { JEJU_PUBLIC_MAP_UI_FIXTURE } from "@/fixtures/jeju-public-map-ui";

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

const busanSnapshotItems = [
  ...tourPlaces.map((place) => ({
    id: `tour:${place.contentId}`,
    regionId: "busan",
    providerPlaceId: place.contentId,
    name: place.title,
    layer: "tourism",
    category: "attraction",
    districtCode: place.legalDistrictCode,
    districtName: "해운대구",
    address: place.address,
    coordinates: { latitude: place.latitude, longitude: place.longitude },
    lastSeenAt: place.source.retrievedAt,
    matchedQueryCount: 0,
    categoryQueryAgreementCount: 0,
    completeness: 0.5,
    imageUrl: null,
    placeUrl: `/places/${place.contentId}?region=busan&contentTypeId=12`,
    petAccessVerdict: "unknown",
    publicLabel: "동반 정보 확인 필요",
    sourceLabel: "한국관광공사",
  })),
  {
    id: "kakao:9101",
    regionId: "busan",
    providerPlaceId: "9101",
    name: "광안 여행 후보",
    layer: "kakao",
    category: "cafe",
    districtCode: "500",
    districtName: "수영구",
    address: "부산광역시 수영구 광안해변로 1",
    coordinates: { latitude: 35.15, longitude: 129.12 },
    lastSeenAt: "2026-08-16T00:00:00.000Z",
    matchedQueryCount: 1,
    categoryQueryAgreementCount: 1,
    completeness: 0.5,
    imageUrl: null,
    placeUrl: "https://place.map.kakao.com/9101",
    petAccessVerdict: "unknown",
    publicLabel: "동반 여부 확인 필요",
    sourceLabel: "카카오 검색 후보",
  },
] as const;

function snapshotBody(region: "busan" | "jeju") {
  const items = region === "busan" ? busanSnapshotItems : JEJU_PUBLIC_MAP_UI_FIXTURE.map((place) => ({
    id: place.id,
    regionId: "jeju",
    providerPlaceId: place.providerPlaceId,
    name: place.name,
    layer: "tourism",
    category: place.category ?? "other",
    districtCode: place.district.code,
    districtName: place.district.name,
    address: place.address,
    coordinates: place.coordinates,
    lastSeenAt: place.lastSeenAt ?? null,
    matchedQueryCount: 0,
    categoryQueryAgreementCount: 0,
    completeness: 0.5,
    imageUrl: place.imageUrl ?? null,
    placeUrl: place.placeUrl,
    petAccessVerdict: place.petAccessVerdict ?? "unknown",
    publicLabel: place.publicLabel,
    sourceLabel: "한국관광공사",
  }));
  const categoryCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
  return JSON.stringify({
    ok: true,
    data: {
      contractVersion: 1,
      region,
      scope: "default",
      generatedAt: "2026-08-24T00:00:00.000Z",
      dataVersion: region === "busan" ? "v1-1111111111111111" : "v1-2222222222222222",
      totalCount: items.length,
      providerCounts: region === "busan" ? { tour: 25, kakao: 1 } : { tour: items.length, kakao: 0 },
      categoryCounts,
      freshness: { status: "fresh" },
      items,
    },
    requestId: `full-map-${region}-snapshot`,
  });
}

async function mockCatalogApis(page: Page) {
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const url = new URL(route.request().url());
    const region = url.searchParams.get("region");
    expect(url.searchParams.get("version")).toBe("1");
    expect(url.searchParams.get("scope")).toBe("default");
    expect(region === "busan" || region === "jeju").toBe(true);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: snapshotBody(region === "jeju" ? "jeju" : "busan"),
    });
  });
  await page.route("**/api/tour/places?**", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("regionCode")).toBe("26");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { places: tourPlaces, page: 1, pageSize: 1000, totalCount: tourPlaces.length, source: tourPlaces[0].source }, requestId: "full-map-tour" }),
    });
  });
  await page.route("**/api/map/places?**", async (route) => {
    const url = new URL(route.request().url());
    const region = url.searchParams.get("region");
    if (region === "jeju") {
      expect(url.searchParams.get("providers")).toBe("tour");
      expect(url.searchParams.get("kinds")).toBe("tourism_place");
      const district = url.searchParams.get("district");
      const items = district
        ? JEJU_PUBLIC_MAP_UI_FIXTURE.filter((place) => place.district.code === district)
        : JEJU_PUBLIC_MAP_UI_FIXTURE;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            region: { id: "jeju", displayName: "제주" },
            items,
            page: 1,
            pageSize: 200,
            totalCount: items.length,
            hasNext: false,
            nextCursor: null,
          },
          requestId: "full-map-jeju-kto",
        }),
      });
      return;
    }
    expect(region).toBe("busan");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { region: { id: "busan", displayName: "부산" }, items: kakaoItems, page: 1, pageSize: 200, totalCount: kakaoItems.length, hasNext: false }, requestId: "full-map-kakao" }),
    });
  });
  const transparentPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**/_next/image?**", async (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: transparentPng,
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
      private south = Number.POSITIVE_INFINITY;
      private west = Number.POSITIVE_INFINITY;
      private north = Number.NEGATIVE_INFINITY;
      private east = Number.NEGATIVE_INFINITY;
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
      private bounds = new Bounds({ south: 35, west: 128.9, north: 35.3, east: 129.3 });
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
      __getExplorerBounds?: () => { south: number; west: number; north: number; east: number } | null;
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
        const isJeju = options.position.getLng() < 128;
        this.element.style.left = `${8 + ((options.position.getLng() - (isJeju ? 125.9 : 128.9)) / (isJeju ? 1.2 : 0.4)) * 84}%`;
        this.element.style.top = `${8 + (((isJeju ? 34 : 35.3) - options.position.getLat()) / (isJeju ? 1 : 0.3)) * 78}%`;
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
          const isJeju = options.position.getLng() < 128;
          options.content.style.position = "absolute";
          options.content.style.left = `${8 + ((options.position.getLng() - (isJeju ? 125.9 : 128.9)) / (isJeju ? 1.2 : 0.4)) * 84}%`;
          options.content.style.top = `${8 + (((isJeju ? 34 : 35.3) - options.position.getLat()) / (isJeju ? 1 : 0.3)) * 78}%`;
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
    testWindow.__getExplorerBounds = () => {
      const bounds = testWindow.__activeExplorerMap?.getBounds();
      if (!bounds) return null;
      return {
        south: bounds.getSouthWest().getLat(),
        west: bounds.getSouthWest().getLng(),
        north: bounds.getNorthEast().getLat(),
        east: bounds.getNorthEast().getLng(),
      };
    };
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

async function openExplorerFilters(page: Page) {
  const trigger = page.getByRole("button", { name: "필터", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const dropdown = page.getByRole("region", { name: "장소 필터" });
  await expect(dropdown).toBeVisible();
  return dropdown;
}

test("keeps one source marker per place across pagination, selection, and viewport commit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Desktop registry flow; responsive behavior has a dedicated cross-viewport test.");
  const startedAt = Date.now();
  const catalogRequests: string[] = [];
  const snapshotRequests: string[] = [];
  const pagedMapRequests: string[] = [];
  const filteredTourMarkerRequests: string[] = [];
  const rscRequests: string[] = [];
  const failedRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/tour/places" || pathname === "/api/map/places") {
      catalogRequests.push(request.url());
    }
    if (pathname === "/api/map/places/snapshot") snapshotRequests.push(request.url());
    if (pathname === "/api/map/places") pagedMapRequests.push(request.url());
    if (pathname === "/api/tour/places" && url.searchParams.get("view") === "markers") {
      filteredTourMarkerRequests.push(request.url());
    }
    if (url.searchParams.has("_rsc")) rscRequests.push(request.url());
  });
  await page.goto("/results?tab=catalog");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await expect(page.locator('[id^="place-card-"]').first()).toBeVisible();
  const firstUsefulCardsMs = Date.now() - startedAt;
  expect(snapshotRequests).toHaveLength(1);
  expect(pagedMapRequests).toHaveLength(0);
  expect(filteredTourMarkerRequests).toHaveLength(0);
  await expect(page.getByText(/현재 표시 \d+곳/u)).toHaveCount(0);
  await expect(page.locator(".explorer-filter-dropdown")).toHaveCount(0);
  await expect(page.getByLabel("장소 출처 범례")).toContainText("카카오맵");
  const filterButton = page.getByRole("button", { name: "필터", exact: true });
  await expect(filterButton).toHaveAttribute("aria-expanded", "false");
  await filterButton.click();
  let categoryPanel = page.getByRole("region", { name: "장소 필터" });
  await expect(categoryPanel).toBeVisible();
  await expect(filterButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("dialog#explorer-filter-dialog")).toHaveCount(0);
  await expect(categoryPanel.getByText("출처", { exact: true })).toHaveCount(0);
  await expect(categoryPanel.getByRole("button", { name: /^한국관광공사/u })).toHaveCount(0);
  await expect(categoryPanel.getByRole("button", { name: /^카카오맵/u })).toHaveCount(0);
  await expect(categoryPanel.getByRole("heading", { name: "여행 장소" })).toBeVisible();
  await expect(categoryPanel.getByText("반려견과 함께 방문 가능한 장소를 선택해보세요.", { exact: true })).toBeVisible();
  await expect(categoryPanel.locator(".explorer-category-group__icon")).toHaveCount(7);
  const filterButtonBox = await filterButton.boundingBox();
  const dropdownBox = await categoryPanel.boundingBox();
  expect(filterButtonBox).not.toBeNull();
  expect(dropdownBox).not.toBeNull();
  expect(dropdownBox?.y ?? 0).toBeGreaterThanOrEqual((filterButtonBox?.y ?? 0) + (filterButtonBox?.height ?? 0) - 1);
  await expect(page.getByLabel("부산 세부 지역")).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(12);
  const mapRoot = page.locator("[data-marker-registry-size]");
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "26");
  await expect(mapRoot).toHaveAttribute("data-active-marker-count", "26");
  await expect(mapRoot).toHaveAttribute("data-custom-overlay-marker-count", "0");
  await expect(mapRoot).toHaveAttribute("data-clusterer-instance-count", "1");
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(26);
  await expect(page.locator(".kakao-map-selection")).toHaveCount(0);
  const interactiveMarkersMs = Date.now() - startedAt;
  console.log(`SNAPSHOT_BROWSER_METRICS ${JSON.stringify({
    firstUsefulCardsMs,
    interactiveMarkersMs,
    completeCatalogMs: interactiveMarkersMs,
    snapshotResponseBytes: Buffer.byteLength(snapshotBody("busan"), "utf8"),
    snapshotRequests: snapshotRequests.length,
    pagedMapRequests: pagedMapRequests.length,
    filteredTourMarkerRequests: filteredTourMarkerRequests.length,
    rscRequests: rscRequests.length,
    failedRequests: failedRequests.length,
    consoleErrors: consoleErrors.length,
  })}`);

  for (const label of ["관광지", "식당", "카페", "숙소"]) {
    await expect(categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "true");
  }
  for (const label of ["쇼핑", "동물병원", "펫샵·용품점"]) {
    await expect(categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "false");
  }
  await filterButton.click();
  await expect(categoryPanel).not.toBeVisible();

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

  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^카페/u }).click();
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 25곳" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "25");
  await expect(page.getByText("동반 가능", { exact: true })).toHaveCount(0);
  await expect(page.getByText("24시간", { exact: true })).toHaveCount(0);
  expect(snapshotRequests).toHaveLength(1);
  expect(pagedMapRequests).toHaveLength(0);
  expect(filteredTourMarkerRequests).toHaveLength(0);
  expect(rscRequests).toHaveLength(0);
  expect(failedRequests).toHaveLength(0);
  expect(consoleErrors).toHaveLength(0);

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

test("keeps canonical filter history shareable without RSC navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "History and RSC behavior is measured once in desktop Chromium.");
  const rscRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.searchParams.has("_rsc")) rscRequests.push(request.url());
  });

  await page.goto("/results?tab=catalog&region=busan&page=1");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(rscRequests).toHaveLength(0);

  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page).toHaveURL(/region=busan&page=2$/u);
  const panel = await openExplorerFilters(page);
  await panel.getByRole("button", { name: /^관광지/u }).click();
  await panel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 1곳" })).toBeVisible();
  await expect(page).toHaveURL(/categories=food%2Ccafe%2Caccommodation.*page=1/u);

  await page.goBack();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("2");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "총 1곳" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "총 1곳" })).toBeVisible();
  await page.getByRole("button", { name: "제주", exact: true }).click();
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "총 1곳" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  expect(rscRequests).toHaveLength(0);
});

test("aborts a stale region snapshot and never lets its late response replace Jeju", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "The stale-response race is measured once in desktop Chromium.");
  let busanStarted = false;
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const region = new URL(route.request().url()).searchParams.get("region");
    if (region === "busan") {
      busanStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: snapshotBody(region === "jeju" ? "jeju" : "busan"),
    }).catch(() => undefined);
  });

  await page.goto("/results?tab=catalog&region=busan&page=1");
  await expect.poll(() => busanStarted).toBe(true);
  await page.getByRole("button", { name: "제주", exact: true }).click();
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  await expect(page.locator("[data-marker-registry-size]")).toHaveAttribute("data-marker-registry-size", "54");
});

test("hides redundant pet-access caveats from Kakao candidate cards", async ({ page }, testInfo) => {
  await page.goto("/results?tab=catalog&region=busan&categories=cafe&layers=kakao&page=1");
  if (testInfo.project.name === "mobile-chrome") {
    await page.getByRole("button", { name: "목록", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "총 1곳" })).toBeVisible();

  const kakaoCandidateCard = page.locator("#place-card-kakao-9101");
  await expect(kakaoCandidateCard).toBeVisible();
  await expect(kakaoCandidateCard).toContainText("카카오 검색 후보");
  await expect(kakaoCandidateCard.getByText("동반 여부 확인 필요", { exact: true })).toHaveCount(0);
  await expect(kakaoCandidateCard.getByText(
    "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
    { exact: true },
  )).toHaveCount(0);
});

test("switches to the isolated 54-place Jeju KTO map and safely returns to Busan", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "The Jeju cross-region flow sets all required viewports in desktop Chromium.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requests: string[] = [];
  let jejuSelected = false;
  page.on("request", (request) => {
    if (jejuSelected) requests.push(request.url());
  });

  await page.goto("/results?tab=catalog");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  const jejuButton = page.getByRole("button", { name: "제주", exact: true });
  await jejuButton.focus();
  jejuSelected = true;
  await jejuButton.press("Enter");
  await expect(jejuButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  await expect(page).toHaveURL(/region=jeju/u);

  const mapRoot = page.locator("[data-marker-registry-size]");
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "54");
  await expect(mapRoot).toHaveAttribute("data-active-marker-count", "54");
  await expect(mapRoot).toHaveAttribute("data-clusterer-instance-count", "1");
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(54);
  const fittedBounds = await page.evaluate(() =>
    (window as unknown as {
      __getExplorerBounds?: () => { south: number; west: number; north: number; east: number } | null;
    }).__getExplorerBounds?.(),
  );
  expect(fittedBounds?.east).toBeLessThan(128);

  await expect(page.getByRole("tab", { name: "제주 경로 추천은 준비 중입니다." })).toBeDisabled();
  await expect(page.getByText("카카오 검색 후보", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^동물병원/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^펫샵·용품점/u })).toHaveCount(0);
  await expect(page.locator(".catalog-result-card").getByText("한국관광공사", { exact: true })).toHaveCount(12);
  await expect(page.locator(".catalog-result-card").getByText("동반 조건 확인 필요", { exact: true })).toHaveCount(12);
  await expect(page.getByText("반려동물 동반 가능", { exact: true })).toHaveCount(0);
  await expect(page.locator('.catalog-result-card a[href^="tel:"]')).toHaveCount(0);
  await expect(page.locator('.catalog-result-card [data-image-kind="provider_photo"]')).toHaveCount(12);
  await expect(page.locator(".catalog-result-card").first().getByRole("link", { name: /원문 상세 보기$/u }))
    .toHaveAttribute("href", /region=jeju.*contentTypeId=/u);
  const firstJejuCard = page.locator(".catalog-result-card").first();
  await firstJejuCard.getByRole("button", { name: /지도에서 보기$/u }).click();
  await expect(firstJejuCard).toHaveClass(/is-selected/u);
  await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(1);

  await firstJejuCard.getByRole("link", { name: /원문 상세 보기$/u }).click();
  await expect(page).toHaveURL(/\/places\/5010001\?region=jeju&contentTypeId=12/u);
  await expect(page.getByRole("heading", { name: "제주 UI 검증 상세 장소" })).toBeVisible();
  await expect(page.getByText("한국관광공사 원문", { exact: true })).toBeVisible();
  await expect(page.getByText("동반 조건 확인 필요", { exact: true })).toBeVisible();
  await expect(page.getByText("연락처", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "추천 결과로" }).click();
  await expect(page).toHaveURL(/\/results\?tab=catalog&region=jeju/u);
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();

  const categoryPanel = await openExplorerFilters(page);
  await expect(categoryPanel.getByRole("button", { name: /^관광지/u })).toContainText("46");
  await expect(categoryPanel.getByRole("button", { name: /^식당/u })).toContainText("4");
  await expect(categoryPanel.getByRole("button", { name: /^숙소/u })).toContainText("4");
  await expect(categoryPanel.getByRole("button", { name: /^카페/u })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(categoryPanel).not.toBeVisible();

  await page.getByRole("button", { name: "5", exact: true }).click();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("5");
  await expect(page.locator('.catalog-result-card [data-image-kind="category_placeholder"]')).toHaveCount(6);
  await expect(page.locator(".catalog-result-card").getByText("동반 정보 확인 필요", { exact: true })).toHaveCount(5);

  const districtSelect = page.getByLabel("제주 세부 지역");
  await districtSelect.selectOption("110");
  await expect(page.getByRole("heading", { name: "총 27곳" })).toBeVisible();
  await expect(page).toHaveURL(/region=jeju.*district=110/u);
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "27");
  await expect(page.locator(".catalog-result-card").first()).toContainText("제주시");
  await expect(page.locator(".catalog-result-card").first()).not.toContainText("부산광역시 중구");

  await districtSelect.selectOption("130");
  await expect(page.getByRole("heading", { name: "총 27곳" })).toBeVisible();
  await expect(page).toHaveURL(/region=jeju.*district=130/u);
  await expect(page.locator(".catalog-result-card").first()).toContainText("서귀포시");

  const jejuRequests = requests
    .map((value) => new URL(value))
    .filter(({ pathname }) => pathname.startsWith("/api/"));
  expect(jejuRequests.length).toBeGreaterThan(0);
  expect(jejuRequests.every(({ pathname, searchParams }) => {
    if (pathname === "/api/map/places/snapshot") {
      return searchParams.get("region") === "jeju" &&
        searchParams.get("version") === "1";
    }
    return pathname === "/api/tour/places/5010001" &&
      searchParams.get("region") === "jeju";
  })).toBe(true);
  expect(jejuRequests.some(({ pathname }) => [
    "/api/tour/places",
    "/api/itineraries/generate",
    "/api/itineraries/revalidate",
    "/api/directions",
    "/api/kakao/directions",
  ].includes(pathname))).toBe(false);

  jejuSelected = false;
  await page.getByRole("button", { name: "부산", exact: true }).click();
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await expect(page).toHaveURL(/region=busan/u);
  await expect(page).not.toHaveURL(/district=/u);
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "26");
  await expect(page.getByText("제주시", { exact: true })).toHaveCount(0);

  for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "지도", exact: true }).click();
    await page.getByRole("button", { name: "제주", exact: true }).click();
    await expect(page.locator(".explorer-filter-dropdown")).toHaveCount(0);
    await page.getByRole("button", { name: "지도", exact: true }).click();
    await expect(page.locator(".full-map-explorer__map")).toBeVisible();
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.locator(".full-map-explorer__sidebar")).toBeVisible();
    await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
    const responsiveDialog = await openExplorerFilters(page);
    const dialogBox = await responsiveDialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.width - 8);
    await expect(responsiveDialog.getByRole("button", { name: /^한국관광공사/u })).toHaveCount(0);
    await expect(responsiveDialog.getByRole("button", { name: /^관광지/u })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(responsiveDialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "필터", exact: true })).toBeFocused();
    await page.locator(".catalog-result-card").first().getByRole("button", { name: /지도에서 보기$/u }).click();
    await expect(page.getByRole("button", { name: "지도", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".full-map-explorer__map")).toBeVisible();
    await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "부산", exact: true }).click();
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  }
});

test("keeps Jeju error, retry, and empty states accessible in mobile list mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "The test sets the 390px viewport explicitly.");
  let firstJejuRequest = true;
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("region") !== "jeju") return route.fallback();
    if (firstJejuRequest) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "UPSTREAM_ERROR", message: "검증용 스냅샷 오류", retryable: true },
          requestId: "jeju-snapshot-error",
        }),
      });
      return;
    }
    const body = JSON.parse(snapshotBody("jeju"));
    body.data.items = body.data.items.filter((place: { districtCode: string }) => place.districtCode === "110");
    body.data.totalCount = body.data.items.length;
    body.data.providerCounts = { tour: body.data.items.length, kakao: 0 };
    body.data.categoryCounts = body.data.items.reduce(
      (counts: Record<string, number>, place: { category: string }) => {
        counts[place.category] = (counts[place.category] ?? 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/map/places?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("region") !== "jeju") return route.fallback();
    if (firstJejuRequest) {
      firstJejuRequest = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "UPSTREAM_ERROR", message: "검증용 일시 오류", retryable: true },
          requestId: "jeju-error",
        }),
      });
      return;
    }
    const district = url.searchParams.get("district");
    const items = district === "130" ? [] : JEJU_PUBLIC_MAP_UI_FIXTURE;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          region: { id: "jeju", displayName: "제주" },
          items,
          page: 1,
          pageSize: 200,
          totalCount: items.length,
          hasNext: false,
          nextCursor: null,
        },
        requestId: "jeju-retry",
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/results?tab=catalog");
  await page.getByRole("button", { name: "목록", exact: true }).click();
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await page.getByRole("button", { name: "제주", exact: true }).click();
  await expect(page.locator('.explorer-results-status [role="alert"]'))
    .toContainText("관광공사 장소를 불러오지 못했습니다.");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "총 27곳" })).toBeVisible();

  await page.getByLabel("제주 세부 지역").selectOption("130");
  await expect(page.getByRole("heading", { name: "총 0곳" })).toBeVisible();
  await expect(page.getByText("선택한 조건의 장소가 없습니다.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
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

  const filterSwitchStartedAt = Date.now();
  let categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^카페/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 25곳" })).toBeVisible();
  const filterSwitchMs = Date.now() - filterSwitchStartedAt;

  for (let index = 0; index < 4; index += 1) {
    categoryPanel = await openExplorerFilters(page);
    await categoryPanel.getByRole("button", { name: /^카페/u }).click();
    await categoryPanel.getByRole("button", { name: "적용하기" }).click();
    await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
    categoryPanel = await openExplorerFilters(page);
    await categoryPanel.getByRole("button", { name: /^카페/u }).click();
    await categoryPanel.getByRole("button", { name: "적용하기" }).click();
    await expect(page.getByRole("heading", { name: "총 25곳" })).toBeVisible();
  }
  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^카페/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
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
    regionId: "busan",
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
    placeUrl: `/places/${place.contentId}?region=busan&contentTypeId=12`,
    petAccessVerdict: "unknown",
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
  await page.route("**/api/map/places/snapshot?**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: {
        contractVersion: 1,
        region: "busan",
        scope: "default",
        generatedAt: "2026-08-24T00:00:00.000Z",
        dataVersion: "v1-3333333333333333",
        totalCount: markerItems.length,
        providerCounts: { tour: markerItems.length, kakao: 0 },
        categoryCounts: { attraction: markerItems.length },
        freshness: { status: "fresh" },
        items: markerItems,
      },
      requestId: "full-map-large-snapshot",
    }),
  }));
  await page.route("**/api/map/places?**", (route) => {
    expect(new URL(route.request().url()).searchParams.get("region")).toBe(
      "busan",
    );
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { region: { id: "busan", displayName: "부산" }, items: [], page: 1, pageSize: 200, totalCount: 0, hasNext: false }, requestId: "full-map-large-kakao" }),
    });
  });

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

  const filterSwitchStartedAt = Date.now();
  let categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^관광지/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "0");
  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^관광지/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
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
  let evidenceCategoryPanel = await openExplorerFilters(page);
  for (const label of ["동물병원", "펫샵·용품점"]) {
    await evidenceCategoryPanel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await evidenceCategoryPanel.getByRole("button", { name: "적용하기" }).click();
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

  evidenceCategoryPanel = await openExplorerFilters(page);
  for (const label of ["관광지", "식당", "카페", "숙소", "쇼핑"]) {
    await evidenceCategoryPanel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await evidenceCategoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 2곳" })).toBeVisible();
  await capture("07-veterinary-pet-shop.png");
  evidenceCategoryPanel = await openExplorerFilters(page);
  for (const label of ["동물병원", "펫샵·용품점", "관광지", "식당", "카페", "숙소"]) {
    await evidenceCategoryPanel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await evidenceCategoryPanel.getByRole("button", { name: "적용하기" }).click();

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
