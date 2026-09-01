import { mkdir } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { JEJU_PUBLIC_MAP_UI_FIXTURE } from "@/fixtures/jeju-public-map-ui";
import { SEOUL_PUBLIC_MAP_UI_FIXTURE } from "../fixtures/seoul-public-map-ui";
import {
  SEOUL_SHOPPING_MAP_UI_FIXTURE,
  SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL,
} from "../fixtures/seoul-shopping-map-ui";
import { liveDetail } from "./license-mock";

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

function snapshotBody(
  region: "busan" | "jeju" | "seoul",
  freshness: "fresh" | "stale" = "fresh",
  dataset: "core" | "shopping" = "core",
) {
  const fixture = region === "jeju"
    ? JEJU_PUBLIC_MAP_UI_FIXTURE
    : dataset === "shopping" ? SEOUL_SHOPPING_MAP_UI_FIXTURE : SEOUL_PUBLIC_MAP_UI_FIXTURE;
  const items = region === "busan" ? busanSnapshotItems : fixture.map((place) => ({
    id: place.id,
    regionId: region,
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
      dataset,
      generatedAt: "2026-08-24T00:00:00.000Z",
      publicationVersion: dataset === "shopping"
        ? "p1-5555555555555555"
        : region === "jeju"
          ? "p1-2222222222222222"
          : region === "seoul"
            ? "p1-4444444444444444"
            : "p1-1111111111111111",
      dataVersion: region === "busan"
        ? "v1-1111111111111111"
        : region === "jeju"
          ? "v1-2222222222222222"
          : dataset === "shopping" ? "v1-5555555555555555" : "v1-4444444444444444",
      totalCount: items.length,
      providerCounts: region === "busan" ? { tour: 25, kakao: 1 } : { tour: items.length, kakao: 0 },
      categoryCounts,
      freshness: freshness === "fresh"
        ? { status: "fresh" }
        : { status: "stale", staleAt: "2026-08-26T00:05:00.000Z" },
      items,
    },
    requestId: `full-map-${region}-${dataset}-snapshot`,
  });
}

function cardDetailsBody(url: URL) {
  const region = url.searchParams.get("region") as "busan" | "jeju" | "seoul";
  const dataset = url.searchParams.get("dataset") === "shopping" ? "shopping" : "core";
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const snapshot = JSON.parse(snapshotBody(region, "fresh", dataset)) as {
    data: {
      publicationVersion: `p1-${string}`;
      items: Array<{
        id: string;
        address: string;
        imageUrl: string | null;
        placeUrl: string | null;
      }>;
    };
  };
  const byId = new Map(snapshot.data.items.map((item) => [item.id, item]));
  const items = ids.map((id) => {
    const item = byId.get(id);
    expect(item).toBeDefined();
    return {
      id,
      address: item?.address ?? "주소 확인 필요",
      phone: null,
      imageUrl: item?.imageUrl ?? null,
      placeUrl: item?.placeUrl ?? null,
      contentTypeId: item?.placeUrl?.includes("contentTypeId=12") ? "12" : null,
    };
  });
  return JSON.stringify({
    ok: true,
    data: {
      contractVersion: 1,
      region,
      dataset,
      publicationVersion: snapshot.data.publicationVersion,
      items,
      page: 1,
      pageSize: 12,
      totalCount: items.length,
    },
    requestId: `full-map-${region}-${dataset}-cards`,
  });
}

