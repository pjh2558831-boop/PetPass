"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Layers, LocateFixed, MapPinned, Minus, Plus, ScanSearch } from "lucide-react";
import {
  createKakaoMapController,
  isValidMapCoordinates,
  type KakaoMapController,
  type KakaoMapLocation,
  type KakaoViewportIdleCause,
} from "@/lib/kakao/maps";
import {
  getKakaoMapJavaScriptKey,
  getKakaoMapsPublicError,
  isClustererOnlySdkFailure,
  isKakaoBaseMapsReady,
  loadKakaoMapsSdk,
} from "@/lib/kakao/sdk-loader";
import { deriveRegionLabel } from "@/lib/regions/label";
import { getRegionConfig } from "@/lib/regions/config";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import type { Coordinates } from "@/types/place";
import type { RegionId } from "@/types/region";

export interface MapLayerControl {
  id: string;
  label: string;
  markerKind: KakaoMapLocation["markerKind"];
  count: number | null;
  visible: boolean;
  disabled?: boolean;
  description?: string;
}

export interface MapPanelProps {
  regionId: RegionId;
  compact?: boolean;
  title?: string;
  locationLabel?: string;
  locations: KakaoMapLocation[];
  routeCoordinates?: Coordinates[];
  selectedLocationId?: string | null;
  selectionFocusKey?: number;
  onLocationSelect?: (id: string | null) => void;
  onDataUpdate?: () => void;
  onCurrentMapSearch?: (viewport: KakaoCurrentMapSearch) => void;
  onViewportIdle?: (
    viewport: KakaoCurrentMapSearch,
    cause: KakaoViewportIdleCause,
    level?: number,
  ) => void;
  viewportKey?: string;
  fitOnResize?: boolean;
  fitOnDataChange?: boolean;
  focusBounds?: KakaoCurrentMapSearch["rectangle"];
  layerControls?: MapLayerControl[];
  onLayerToggle?: (id: string, visible: boolean) => void;
  showLocationLabel?: boolean;
  showSelectionInfo?: boolean;
  selectionContent?: ReactNode;
  showWatermark?: boolean;
  showNavigationControls?: boolean;
  showSatelliteControl?: boolean;
  currentMapSearchLabel?: string;
  showCurrentMapSearch?: boolean;
  emptyMessage?: string;
  isDataLoading?: boolean;
  showEmptyMessage?: boolean;
  initialLevel?: number;
  initialViewport?: { center: Coordinates; level: number };
  loadingPresentation?: "status" | "visual-only";
}

const EMPTY_ROUTE_COORDINATES: Coordinates[] = [];

function getLayerMarkerAsset(
  kind: KakaoMapLocation["markerKind"],
): string | null {
  if (kind === "tourism-official" || kind === "catalog") return "/map-pins/tourism-official.svg";
  if (kind === "kakao-candidate" || kind === "search") return "/map-pins/kakao-candidate.svg";
  if (kind === "veterinary") return "/map-pins/veterinary.svg";
  if (kind === "pet-shop") return "/map-pins/pet-shop.svg";
  return null;
}

