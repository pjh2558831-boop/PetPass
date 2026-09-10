import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as discoveryRoute } from "@/app/api/places/discovery/route";
import {
  geocodeAddress,
  searchKakaoPlaces,
} from "@/lib/kakao/local";
import {
  createKakaoMapController,
  type KakaoMapsSdk,
} from "@/lib/kakao/maps";
import { KAKAO_CURRENT_MAP_MAX_RADIUS_METERS } from "@/lib/kakao/search-area";
import {
  BUSAN_REGION_CONFIG,
  JEJU_REGION_CONFIG,
} from "@/lib/regions/config";
import {
  getKakaoMapJavaScriptKey,
  getKakaoMapsSdkUrl,
} from "@/lib/kakao/sdk-loader";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";

const originalRestKey = process.env.KAKAO_REST_API_KEY;
const originalMapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalRestKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalRestKey;
  if (originalMapKey === undefined) {
    delete process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
  } else {
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY = originalMapKey;
  }
  delete window.kakao;
});

describe("Kakao integration boundaries", () => {
  it("returns a clear configuration error when the REST key is missing", () => {
    delete process.env.KAKAO_REST_API_KEY;
    expect(() => getKakaoRestApiKey()).toThrow("KAKAO_REST_API_KEY");
  });

  it("rejects arbitrary Kakao keyword input before calling Kakao", async () => {
    const response = await discoveryRoute(
      new Request(
        "http://localhost/api/places/discovery?category=food&districtCode=500&query=카페",
      ),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", retryable: false },
    });
  });

  it("normalizes a successful keyword search response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        documents: [
          {
            id: "123",
            place_name: "해운대 반려동물 카페",
            category_name: "음식점 > 카페",
            phone: "051-000-0000",
            address_name: "부산 해운대구 우동 1",
            road_address_name: "부산 해운대구 해운대로 1",
            place_url: "https://place.map.kakao.com/123",
            distance: "820",
            x: "129.1603",
            y: "35.1590",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await searchKakaoPlaces(
      { query: "해운대 카페", page: 1, size: 5 },
      { apiKey: "test-key", fetchImpl },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "123",
        name: "해운대 반려동물 카페",
        distanceMeters: 820,
        coordinates: { latitude: 35.159, longitude: 129.1603 },
      }),
    ]);
  });

  it("normalizes a successful address search response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        documents: [
          {
            address_name: "부산 해운대구 우동 1",
            address_type: "REGION_ADDR",
            x: "129.1603",
            y: "35.1590",
            road_address: { address_name: "부산 해운대구 해운대로 1" },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await geocodeAddress("부산 해운대구", 5, {
      apiKey: "test-key",
      fetchImpl,
    });
    expect(result[0]).toMatchObject({
      address: "부산 해운대구 우동 1",
      roadAddress: "부산 해운대구 해운대로 1",
      coordinates: { latitude: 35.159, longitude: 129.1603 },
    });
  });

  it("sanitizes an upstream failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("upstream details", { status: 503 }),
    ) as unknown as typeof fetch;

    await expect(
      searchKakaoPlaces(
        { query: "해운대 카페", page: 1, size: 5 },
        { apiKey: "test-key", fetchImpl },
      ),
    ).rejects.toThrow("503 상태로 실패했습니다");
  });

  it("reports missing map configuration and SDK failures", () => {
    delete process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
    expect(() => getKakaoMapJavaScriptKey()).toThrow(
      "NEXT_PUBLIC_KAKAO_MAP_JS_KEY",
    );
    expect(() =>
      createKakaoMapController(document.createElement("div"), {
        defaultCenter: BUSAN_REGION_CONFIG.defaultMapCenter,
        locations: [],
      }),
    ).toThrow("지도 SDK");
  });

  it("loads the clusterer library exactly once in the SDK URL", () => {
    const url = new URL(getKakaoMapsSdkUrl("test-key"));
    expect(url.searchParams.get("libraries")).toBe("services,clusterer");
    expect(url.searchParams.getAll("libraries")).toHaveLength(1);
  });

  it("initializes one catalog clusterer, deduplicates markers, and cleans up", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 800, height: 600 } as DOMRect);
    type Listener = (...args: unknown[]) => void;
    const listeners = new WeakMap<object, Map<string, Set<Listener>>>();
    const addListener = vi.fn(
      (target: object, eventName: string, handler: Listener) => {
        const targetListeners = listeners.get(target) ?? new Map();
        const eventListeners = targetListeners.get(eventName) ?? new Set();
        eventListeners.add(handler);
        targetListeners.set(eventName, eventListeners);
        listeners.set(target, targetListeners);
      },
    );
    const removeListener = vi.fn(
      (target: object, eventName: string, handler: Listener) => {
        listeners.get(target)?.get(eventName)?.delete(handler);
      },
    );
    const emit = (target: object, eventName: string, ...args: unknown[]) => {
      listeners.get(target)?.get(eventName)?.forEach((handler) => handler(...args));
    };

    class FakeLatLng {
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
    class FakeBounds {
      extend = vi.fn();
      getNorthEast() {
        return new FakeLatLng(35.3, 129.3);
      }
      getSouthWest() {
        return new FakeLatLng(35.05, 128.9);
      }
    }
    const mapInstances: FakeMap[] = [];
    class FakeMap {
      private readonly center: FakeLatLng;
      constructor(
        _container: HTMLElement,
        options: { center: FakeLatLng },
      ) {
        this.center = options.center;
        mapInstances.push(this);
      }
      getBounds = vi.fn(() => new FakeBounds());
      getCenter = vi.fn(() => this.center);
      panTo = vi.fn();
      relayout = vi.fn();
      setBounds = vi.fn();
      getLevel = vi.fn(() => 7);
      setLevel = vi.fn();
      setMapTypeId = vi.fn();
    }
    class FakeMarkerImage {
      constructor(
        readonly source: string,
        readonly size: unknown,
        readonly options: unknown,
      ) {}
    }
    const markers: FakeMarker[] = [];
    class FakeMarker {
      readonly options: {
        image?: FakeMarkerImage;
        map?: FakeMap;
        position: FakeLatLng;
        title?: string;
      };
      setImage = vi.fn((image: FakeMarkerImage) => {
        this.options.image = image;
      });
      setMap = vi.fn();
      setPosition = vi.fn();
      setTitle = vi.fn();
      setZIndex = vi.fn();
      constructor(options: FakeMarker["options"]) {
        this.options = options;
        markers.push(this);
      }
    }
    const overlays: Array<{
      content: HTMLElement;
      setMap: ReturnType<typeof vi.fn>;
    }> = [];
    class FakeOverlay {
      content: HTMLElement;
      setMap = vi.fn();
      constructor(options: { content: HTMLElement }) {
        this.content = options.content;
        overlays.push(this);
      }
    }
    class FakePolyline {
      setMap = vi.fn();
    }
    const clusterers: FakeClusterer[] = [];
    class FakeClusterer {
      markers: FakeMarker[] = [];
      options: { styles?: Array<Record<string, string>> };
      addMarkers = vi.fn((markers: FakeMarker[]) => {
        this.markers.push(...markers.filter((marker) => !this.markers.includes(marker)));
        emit(this, "clustered", [
          {
            getMarkers: () => markers,
            getSize: () => markers.length,
          },
        ]);
      });
      removeMarkers = vi.fn((markers: FakeMarker[]) => {
        const removed = new Set(markers);
        this.markers = this.markers.filter((marker) => !removed.has(marker));
      });
      clear = vi.fn(() => {
        this.markers = [];
      });
      redraw = vi.fn();
      constructor(options: { styles?: Array<Record<string, string>> }) {
        this.options = options;
        clusterers.push(this);
      }
    }

    window.kakao = {
      maps: {
        load: (callback: () => void) => callback(),
        event: { addListener, removeListener },
        LatLng: FakeLatLng,
        LatLngBounds: FakeBounds,
        Map: FakeMap,
        MapTypeId: { ROADMAP: 1, HYBRID: 3 },
        CustomOverlay: FakeOverlay,
        Marker: FakeMarker,
        MarkerImage: FakeMarkerImage,
        MarkerClusterer: FakeClusterer,
        Point: class FakePoint {},
        Polyline: FakePolyline,
        Size: class FakeSize {},
      } as unknown as NonNullable<Window["kakao"]>["maps"],
    };

    const onLocationSelect = vi.fn();
    const container = document.createElement("div");
    let visible = false;
    vi.spyOn(container, "getBoundingClientRect").mockImplementation(() => ({ width: visible ? 800 : 0, height: visible ? 600 : 0 }) as DOMRect);
    const controller = createKakaoMapController(container, {
      defaultCenter: BUSAN_REGION_CONFIG.defaultMapCenter,
      locations: [
        {
          id: "departure",
          name: "출발지",
          address: "부산역",
          coordinates: { latitude: 35.115, longitude: 129.04 },
          markerKind: "departure",
          markerLabel: "출",
          sourceLabel: "선택한 출발지",
        },
        {
          id: "one",
          name: "첫 장소",
          address: "부산",
          coordinates: { latitude: 35.16, longitude: 129.16 },
          markerKind: "tourism-official",
          sourceLabel: "한국관광공사 제공 장소",
        },
        {
          id: "one",
          name: "중복 장소",
          address: "부산",
          coordinates: { latitude: 35.17, longitude: 129.17 },
          markerKind: "catalog",
        },
        {
          id: "invalid",
          name: "좌표 오류",
          address: "부산",
          coordinates: { latitude: 100, longitude: 129.18 },
          markerKind: "catalog",
        },
        {
          id: "kakao",
          name: "카카오 장소",
          address: "부산",
          coordinates: { latitude: 35.17, longitude: 129.17 },
          markerKind: "kakao-candidate",
          markerLabel: "K",
          sourceLabel: "카카오 검색 장소 · 반려동물 동반 여부 확인 필요",
        },
        {
          id: "route-one",
          name: "일정 장소",
          address: "부산",
          coordinates: { latitude: 35.18, longitude: 129.18 },
          markerKind: "itinerary",
          order: 1,
          sourceLabel: "추천 일정 정류장",
        },
      ],
      onLocationSelect,
    });

    expect(clusterers).toHaveLength(1);
    controller.zoomBy(-1);
    expect(mapInstances[0].setLevel).toHaveBeenLastCalledWith(6);
    controller.zoomBy(100);
    expect(mapInstances[0].setLevel).toHaveBeenLastCalledWith(14);
    controller.setSatellite(true);
    expect(mapInstances[0].setMapTypeId).toHaveBeenLastCalledWith(3);
    controller.setSatellite(false);
    expect(mapInstances[0].setMapTypeId).toHaveBeenLastCalledWith(1);
    expect(mapInstances[0].setBounds).not.toHaveBeenCalled();
    controller.selectLocation("route-one");
    controller.focusLocation("route-one");
    expect(mapInstances[0].panTo).not.toHaveBeenCalled();
    visible = true;
    // React can request focus before ResizeObserver has updated the SDK size.
    controller.focusLocation("route-one");
    expect(mapInstances[0].relayout).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].relayout.mock.invocationCallOrder[0]).toBeLessThan(mapInstances[0].panTo.mock.invocationCallOrder[0]);
    controller.relayout();
    expect(mapInstances[0].panTo).toHaveBeenCalledTimes(1);
    controller.relayout();
    controller.selectLocation("route-one");
    expect(mapInstances[0].panTo).toHaveBeenCalledTimes(1);
    controller.focusLocation("route-one");
    expect(mapInstances[0].panTo).toHaveBeenCalledTimes(2);
    controller.selectLocation(null);
    controller.fitBounds();
    expect(clusterers[0].addMarkers).toHaveBeenCalledTimes(1);
    expect(clusterers[0].markers).toHaveLength(2);
    expect(container.dataset.catalogMarkerCount).toBe("2");
    expect(container.dataset.clusterCount).toBe("1");
    expect(clusterers[0].options.styles?.[0]?.background).toBe("#596760");
    expect(mapInstances[0].setBounds).toHaveBeenCalledTimes(1);
    expect(controller.getSearchViewport()).toEqual({
      center: BUSAN_REGION_CONFIG.defaultMapCenter,
      radiusMeters: KAKAO_CURRENT_MAP_MAX_RADIUS_METERS,
      rectangle: {
        west: 128.9,
        south: 35.05,
        east: 129.3,
        north: 35.3,
      },
    });

    const departureMarkerButton = overlays.find(({ content }) =>
      content.matches('[data-location-id="departure"]'),
    )?.content as HTMLButtonElement;
    const itineraryMarkerButton = overlays.find(({ content }) =>
      content.matches('[data-location-id="route-one"]'),
    )?.content as HTMLButtonElement;
    const officialMarker = markers.find((marker) => marker.options.title?.includes("첫 장소"));
    const kakaoMarker = markers.find((marker) => marker.options.title?.includes("카카오 장소"));
    expect(officialMarker?.options.image?.source).toBe("/map-pins/tourism-official.svg");
    expect(kakaoMarker?.options.image?.source).toBe("/map-pins/kakao-candidate.svg");
    expect(container.dataset.markerRegistrySize).toBe("2");
    expect(container.dataset.customOverlayMarkerCount).toBe("2");
    expect(departureMarkerButton.classList.contains("kakao-map-marker--departure")).toBe(true);
    expect(departureMarkerButton.textContent).toBe("출");
    expect(itineraryMarkerButton.classList.contains("kakao-map-marker--itinerary")).toBe(true);
    expect(itineraryMarkerButton.textContent).toBe("1");
    expect(officialMarker).toBeDefined();
    emit(officialMarker!, "click");
    expect(onLocationSelect).toHaveBeenCalledWith("one");
    expect(officialMarker?.setImage).toHaveBeenCalledWith(
      expect.objectContaining({ source: "/map-pins/tourism-official.svg" }),
    );
    expect(overlays.some(({ content }) => content.matches(".kakao-map-selection"))).toBe(false);
    expect(overlays.some(({ content }) => content.matches(".kakao-map-info"))).toBe(
      true,
    );
    const firstInfoOverlay = overlays.find(({ content }) =>
      content.matches(".kakao-map-info"),
    );
    expect(firstInfoOverlay).toBeDefined();
    controller.setShowSelectionInfo(false);
    expect(firstInfoOverlay?.setMap).toHaveBeenCalledWith(null);
    const customContent = document.createElement("div");
    customContent.textContent = "Selected place preview";
    controller.setSelectionContent(customContent);
    expect(overlays.at(-1)?.content).toBe(customContent);
    controller.selectLocation(null);
    expect(container.dataset.infoOverlayCount).toBe("0");
    controller.selectLocation("one");
    expect(overlays.at(-1)?.content).toBe(customContent);
    controller.setSelectionContent(null);
    expect(container.dataset.infoOverlayCount).toBe("0");
    const overlayCountWithoutInfo = overlays.length;
    controller.setShowSelectionInfo(true);
    expect(overlays.length).toBeGreaterThan(overlayCountWithoutInfo);
    expect(
      overlays.slice(overlayCountWithoutInfo).some(({ content }) =>
        content.matches(".kakao-map-info"),
      ),
    ).toBe(true);

    await controller.updateData(
      [
        {
          id: "two",
          name: "둘째 장소",
          address: "부산",
          coordinates: { latitude: 35.18, longitude: 129.18 },
          markerKind: "catalog",
        },
      ],
      [],
      { fitBounds: false },
    );
    expect(clusterers).toHaveLength(1);
    expect(clusterers[0].clear).not.toHaveBeenCalled();
    expect(clusterers[0].removeMarkers).toHaveBeenCalledTimes(1);
    expect(clusterers[0].addMarkers).toHaveBeenCalledTimes(2);
    expect(clusterers[0].redraw).toHaveBeenCalledTimes(2);
    expect(mapInstances[0].setBounds).toHaveBeenCalledTimes(1);

    visible = false;
    controller.focusBounds({ west: 126, south: 37, east: 128, north: 38 });
    expect(mapInstances[0].setBounds).toHaveBeenCalledTimes(1);
    visible = true;
    controller.relayout();
    expect(mapInstances[0].setBounds).toHaveBeenCalledTimes(2);
    expect(clusterers[0].clear).not.toHaveBeenCalled();

    const retainedMarker = clusterers[0].markers[0];
    await controller.updateData(
      [{
        id: "two",
        name: "둘째 장소 갱신",
        address: "부산",
        coordinates: { latitude: 35.19, longitude: 129.19 },
        markerKind: "kakao-candidate",
      }],
      [],
      { fitBounds: false },
    );
    expect(clusterers[0].markers[0]).toBe(retainedMarker);
    expect(retainedMarker.options.image?.source).toBe("/map-pins/kakao-candidate.svg");
    const clearCountBeforeZoom = clusterers[0].clear.mock.calls.length;
    emit(mapInstances[0], "zoom_changed");
    expect(clusterers[0].clear).toHaveBeenCalledTimes(clearCountBeforeZoom);

    controller.destroy();
    expect(clusterers[0].clear).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith(
      clusterers[0],
      "clustered",
      expect.any(Function),
    );
    expect(container.childElementCount).toBe(0);

    delete (window.kakao?.maps as unknown as Record<string, unknown>)
      .MarkerClusterer;
    const fallbackMarkerStart = markers.length;
    const fallbackContainer = document.createElement("div");
    const fallbackController = createKakaoMapController(fallbackContainer, {
      defaultCenter: BUSAN_REGION_CONFIG.defaultMapCenter,
      locations: [
        {
          id: "fallback",
          name: "일반 마커 장소",
          address: "부산",
          coordinates: { latitude: 35.16, longitude: 129.16 },
          markerKind: "catalog",
        },
      ],
    });

    expect(fallbackContainer.dataset.clustererReady).toBe("false");
    expect(fallbackContainer.dataset.catalogMarkerCount).toBe("1");
    expect(markers.slice(fallbackMarkerStart)).toHaveLength(1);
    expect(markers.at(-1)?.options.image?.source).toBe("/map-pins/tourism-official.svg");
    expect(markers.at(-1)?.setMap).toHaveBeenCalledWith(mapInstances.at(-1));
    await fallbackController.updateData([], [], { fitBounds: false });
    expect(markers.at(-1)?.setMap).toHaveBeenLastCalledWith(null);
    fallbackController.destroy();

    const jejuContainer = document.createElement("div");
    const jejuController = createKakaoMapController(
      jejuContainer,
      {
        defaultCenter: JEJU_REGION_CONFIG.defaultMapCenter,
        defaultBounds: JEJU_REGION_CONFIG.mapBounds,
        locations: [],
      },
    );
    expect(mapInstances.at(-1)?.setBounds).toHaveBeenCalledTimes(1);
    expect(jejuController.getSearchViewport()).toMatchObject({
      center: JEJU_REGION_CONFIG.defaultMapCenter,
    });
    const mapCountBeforeRegionReset = mapInstances.length;
    await jejuController.updateData([{
      id: "jeju-source",
      name: "제주 장소",
      address: "제주특별자치도 제주시",
      coordinates: { latitude: 33.5, longitude: 126.53 },
      markerKind: "tourism-official",
    }], []);
    jejuController.resetRegion(BUSAN_REGION_CONFIG.mapBounds);
    expect(mapInstances).toHaveLength(mapCountBeforeRegionReset);
    expect(clusterers.at(-1)?.clear).toHaveBeenCalledTimes(1);
    expect(jejuContainer.dataset.markerRegistrySize).toBe("0");
    expect(jejuContainer.dataset.markerCacheSize).toBe("0");
    jejuController.destroy();

    window.kakao!.maps!.MarkerClusterer = FakeClusterer as unknown as KakaoMapsSdk["MarkerClusterer"];
    const scheduledBatches: Array<() => void> = [];
    const batchedContainer = document.createElement("div");
    const batchedController = createKakaoMapController(batchedContainer, {
      defaultCenter: BUSAN_REGION_CONFIG.defaultMapCenter,
      locations: [],
      markerBatchSize: 2,
      scheduleMarkerBatch: (callback) => scheduledBatches.push(callback),
    });
    const largeLocations = Array.from({ length: 5 }, (_, index) => ({
      id: `batched-${index}`,
      name: `배치 장소 ${index}`,
      address: "부산광역시",
      coordinates: { latitude: 35.1 + index * 0.001, longitude: 129.1 + index * 0.001 },
      markerKind: "tourism-official" as const,
    }));
    const batchedUpdate = batchedController.updateData(largeLocations, []);
    expect(batchedContainer.dataset.createdSourceMarkerCount).toBe("2");
    expect(scheduledBatches).toHaveLength(1);
    while (scheduledBatches.length > 0) {
      scheduledBatches.shift()?.();
      await Promise.resolve();
    }
    await expect(batchedUpdate).resolves.toBe(true);
    expect(batchedContainer.dataset.catalogMarkerCount).toBe("5");
    expect(batchedContainer.dataset.activeMarkerCount).toBe("5");

    const staleUpdate = batchedController.updateData(largeLocations.map((location) => ({
      ...location,
      id: `stale-${location.id}`,
    })), []);
    await expect(batchedController.updateData([largeLocations[0]], []))
      .resolves.toBe(true);
    while (scheduledBatches.length > 0) {
      scheduledBatches.shift()?.();
      await Promise.resolve();
    }
    await expect(staleUpdate).resolves.toBe(false);
    expect(batchedContainer.dataset.catalogMarkerCount).toBe("1");
    expect(batchedContainer.dataset.activeMarkerCount).toBe("1");
    const destroyedUpdate = batchedController.updateData(largeLocations, []);
    batchedController.destroy();
    while (scheduledBatches.length > 0) { scheduledBatches.shift()?.(); await Promise.resolve(); }
    await expect(destroyedUpdate).resolves.toBe(false);
    expect(clusterers.at(-1)?.markers).toHaveLength(0);
    await expect(batchedController.updateData(largeLocations, [])).resolves.toBe(false);
    expect(scheduledBatches).toHaveLength(0);

    const restoredContainer = document.createElement("div");
    vi.spyOn(restoredContainer, "getBoundingClientRect").mockReturnValue({ width: 800, height: 600 } as DOMRect);
    const restoredIdle = vi.fn();
    const restored = createKakaoMapController(restoredContainer, {
      defaultCenter: BUSAN_REGION_CONFIG.defaultMapCenter,
      defaultBounds: BUSAN_REGION_CONFIG.mapBounds,
      initialViewport: { center: { latitude: 35.2, longitude: 129.2 }, level: 7 },
      locations: [],
      markerBatchSize: 2,
      scheduleMarkerBatch: (callback) => scheduledBatches.push(callback),
      onViewportIdle: restoredIdle,
    });
    const restoredMap = mapInstances.at(-1)!;
    expect(restoredMap.getCenter().getLat()).toBe(35.2);
    expect(restoredIdle).toHaveBeenCalledWith(expect.anything(), "initial", 7);
    expect(restoredMap.setBounds).not.toHaveBeenCalled();
    const interactiveUpdate = restored.updateData(largeLocations, []);
    expect(restoredContainer.dataset.markerRegistrationPending).toBe("true");
    emit(restoredMap, "dragstart");
    while (scheduledBatches.length > 0) { scheduledBatches.shift()?.(); await Promise.resolve(); }
    await expect(interactiveUpdate).resolves.toBe(true);
    expect(restoredContainer.dataset.markerRegistrationPending).toBe("false");
    expect(restoredMap.setBounds).not.toHaveBeenCalled();
    expect(clusterers.at(-1)?.markers.map((marker) => marker.options.title)).toEqual(largeLocations.map((place) => `${place.name} · 한국관광공사 장소`));
    const historicalLocations = Array.from({ length: 1824 }, (_, index) => ({ ...largeLocations[0], id: `historical-${index}` }));
    const populate = restored.updateData(historicalLocations, [], { fitBounds: false });
    while (scheduledBatches.length > 0) { scheduledBatches.shift()?.(); await Promise.resolve(); }
    await populate;
    const createdBeforeToggle = restoredContainer.dataset.createdSourceMarkerCount;
    await restored.updateData([historicalLocations[0]], [], { fitBounds: false });
    const repeat = restored.updateData(historicalLocations, [], { fitBounds: false });
    while (scheduledBatches.length > 0) { scheduledBatches.shift()?.(); await Promise.resolve(); }
    await repeat;
    expect(restoredContainer.dataset.createdSourceMarkerCount).toBe(createdBeforeToggle);
    expect(clusterers.at(-1)?.markers).toHaveLength(1824);
    const cacheLocations = Array.from({ length: 2056 }, (_, index) => ({ ...largeLocations[0], id: `cache-${index}` }));
    const cacheUpdate = restored.updateData(cacheLocations, [], { fitBounds: false });
    while (scheduledBatches.length > 0) { scheduledBatches.shift()?.(); await Promise.resolve(); }
    await cacheUpdate;
    const cleanupBeforeEviction = removeListener.mock.calls.length;
    await restored.updateData([cacheLocations[0]], [], { fitBounds: false });
    expect(Number(restoredContainer.dataset.markerCacheSize)).toBe(2049);
    expect(removeListener.mock.calls.length).toBeGreaterThan(cleanupBeforeEviction);
    expect(clusterers.at(-1)?.markers).toHaveLength(1);
    restored.destroy();
    expect(listeners.get(restoredMap)?.get("dragstart")?.size ?? 0).toBe(0);

    vi.useFakeTimers();
    try {
      const timed = createKakaoMapController(document.createElement("div"), {
        defaultCenter: BUSAN_REGION_CONFIG.defaultMapCenter, locations: [], markerBatchSize: 2,
      });
      const pending = timed.updateData(largeLocations, []);
      expect(vi.getTimerCount()).toBe(1);
      timed.destroy();
      expect(vi.getTimerCount()).toBe(0);
      await expect(pending).resolves.toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
