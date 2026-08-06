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

interface KakaoMarkerImage {
  readonly __kakaoMarkerImage?: never;
}

interface KakaoMarker {
  setImage(image: KakaoMarkerImage): void;
  setMap(map: KakaoMapInstance | null): void;
  setZIndex(zIndex: number): void;
}

interface KakaoCluster {
  getMarkers(): KakaoMarker[];
  getSize(): number;
}

interface KakaoMarkerClusterer {
  addMarkers(markers: KakaoMarker[]): void;
  clear(): void;
}

interface KakaoMapsEvent {
  addListener(
    target: object,
    eventName: string,
    handler: (...args: unknown[]) => void,
  ): void;
  removeListener(
    target: object,
    eventName: string,
    handler: (...args: unknown[]) => void,
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
  Marker: new (options: {
    clickable?: boolean;
    image?: KakaoMarkerImage;
    map?: KakaoMapInstance;
    position: KakaoLatLng;
    title?: string;
    zIndex?: number;
  }) => KakaoMarker;
  MarkerImage: new (
    source: string,
    size: object,
    options?: { offset?: object },
  ) => KakaoMarkerImage;
  MarkerClusterer: new (options: {
    averageCenter?: boolean;
    clickable?: boolean;
    disableClickZoom?: boolean;
    gridSize?: number;
    map: KakaoMapInstance;
    minClusterSize?: number;
    minLevel?: number;
    styles?: Array<Record<string, string>>;
  }) => KakaoMarkerClusterer;
  Point: new (x: number, y: number) => object;
  Polyline: new (options: {
    map: KakaoMapInstance;
    path: KakaoLatLng[];
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
    strokeWeight: number;
  }) => KakaoPolyline;
  Size: new (width: number, height: number) => object;
}

declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsSdk };
  }
}

export type KakaoMapMarkerKind = "catalog" | "itinerary" | "search";

