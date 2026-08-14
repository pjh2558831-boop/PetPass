import { ConfigurationRequiredError } from "@/lib/shared/errors";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import { KAKAO_CURRENT_MAP_MAX_RADIUS_METERS } from "@/lib/kakao/search-area";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import type { Coordinates } from "@/types/place";

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoLatLngBounds {
  extend(point: KakaoLatLng): void;
  getNorthEast(): KakaoLatLng;
  getSouthWest(): KakaoLatLng;
}

interface KakaoMapInstance {
  getBounds(): KakaoLatLngBounds;
  getCenter(): KakaoLatLng;
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
  setPosition(position: KakaoLatLng): void;
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

export type KakaoMapMarkerKind =
  | "catalog"
  | "departure"
  | "itinerary"
  | "search"
  | "tourism-official"
  | "business-confirmed"
  | "administrator-confirmed"
  | "user-reported"
  | "kakao-candidate"
  | "veterinary"
  | "pet-shop"
  | "shopping";

export interface KakaoMapLocation {
  id: string;
  name: string;
  address: string;
  coordinates?: Coordinates | null;
  order?: number;
  markerKind?: KakaoMapMarkerKind;
  markerLabel?: string;
  sourceLabel?: string;
  interactive?: boolean;
  clusterable?: boolean;
}

export interface KakaoMapController {
  destroy(): void;
  fitBounds(): void;
  getSearchViewport(): KakaoCurrentMapSearch | null;
  relayout(): void;
  selectLocation(id: string | null, notify?: boolean): void;
  setShowSelectionInfo(show: boolean): void;
  updateData(
    locations: KakaoMapLocation[],
    routeCoordinates: Coordinates[],
    options?: { fitBounds?: boolean },
  ): void;
}

function distanceMeters(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
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

export interface KakaoCoordinatePickerController {
  destroy(): void;
  relayout(): void;
  setSelection(coordinates: Coordinates | null, center?: boolean): void;
}

export function getRenderableRouteCoordinates(
  routeCoordinates: Coordinates[],
): Coordinates[] {
  return routeCoordinates.length > 1 && routeCoordinates.every(isValidMapCoordinates)
    ? routeCoordinates
    : [];
}

export function createKakaoCoordinatePicker(
  container: HTMLElement,
  options: {
    initialCoordinates?: Coordinates | null;
    onSelect: (coordinates: Coordinates) => void;
  },
): KakaoCoordinatePickerController {
  const maps = window.kakao?.maps;
  if (!maps?.Map || !maps.LatLng || !maps.Marker || !maps.event) {
    throw new ConfigurationRequiredError(
      "카카오 지도 SDK가 준비되지 않아 출발지를 선택할 수 없습니다.",
    );
  }

  const initialCoordinates = isValidMapCoordinates(options.initialCoordinates)
    ? options.initialCoordinates
    : BUSAN_REGION_CONFIG.defaultMapCenter;
  const map = new maps.Map(container, {
    center: new maps.LatLng(
      initialCoordinates.latitude,
      initialCoordinates.longitude,
    ),
    level: 5,
  });
  let marker: KakaoMarker | null = null;

  const setSelection = (
    coordinates: Coordinates | null,
    center = false,
  ) => {
    if (!isValidMapCoordinates(coordinates)) {
      marker?.setMap(null);
      marker = null;
      return;
    }
    const position = new maps.LatLng(
      coordinates.latitude,
      coordinates.longitude,
    );
    if (marker) {
      marker.setPosition(position);
      marker.setMap(map);
    } else {
      marker = new maps.Marker({ map, position, title: "선택한 출발지" });
    }
    if (center) map.panTo(position);
  };

  const handleMapClick = (event: unknown) => {
    const latLng = (event as { latLng?: KakaoLatLng } | null)?.latLng;
    if (!latLng) return;
    const coordinates = {
      latitude: latLng.getLat(),
      longitude: latLng.getLng(),
    };
    if (!isValidMapCoordinates(coordinates)) return;
    setSelection(coordinates);
    options.onSelect(coordinates);
  };

  maps.event.addListener(map, "click", handleMapClick);
  container.dataset.kakaoCoordinatePickerReady = "true";
  setSelection(options.initialCoordinates ?? null);

  return {
    destroy() {
      maps.event.removeListener(map, "click", handleMapClick);
      marker?.setMap(null);
      marker = null;
      delete container.dataset.kakaoCoordinatePickerReady;
    },
    relayout() {
      map.relayout();
    },
    setSelection,
  };
}

const TRANSPARENT_MARKER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";

export function createKakaoMapController(
  container: HTMLElement,
  options: {
    locations: KakaoMapLocation[];
    routeCoordinates?: Coordinates[];
    onLocationSelect?: (id: string | null) => void;
    onViewportIdle?: (viewport: KakaoCurrentMapSearch) => void;
    showSelectionInfo?: boolean;
  },
): KakaoMapController {
  const maps = window.kakao?.maps;
  if (
    !maps?.Map ||
    !maps.LatLng ||
    !maps.LatLngBounds ||
    !maps.CustomOverlay ||
    !maps.Marker ||
    !maps.MarkerImage ||
    !maps.Point ||
    !maps.Polyline ||
    !maps.Size
  ) {
    throw new ConfigurationRequiredError(
      "카카오 지도 SDK를 불러오지 못했습니다.",
    );
  }

  const defaultCenter = new maps.LatLng(
    BUSAN_REGION_CONFIG.defaultMapCenter.latitude,
    BUSAN_REGION_CONFIG.defaultMapCenter.longitude,
  );
  const map = new maps.Map(container, { center: defaultCenter, level: 8 });
  const transparentMarkerImage = new maps.MarkerImage(
    TRANSPARENT_MARKER_SVG,
    new maps.Size(1, 1),
    { offset: new maps.Point(0, 0) },
  );
  const nativeMarkerImages = new Map<KakaoMapMarkerKind, KakaoMarkerImage>();
  const nativeMarkerVisual = (kind: KakaoMapMarkerKind) => {
    const visuals: Record<KakaoMapMarkerKind, { color: string; label: string; textColor?: string; shape: "pin" | "diamond" | "circle" | "square" }> = {
      veterinary: { color: "#c84141", label: "+", shape: "circle" },
      "pet-shop": { color: "#6657a8", label: "▣", shape: "square" },
      catalog: { color: "#236148", label: "공", shape: "pin" },
      departure: { color: "#2467a8", label: "출", shape: "circle" },
      "tourism-official": { color: "#236148", label: "공", shape: "pin" },
      "business-confirmed": { color: "#267d73", label: "업", shape: "square" },
      "administrator-confirmed": { color: "#7356a8", label: "관", shape: "circle" },
      "user-reported": { color: "#a8692d", label: "제", shape: "circle" },
      search: { color: "#f4c84a", label: "K", textColor: "#493a0b", shape: "pin" },
      "kakao-candidate": { color: "#f4c84a", label: "K", textColor: "#493a0b", shape: "pin" },
      shopping: { color: "#6d588c", label: "쇼", shape: "diamond" },
      itinerary: { color: "#b85f40", label: "", shape: "diamond" },
    };
    return visuals[kind];
  };
  const getNativeMarkerImage = (kind: KakaoMapMarkerKind) => {
    const existing = nativeMarkerImages.get(kind);
    if (existing) return existing;
    const visual = nativeMarkerVisual(kind);
    const shape =
      visual.shape === "pin"
        ? '<path d="M15 1C7.27 1 1 7.27 1 15c0 10.5 14 20 14 20s14-9.5 14-20C29 7.27 22.73 1 15 1Z"/>'
        : visual.shape === "diamond"
        ? '<path d="M15 1 29 15 15 35 1 15Z"/>'
        : visual.shape === "square"
          ? '<rect x="2" y="2" width="26" height="30" rx="6"/>'
          : '<circle cx="15" cy="16" r="14"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 30 36"><g fill="${visual.color}" stroke="white" stroke-width="2">${shape}</g><text x="15" y="20" text-anchor="middle" fill="${visual.textColor ?? "white"}" font-size="11" font-weight="900" font-family="sans-serif">${visual.label}</text></svg>`;
    const image = new maps.MarkerImage(
      `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      new maps.Size(30, 36),
      { offset: new maps.Point(15, 34) },
    );
    nativeMarkerImages.set(kind, image);
    return image;
  };
  const clusterer = maps.MarkerClusterer
    ? new maps.MarkerClusterer({
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
            background: "#596760",
            boxShadow: "0 8px 22px rgba(35,97,72,.28)",
            color: "#fff",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "900",
            lineHeight: "38px",
            textAlign: "center",
          },
        ],
      })
    : null;
  const markerOverlays: KakaoCustomOverlay[] = [];
  const standaloneMarkers: KakaoMarker[] = [];
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
  let shouldShowSelectionInfo = options.showSelectionInfo !== false;
  let destroyed = false;
  let markerRenderFrame: number | null = null;

  container.dataset.kakaoMapInitialized = "true";
  container.dataset.clustererReady = clusterer ? "true" : "false";
  container.dataset.clusterCount = "0";
  container.dataset.catalogMarkerCount = "0";
  container.dataset.interactiveMarkerCount = "0";

  const setCatalogMarkerClustered = (
    button: HTMLButtonElement,
    clustered: boolean,
  ) => {
    button.classList.toggle("is-clustered", clustered);
    if (clustered) {
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    } else {
      button.removeAttribute("aria-hidden");
      button.tabIndex = 0;
    }

    const overlayRoot = button.parentElement;
    if (overlayRoot) {
      overlayRoot.style.pointerEvents = clustered ? "none" : "";
      overlayRoot.style.visibility = clustered ? "hidden" : "";
    }
  };

  const resetSelectionVisuals = () => {
    if (selectedId) {
      const selectedButton = locationPositions.get(selectedId)?.button;
      selectedButton?.classList.remove("is-selected");
      selectedButton?.setAttribute("aria-pressed", "false");
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

  const readSearchViewport = (): KakaoCurrentMapSearch | null => {
    const center = map.getCenter?.();
    const bounds = map.getBounds?.();
    const northEast = bounds?.getNorthEast?.();
    const southWest = bounds?.getSouthWest?.();
    if (!center || !northEast || !southWest) return null;
    const centerCoordinates = {
      latitude: center.getLat(),
      longitude: center.getLng(),
    };
    const northEastCoordinates = {
      latitude: northEast.getLat(),
      longitude: northEast.getLng(),
    };
    const southWestCoordinates = {
      latitude: southWest.getLat(),
      longitude: southWest.getLng(),
    };
    if (
      !isValidMapCoordinates(centerCoordinates) ||
      !isValidMapCoordinates(northEastCoordinates) ||
      !isValidMapCoordinates(southWestCoordinates) ||
      southWestCoordinates.longitude >= northEastCoordinates.longitude ||
      southWestCoordinates.latitude >= northEastCoordinates.latitude
    ) {
      return null;
    }
    const radiusMeters = Math.min(
      KAKAO_CURRENT_MAP_MAX_RADIUS_METERS,
      Math.max(
        500,
        Math.ceil(
          Math.max(
            distanceMeters(centerCoordinates, northEastCoordinates),
            distanceMeters(centerCoordinates, southWestCoordinates),
          ),
        ),
      ),
    );
    return {
      center: centerCoordinates,
      radiusMeters,
      rectangle: {
        west: southWestCoordinates.longitude,
        south: southWestCoordinates.latitude,
        east: northEastCoordinates.longitude,
        north: northEastCoordinates.latitude,
      },
    };
  };
  const viewportIdleHandler = () => {
    const viewport = readSearchViewport();
    if (viewport) options.onViewportIdle?.(viewport);
  };
  maps.event.addListener(map, "idle", viewportIdleHandler);
  viewportIdleHandler();

  const syncClusteredCatalogOverlays = (clustersValue: unknown) => {
    if (destroyed) return;
    for (const button of catalogButtonByMarker.values()) {
      setCatalogMarkerClustered(button, false);
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
        setCatalogMarkerClustered(button, true);
      }
    }
    container.dataset.clusterCount = String(visibleClusterCount);
  };
  if (clusterer) {
    maps.event.addListener(clusterer, "clustered", syncClusteredCatalogOverlays);
  }

  const clearLayers = () => {
    if (markerRenderFrame !== null) {
      window.cancelAnimationFrame(markerRenderFrame);
      markerRenderFrame = null;
    }
    resetSelectionVisuals();
    catalogButtonByMarker.clear();
    clusterer?.clear();
    catalogMarkers = [];
    markerCleanups.splice(0).forEach((cleanup) => cleanup());
    markerOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
    standaloneMarkers.splice(0).forEach((marker) => marker.setMap(null));
    routeLine?.setMap(null);
    routeLine = null;
    locationPositions.clear();
    visiblePoints = [];
    container.dataset.clusterCount = "0";
    container.dataset.catalogMarkerCount = "0";
    container.dataset.interactiveMarkerCount = "0";
  };

  const controller: KakaoMapController = {
    destroy() {
      if (destroyed) return;
      if (clusterer) {
        maps.event.removeListener(
          clusterer,
          "clustered",
          syncClusteredCatalogOverlays,
        );
      }
      clearLayers();
      maps.event.removeListener(map, "click", mapClickHandler);
      maps.event.removeListener(map, "idle", viewportIdleHandler);
      destroyed = true;
      container.replaceChildren();
      delete container.dataset.clustererReady;
      delete container.dataset.kakaoMapInitialized;
    },

    fitBounds() {
      if (visiblePoints.length === 0) return;
      if (visiblePoints.length === 1) {
        map.panTo(visiblePoints[0]);
        return;
      }
      const bounds = new maps.LatLngBounds();
      visiblePoints.forEach((point) => bounds.extend(point));
      map.setBounds(bounds, 48);
    },

    getSearchViewport() {
      return readSearchViewport();
    },

    relayout() {
      map.relayout();
    },

    setShowSelectionInfo(show) {
      if (shouldShowSelectionInfo === show) return;
      shouldShowSelectionInfo = show;
      const currentSelection = selectedId;
      if (currentSelection) controller.selectLocation(currentSelection);
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
      selected.button.setAttribute("aria-pressed", "true");

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

      if (shouldShowSelectionInfo) {
        const content = document.createElement("div");
        content.className = "kakao-map-info";
        const name = document.createElement("strong");
        name.textContent = selected.location.name;
        const address = document.createElement("span");
        address.textContent = selected.location.address;
        content.append(name, address);
        if (selected.location.sourceLabel) {
          const source = document.createElement("small");
          source.textContent = selected.location.sourceLabel;
          content.append(source);
        }

        infoOverlay = new maps.CustomOverlay({
          map,
          position: selected.position,
          content,
          xAnchor: 0.5,
          yAnchor: 1.75,
          zIndex: 10,
        });
      }
      map.panTo(selected.position);
      if (notify) options.onLocationSelect?.(id);
    },

    updateData(locations, routeCoordinates, updateOptions = {}) {
      const previousSelection = selectedId;
      clearLayers();
      const seenLocationIds = new Set<string>();
      let catalogMarkerCount = 0;
      let interactiveMarkerCount = 0;

      const renderLocation = (location: KakaoMapLocation) => {
        if (
          seenLocationIds.has(location.id) ||
          !isValidMapCoordinates(location.coordinates)
        ) {
          return;
        }
        seenLocationIds.add(location.id);
        const position = new maps.LatLng(
          location.coordinates.latitude,
          location.coordinates.longitude,
        );
        visiblePoints.push(position);

        const kind =
          location.markerKind ?? (location.order ? "itinerary" : "catalog");
        const interactive = location.interactive !== false;
        const clusterable =
          location.clusterable ?? !["itinerary", "departure"].includes(kind);
        let markerButton: HTMLButtonElement | null = null;
        if (interactive) {
          interactiveMarkerCount += 1;
          const marker = document.createElement("button");
          marker.type = "button";
          marker.className = `kakao-map-marker kakao-map-marker--${kind}`;
          marker.dataset.locationId = location.id;
          const markerLabel = document.createElement("span");
          markerLabel.textContent =
            kind === "itinerary" && location.order
              ? String(location.order)
              : location.markerLabel ?? nativeMarkerVisual(kind).label;
          marker.append(markerLabel);
          marker.setAttribute("aria-pressed", "false");
          marker.setAttribute(
            "aria-label",
            `${kind === "itinerary" && location.order ? `${location.order}번 ` : ""}${location.name} · ${location.sourceLabel ?? "장소"} 지도 마커`,
          );
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
            zIndex: kind === "departure" ? 7 : kind === "itinerary" ? 6 : 4,
          });
          markerOverlays.push(overlay);
          locationPositions.set(location.id, {
            button: marker,
            location,
            position,
          });
          markerButton = marker;
        }

        if (clusterable) {
          catalogMarkerCount += 1;
        }
        if (clusterable) {
          const proxyMarker = new maps.Marker({
            clickable: false,
            ...(interactive
              ? { image: transparentMarkerImage }
              : { image: getNativeMarkerImage(kind), title: location.name }),
            position,
            ...(!clusterer && !interactive ? { map } : {}),
          });
          proxyMarker.setZIndex(0);
          if (clusterer) catalogMarkers.push(proxyMarker);
          else if (!interactive) standaloneMarkers.push(proxyMarker);
          if (markerButton) catalogButtonByMarker.set(proxyMarker, markerButton);
        }
      };

      const routePath = getRenderableRouteCoordinates(routeCoordinates)
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

      const finishMarkers = () => {
        markerRenderFrame = null;
        container.dataset.catalogMarkerCount = String(catalogMarkerCount);
        container.dataset.interactiveMarkerCount = String(interactiveMarkerCount);
        if (clusterer && catalogMarkers.length > 0) clusterer.addMarkers(catalogMarkers);
        if (updateOptions.fitBounds !== false) controller.fitBounds();
        if (previousSelection && locationPositions.has(previousSelection)) controller.selectLocation(previousSelection);
      };
      const batchSize = 100;
      let offset = 0;
      const renderBatch = () => {
        if (destroyed) return;
        const end = Math.min(offset + batchSize, locations.length);
        for (; offset < end; offset += 1) renderLocation(locations[offset]);
        container.dataset.catalogMarkerCount = String(catalogMarkerCount);
        container.dataset.interactiveMarkerCount = String(interactiveMarkerCount);
        if (offset < locations.length) markerRenderFrame = window.requestAnimationFrame(renderBatch);
        else finishMarkers();
      };
      if (locations.length > batchSize) markerRenderFrame = window.requestAnimationFrame(renderBatch);
      else { locations.forEach(renderLocation); finishMarkers(); }
    },
  };

  controller.updateData(options.locations, options.routeCoordinates ?? []);
  return controller;
}