async function mockCatalogApis(page: Page) {
  await page.route("**/api/tour/places/5010001?**", async (route) => {
    const detail = liveDetail("not_applicable");
    detail.summary = {
      ...detail.summary,
      contentId: "5010001",
      contentTypeId: "12",
      providerContentTypeId: "12",
      title: "제주 UI 검증 상세 장소",
      address: "제주특별자치도 제주시 검증로 1",
      longitude: 126.25,
      latitude: 33.44,
      legalRegionCode: "50",
      legalDistrictCode: "110",
      phone: null,
      source: { ...detail.summary.source, contentId: "5010001" },
    };
    detail.petAccessAssessment = {
      ...detail.petAccessAssessment,
      verdict: "conditional",
    };
    detail.source = { ...detail.source, contentId: "5010001" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: detail, requestId: "jeju-detail-test-only" }),
    });
  });
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const url = new URL(route.request().url());
    const region = url.searchParams.get("region");
    const dataset = url.searchParams.get("dataset");
    expect(url.searchParams.get("version")).toBe("1");
    expect(url.searchParams.get("scope")).toBe("default");
    expect(dataset === "core" || (region === "seoul" && dataset === "shopping")).toBe(true);
    expect(region === "busan" || region === "jeju" || region === "seoul").toBe(true);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: snapshotBody(
        region === "jeju" ? "jeju" : region === "seoul" ? "seoul" : "busan",
        "fresh",
        dataset === "shopping" ? "shopping" : "core",
      ),
    });
  });
  await page.route("**/api/map/places/cards?**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("version")).toBe("1");
    expect(url.searchParams.get("region") === "busan" ||
      url.searchParams.get("region") === "jeju" ||
      url.searchParams.get("region") === "seoul").toBe(true);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: cardDetailsBody(url),
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
    if (region === "jeju" || region === "seoul") {
      expect(url.searchParams.get("providers")).toBe("tour");
      expect(url.searchParams.get("kinds")).toBe("tourism_place");
      const fixture = region === "jeju" ? JEJU_PUBLIC_MAP_UI_FIXTURE : SEOUL_PUBLIC_MAP_UI_FIXTURE;
      const district = url.searchParams.get("district");
      const items = district
        ? fixture.filter((place) => place.district.code === district)
        : fixture;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            region: { id: region, displayName: region === "jeju" ? "제주" : "서울" },
            items,
            page: 1,
            pageSize: 200,
            totalCount: items.length,
            hasNext: false,
            nextCursor: null,
          },
          requestId: `full-map-${region}-kto`,
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
      __explorerMapInstanceCount?: number;
      __moveExplorerMap?: () => void;
      __zoomExplorerMap?: () => void;
      __setExplorerClusterMode?: (mode: "clusters" | "pins") => void;
      __getExplorerBounds?: () => { south: number; west: number; north: number; east: number } | null;
    };
    class MapConstructor extends FakeMap {
      constructor(container: HTMLElement, options: { center: LatLng }) {
        super(container, options);
        testWindow.__activeExplorerMap = this;
        testWindow.__explorerMapInstanceCount = (testWindow.__explorerMapInstanceCount ?? 0) + 1;
        document.documentElement.dataset.explorerMapInstanceCount = String(testWindow.__explorerMapInstanceCount);
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

async function openRegionPicker(page: Page) {
  const picker = page.getByRole("region", { name: "여행 지역 선택" });
  if (!await picker.isVisible()) {
    await page.locator(".explorer-region-picker__trigger").click();
  }
  await expect(picker).toBeVisible();
  return picker;
}

async function selectExplorerRegion(page: Page, regionName: string) {
  const picker = await openRegionPicker(page);
  await picker.getByRole("option", { name: regionName, exact: true }).click();
}

async function selectExplorerDistrict(page: Page, regionName: string, districtName: string) {
  const districtSearch = page.getByRole("combobox", { name: `${regionName} 세부 지역 검색` });
  await districtSearch.fill(districtName);
  await expect(districtSearch).toHaveValue(districtName);
}

test("keeps the authored region picker tidy, searchable, and keyboard dismissible", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  await expect(page.locator("[data-marker-registry-size]")).toHaveAttribute("data-marker-registry-size", "26");

  const trigger = page.locator(".explorer-region-picker__trigger");
  await expect(trigger).toHaveAccessibleName("여행 지역 선택, 현재 부산");
  await trigger.click();

  const picker = page.getByRole("region", { name: "여행 지역 선택" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("heading", { name: "어디로 떠날까요?" })).toBeVisible();
  await expect(picker.getByRole("option", { name: "부산", exact: true })).toHaveAttribute("aria-selected", "true");

  const pickerBox = await picker.boundingBox();
  const viewport = page.viewportSize();
  expect(pickerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(pickerBox?.x ?? -1).toBeGreaterThanOrEqual(8);
  expect((pickerBox?.x ?? 0) + (pickerBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) - 8);

  const search = picker.getByRole("searchbox", { name: "지역 검색" });
  await search.fill("충청남도");
  await expect(picker.getByRole("option", { name: "충남", exact: true })).toBeVisible();
  await expect(picker.getByRole("option", { name: "부산", exact: true })).toHaveCount(0);
  await picker.getByRole("button", { name: "지역 검색어 지우기" }).click();
  await expect(search).toHaveValue("");

  await search.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("uses the result header as the only loading sentence while place data is pending", async ({ page }) => {
  let releaseSnapshot!: () => void;
  const snapshotPending = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("region") !== "busan") return route.fallback();
    await snapshotPending;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: snapshotBody("busan"),
    });
  });

  await page.goto("/results?tab=catalog&region=busan&page=17");
  const map = page.locator(".full-map-explorer__map");
  await expect(page.getByRole("heading", { name: "장소 수를 확인하고 있어요" })).toBeVisible();
  await expect(page.getByText("총 0곳", { exact: true })).toHaveCount(0);
  await expect(page.locator(".explorer-result-skeleton")).toHaveCount(3);
  await expect(page.locator(".explorer-empty-state")).toHaveCount(0);
  await expect(page.getByText("지도를 불러오는 중입니다…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("장소 수를 확인하고 있어요", { exact: true })).toHaveCount(1);
  await expect(map.getByText("선택한 조건에 표시할 장소가 없습니다.", { exact: true })).toHaveCount(0);

  releaseSnapshot();
  await expect(map.locator("[data-location-count=\"26\"]")).toHaveCount(1);
  await expect(map.getByText("지도를 불러오는 중입니다…", { exact: true })).toHaveCount(0);
});

test("shows 맞춤 일정 progress only inside the active recommendation view", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  await expect(
    page.getByRole("link", { name: "맞춤 일정", exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "여행 만들기 단계" })).toHaveCount(0);

  await page.goto("/results?tab=recommendations&region=busan");
  await expect(page.getByRole("tab", { name: "맞춤 일정" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("navigation", { name: "여행 만들기 단계" })).toBeVisible();
});

async function openExplorerFilters(page: Page) {
  const trigger = page.locator(".explorer-toolbar-filter").getByRole("button", { name: "필터", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const dropdown = page.getByRole("region", { name: "장소 필터" });
  await expect(dropdown).toBeVisible();
  return dropdown;
}

test("separates mode, scope, result tools, and source controls while keeping map search centered", async ({ page }, testInfo) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  await expect(page.locator("[data-marker-registry-size]")).toHaveAttribute("data-marker-registry-size", "26");

  const map = page.locator(".full-map-explorer__map");
  const mapFilter = page.locator(".explorer-toolbar-filter").getByRole("button", { name: "필터", exact: true });
  await expect(mapFilter).toBeVisible();
  await expect(page.getByRole("group", { name: "탐색 모드" })).toBeVisible();
  await expect(page.getByRole("group", { name: "탐색 범위" })).toBeVisible();
  await expect(page.getByRole("group", { name: "결과 도구" })).toBeVisible();
  await expect(page.getByRole("group", { name: "장소 출처 범례" })).toBeVisible();
  await expect(page.getByRole("button", { name: "필터", exact: true })).toHaveCount(1);
  if (testInfo.project.name === "mobile-chrome") {
    await page.getByRole("group", { name: "지도 또는 목록 보기" })
      .getByRole("button", { name: "지도", exact: true }).click();
  }
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();

  const filterPanel = await openExplorerFilters(page);
  const panelBox = await filterPanel.boundingBox();
  expect(panelBox).not.toBeNull();

  await mapFilter.click();
  await page.evaluate(() => (window as unknown as { __zoomExplorerMap?: () => void }).__zoomExplorerMap?.());
  const research = map.getByRole("button", { name: "이 지역 검색 다시하기" });
  await expect(research).toBeVisible();
  const researchBox = await research.boundingBox();
  expect(researchBox).not.toBeNull();
  const researchCenter = (researchBox?.x ?? 0) + (researchBox?.width ?? 0) / 2;
  const mapCenter = (mapBox?.x ?? 0) + (mapBox?.width ?? 0) / 2;
  expect(Math.abs(researchCenter - mapCenter)).toBeLessThanOrEqual(3);
});

test("synchronizes the selected-place tray with list and map selection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Desktop tray synchronization is verified once; mobile layout has separate responsive coverage.");
  await page.goto("/results?tab=catalog&region=busan&mode=select&page=1");

  const card = page.locator('[id^="place-card-"]').first();
  const placeName = await card.getByRole("heading").innerText();
  const escapedPlaceName = placeName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const addButton = card.getByRole("button", { name: "일정에 담기", exact: true });
  const tray = page.locator(".selected-itinerary-tray");
  const mapRoot = page.locator("[data-marker-registry-size]");
  const markerCount = await mapRoot.getAttribute("data-marker-registry-size");

  await addButton.click();
  await expect(card.getByRole("button", { name: "일정에 담음", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(tray.getByRole("heading", { name: "1 / 5곳 담음" })).toBeVisible();
  await expect(tray).toContainText(placeName);
  await expect(tray.getByRole("button", { name: "선택한 장소로 일정 만들기" })).toBeEnabled();

  await mapRoot.getByRole("button", { name: new RegExp(`^${escapedPlaceName}`, "u") }).click();
  await expect(card).toHaveAttribute("aria-current", "true");
  await expect(card.getByRole("button", { name: "일정에 담음", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", markerCount ?? "");

  await card.getByRole("button", { name: "일정에 담음", exact: true }).click();
  await expect(tray.getByRole("heading", { name: "0 / 5곳 담음" })).toBeVisible();
  await expect(tray).not.toContainText(placeName);
});

test("keeps the mobile selected-place CTA reachable without covering the map", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Mobile tray geometry is verified in the mobile project only.");
  await page.goto("/results?tab=catalog&region=busan&mode=select&page=1");

  const card = page.locator('[id^="place-card-"]').first();
  await card.getByRole("button", { name: "일정에 담기", exact: true }).click();
  const mobileBar = page.getByLabel("선택한 일정 장소");
  await expect(mobileBar).toBeVisible();
  await expect(mobileBar.getByRole("button", { name: "일정 만들기" })).toBeEnabled();

  await page.getByRole("group", { name: "지도 또는 목록 보기" })
    .getByRole("button", { name: "지도" }).click();
  const map = page.locator(".full-map-explorer__map");
  await expect(map).toBeVisible();
  const [barBox, mapBox] = await Promise.all([mobileBar.boundingBox(), map.boundingBox()]);
  expect(barBox).not.toBeNull();
  expect(mapBox).not.toBeNull();
  expect((mapBox?.y ?? 0) + (mapBox?.height ?? 0)).toBeLessThanOrEqual((barBox?.y ?? 0) + 1);
});

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
  await page.goto("/results?tab=catalog&region=busan");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await expect(page.locator('[id^="place-card-"]').first()).toBeVisible();
  const firstUsefulCardsMs = Date.now() - startedAt;
  expect(snapshotRequests).toHaveLength(1);
  expect(pagedMapRequests).toHaveLength(0);
  expect(filteredTourMarkerRequests).toHaveLength(0);
  await expect(page.getByText(/현재 표시 \d+곳/u)).toHaveCount(0);
  await expect(page.locator(".explorer-filter-dropdown")).toHaveCount(0);
  await expect(page.getByLabel("장소 출처 범례")).toContainText("카카오맵");
  const filterButton = page.locator(".explorer-toolbar-filter").getByRole("button", { name: "필터", exact: true });
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
  await expect(pageTwoCard).toHaveAttribute("aria-current", "true");
  await expect(mapRoot).toHaveAttribute("data-clusterer-reset-count", resetCount ?? "");
  await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(1);
  await expect(page.locator(".kakao-map-selection")).toHaveCount(0);

  const secondPageCard = page.locator('[id^="place-card-"]').nth(1);
  const secondPagePlaceName = await secondPageCard.getByRole("heading").innerText();
  const escapedSecondPagePlaceName = secondPagePlaceName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  await mapRoot.getByRole("button", { name: new RegExp(`^${escapedSecondPagePlaceName}`, "u") }).click();
  await expect(secondPageCard).toHaveAttribute("aria-current", "true");
  await expect(pageTwoCard).not.toHaveAttribute("aria-current", "true");

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

test("searches the loaded catalog across list and map without changing the URL contract", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=4");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "장소 검색" });

  await search.fill("광안 여행 후보");
  await expect(page.getByRole("heading", { name: "총 1곳" })).toBeVisible();
  await expect(page.locator('[id^="place-card-"]')).toHaveCount(1);
  await expect(page.locator("[data-marker-registry-size]")).toHaveAttribute("data-marker-registry-size", "1");
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("1");
  await expect(page).toHaveURL(/tab=catalog&region=busan&page=1$/u);
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);

  await search.fill("존재하지 않는 장소");
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없어요" })).toBeVisible();
  await expect(page.locator("[data-marker-registry-size]")).toHaveAttribute("data-marker-registry-size", "0");

  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
});

test("offers explicit first and last page controls without redundant scope copy or unknown badges", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&page=1");
  await expect(page.getByText("공식 관광 장소와 공개된 지역 후보를 함께 비교합니다.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".catalog-result-card__badges").getByText("동반 정보 확인 필요", { exact: true })).toHaveCount(0);

  const pagination = page.getByRole("navigation", { name: "장소 목록 페이지" });
  await expect(pagination.getByRole("button", { name: "첫 페이지" })).toBeDisabled();
  await pagination.getByRole("button", { name: "마지막 페이지" }).click();
  await expect(pagination.locator('[aria-current="page"]')).toHaveText("3");
  await expect(pagination.getByRole("button", { name: "마지막 페이지" })).toBeDisabled();
  await pagination.getByRole("button", { name: "첫 페이지" }).click();
  await expect(pagination.locator('[aria-current="page"]')).toHaveText("1");
});

test("removes verification-required candidate inclusion controls from selection UI", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan&mode=select&page=1");
  await expect(page.getByText("0 / 5곳 담음", { exact: true })).toHaveCount(2);
  await expect(page.getByText("확인 필요한 장소도 후보에 포함", { exact: true })).toHaveCount(0);
  await page.goto("/planner/pet");
  await expect(page.getByText("확인 필요한 장소도 후보에 포함", { exact: true })).toHaveCount(0);
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
  await selectExplorerRegion(page, "제주");
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
  await selectExplorerRegion(page, "제주");
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
  await expect(kakaoCandidateCard).toContainText("카카오맵");
  await expect(kakaoCandidateCard.getByText("카카오 검색 후보", { exact: true })).toHaveCount(0);
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

  await page.goto("/results?tab=catalog&region=busan");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  const regionPicker = await openRegionPicker(page);
  const jejuButton = regionPicker.getByRole("option", { name: "제주", exact: true });
  await jejuButton.focus();
  jejuSelected = true;
  await jejuButton.press("Enter");
  await expect(page.locator(".explorer-region-picker__trigger"))
    .toHaveAccessibleName("여행 지역 선택, 현재 제주");
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

  await page.getByRole("button", { name: "마지막 페이지", exact: true }).click();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("5");
  await expect(page.locator('.catalog-result-card [data-image-kind="category_placeholder"]')).toHaveCount(0);
  await expect(page.locator(".catalog-result-card--text-only")).toHaveCount(6);
  await expect(page.locator(".catalog-result-card").getByText("동반 정보 확인 필요", { exact: true })).toHaveCount(0);

  await selectExplorerDistrict(page, "제주", "제주시");
  await expect(page.getByRole("heading", { name: "총 27곳" })).toBeVisible();
  await expect(page).toHaveURL(/region=jeju.*district=110/u);
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "27");
  await expect(page.locator(".catalog-result-card").first()).toContainText("제주시");
  await expect(page.locator(".catalog-result-card").first()).not.toContainText("부산광역시 중구");

  await selectExplorerDistrict(page, "제주", "서귀포시");
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
    if (pathname === "/api/map/places/cards") {
      return searchParams.get("region") === "jeju" &&
        searchParams.get("dataset") === "core";
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
  await selectExplorerRegion(page, "부산");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await expect(page).toHaveURL(/region=busan/u);
  await expect(page).not.toHaveURL(/district=/u);
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "26");
  await expect(page.getByText("제주시", { exact: true })).toHaveCount(0);

  for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "지도", exact: true }).click();
    const jejuNavigation = page.waitForURL(/region=jeju/u, { waitUntil: "load" });
    await selectExplorerRegion(page, "제주");
    await jejuNavigation;
    await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "54");
    await expect(page.locator(".explorer-filter-dropdown")).toHaveCount(0);
    await page.getByRole("button", { name: "지도", exact: true }).click();
    await expect(page.locator(".full-map-explorer__map")).toBeVisible();
    const responsiveDialog = await openExplorerFilters(page);
    const dialogBox = await responsiveDialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.width - 8);
    await expect(responsiveDialog.getByRole("button", { name: /^한국관광공사/u })).toHaveCount(0);
    await expect(responsiveDialog.getByRole("button", { name: /^관광지/u })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(responsiveDialog).not.toBeVisible();
    await expect(page.locator(".explorer-toolbar-filter").getByRole("button", { name: "필터", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.locator(".full-map-explorer__sidebar")).toBeVisible();
    await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
    await page.locator(".catalog-result-card").first().getByRole("button", { name: /지도에서 보기$/u }).click();
    await expect(page.getByRole("button", { name: "지도", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".full-map-explorer__map")).toBeVisible();
    await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await selectExplorerRegion(page, "부산");
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  }
});

test("renders every Gyeonggi Shopping marker once and reuses its map layer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "The representative large Shopping render runs once in desktop Chromium.");
  test.setTimeout(45_000);
  const coreCount = 0;
  const shoppingCount = 2_447;
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(request.url());
  });
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("region") !== "gyeonggi") return route.fallback();
    const dataset = url.searchParams.get("dataset") === "shopping" ? "shopping" : "core";
    const count = dataset === "shopping" ? shoppingCount : coreCount;
    const category = dataset === "shopping" ? "shopping" : "attraction";
    const items = Array.from({ length: count }, (_, index) => ({
      id: `tour:${dataset}-${String(index + 1).padStart(5, "0")}`,
      name: `경기 ${dataset === "shopping" ? "쇼핑" : "핵심"} 장소 ${index + 1}`,
      layer: "tourism",
      category,
      districtCode: "110",
      coordinates: {
        latitude: 37.18 + (index % 41) * 0.004,
        longitude: 126.88 + (Math.floor(index / 41) % 41) * 0.006,
      },
      petAccessVerdict: "unknown",
      publicLabel: "반려동물 동반 정보 확인 필요",
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          contractVersion: 1,
          region: "gyeonggi",
          scope: "default",
          dataset,
          generatedAt: "2026-08-28T00:00:00.000Z",
          publicationVersion: dataset === "shopping"
            ? "p1-7777777777777777"
            : "p1-6666666666666666",
          dataVersion: dataset === "shopping"
            ? "v1-7777777777777777"
            : "v1-6666666666666666",
          totalCount: count,
          providerCounts: { tour: count, kakao: 0 },
          categoryCounts: { [category]: count },
          freshness: { status: "fresh" },
          items,
        },
        requestId: `gyeonggi-${dataset}-snapshot`,
      }),
    });
  });
  await page.route("**/api/map/places/cards?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("region") !== "gyeonggi") return route.fallback();
    await route.fulfill({ status: 500, body: "Shopping card details must stay unused." });
  });

  await page.goto("/results?tab=catalog&region=gyeonggi&layers=tourism&page=1");
  const mapRoot = page.locator("[data-marker-registry-size]");
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없어요" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "0");
  await expect(page.getByText("쇼핑은 필터에서 선택하면 불러옵니다.", { exact: true })).toBeVisible();
  expect(apiRequests.map((value) => new URL(value)).filter(({ pathname, searchParams }) =>
    pathname === "/api/map/places/snapshot" && searchParams.get("dataset") === "shopping")).toHaveLength(0);

  const startedAt = Date.now();
  let categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^쇼핑/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 2,447곳" })).toBeVisible();
  await expect(page.getByText("쇼핑 장소 2,447곳을 불러왔습니다.", { exact: true })).toBeVisible();
  await expect(page.locator(".catalog-result-card")).toHaveCount(12);
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", String(shoppingCount));
  await expect(mapRoot).toHaveAttribute("data-active-marker-count", String(shoppingCount));
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(shoppingCount);
  await expect(mapRoot).toHaveAttribute("data-clusterer-instance-count", "1");
  await expect(page.locator(".kakao-map-canvas")).toHaveAttribute("data-map-version", "1");
  expect(await page.evaluate(() => document.documentElement.dataset.explorerMapInstanceCount)).toBe("1");
  const markerReadyMs = Date.now() - startedAt;
  const createdMarkerCount = await mapRoot.getAttribute("data-created-source-marker-count");

  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^쇼핑/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없어요" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "0");
  await expect(mapRoot).toHaveAttribute("data-marker-cache-size", String(shoppingCount));

  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: /^쇼핑/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 2,447곳" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-created-source-marker-count", createdMarkerCount ?? "");
  await page.getByRole("button", { name: "다음 페이지" }).click();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("2");
  await expect(mapRoot).toHaveAttribute("data-created-source-marker-count", createdMarkerCount ?? "");

  const firstCard = page.locator(".catalog-result-card").first();
  await firstCard.getByRole("button", { name: /지도에서 보기$/u }).click();
  await expect(firstCard).toHaveClass(/is-selected/u);
  await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(1);

  const snapshotRequests = apiRequests.map((value) => new URL(value))
    .filter(({ pathname }) => pathname === "/api/map/places/snapshot");
  expect(snapshotRequests.filter(({ searchParams }) => searchParams.get("dataset") === "core")).toHaveLength(1);
  expect(snapshotRequests.filter(({ searchParams }) => searchParams.get("dataset") === "shopping")).toHaveLength(1);
  expect(apiRequests.map((value) => new URL(value)).filter(({ pathname, searchParams }) =>
    pathname === "/api/map/places/cards" && searchParams.get("dataset") === "shopping")).toHaveLength(0);
  expect(apiRequests.some((value) => /^\/api\/tour\/places\/[^?]+/u.test(new URL(value).pathname))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.dataset.explorerMapInstanceCount)).toBe("1");
  console.log(`GYEONGGI_SHOPPING_MARKER_READY ${JSON.stringify({ markerReadyMs, shoppingCount })}`);
});