export function MapPanel({
  regionId,
  compact = false,
  title,
  locationLabel,
  locations,
  routeCoordinates = EMPTY_ROUTE_COORDINATES,
  selectedLocationId = null,
  selectionFocusKey,
  onLocationSelect,
  onDataUpdate,
  onCurrentMapSearch,
  onViewportIdle,
  viewportKey = "default",
  fitOnResize = false,
  fitOnDataChange = true,
  focusBounds,
  layerControls = [],
  onLayerToggle,
  showLocationLabel = true,
  showSelectionInfo = true,
  selectionContent,
  showWatermark = true,
  showNavigationControls = false,
  showSatelliteControl = true,
  currentMapSearchLabel = "이 지역 검색 다시하기",
  showCurrentMapSearch = true,
  emptyMessage = "표시할 장소가 없습니다.",
  isDataLoading = false,
  showEmptyMessage = true,
  initialLevel,
  initialViewport,
  loadingPresentation = "status",
}: MapPanelProps) {
  const [satellite, setSatellite] = useState(false);
  const region = getRegionConfig(regionId);
  const resolvedInitialLevel = initialViewport?.level ?? initialLevel ?? region.defaultMapLevel;
  const resolvedTitle = title ?? `${region.displayName} 장소 지도`;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<KakaoMapController | null>(null);
  const controllerRegionRef = useRef<RegionId | null>(null);
  const dataUpdateGenerationRef = useRef(0);
  const initializingRef = useRef(false);
  const viewportKeyRef = useRef(viewportKey);
  const appliedSelectionFocusKeyRef = useRef(selectionFocusKey);
  const locationCountRef = useRef(locations.length);
  const currentViewportKeyRef = useRef(viewportKey);
  const showSelectionInfoRef = useRef(showSelectionInfo);
  const latestRef = useRef({
    locations,
    routeCoordinates,
    selectedLocationId,
    isDataLoading,
    regionId,
    initialViewport,
    defaultCenter: region.defaultMapCenter,
    defaultLevel: resolvedInitialLevel,
    defaultBounds: region.mapBounds,
  });
  const selectRef = useRef(onLocationSelect);
  const dataUpdateRef = useRef(onDataUpdate);
  const viewportIdleRef = useRef(onViewportIdle);
  const currentSearchRef = useRef(onCurrentMapSearch);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { controllerRef.current?.setSatellite(satellite); }, [satellite, loadState, regionId]);
  const [markersPending, setMarkersPending] = useState(false);
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [mapVersion, setMapVersion] = useState(0);

  useEffect(() => {
    latestRef.current = {
      locations,
      routeCoordinates,
      selectedLocationId,
      isDataLoading,
      regionId,
      initialViewport,
      defaultCenter: region.defaultMapCenter,
      defaultLevel: resolvedInitialLevel,
      defaultBounds: region.mapBounds,
    };
    selectRef.current = onLocationSelect;
    dataUpdateRef.current = onDataUpdate;
    viewportIdleRef.current = onViewportIdle;
    currentSearchRef.current = onCurrentMapSearch;
    currentViewportKeyRef.current = viewportKey;
    showSelectionInfoRef.current = showSelectionInfo;
  }, [initialViewport, isDataLoading, locations, onCurrentMapSearch, onDataUpdate, onLocationSelect, onViewportIdle, region.defaultMapCenter, region.mapBounds, regionId, resolvedInitialLevel, routeCoordinates, selectedLocationId, showSelectionInfo, viewportKey]);

  const initializeMap = useCallback(() => {
    const container = mapContainerRef.current;
    if (!container || !isKakaoBaseMapsReady() || initializingRef.current) return;
    if (controllerRef.current) return;
    initializingRef.current = true;
    try {
      const latest = latestRef.current;
      const controller = createKakaoMapController(container, {
        initialViewport: latest.initialViewport,
        defaultCenter: latest.defaultCenter,
        defaultLevel: latest.defaultLevel,
        defaultBounds: latest.defaultBounds,
        locations: [],
        onLocationSelect: (id) => selectRef.current?.(id),
        onViewportIdle: (viewport, cause, level) => viewportIdleRef.current?.(viewport, cause, level),
        showSelectionInfo: showSelectionInfoRef.current,
      });
      controllerRef.current = controller;
      controllerRegionRef.current = latest.regionId;
      const updateGeneration = ++dataUpdateGenerationRef.current;
      setMarkersPending(true);
      void controller.updateData(latest.locations, latest.routeCoordinates, { fitBounds: !latest.initialViewport }).then((completed) => {
        if (!completed || controllerRef.current !== controller || updateGeneration !== dataUpdateGenerationRef.current) return;
        setMarkersPending(false);
        controller.selectLocation(latestRef.current.selectedLocationId);
        if (!latest.initialViewport && latestRef.current.selectedLocationId) controller.focusLocation(latestRef.current.selectedLocationId);
        if (latest.locations.length > 0 || !latest.isDataLoading) dataUpdateRef.current?.();
      });
      viewportKeyRef.current = currentViewportKeyRef.current;
      setLoadState("ready");
      setLoadError("");
      setMapVersion((value) => value + 1);
    } catch (error) {
      setLoadState("error");
      setLoadError(error instanceof Error ? error.message : "지도를 초기화하지 못했습니다.");
    } finally {
      initializingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMapsSdk().then(() => {
      if (!cancelled) initializeMap();
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (isClustererOnlySdkFailure(error) && isKakaoBaseMapsReady()) {
        initializeMap();
        return;
      }
      setLoadState("error");
      setLoadError(getKakaoMapsPublicError(error));
    });
    return () => { cancelled = true; };
  }, [initializeMap, sdkAttempt]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || controllerRegionRef.current === regionId) return;
    dataUpdateGenerationRef.current += 1;
    controller.resetRegion(region.mapBounds);
    controllerRegionRef.current = regionId;
    viewportKeyRef.current = viewportKey;
    locationCountRef.current = 0;
  }, [region.mapBounds, regionId, viewportKey]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const fitBounds = fitOnDataChange && (viewportKeyRef.current !== viewportKey ||
      (locationCountRef.current === 0 && locations.length > 0));
    const updateGeneration = ++dataUpdateGenerationRef.current;
    setMarkersPending(true);
    void controller.updateData(locations, routeCoordinates, { fitBounds }).then((completed) => {
      if (!completed || controllerRef.current !== controller || updateGeneration !== dataUpdateGenerationRef.current) return;
      setMarkersPending(false);
      controller.selectLocation(latestRef.current.selectedLocationId);
      if (locations.length > 0 || !latestRef.current.isDataLoading) dataUpdateRef.current?.();
    });
    viewportKeyRef.current = viewportKey;
    locationCountRef.current = locations.length;
  }, [fitOnDataChange, locations, routeCoordinates, viewportKey]);

  useEffect(() => {
    if (loadState === "ready" && focusBounds) controllerRef.current?.focusBounds(focusBounds);
  }, [focusBounds, loadState]);

  useEffect(() => {
    controllerRef.current?.selectLocation(selectedLocationId);
    if (selectedLocationId && (selectionFocusKey === undefined || selectionFocusKey !== appliedSelectionFocusKeyRef.current)) {
      controllerRef.current?.focusLocation(selectedLocationId);
    }
    appliedSelectionFocusKeyRef.current = selectionFocusKey;
  }, [selectedLocationId, selectionFocusKey]);

  useEffect(() => { controllerRef.current?.setShowSelectionInfo(showSelectionInfo); }, [showSelectionInfo]);

  useEffect(() => {
    const container = mapContainerRef.current;
    const controller = controllerRef.current;
    if (!container || !controller || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      controller.relayout();
      if (fitOnResize) controller.fitBounds();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitOnResize, mapVersion]);

  useEffect(() => () => {
    controllerRef.current?.destroy();
    controllerRef.current = null;
    controllerRegionRef.current = null;
    dataUpdateGenerationRef.current += 1;
    initializingRef.current = false;
  }, []);

  try {
    getKakaoMapJavaScriptKey();
  } catch {
    return <section aria-label={resolvedTitle}><div role="alert" data-map-error-category="configuration" className={`map-canvas grid place-items-center p-8 text-center ${compact ? "!min-h-[300px]" : ""}`}><p className="map-public-error"><strong>지도를 일시적으로 불러오지 못했습니다.</strong><span>장소 목록은 계속 확인할 수 있어요.</span></p></div></section>;
  }

  const missingCoordinateCount = locations.filter((location) => !isValidMapCoordinates(location.coordinates)).length;
  const validLocationCount = locations.length - missingCoordinateCount;
  const resolvedLocationLabel = locationLabel ?? deriveRegionLabel({ roadAddress: locations[0]?.address });
  const legendLayers = layerControls.filter((layer) => layer.id !== "all");
  const showLoadingMessage = !loadError && (loadState === "loading" || isDataLoading || markersPending);

  return (
    <section className={`relative${selectionContent ? " map-panel-with-preview" : ""}`} aria-label={resolvedTitle}>
      <div className={`map-canvas kakao-map-canvas ${compact ? "!min-h-[300px]" : ""}`} aria-busy={showLoadingMessage} data-location-count={validLocationCount} data-map-version={mapVersion} data-route-point-count={routeCoordinates.length} data-initial-level={resolvedInitialLevel}>
        <div ref={mapContainerRef} className="absolute inset-0" role="group" aria-label="지도 장소 마커" />
        {showLoadingMessage && loadingPresentation === "status" ? <p role="status" aria-live="polite" className="absolute inset-x-4 top-20 z-10 rounded-lg bg-white/95 p-4 text-center text-sm font-bold">{loadState === "ready" ? "지도 장소를 업데이트 중입니다…" : "지도를 불러오는 중입니다…"}</p> : null}
        {showLoadingMessage && loadingPresentation === "visual-only" ? <span className="map-loading-indicator" aria-hidden="true" /> : null}
        {loadError ? <p role="alert" data-map-error-category="sdk" className="map-public-error absolute inset-x-4 top-20 z-10"><strong>지도를 일시적으로 불러오지 못했습니다.</strong><span>장소 목록은 계속 확인할 수 있어요.</span><button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => { setLoadError(""); setLoadState("loading"); setSdkAttempt((value) => value + 1); }}>지도 다시 시도</button></p> : null}
        {showEmptyMessage && loadState === "ready" && !isDataLoading && !markersPending && validLocationCount === 0 ? <p role="status" className="absolute inset-x-4 top-20 z-10 rounded-lg bg-white/95 p-4 text-center text-sm font-bold">{emptyMessage}</p> : null}
        {missingCoordinateCount > 0 ? <p className="absolute inset-x-4 bottom-16 z-10 rounded-xl bg-[#fff8f1]/95 p-3 text-xs font-bold text-[#7a4b2f]">좌표를 확인할 수 없는 장소 {missingCoordinateCount}곳은 지도에서 제외했습니다.</p> : null}
        {showWatermark ? <div className="map-watermark">
          {routeCoordinates.length >= 2 ? "지도 · 실제 장소와 이동 경로" : "지도 · 실제 장소"}
        </div> : null}
        {showNavigationControls ? <div className="map-navigation-controls" aria-label="지도 화면 조절">
          <button type="button" disabled={loadState !== "ready"} onClick={() => controllerRef.current?.fitBounds()} aria-label="표시된 장소에 지도 위치 맞추기"><LocateFixed size={19} aria-hidden="true" /></button>
          <div>
            <button type="button" disabled={loadState !== "ready"} onClick={() => controllerRef.current?.zoomBy(-1)} aria-label="지도 확대"><Plus size={21} aria-hidden="true" /></button>
            <button type="button" disabled={loadState !== "ready"} onClick={() => controllerRef.current?.zoomBy(1)} aria-label="지도 축소"><Minus size={21} aria-hidden="true" /></button>
          </div>
          {showSatelliteControl && <button type="button" disabled={loadState !== "ready"} aria-pressed={satellite} onClick={() => setSatellite(!satellite)}><Layers size={20} aria-hidden="true" /><span>위성지도</span></button>}
        </div> : null}
        {showLocationLabel ? <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-bold text-[#314b3f] shadow-sm"><MapPinned size={15} aria-hidden="true" />{resolvedLocationLabel}</div> : null}
        {legendLayers.length > 0 ? <div className="absolute right-3 top-3 z-10 flex max-w-[calc(100%-7rem)] flex-wrap justify-end gap-1.5 rounded-xl border border-white/90 bg-white/95 p-2 text-[10px] font-extrabold shadow-sm" aria-label="지도 마커 범례">{legendLayers.map((layer) => { const asset = getLayerMarkerAsset(layer.markerKind); return <span key={layer.id} className="inline-flex items-center gap-1.5">{asset ? <Image src={asset} width={18} height={22} alt="" aria-hidden="true" /> : <span className={`map-legend-marker map-legend-marker--${layer.markerKind}`} aria-hidden="true" />}{layer.label}<span className="font-semibold text-[#52635a]">{layer.count ?? "—"}</span></span>; })}</div> : null}
        {!showNavigationControls ? <button type="button" onClick={() => controllerRef.current?.fitBounds()} disabled={loadState !== "ready"} className="absolute bottom-4 left-4 z-10 grid size-11 place-items-center rounded-full border border-white/80 bg-white/90 text-[#236148] shadow-sm disabled:opacity-50" aria-label="표시된 장소에 지도 위치 맞추기"><LocateFixed size={18} aria-hidden="true" /></button> : null}
        {onCurrentMapSearch && showCurrentMapSearch ? <button type="button" onClick={() => { const viewport = controllerRef.current?.getSearchViewport(); if (viewport) currentSearchRef.current?.(viewport); }} disabled={loadState !== "ready"} className="map-current-search-button absolute bottom-4 right-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/95 px-4 text-xs font-extrabold text-[#236148] shadow-sm disabled:opacity-50" aria-label={currentMapSearchLabel}><ScanSearch size={16} aria-hidden="true" />{currentMapSearchLabel}</button> : null}
      </div>
      {layerControls.length > 0 ? <fieldset className="mt-3 rounded-lg border border-[#d8e2dc] bg-white p-3"><legend className="px-1 text-xs font-black text-[#344a40]">지도 레이어</legend><div className="mt-1 flex flex-wrap gap-2">{layerControls.map((layer) => { const asset = getLayerMarkerAsset(layer.markerKind); return <button key={layer.id} type="button" aria-pressed={layer.visible} disabled={layer.disabled} title={layer.description} onClick={() => onLayerToggle?.(layer.id, !layer.visible)} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-extrabold transition disabled:opacity-45 ${layer.visible ? "border-[#8caf9d] bg-[#edf8f2] text-[#285c45]" : "border-[#d7e0da] bg-white text-[#68776f]"}`}>{asset ? <Image src={asset} width={18} height={22} alt="" aria-hidden="true" /> : <span className={`map-legend-marker map-legend-marker--${layer.markerKind ?? "catalog"}`} aria-hidden="true" />}<span>{layer.label}</span><span className="font-semibold text-[#52635a]">{layer.count ?? "—"}</span></button>; })}</div><p className="mt-2 text-[11px] leading-5 text-[#52635a]">레이어 수량은 표시 여부를 적용하기 전의 필터 결과이며, —는 현재 불러올 수 없음을 뜻합니다.</p></fieldset> : null}
      {selectionContent ? <div className="map-selection-content">{selectionContent}</div> : null}
    </section>
  );
}
