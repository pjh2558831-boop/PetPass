import { ConfigurationRequiredError } from "@/lib/shared/errors";
import { KAKAO_CURRENT_MAP_MAX_RADIUS_METERS } from "@/lib/kakao/search-area";
import {
  getSourceMarkerAsset,
  type SourceMarkerSource,
} from "@/lib/kakao/marker-assets";
import { recordHomepageBrowserTiming } from "@/lib/homepage/browser-performance";
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

export interface KakaoMarker {
  setImage(image: KakaoMarkerImage): void;
  setMap(map: KakaoMapInstance | null): void;
  setPosition(position: KakaoLatLng): void;
  setTitle?(title: string): void;
  setZIndex(zIndex: number): void;
}

interface KakaoCluster {
  getMarkers(): KakaoMarker[];
  getSize(): number;
}

interface KakaoMarkerClusterer {
  addMarkers(markers: KakaoMarker[], nodraw?: boolean): void;
  removeMarkers(markers: KakaoMarker[], nodraw?: boolean): void;
  clear(): void;
  redraw?(): void;
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
  resetRegion(defaultBounds?: KakaoCurrentMapSearch["rectangle"]): void;
  selectLocation(id: string | null, notify?: boolean): void;
  setShowSelectionInfo(show: boolean): void;
  updateData(
    locations: KakaoMapLocation[],
    routeCoordinates: Coordinates[],
    options?: { fitBounds?: boolean },
  ): Promise<boolean>;
}

export type KakaoViewportIdleCause = "initial" | "programmatic" | "user";