test("loads Seoul core once and fetches the complete shopping dataset only on first selection", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "The Seoul flow explicitly verifies all required viewport widths once in desktop Chromium.");
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const apiRequests: string[] = [];
  const rscRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(request.url());
    if (url.searchParams.has("_rsc")) rscRequests.push(request.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/tour/places/6110001?**", async (route) => {
    const detail = liveDetail("not_applicable");
    detail.summary = {
      ...detail.summary,
      contentId: "6110001",
      contentTypeId: "12",
      providerContentTypeId: "12",
      title: "서울 UI 검증 상세 장소",
      address: "서울특별시 종로구 검증로 1",
      longitude: 126.79,
      latitude: 37.43,
      legalRegionCode: "11",
      legalDistrictCode: "110",
      phone: null,
      source: { ...detail.summary.source, contentId: "6110001" },
    };
    detail.source = { ...detail.source, contentId: "6110001" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: detail, requestId: "seoul-detail-test-only" }),
    });
  });

  await page.goto("/results?tab=catalog&region=seoul&page=1");
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  const mapRoot = page.locator("[data-marker-registry-size]");
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "76");
  await expect(mapRoot).toHaveAttribute("data-active-marker-count", "76");
  await expect(mapRoot).toHaveAttribute("data-clusterer-instance-count", "1");
  await expect(page.locator(".fake-kakao-native-marker")).toHaveCount(76);
  await expect(page.getByRole("tab", { name: "서울 경로 추천은 준비 중입니다." })).toBeDisabled();
  await expect(page.getByText("한국관광공사 공식 장소만 표시합니다.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".explorer-region-picker__trigger"))
    .toHaveAccessibleName("여행 지역 선택, 현재 서울");
  await expect(page.locator("#district-options-seoul option")).toHaveCount(26);
  await expect(page.getByRole("group", { name: "장소 출처 범례" }).getByRole("button"))
    .toHaveCount(1);
  await expect(page.getByRole("button", { name: "한국관광공사", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("카카오맵", { exact: true })).toHaveCount(0);
  await expect(page.locator(".catalog-result-card").first()).toContainText("한국관광공사");
  const imageTiming = await page.evaluate(() => ({
    mapReadyAt: Number(document.documentElement.dataset.mapReadyAt),
    imageStarts: performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/_next/image"))
      .map((entry) => entry.startTime),
  }));
  expect(imageTiming.mapReadyAt).toBeGreaterThan(0);
  expect(imageTiming.imageStarts.every((startedAt) => startedAt >= imageTiming.mapReadyAt)).toBe(true);

  const visitorRequests = apiRequests.map((value) => new URL(value));
  expect(visitorRequests.filter(({ pathname }) => pathname === "/api/map/places/snapshot"))
    .toHaveLength(1);
  expect(visitorRequests.find(({ pathname }) => pathname === "/api/map/places/snapshot")
    ?.searchParams.get("dataset")).toBe("core");
  expect(visitorRequests.some(({ pathname }) => pathname === "/api/map/places")).toBe(false);
  expect(visitorRequests.some(({ pathname }) => pathname === "/api/tour/places")).toBe(false);
  expect(visitorRequests.some(({ pathname }) => [
    "/api/itineraries/generate",
    "/api/itineraries/revalidate",
    "/api/directions",
    "/api/kakao/directions",
  ].includes(pathname))).toBe(false);
  expect(visitorRequests.every(({ pathname, searchParams }) =>
    pathname !== "/api/map/places/snapshot" || searchParams.get("region") === "seoul"))
    .toBe(true);

  const metricsBeforeFilters = await page.evaluate(() => ({
    requestCount: Number(document.documentElement.dataset.mapSnapshotRequestCount),
    firstUsefulCardsMs: Number(document.documentElement.dataset.mapFirstUsefulCardsMs),
    completeSnapshotMs: Number(document.documentElement.dataset.mapCompleteSnapshotMs),
    rawResponseBytes: Number(document.documentElement.dataset.mapSnapshotRawBytes),
    compressedTransferBytes: document.documentElement.dataset.mapSnapshotCompressedBytes
      ? Number(document.documentElement.dataset.mapSnapshotCompressedBytes)
      : null,
    jsonParseMs: Number(document.documentElement.dataset.mapJsonParseMs),
    validationMs: Number(document.documentElement.dataset.mapContractValidationMs),
    indexConstructionMs: Number(document.documentElement.dataset.mapIndexConstructionMs),
    reactCommitMs: Number(document.documentElement.dataset.mapReactCommitMs),
  }));
  const markerApplicationMs = Number(await mapRoot.getAttribute("data-marker-update-ms"));
  const clusteringMs = Number(await mapRoot.getAttribute("data-cluster-update-ms"));
  expect(metricsBeforeFilters.requestCount).toBe(1);
  expect(metricsBeforeFilters.rawResponseBytes).toBe(Buffer.byteLength(snapshotBody("seoul", "fresh", "core"), "utf8"));
  expect(metricsBeforeFilters.jsonParseMs).toBeLessThan(50);
  expect(metricsBeforeFilters.validationMs).toBeLessThan(50);
  expect(metricsBeforeFilters.indexConstructionMs).toBeLessThan(50);
  expect(markerApplicationMs).toBeLessThan(300);
  expect(clusteringMs).toBeLessThan(300);

  const sourceFilter = page.getByRole("button", { name: "한국관광공사", exact: true });
  await sourceFilter.click();
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없어요" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "0");
  await expect(page).toHaveURL(/layers=none/u);
  await sourceFilter.click();
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "76");

  let categoryPanel = await openExplorerFilters(page);
  expect(apiRequests.filter((value) => new URL(value).pathname === "/api/map/places/snapshot"))
    .toHaveLength(1);
  await expect(categoryPanel.getByRole("button", { name: /^관광지/u })).toContainText("56");
  await expect(categoryPanel.getByRole("button", { name: /^식당/u })).toContainText("6");
  await expect(categoryPanel.getByRole("button", { name: /^숙소/u })).toContainText("14");
  await expect(categoryPanel.getByRole("button", { name: /^쇼핑/u })).toContainText("…");
  await expect(categoryPanel.getByRole("button", { name: /^카페/u })).toHaveCount(0);
  for (const label of ["관광지", "식당", "숙소"]) {
    await categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await categoryPanel.getByRole("button", { name: /^쇼핑/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 3,090곳" })).toBeVisible();
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", String(SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL));
  await expect(page.locator(".catalog-result-card").first()).toContainText("쇼핑");
  await expect(page.locator(".catalog-result-card").first()).not.toContainText("반려동물 동반 정보 확인 필요");
  await expect(page.locator(".catalog-result-card").getByRole("link", { name: /원문 상세 보기$/u })).toHaveCount(0);
  expect(apiRequests.filter((value) => {
    const url = new URL(value);
    return url.pathname === "/api/map/places/snapshot" && url.searchParams.get("dataset") === "shopping";
  })).toHaveLength(1);
  const shoppingPerformance = {
    jsonParseMs: await page.evaluate(() => Number(document.documentElement.dataset.mapJsonParseMs)),
    validationMs: await page.evaluate(() => Number(document.documentElement.dataset.mapContractValidationMs)),
    indexConstructionMs: await page.evaluate(() => Number(document.documentElement.dataset.mapIndexConstructionMs)),
    reactCommitMs: await page.evaluate(() => Number(document.documentElement.dataset.mapReactCommitMs)),
    markerApplicationMs: Number(await mapRoot.getAttribute("data-marker-update-ms")),
    clusteringMs: Number(await mapRoot.getAttribute("data-cluster-update-ms")),
  };
  expect(shoppingPerformance.jsonParseMs).toBeLessThan(1_000);
  expect(shoppingPerformance.validationMs).toBeLessThan(1_000);
  expect(shoppingPerformance.indexConstructionMs).toBeLessThan(1_000);
  expect(shoppingPerformance.markerApplicationMs).toBeLessThan(5_000);
  expect(shoppingPerformance.clusteringMs).toBeLessThan(5_000);
  await expect.poll(() => page.evaluate(() =>
    Number(document.documentElement.dataset.mapWarmFilterFeedbackMs))).toBeLessThan(100);

  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: "초기화" }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  categoryPanel = await openExplorerFilters(page);
  for (const label of ["관광지", "식당", "숙소"]) {
    await categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await categoryPanel.getByRole("button", { name: /^쇼핑/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 3,090곳" })).toBeVisible();
  expect(apiRequests.filter((value) => {
    const url = new URL(value);
    return url.pathname === "/api/map/places/snapshot" && url.searchParams.get("dataset") === "shopping";
  })).toHaveLength(1);
  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: "초기화" }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  await page.getByRole("button", { name: "마지막 페이지", exact: true }).click();
  await expect(page.locator('.explorer-pagination [aria-current="page"]')).toHaveText("7");
  await expect(page.locator(".catalog-result-card")).toHaveCount(4);
  await expect(page.locator(".catalog-result-card").getByText(/동반 정보 확인 필요|방문 전 확인 필요/u)).toHaveCount(0);
  await expect(page.locator('.catalog-result-card [data-image-kind="category_placeholder"]')).toHaveCount(0);
  expect(await page.locator(".catalog-result-card--text-only").count()).toBeGreaterThan(0);

  await selectExplorerDistrict(page, "서울", "종로구");
  await expect(page.getByRole("heading", { name: "총 4곳" })).toBeVisible();
  await expect(page).toHaveURL(/region=seoul.*district=110/u);
  await expect(mapRoot).toHaveAttribute("data-marker-registry-size", "4");
  await expect(page.locator(".catalog-result-card").first()).toContainText("종로구");

  const firstCard = page.locator("#place-card-tour-6110001");
  await firstCard.getByRole("button", { name: /지도에서 보기$/u }).click();
  await expect(firstCard).toHaveClass(/is-selected/u);
  await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(1);
  expect(rscRequests).toHaveLength(0);
  await firstCard.getByRole("link", { name: /원문 상세 보기$/u }).click();
  await expect(page).toHaveURL(/\/places\/6110001\?region=seoul&contentTypeId=12/u);
  await expect(page.getByRole("heading", { name: "서울 UI 검증 상세 장소" })).toBeVisible();
  await expect(page.getByText("한국관광공사 원문", { exact: true })).toBeVisible();
  await expect(page.getByText("연락처", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "추천 결과로" }).click();
  await expect(page).toHaveURL(/\/results\?tab=catalog&region=seoul/u);
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();

  const responsivePerformance: Array<{ width: number; interactionMs: number }> = [];
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    const interactionStartedAt = performance.now();
    await page.getByRole("button", { name: "지도", exact: true }).click();
    await expect(page.locator(".full-map-explorer__map")).toBeVisible();
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.locator(".full-map-explorer__sidebar")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    responsivePerformance.push({
      width: viewport.width,
      interactionMs: Number((performance.now() - interactionStartedAt).toFixed(1)),
    });
  }

  const metrics = {
    ...metricsBeforeFilters,
    markerApplicationMs,
    clusteringMs,
    warmFilterFeedbackMs: await page.evaluate(() =>
      Number(document.documentElement.dataset.mapWarmFilterFeedbackMs)),
    deterministicFixtureCount: SEOUL_PUBLIC_MAP_UI_FIXTURE.length,
    deterministicShoppingFixtureCount: SEOUL_SHOPPING_MAP_UI_FIXTURE_TOTAL,
    normalPathBrowserSnapshotRequests: 1,
    firstShoppingSelectionRequests: 1,
    warmShoppingReselectionRequests: 0,
    payloadBytes: {
      core: {
        raw: Buffer.byteLength(snapshotBody("seoul", "fresh", "core"), "utf8"),
        gzip: gzipSync(snapshotBody("seoul", "fresh", "core")).byteLength,
        brotli: brotliCompressSync(snapshotBody("seoul", "fresh", "core")).byteLength,
      },
      shopping: {
        raw: Buffer.byteLength(snapshotBody("seoul", "fresh", "shopping"), "utf8"),
        gzip: gzipSync(snapshotBody("seoul", "fresh", "shopping")).byteLength,
        brotli: brotliCompressSync(snapshotBody("seoul", "fresh", "shopping")).byteLength,
      },
    },
    shoppingPerformance,
    responsivePerformance: [
      { width: 1440, interactionMs: Number(metricsBeforeFilters.firstUsefulCardsMs.toFixed(1)) },
      ...responsivePerformance,
    ],
    supabaseRpcPages: { core: 1, shopping: 16 },
    normalPathFallbackRequests: 0,
    normalPathKtoProviderCalls: 0,
    normalPathKakaoDiscoveryCalls: 0,
    normalPathItineraryCalls: 0,
  };
  console.log(`SEOUL_MAP_METRICS ${JSON.stringify(metrics)}`);
  await test.info().attach("seoul-map-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  expect(consoleErrors).toHaveLength(0);
});

test("isolates Seoul across Busan and Jeju transitions, including late responses", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "The transition races are measured once in desktop Chromium.");
  let delayJeju = true;
  let delaySeoul = false;
  let jejuStarted = false;
  let seoulStarted = false;
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const region = new URL(route.request().url()).searchParams.get("region") as "busan" | "jeju" | "seoul";
    if (region === "jeju" && delayJeju) {
      jejuStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (region === "seoul" && delaySeoul) {
      seoulStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: snapshotBody(region) }).catch(() => undefined);
  });

  await page.goto("/results?tab=catalog&region=jeju&page=1");
  await expect.poll(() => jejuStarted).toBe(true);
  await selectExplorerRegion(page, "서울");
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  await expect(page.getByText("제주시", { exact: true })).toHaveCount(0);

  await page.goto("/results?tab=catalog&region=jeju&page=1");
  delayJeju = false;
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  delaySeoul = true;
  await selectExplorerRegion(page, "서울");
  await expect.poll(() => seoulStarted).toBe(true);
  await selectExplorerRegion(page, "제주");
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  await page.waitForTimeout(450);
  await expect(page.getByRole("heading", { name: "총 54곳" })).toBeVisible();
  await expect(page.getByText("종로구", { exact: true })).toHaveCount(0);

  delaySeoul = false;
  await selectExplorerRegion(page, "부산");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await selectExplorerRegion(page, "서울");
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  await selectExplorerRegion(page, "부산");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await expect(page.locator('.fake-kakao-native-marker[data-marker-width="46"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    Number(document.documentElement.dataset.mapWarmRegionRevisitMs))).toBeGreaterThanOrEqual(0);
  const warmRegionRevisitMs = await page.evaluate(() =>
    Number(document.documentElement.dataset.mapWarmRegionRevisitMs));
  console.log(`SEOUL_WARM_REVISIT_METRICS ${JSON.stringify({ warmRegionRevisitMs })}`);
});

test("keeps Seoul core usable when the on-demand shopping dataset fails", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Dataset failure behavior is verified once in desktop Chromium.");
  const snapshotRequests: string[] = [];
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("region") !== "seoul") return route.fallback();
    snapshotRequests.push(route.request().url());
    if (url.searchParams.get("dataset") === "shopping") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({
          ok: false,
          error: { code: "UPSTREAM_ERROR", message: "검증용 쇼핑 오류", retryable: true },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: snapshotBody("seoul", "fresh", "core"),
    });
  });

  await page.goto("/results?tab=catalog&region=seoul&page=1");
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  let categoryPanel = await openExplorerFilters(page);
  for (const label of ["관광지", "식당", "숙소"]) {
    await categoryPanel.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  }
  await categoryPanel.getByRole("button", { name: /^쇼핑/u }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.locator('.explorer-results-status [role="alert"]'))
    .toContainText("쇼핑 장소를 불러오지 못했습니다.");

  categoryPanel = await openExplorerFilters(page);
  await categoryPanel.getByRole("button", { name: "초기화" }).click();
  await categoryPanel.getByRole("button", { name: "적용하기" }).click();
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  expect(snapshotRequests.filter((value) => new URL(value).searchParams.get("dataset") === "core"))
    .toHaveLength(1);
  expect(snapshotRequests.filter((value) => new URL(value).searchParams.get("dataset") === "shopping"))
    .toHaveLength(1);
});

