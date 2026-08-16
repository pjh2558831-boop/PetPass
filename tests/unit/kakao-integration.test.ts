import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as discoveryRoute } from "@/app/api/places/discovery/route";
import {
  geocodeAddress,
  searchKakaoPlaces,
} from "@/lib/kakao/local";
import {
  createKakaoMapController,
} from "@/lib/kakao/maps";
import { KAKAO_CURRENT_MAP_MAX_RADIUS_METERS } from "@/lib/kakao/search-area";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
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
        locations: [],
      }),
    ).toThrow("지도 SDK");
  });

  it("loads the clusterer library exactly once in the SDK URL", () => {
    const url = new URL(getKakaoMapsSdkUrl("test-key"));
    expect(url.searchParams.get("libraries")).toBe("services,clusterer");
    expect(url.searchParams.getAll("libraries")).toHaveLength(1);
  });

  it("initializes one catalog clusterer, deduplicates markers, and cleans up", () => {
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
        this.markers = markers;
        emit(this, "clustered", [
          {
            getMarkers: () => markers,
            getSize: () => markers.length,
          },
        ]);
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
    const controller = createKakaoMapController(container, {
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
    const overlayCountWithoutInfo = overlays.length;
    controller.setShowSelectionInfo(true);
    expect(overlays.length).toBeGreaterThan(overlayCountWithoutInfo);
    expect(
      overlays.slice(overlayCountWithoutInfo).some(({ content }) =>
        content.matches(".kakao-map-info"),
      ),
    ).toBe(true);

    controller.updateData(
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
    expect(clusterers[0].clear).toHaveBeenCalled();
    expect(clusterers[0].addMarkers).toHaveBeenCalledTimes(2);
    expect(clusterers[0].redraw).toHaveBeenCalledTimes(2);
    expect(mapInstances[0].setBounds).toHaveBeenCalledTimes(1);

    const retainedMarker = clusterers[0].markers[0];
    controller.updateData(
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
    expect(clusterers[0].clear).toHaveBeenCalledTimes(4);
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
    fallbackController.destroy();
  });
});