export interface SourceMarkerRecord {
  placeId: string;
  source: SourceMarkerSource;
  marker: KakaoMarker;
  normalImage: KakaoMarkerImage;
  selectedImage: KakaoMarkerImage;
  listenerCleanup: () => void;
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
    defaultCenter: Coordinates;
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
    : options.defaultCenter;
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

export function createKakaoMapController(
  container: HTMLElement,
  options: {
    defaultCenter: Coordinates;
    defaultLevel?: number;
    defaultBounds?: KakaoCurrentMapSearch["rectangle"];
    locations: KakaoMapLocation[];
    routeCoordinates?: Coordinates[];
    onLocationSelect?: (id: string | null) => void;
    onViewportIdle?: (
      viewport: KakaoCurrentMapSearch,
      cause: KakaoViewportIdleCause,
    ) => void;
    showSelectionInfo?: boolean;
    markerBatchSize?: number;
    scheduleMarkerBatch?: (callback: () => void) => void;
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
  const CustomOverlayConstructor = maps.CustomOverlay;

  const defaultCenter = new maps.LatLng(
    options.defaultCenter.latitude,
    options.defaultCenter.longitude,
  );
  const map = new maps.Map(container, {
    center: defaultCenter,
    level: options.defaultLevel ?? 8,
  });
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
  const sourceMarkerImages = new Map<
    SourceMarkerSource,
    { normal: KakaoMarkerImage; selected: KakaoMarkerImage }
  >();
  const getSourceMarkerImages = (source: SourceMarkerSource) => {
    const existing = sourceMarkerImages.get(source);
    if (existing) return existing;
    const asset = getSourceMarkerAsset(source);
    const createImage = (size: typeof asset.normal) => new maps.MarkerImage(
      asset.path,
      new maps.Size(size.width, size.height),
      { offset: new maps.Point(size.anchorX, size.anchorY) },
    );
    const images = {
      normal: createImage(asset.normal),
      selected: createImage(asset.selected),
    };
    sourceMarkerImages.set(source, images);
    return images;
  };
  const getSourceForKind = (
    kind: KakaoMapMarkerKind,
  ): SourceMarkerSource | null => {
    if (kind === "tourism-official" || kind === "catalog") return "tourism";
    if (kind === "kakao-candidate" || kind === "search") return "kakao_candidate";
    if (kind === "veterinary") return "veterinary";
    if (kind === "pet-shop") return "pet_shop";
    return null;
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
  const sourceMarkerRegistry = new Map<string, SourceMarkerRecord & {
    location: KakaoMapLocation;
    position: KakaoLatLng;
    clusterable: boolean;
  }>();
  const legacyMarkerOverlays: KakaoCustomOverlay[] = [];
  const legacyNativeMarkers: KakaoMarker[] = [];
  const legacyMarkerCleanups: Array<() => void> = [];
  const locationPositions = new Map<
    string,
    {
      button: HTMLButtonElement | null;
      location: KakaoMapLocation;
      position: KakaoLatLng;
      sourceMarker: SourceMarkerRecord | null;
    }
  >();
  let visiblePoints: KakaoLatLng[] = [];
  let infoOverlay: KakaoCustomOverlay | null = null;
  let routeLine: KakaoPolyline | null = null;
  let selectedId: string | null = null;
  let shouldShowSelectionInfo = options.showSelectionInfo !== false;
  let destroyed = false;
  let pendingProgrammaticViewport = false;
  const clustererResetCount = 0;
  let clusterRedrawCount = 0;
  let createdSourceMarkerCount = 0;
  let activeClusterSourceIds = new Set<string>();
  let activeStandaloneSourceIds = new Set<string>();
  const pendingClusterSourceIds = new Set<string>();
  let currentDefaultBounds = options.defaultBounds;
  let updateGeneration = 0;
  const markerBatchSize = Math.max(1, options.markerBatchSize ?? 300);
  const scheduleMarkerBatch = options.scheduleMarkerBatch ?? ((callback: () => void) => {
    const browserScheduler = (globalThis as typeof globalThis & {
      scheduler?: { postTask?: (task: () => void, options?: { priority?: string }) => Promise<unknown> };
    }).scheduler;
    if (browserScheduler?.postTask) {
      void browserScheduler.postTask(callback, { priority: "user-visible" });
      return;
    }
    setTimeout(callback, 0);
  });

  container.dataset.kakaoMapInitialized = "true";
  container.dataset.clustererReady = clusterer ? "true" : "false";
  container.dataset.clusterCount = "0";
  container.dataset.catalogMarkerCount = "0";
  container.dataset.interactiveMarkerCount = "0";
  container.dataset.markerRegistrySize = "0";
  container.dataset.activeMarkerCount = "0";
  container.dataset.customOverlayMarkerCount = "0";
  container.dataset.clustererInstanceCount = clusterer ? "1" : "0";
  container.dataset.clustererResetCount = "0";
  container.dataset.clusterRedrawCount = "0";
  container.dataset.createdSourceMarkerCount = "0";

  const resetSelectionVisuals = () => {
    if (selectedId) {
      const selected = locationPositions.get(selectedId);
      const selectedButton = selected?.button;
      selectedButton?.classList.remove("is-selected");
      selectedButton?.setAttribute("aria-pressed", "false");
      if (selected?.sourceMarker) {
        selected.sourceMarker.marker.setImage(selected.sourceMarker.normalImage);
        selected.sourceMarker.marker.setZIndex(4);
      }
    }
    infoOverlay?.setMap(null);
    infoOverlay = null;
    container.dataset.infoOverlayCount = "0";
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
    if (!viewport) return;
    const cause: KakaoViewportIdleCause = pendingProgrammaticViewport
      ? "programmatic"
      : "user";
    pendingProgrammaticViewport = false;
    options.onViewportIdle?.(viewport, cause);
  };
  maps.event.addListener(map, "idle", viewportIdleHandler);
  const initialViewport = readSearchViewport();
  if (initialViewport) options.onViewportIdle?.(initialViewport, "initial");

  const syncClusteredCatalogOverlays = (clustersValue: unknown) => {
    if (destroyed) return;
    const clusters = Array.isArray(clustersValue)
      ? (clustersValue as KakaoCluster[])
      : [];
    container.dataset.clusterCount = String(
      clusters.filter((cluster) => cluster.getSize() >= 2).length,
    );
  };
  if (clusterer) {
    maps.event.addListener(clusterer, "clustered", syncClusteredCatalogOverlays);
  }

  const clearLegacyLayers = () => {
    legacyMarkerCleanups.splice(0).forEach((cleanup) => cleanup());
    legacyMarkerOverlays.splice(0).forEach((overlay) => overlay.setMap(null));
    legacyNativeMarkers.splice(0).forEach((marker) => marker.setMap(null));
    container.dataset.customOverlayMarkerCount = "0";
  };

  const clearLayers = () => {
    updateGeneration += 1;
    resetSelectionVisuals();
    clusterer?.clear();
    for (const record of sourceMarkerRegistry.values()) {
      record.listenerCleanup();
      record.marker.setMap(null);
    }
    sourceMarkerRegistry.clear();
    pendingClusterSourceIds.clear();
    activeClusterSourceIds.clear();
    activeStandaloneSourceIds.clear();
    clearLegacyLayers();
    routeLine?.setMap(null);
    routeLine = null;
    locationPositions.clear();
    visiblePoints = [];
    container.dataset.clusterCount = "0";
    container.dataset.catalogMarkerCount = "0";
    container.dataset.interactiveMarkerCount = "0";
    container.dataset.markerRegistrySize = "0";
    container.dataset.markerCacheSize = "0";
    container.dataset.activeMarkerCount = "0";
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
      if (visiblePoints.length === 0) {
        if (!currentDefaultBounds) return;
        const bounds = new maps.LatLngBounds();
        bounds.extend(new maps.LatLng(
          currentDefaultBounds.south,
          currentDefaultBounds.west,
        ));
        bounds.extend(new maps.LatLng(
          currentDefaultBounds.north,
          currentDefaultBounds.east,
        ));
        pendingProgrammaticViewport = true;
        map.setBounds(bounds, 48);
        return;
      }
      if (visiblePoints.length === 1) {
        pendingProgrammaticViewport = true;
        map.panTo(visiblePoints[0]);
        return;
      }
      const bounds = new maps.LatLngBounds();
      visiblePoints.forEach((point) => bounds.extend(point));
      pendingProgrammaticViewport = true;
      map.setBounds(bounds, 48);
    },

    getSearchViewport() {
      return readSearchViewport();
    },

    relayout() {
      map.relayout();
    },

    resetRegion(defaultBounds) {
      currentDefaultBounds = defaultBounds;
      clearLayers();
      controller.fitBounds();
    },

    setShowSelectionInfo(show) {
      if (shouldShowSelectionInfo === show) return;
      shouldShowSelectionInfo = show;
      if (!selectedId) return;
      infoOverlay?.setMap(null);
      infoOverlay = null;
      if (!show) {
        container.dataset.infoOverlayCount = "0";
        return;
      }
      const selected = locationPositions.get(selectedId);
      if (selected) renderSelectionInfo(selected);
    },

    selectLocation(id, notify = false) {
      if (id && selectedId === id) {
        if (notify) options.onLocationSelect?.(id);
        return;
      }
      resetSelectionVisuals();
      if (!id) {
        if (notify) options.onLocationSelect?.(null);
        return;
      }

      const selected = locationPositions.get(id);
      if (!selected) return;
      selectedId = id;
      selected.button?.classList.add("is-selected");
      selected.button?.setAttribute("aria-pressed", "true");
      if (selected.sourceMarker) {
        selected.sourceMarker.marker.setImage(selected.sourceMarker.selectedImage);
        selected.sourceMarker.marker.setZIndex(9);
      }
      if (shouldShowSelectionInfo) renderSelectionInfo(selected);
      pendingProgrammaticViewport = true;
      map.panTo(selected.position);
      if (notify) options.onLocationSelect?.(id);
    },

    async updateData(locations, routeCoordinates, updateOptions = {}) {
      const generation = ++updateGeneration;
      const updateStartedAt = performance.now();
      if (clusterer && pendingClusterSourceIds.size > 0) {
        const pendingMarkers = [...pendingClusterSourceIds]
          .flatMap((id) => sourceMarkerRegistry.get(id)?.marker ?? []);
        if (pendingMarkers.length > 0) clusterer.removeMarkers(pendingMarkers, true);
        pendingClusterSourceIds.clear();
      }
      const previousSelection = selectedId;
      resetSelectionVisuals();
      clearLegacyLayers();
      routeLine?.setMap(null);
      routeLine = null;
      const seenLocationIds = new Set<string>();
      let interactiveMarkerCount = 0;
      const desiredSourceIds = new Set<string>();
      const preflightIds = new Set<string>();
      for (const location of locations) {
        if (preflightIds.has(location.id) || !isValidMapCoordinates(location.coordinates)) continue;
        preflightIds.add(location.id);
        const kind = location.markerKind ?? (location.order ? "itinerary" : "catalog");
        if (getSourceForKind(kind)) desiredSourceIds.add(location.id);
      }
      const removedBeforeRender = [...activeClusterSourceIds]
        .filter((id) => !desiredSourceIds.has(id));
      const removedBeforeRenderMarkers = removedBeforeRender
        .flatMap((id) => sourceMarkerRegistry.get(id)?.marker ?? []);
      if (clusterer && removedBeforeRenderMarkers.length > 0) {
        clusterer.removeMarkers(removedBeforeRenderMarkers, true);
        if (locations.length > markerBatchSize) {
          clusterer.redraw?.();
          clusterRedrawCount += 1;
        }
      } else if (!clusterer) {
        removedBeforeRenderMarkers.forEach((marker) => marker.setMap(null));
      }
      for (const id of activeStandaloneSourceIds) {
        if (!desiredSourceIds.has(id)) sourceMarkerRegistry.get(id)?.marker.setMap(null);
      }
      activeClusterSourceIds = new Set(
        [...activeClusterSourceIds].filter((id) => desiredSourceIds.has(id)),
      );
      activeStandaloneSourceIds = new Set(
        [...activeStandaloneSourceIds].filter((id) => desiredSourceIds.has(id)),
      );
      const nextClusterSourceIds = new Set<string>();
      const nextStandaloneSourceIds = new Set<string>();
      const activeClusterMarkers: KakaoMarker[] = [];
      const activeStandaloneMarkers: KakaoMarker[] = [];
      let clusterGeometryChanged = false;
      visiblePoints = [];
      locationPositions.clear();

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
        const source = getSourceForKind(kind);
        if (source) {
          desiredSourceIds.add(location.id);
          const images = getSourceMarkerImages(source);
          let record = sourceMarkerRegistry.get(location.id);
          if (!record) {
            const marker = new maps.Marker({
              clickable: interactive,
              image: images.normal,
              position,
              title: `${location.name} · ${getSourceMarkerAsset(source).accessibleLabel}`,
            });
            marker.setZIndex(4);
            const mutableRecord: SourceMarkerRecord & {
              location: KakaoMapLocation;
              position: KakaoLatLng;
              clusterable: boolean;
            } = {
              placeId: location.id,
              source,
              marker,
              normalImage: images.normal,
              selectedImage: images.selected,
              listenerCleanup: () => undefined,
              location,
              position,
              clusterable,
            };
            const clickHandler = () => {
              if (mutableRecord.location.interactive === false) return;
              controller.selectLocation(mutableRecord.placeId, true);
            };
            maps.event.addListener(marker, "click", clickHandler);
            mutableRecord.listenerCleanup = () => maps.event.removeListener(
              marker,
              "click",
              clickHandler,
            );
            record = mutableRecord;
            sourceMarkerRegistry.set(location.id, record);
            createdSourceMarkerCount += 1;
          } else {
            const positionChanged = record.position.getLat() !== position.getLat() ||
              record.position.getLng() !== position.getLng();
            const sourceChanged = record.source !== source;
            const titleChanged = record.location.name !== location.name;
            if (
              activeClusterSourceIds.has(location.id) &&
              positionChanged
            ) {
              clusterGeometryChanged = true;
            }
            record.source = source;
            record.normalImage = images.normal;
            record.selectedImage = images.selected;
            record.location = location;
            record.position = position;
            record.clusterable = clusterable;
            if (positionChanged) record.marker.setPosition(position);
            if (sourceChanged) record.marker.setImage(images.normal);
            if (sourceChanged || titleChanged) {
              record.marker.setTitle?.(`${location.name} · ${getSourceMarkerAsset(source).accessibleLabel}`);
            }
          }
          if (clusterable) {
            nextClusterSourceIds.add(location.id);
            activeClusterMarkers.push(record.marker);
          } else {
            nextStandaloneSourceIds.add(location.id);
            activeStandaloneMarkers.push(record.marker);
          }
          if (interactive) interactiveMarkerCount += 1;
          locationPositions.set(location.id, {
            button: null,
            location,
            position,
            sourceMarker: record,
          });
          return;
        }
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
          legacyMarkerCleanups.push(() => marker.removeEventListener("click", clickHandler));

          const overlay = new maps.CustomOverlay({
            map,
            position,
            content: marker,
            xAnchor: 0.5,
            yAnchor: 1,
            zIndex: kind === "departure" ? 7 : kind === "itinerary" ? 6 : 4,
          });
          legacyMarkerOverlays.push(overlay);
          locationPositions.set(location.id, {
            button: marker,
            location,
            position,
            sourceMarker: null,
          });
        }
        if (!interactive) {
          const marker = new maps.Marker({
            clickable: false,
            image: getNativeMarkerImage(kind),
            map,
            position,
            title: location.name,
          });
          marker.setZIndex(4);
          legacyNativeMarkers.push(marker);
        }
      };

      for (let index = 0; index < locations.length; index += markerBatchSize) {
        const batch = locations.slice(index, index + markerBatchSize);
        batch.forEach(renderLocation);
        if (clusterer && locations.length > markerBatchSize) {
          const batchIds = batch.map(({ id }) => id)
            .filter((id) =>
              nextClusterSourceIds.has(id) &&
              !activeClusterSourceIds.has(id) &&
              !pendingClusterSourceIds.has(id));
          const batchMarkers = batchIds
            .flatMap((id) => sourceMarkerRegistry.get(id)?.marker ?? []);
          if (batchMarkers.length > 0) clusterer.addMarkers(batchMarkers, true);
          batchIds.forEach((id) => pendingClusterSourceIds.add(id));
        }
        container.dataset.createdSourceMarkerCount = String(createdSourceMarkerCount);
        if (index + markerBatchSize < locations.length) {
          await new Promise<void>((resolve) => scheduleMarkerBatch(resolve));
          if (destroyed || generation !== updateGeneration) return false;
        }
      }
      for (const [placeId, record] of sourceMarkerRegistry) {
        if (desiredSourceIds.has(placeId)) continue;
        if (
          activeStandaloneSourceIds.has(placeId) ||
          (!clusterer && activeClusterSourceIds.has(placeId))
        ) record.marker.setMap(null);
      }
      const clusterUpdateStartedAt = performance.now();
      for (const id of activeStandaloneSourceIds) {
        if (!nextStandaloneSourceIds.has(id)) sourceMarkerRegistry.get(id)?.marker.setMap(null);
      }
      if (clusterer) {
        const removed = [...activeClusterSourceIds]
          .filter((id) => !nextClusterSourceIds.has(id))
          .flatMap((id) => sourceMarkerRegistry.get(id)?.marker ?? []);
        const added = [...nextClusterSourceIds]
          .filter((id) =>
            !activeClusterSourceIds.has(id) &&
            !pendingClusterSourceIds.has(id))
          .flatMap((id) => sourceMarkerRegistry.get(id)?.marker ?? []);
        if (removed.length > 0) clusterer.removeMarkers(removed, true);
        if (added.length > 0) clusterer.addMarkers(added, true);
        if (
          removed.length > 0 ||
          added.length > 0 ||
          pendingClusterSourceIds.size > 0 ||
          (removedBeforeRender.length > 0 && locations.length <= markerBatchSize) ||
          clusterGeometryChanged
        ) {
          clusterer.redraw?.();
          clusterRedrawCount += 1;
        }
      } else {
        activeClusterMarkers.forEach((marker) => marker.setMap(map));
      }
      for (const id of nextStandaloneSourceIds) {
        if (!activeStandaloneSourceIds.has(id)) sourceMarkerRegistry.get(id)?.marker.setMap(map);
      }
      activeClusterSourceIds = nextClusterSourceIds;
      activeStandaloneSourceIds = nextStandaloneSourceIds;
      pendingClusterSourceIds.clear();

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

      container.dataset.catalogMarkerCount = String(desiredSourceIds.size);
      container.dataset.interactiveMarkerCount = String(interactiveMarkerCount);
      container.dataset.markerRegistrySize = String(desiredSourceIds.size);
      container.dataset.markerCacheSize = String(sourceMarkerRegistry.size);
      container.dataset.activeMarkerCount = String(
        activeClusterMarkers.length + activeStandaloneMarkers.length,
      );
      container.dataset.customOverlayMarkerCount = String(legacyMarkerOverlays.length);
      container.dataset.clustererResetCount = String(clustererResetCount);
      container.dataset.clusterRedrawCount = String(clusterRedrawCount);
      container.dataset.createdSourceMarkerCount = String(createdSourceMarkerCount);
      container.dataset.clusterUpdateMs = (performance.now() - clusterUpdateStartedAt).toFixed(2);
      container.dataset.markerUpdateMs = (performance.now() - updateStartedAt).toFixed(2);
      recordHomepageBrowserTiming("map", "cluster_update", clusterUpdateStartedAt);
      recordHomepageBrowserTiming("map", "marker_update", updateStartedAt);
      if (updateOptions.fitBounds !== false) controller.fitBounds();
      if (previousSelection && locationPositions.has(previousSelection)) {
        controller.selectLocation(previousSelection);
      }
      return true;
    },
  };

  function renderSelectionInfo(
    selected: {
      location: KakaoMapLocation;
      position: KakaoLatLng;
    },
  ) {
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
    infoOverlay = new CustomOverlayConstructor({
      map,
      position: selected.position,
      content,
      xAnchor: 0.5,
      yAnchor: 1.75,
      zIndex: 10,
    });
    container.dataset.infoOverlayCount = "1";
  }

  void controller.updateData(options.locations, options.routeCoordinates ?? []);
  return controller;
}
