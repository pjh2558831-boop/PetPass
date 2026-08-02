import { ConfigurationRequiredError } from "@/lib/shared/errors";
import type { Coordinates } from "@/types/place";

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoLatLngBounds {
  extend(point: KakaoLatLng): void;
}

interface KakaoMapInstance {
  panTo(point: KakaoLatLng): void;
  relayout(): void;
  setBounds(bounds: KakaoLatLngBounds, padding?: number): void;
}

interface KakaoCustomOverlay {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoPolyline {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoMapsEvent {
  addListener(
    target: KakaoMapInstance,
    eventName: string,
    handler: () => void,
  ): void;
  removeListener(
    target: KakaoMapInstance,
    eventName: string,
    handler: () => void,
  ): void;
}

export interface KakaoMapsSdk {
  load(callback: () => void): void;
  event: KakaoMapsEvent;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMapInstance;
  CustomOverlay: new (options: {
    map?: KakaoMapInstance;
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoCustomOverlay;
  Polyline: new (options: {
    map: KakaoMapInstance;
    path: KakaoLatLng[];
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
    strokeWeight: number;
  }) => KakaoPolyline;
}

declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsSdk };
  }
}

export interface KakaoMapLocation {
  id: string;
  name: string;
  address: string;
  coordinates?: Coordinates | null;
  order?: number;
}

export interface KakaoMapController {
  destroy(): void;
  fitBounds(): void;
  relayout(): void;
  selectLocation(id: string | null, notify?: boolean): void;
  updateData(
    locations: KakaoMapLocation[],
    routeCoordinates: Coordinates[],
  ): void;
}

export function getKakaoMapJavaScriptKey(): string {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY?.trim();
  if (!key) {
    throw new ConfigurationRequiredError(
      "NEXT_PUBLIC_KAKAO_MAP_JS_KEY가 설정되지 않았습니다.",
    );
  }
  return key;
}

export function getKakaoMapsSdkUrl(key: string): string {
  const params = new URLSearchParams({
    appkey: key,
    autoload: "false",
    libraries: "services,clusterer",
  });
  return `https://dapi.kakao.com/v2/maps/sdk.js?${params.toString()}`;
}

export function isKakaoMapsReady(): boolean {
  return typeof window !== "undefined" && Boolean(window.kakao?.maps?.Map);
}

function isValidCoordinates(value: Coordinates | null | undefined): value is Coordinates {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      value.longitude >= -180 &&
      value.longitude <= 180,
  );
}

export function createKakaoMapController(
  container: HTMLElement,
  options: {
    locations: KakaoMapLocation[];
    routeCoordinates?: Coordinates[];
    onLocationSelect?: (id: string) => void;
  },
): KakaoMapController {
  const maps = window.kakao?.maps;
  if (!maps) {
    throw new ConfigurationRequiredError(
      "카카오 지도 SDK를 불러오지 못했습니다. JavaScript 키와 허용 도메인을 확인해 주세요.",
    );
  }

  const defaultCenter = new maps.LatLng(35.1596, 129.174);
  const map = new maps.Map(container, { center: defaultCenter, level: 6 });
  const markerOverlays: KakaoCustomOverlay[] = [];
  const markerCleanups: Array<() => void> = [];
  const locationPositions = new Map<
    string,
    { location: KakaoMapLocation; position: KakaoLatLng }
  >();
  let visiblePoints: KakaoLatLng[] = [];
  let infoOverlay: KakaoCustomOverlay | null = null;
  let routeLine: KakaoPolyline | null = null;
  let selectedId: string | null = null;

  const closeInfo = () => {
    infoOverlay?.setMap(null);
    infoOverlay = null;
    selectedId = null;
  };

  const mapClickHandler = () => closeInfo();
  maps.event.addListener(map, "click", mapClickHandler);

  const clearLayers = () => {
    closeInfo();
    markerCleanups.splice(0).forEach((cleanup) => cleanup());
    markerOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
    routeLine?.setMap(null);
    routeLine = null;
    locationPositions.clear();
    visiblePoints = [];
  };

  const controller: KakaoMapController = {
    destroy() {
      clearLayers();
      maps.event.removeListener(map, "click", mapClickHandler);
      container.replaceChildren();
    },

    fitBounds() {
      if (visiblePoints.length === 0) return;
      const bounds = new maps.LatLngBounds();
      visiblePoints.forEach((point) => bounds.extend(point));
      map.setBounds(bounds, 48);
    },

    relayout() {
      map.relayout();
      controller.fitBounds();
    },

    selectLocation(id, notify = false) {
      infoOverlay?.setMap(null);
      infoOverlay = null;
      selectedId = id;
      if (!id) return;

      const selected = locationPositions.get(id);
      if (!selected) return;

      const content = document.createElement("div");
      content.className = "kakao-map-info";
      const name = document.createElement("strong");
      name.textContent = selected.location.name;
      const address = document.createElement("span");
      address.textContent = selected.location.address;
      content.append(name, address);

      infoOverlay = new maps.CustomOverlay({
        map,
        position: selected.position,
        content,
        xAnchor: 0.5,
        yAnchor: 1.75,
        zIndex: 10,
      });
      map.panTo(selected.position);
      if (notify) options.onLocationSelect?.(id);
    },

    updateData(locations, routeCoordinates) {
      const previousSelection = selectedId;
      clearLayers();

      locations.forEach((location) => {
        if (!isValidCoordinates(location.coordinates)) return;
        const position = new maps.LatLng(
          location.coordinates.latitude,
          location.coordinates.longitude,
        );
        locationPositions.set(location.id, { location, position });
        visiblePoints.push(position);

        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "kakao-map-marker";
        const markerLabel = document.createElement("span");
        markerLabel.textContent = location.order ? String(location.order) : "•";
        marker.append(markerLabel);
        marker.setAttribute("aria-label", `${location.name} 지도 마커`);
        const clickHandler = (event: Event) => {
          event.stopPropagation();
          controller.selectLocation(location.id, true);
        };
        marker.addEventListener("click", clickHandler);
        markerCleanups.push(() => marker.removeEventListener("click", clickHandler));

        markerOverlays.push(
          new maps.CustomOverlay({
            map,
            position,
            content: marker,
            xAnchor: 0.5,
            yAnchor: 1,
            zIndex: 4,
          }),
        );
      });

      const routePath = routeCoordinates
        .filter(isValidCoordinates)
        .map(({ latitude, longitude }) => new maps.LatLng(latitude, longitude));
      if (routePath.length > 1) {
        visiblePoints.push(...routePath);
        routeLine = new maps.Polyline({
          map,
          path: routePath,
          strokeColor: "#236148",
          strokeOpacity: 0.88,
          strokeStyle: "solid",
          strokeWeight: 5,
        });
      }

      controller.fitBounds();
      if (previousSelection && locationPositions.has(previousSelection)) {
        controller.selectLocation(previousSelection);
      }
    },
  };

  controller.updateData(options.locations, options.routeCoordinates ?? []);
  return controller;
}