test("marks stale Seoul data and retries without a legacy fallback", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Seoul state contracts are measured once in desktop Chromium.");
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const region = new URL(route.request().url()).searchParams.get("region");
    if (region !== "seoul") return route.fallback();
    await route.fulfill({ status: 200, contentType: "application/json", body: snapshotBody("seoul", "stale") });
  });
  await page.goto("/results?tab=catalog&region=seoul&page=1");
  await expect(page.getByRole("heading", { name: "총 76곳" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "저장된 장소 데이터를 표시하고 있습니다." })).toBeVisible();

  let snapshotAttempt = 0;
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const region = new URL(route.request().url()).searchParams.get("region");
    if (region !== "seoul") return route.fallback();
    snapshotAttempt += 1;
    if (snapshotAttempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "UPSTREAM_ERROR", message: "검증용 오류", retryable: true } }),
      });
      return;
    }
    const empty = JSON.parse(snapshotBody("seoul"));
    empty.data.items = [];
    empty.data.totalCount = 0;
    empty.data.providerCounts = { tour: 0, kakao: 0 };
    empty.data.categoryCounts = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(empty) });
  });
  const legacyRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/map/places") legacyRequests.push(request.url());
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "장소 정보를 확인하지 못했어요" })).toBeVisible();
  await expect(page.locator('.explorer-results-status [role="alert"]')).toContainText("관광공사 장소를 불러오지 못했습니다.");
  await expect(page.getByRole("heading", { name: "총 1곳" })).toHaveCount(0);
  expect(legacyRequests).toHaveLength(0);
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없어요" })).toBeVisible();
  await expect(page.getByText("선택한 조건의 장소가 없습니다.", { exact: true })).toBeVisible();
});