export interface KakaoMapLocation {
  id: string;
  name: string;
  address: string;
  coordinates?: Coordinates | null;
  order?: number;
  markerKind?: KakaoMapMarkerKind;
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

export function isValidMapCoordinates(
  value: Coordinates | null | undefined,
): value is Coordinates {
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

const TRANSPARENT_MARKER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

export function createKakaoMapController(
  container: HTMLElement,
  options: {
    locations: KakaoMapLocation[];
    routeCoordinates?: Coordinates[];
    onLocationSelect?: (id: string | null) => void;
  },
): KakaoMapController {
  const maps = window.kakao?.maps;
  if (
    !maps?.Map ||
    !maps.Marker ||
    !maps.MarkerClusterer ||
    !maps.MarkerImage ||
    !maps.Point ||
    !maps.Size
  ) {
    throw new ConfigurationRequiredError(
      "카카오 지도 SDK와 clusterer 라이브러리를 불러오지 못했습니다.",
    );
  }

  const defaultCenter = new maps.LatLng(35.1596, 129.174);
  const map = new maps.Map(container, { center: defaultCenter, level: 6 });
  const transparentMarkerImage = new maps.MarkerImage(
    TRANSPARENT_MARKER_SVG,
    new maps.Size(1, 1),
    { offset: new maps.Point(0, 0) },
  );
  const clusterer = new maps.MarkerClusterer({
    map,
    averageCenter: true,
    clickable: true,
    disableClickZoom: false,
    gridSize: 54,
    minClusterSize: 2,
    minLevel: 5,
    styles: [
      {
        width: "46px",
        height: "46px",
        boxSizing: "border-box",
        border: "4px solid rgba(255,255,255,.96)",
        borderRadius: "50%",
        background: "#236148",
        boxShadow: "0 8px 22px rgba(35,97,72,.28)",
        color: "#fff",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "900",
        lineHeight: "38px",
        textAlign: "center",
      },
    ],
  });
  const markerOverlays: KakaoCustomOverlay[] = [];
  const markerCleanups: Array<() => void> = [];
  const catalogButtonByMarker = new Map<KakaoMarker, HTMLButtonElement>();
  const locationPositions = new Map<
    string,
    {
      button: HTMLButtonElement;
      location: KakaoMapLocation;
      position: KakaoLatLng;
    }
  >();
  let catalogMarkers: KakaoMarker[] = [];
  let visiblePoints: KakaoLatLng[] = [];
  let infoOverlay: KakaoCustomOverlay | null = null;
  let selectionOverlay: KakaoCustomOverlay | null = null;
  let routeLine: KakaoPolyline | null = null;
  let selectedId: string | null = null;
  let destroyed = false;

  container.dataset.clustererReady = "true";
  container.dataset.clusterCount = "0";
  container.dataset.catalogMarkerCount = "0";

  const resetSelectionVisuals = () => {
    if (selectedId) {
      locationPositions.get(selectedId)?.button.classList.remove("is-selected");
    }
    infoOverlay?.setMap(null);
    selectionOverlay?.setMap(null);
    infoOverlay = null;
    selectionOverlay = null;
    selectedId = null;
  };

  const mapClickHandler = () => {
    resetSelectionVisuals();
    options.onLocationSelect?.(null);
  };
  maps.event.addListener(map, "click", mapClickHandler);

  const syncClusteredCatalogOverlays = (clustersValue: unknown) => {
    if (destroyed) return;
    for (const button of catalogButtonByMarker.values()) {
      button.classList.remove("is-clustered");
      button.removeAttribute("aria-hidden");
      button.tabIndex = 0;
    }
    const clusters = Array.isArray(clustersValue)
      ? (clustersValue as KakaoCluster[])
      : [];
    let visibleClusterCount = 0;
    for (const cluster of clusters) {
      if (cluster.getSize() < 2) continue;
      visibleClusterCount += 1;
      for (const marker of cluster.getMarkers()) {
        const button = catalogButtonByMarker.get(marker);
        if (!button) continue;
        button.classList.add("is-clustered");
        button.setAttribute("aria-hidden", "true");
        button.tabIndex = -1;
      }
    }
    container.dataset.clusterCount = String(visibleClusterCount);
  };
  maps.event.addListener(clusterer, "clustered", syncClusteredCatalogOverlays);

  const clearLayers = () => {
    resetSelectionVisuals();
    catalogButtonByMarker.clear();
    clusterer.clear();
    catalogMarkers = [];
    markerCleanups.splice(0).forEach((cleanup) => cleanup());
    markerOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
    routeLine?.setMap(null);
    routeLine = null;
    locationPositions.clear();
    visiblePoints = [];
    container.dataset.clusterCount = "0";
    container.dataset.catalogMarkerCount = "0";
  };

  const controller: KakaoMapController = {
    destroy() {
      if (destroyed) return;
      maps.event.removeListener(clusterer, "clustered", syncClusteredCatalogOverlays);
      clearLayers();
      maps.event.removeListener(map, "click", mapClickHandler);
      destroyed = true;
      container.replaceChildren();
      delete container.dataset.clustererReady;
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
      resetSelectionVisuals();
      if (!id) {
        if (notify) options.onLocationSelect?.(null);
        return;
      }

      const selected = locationPositions.get(id);
      if (!selected) return;
      selectedId = id;
      selected.button.classList.add("is-selected");

      const selection = document.createElement("div");
      selection.className = "kakao-map-selection";
      selection.setAttribute("aria-hidden", "true");
      selectionOverlay = new maps.CustomOverlay({
        map,
        position: selected.position,
        content: selection,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 7,
      });

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
      const seenLocationIds = new Set<string>();

      for (const location of locations) {
        if (
          seenLocationIds.has(location.id) ||
          !isValidMapCoordinates(location.coordinates)
        ) {
          continue;
        }
        seenLocationIds.add(location.id);
        const position = new maps.LatLng(
          location.coordinates.latitude,
          location.coordinates.longitude,
        );
        visiblePoints.push(position);

        const kind =
          location.markerKind ?? (location.order ? "itinerary" : "catalog");
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `kakao-map-marker kakao-map-marker--${kind}`;
        marker.dataset.locationId = location.id;
        const markerLabel = document.createElement("span");
        markerLabel.textContent =
          kind === "itinerary" && location.order ? String(location.order) : "";
        marker.append(markerLabel);
        marker.setAttribute("aria-label", `${location.name} 지도 마커`);
        const clickHandler = (event: Event) => {
          event.stopPropagation();
          controller.selectLocation(location.id, true);
        };
        marker.addEventListener("click", clickHandler);
        markerCleanups.push(() => marker.removeEventListener("click", clickHandler));

        const overlay = new maps.CustomOverlay({
          map,
          position,
          content: marker,
          xAnchor: 0.5,
          yAnchor: 1,
          zIndex: kind === "itinerary" ? 6 : 4,
        });
        markerOverlays.push(overlay);
        locationPositions.set(location.id, {
          button: marker,
          location,
          position,
        });

        if (kind === "catalog") {
          const proxyMarker = new maps.Marker({
            clickable: false,
            image: transparentMarkerImage,
            position,
          });
          proxyMarker.setZIndex(0);
          catalogMarkers.push(proxyMarker);
          catalogButtonByMarker.set(proxyMarker, marker);
        }
      }

      container.dataset.catalogMarkerCount = String(catalogMarkers.length);
      if (catalogMarkers.length > 0) clusterer.addMarkers(catalogMarkers);

      const routePath = routeCoordinates
        .filter(isValidMapCoordinates)
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