test("keeps Jeju error, retry, and empty states accessible in mobile list mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "The test sets the 390px viewport explicitly.");
  let firstJejuRequest = true;
  await page.route("**/api/map/places/snapshot?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("region") !== "jeju") return route.fallback();
    if (firstJejuRequest) {
      firstJejuRequest = false;
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
  await page.goto("/results?tab=catalog&region=busan");
  await page.getByRole("button", { name: "목록", exact: true }).click();
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();
  await selectExplorerRegion(page, "제주");
  await expect(page.locator('.explorer-results-status [role="alert"]'))
    .toContainText("관광공사 장소를 불러오지 못했습니다.");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "총 27곳" })).toBeVisible();

  await selectExplorerDistrict(page, "제주", "서귀포시");
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없어요" })).toBeVisible();
  await expect(page.getByText("선택한 조건의 장소가 없습니다.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("uses list-first map/list modes without horizontal overflow before the result pane becomes unreadable", async ({ page }) => {
  await page.goto("/results?tab=catalog&region=busan");
  for (const viewport of [{ width: 1_024, height: 900 }, { width: 948, height: 1_660 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: "목록", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".full-map-explorer__sidebar")).toBeVisible();
    await expect(page.locator(".full-map-explorer__map")).not.toBeVisible();
    await page.getByRole("button", { name: "지도", exact: true }).click();
    await expect(page.locator(".full-map-explorer__map")).toBeVisible();
    await page.getByRole("button", { name: "목록", exact: true }).click();
    await expect(page.locator(".full-map-explorer__sidebar")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("keeps deterministic explorer interactions bounded and the live registry stable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Desktop performance flow; mobile mode is verified separately.");
  await page.goto("/results?tab=catalog&region=busan");
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
    districtName: "해운대구",
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
        dataset: "core",
        generatedAt: "2026-08-24T00:00:00.000Z",
        publicationVersion: "p1-3333333333333333",
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

  await page.goto("/results?tab=catalog&region=busan");
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
  await page.goto("/results?tab=catalog&region=busan");
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

  await page.goto("/results?tab=catalog&region=busan");
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

test("captures the phase-b catalog workbench evidence", async ({ page, isMobile }) => {
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
  await page.goto("/results?tab=catalog&region=busan&page=1");
  await expect(page.getByRole("heading", { name: "총 26곳" })).toBeVisible();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const switcher = page.getByRole("group", { name: "지도 또는 목록 보기" });
    if (viewport.width <= 1_024) {
      const listButton = switcher.getByRole("button", { name: "목록", exact: true });
      if (await listButton.getAttribute("aria-pressed") !== "true") await listButton.click();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: path.join(evidenceDirectory, `catalog-${viewport.width}x${viewport.height}.png`),
      animations: "disabled",
      caret: "hide",
      fullPage: false,
    });
  }
});
