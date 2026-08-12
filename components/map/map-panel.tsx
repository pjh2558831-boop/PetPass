"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed, MapPinned, ScanSearch } from "lucide-react";
import {
  createKakaoMapController,
  isValidMapCoordinates,
  type KakaoMapController,
  type KakaoMapLocation,
} from "@/lib/kakao/maps";
import {
  getKakaoMapJavaScriptKey,
  getKakaoMapsPublicError,
  isClustererOnlySdkFailure,
  isKakaoBaseMapsReady,
  loadKakaoMapsSdk,
} from "@/lib/kakao/sdk-loader";
import type { Coordinates } from "@/types/place";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import { deriveRegionLabel } from "@/lib/regions/label";

export interface MapLayerControl {
  id: string;
  label: string;
  markerKind: KakaoMapLocation["markerKind"];
  count: number;
  visible: boolean;
  disabled?: boolean;
  description?: string;
}

const DEFAULT_LOCATIONS: KakaoMapLocation[] = [
  {
    id: "demo-busan-coast-walk",
    name: "청사포 바다 산책길",
    address: "부산 해운대구 청사포로 000",
    coordinates: { latitude: 35.1596, longitude: 129.1917 },
    order: 1,
  },
  {
    id: "demo-busan-terrace-table",
    name: "마린 테라스 식탁",
    address: "부산 해운대구 달맞이길 000",
    coordinates: { latitude: 35.1582, longitude: 129.1782 },
    order: 2,
  },
  {
    id: "demo-busan-mint-cafe",
    name: "민트 파도 카페",
    address: "부산 해운대구 해운대해변로 000",
    coordinates: { latitude: 35.159, longitude: 129.1603 },
    order: 3,
  },
];

export function MapPanel({
  compact = false,
  title = "부산 데모 지도",
  locationLabel,
  locations = DEFAULT_LOCATIONS,
  routeCoordinates = [],
  selectedLocationId = null,
  onLocationSelect,
  onCurrentMapSearch,
  onViewportIdle,
  viewportKey = "default",
  layerControls = [],
  onLayerToggle,
  emptyMessage = "현재 지도 범위에 표시할 장소가 없습니다.",
}: {
  compact?: boolean;
  title?: string;
  locationLabel?: string;
  locations?: KakaoMapLocation[];
  routeCoordinates?: Coordinates[];
  selectedLocationId?: string | null;
  onLocationSelect?: (id: string | null) => void;
  onCurrentMapSearch?: (viewport: KakaoCurrentMapSearch) => void;
  onViewportIdle?: (viewport: KakaoCurrentMapSearch) => void;
  viewportKey?: string;
  layerControls?: MapLayerControl[];
  onLayerToggle?: (id: string, visible: boolean) => void;
  emptyMessage?: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<KakaoMapController | null>(null);
  const initializationRequestedRef = useRef(false);
  const viewportKeyRef = useRef(viewportKey);
  const latestDataRef = useRef({
    locations,
    routeCoordinates,
    selectedLocationId,
  });
  const onLocationSelectRef = useRef(onLocationSelect);
  const onCurrentMapSearchRef = useRef(onCurrentMapSearch);
  const onViewportIdleRef = useRef(onViewportIdle);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const [mapVersion, setMapVersion] = useState(0);
  const resolvedLocationLabel =
    locationLabel ?? deriveRegionLabel({ roadAddress: locations[0]?.address });

  useEffect(() => {
    latestDataRef.current = { locations, routeCoordinates, selectedLocationId };
    onLocationSelectRef.current = onLocationSelect;
    onCurrentMapSearchRef.current = onCurrentMapSearch;
    onViewportIdleRef.current = onViewportIdle;
  }, [
    locations,
    onCurrentMapSearch,
    onViewportIdle,
    onLocationSelect,
    routeCoordinates,
    selectedLocationId,
  ]);

  const initializeMap = useCallback(() => {
    const container = mapContainerRef.current;
    if (!container || !isKakaoBaseMapsReady()) return;
    if (initializationRequestedRef.current) return;
    initializationRequestedRef.current = true;

    try {
      const latestData = latestDataRef.current;
      controllerRef.current?.destroy();
      controllerRef.current = createKakaoMapController(container, {
        locations: latestData.locations,
        routeCoordinates: latestData.routeCoordinates,
        onLocationSelect: (id) => onLocationSelectRef.current?.(id),
        onViewportIdle: (viewport) => onViewportIdleRef.current?.(viewport),
      });
      viewportKeyRef.current = viewportKey;
      controllerRef.current.selectLocation(latestData.selectedLocationId);
      setLoadState("ready");
      setLoadError("");
      setMapVersion((value) => value + 1);
    } catch (error) {
      initializationRequestedRef.current = false;
      setLoadState("error");
      setLoadError(
        error instanceof Error
          ? error.message
          : "카카오 지도를 초기화하지 못했습니다.",
      );
    }
  }, [viewportKey]);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMapsSdk()
      .then(() => {
        if (!cancelled) initializeMap();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isClustererOnlySdkFailure(error) && isKakaoBaseMapsReady()) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[PetPass Kakao Maps] MarkerClusterer is unavailable; using ordinary markers.",
            );
          }
          initializeMap();
          return;
        }
        setLoadState("error");
        setLoadError(getKakaoMapsPublicError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [initializeMap]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const fitBounds = viewportKeyRef.current !== viewportKey;
    controller.updateData(locations, routeCoordinates, { fitBounds });
    controller.selectLocation(latestDataRef.current.selectedLocationId);
    viewportKeyRef.current = viewportKey;
  }, [locations, routeCoordinates, viewportKey]);

  useEffect(() => {
    controllerRef.current?.selectLocation(selectedLocationId);
  }, [selectedLocationId]);

  useEffect(() => {
    const container = mapContainerRef.current;
    const controller = controllerRef.current;
    if (!container || !controller || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => controller.relayout());
    observer.observe(container);
    return () => observer.disconnect();
  }, [mapVersion]);

  useEffect(
    () => () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      initializationRequestedRef.current = false;
    },
    [],
  );

  try {
    getKakaoMapJavaScriptKey();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "카카오 지도 설정을 확인해 주세요.";
    return (
      <section className="relative" aria-label={title}>
        <div
          role="alert"
          className={`map-canvas grid place-items-center p-8 text-center ${
            compact ? "!min-h-[300px]" : ""
          }`}
        >
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-bold text-[#314b3f] shadow-sm">
            <MapPinned size={15} aria-hidden="true" />
            {resolvedLocationLabel}
          </div>
          <p className="relative z-10 max-w-md rounded-2xl bg-white/90 p-4 text-sm font-bold text-[#8d3838] shadow-sm">
            카카오 지도 설정 오류: {message}
          </p>
        </div>
      </section>
    );
  }

  const missingCoordinateCount = locations.filter(
    (location) => !isValidMapCoordinates(location.coordinates),
  ).length;
  const validLocationCount = locations.length - missingCoordinateCount;
  const providerLegend = layerControls.filter(
    (layer) =>
      layer.markerKind === "tourism-official" ||
      layer.markerKind === "kakao-candidate",
  );

  return (
    <section className="relative" aria-label={title}>
      <div
        className={`map-canvas kakao-map-canvas ${compact ? "!min-h-[300px]" : ""}`}
        data-location-count={validLocationCount}
        data-map-version={mapVersion}
        data-route-point-count={routeCoordinates.length}
      >
        <div
          ref={mapContainerRef}
          className="absolute inset-0"
          role="group"
          aria-label="지도 장소 마커"
        />
        {loadState === "loading" ? (
          <p className="absolute inset-x-4 top-20 z-10 rounded-2xl bg-white/95 p-4 text-center text-sm font-bold text-[#52665b] shadow-sm">
            카카오 지도를 불러오고 있어요.
          </p>
        ) : null}
        {loadError ? (
          <p
            role="alert"
            className="absolute inset-x-4 top-20 z-10 rounded-2xl bg-white/95 p-4 text-center text-sm font-bold text-[#8d3838] shadow-sm"
          >
            {loadError}
          </p>
        ) : null}
        {loadState === "ready" && validLocationCount === 0 ? (
          <p className="absolute inset-x-4 top-20 z-10 rounded-2xl bg-white/95 p-4 text-center text-sm font-bold text-[#52665b] shadow-sm">
            {emptyMessage}
          </p>
        ) : null}
        {missingCoordinateCount > 0 ? (
          <p className="absolute inset-x-4 bottom-16 z-10 rounded-xl bg-[#fff8f1]/95 p-3 text-xs font-bold text-[#7a4b2f] shadow-sm">
            좌표 확인이 필요한 장소 {missingCoordinateCount}곳은 지도에서 제외했어요.
          </p>
        ) : null}
        <div className="map-watermark">Kakao Maps · 실제 장소 및 경로</div>
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-bold text-[#314b3f] shadow-sm">
          <MapPinned size={15} aria-hidden="true" />
          {resolvedLocationLabel}
        </div>
        {providerLegend.length > 0 ? (
          <div
            className="absolute right-3 top-3 z-10 flex max-w-[calc(100%-7rem)] flex-wrap justify-end gap-1.5 rounded-xl border border-white/90 bg-white/95 p-2 text-[10px] font-extrabold text-[#405249] shadow-sm sm:right-4 sm:top-4 sm:text-[11px]"
            aria-label="지도 마커 범례"
          >
            {providerLegend.map((layer) => (
              <span key={layer.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className={`map-legend-marker map-legend-marker--${layer.markerKind}`}
                  aria-hidden="true"
                />
                {layer.markerKind === "tourism-official"
                  ? "한국관광공사"
                  : "카카오 검색"}
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => controllerRef.current?.fitBounds()}
          disabled={loadState !== "ready"}
          title="표시된 장소에 지도 맞추기"
          className="absolute bottom-4 left-4 z-10 grid size-10 place-items-center rounded-full border border-white/80 bg-white/90 text-[#236148] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="표시된 장소에 지도 위치 맞추기"
        >
          <LocateFixed size={18} aria-hidden="true" />
        </button>
        {onCurrentMapSearch ? (
          <button
            type="button"
            onClick={() => {
              const viewport = controllerRef.current?.getSearchViewport();
              if (viewport) onCurrentMapSearchRef.current?.(viewport);
            }}
            disabled={loadState !== "ready"}
            className="absolute bottom-4 right-4 z-10 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3 text-xs font-extrabold text-[#236148] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="현재 지도에서 검색"
          >
            <ScanSearch size={16} aria-hidden="true" />
            현재 지도에서 검색
          </button>
        ) : null}
      </div>
      {layerControls.length > 0 ? (
        <fieldset className="mt-3 rounded-2xl border border-[#d8e2dc] bg-white p-3">
          <legend className="px-1 text-xs font-black text-[#344a40]">지도 출처 레이어</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {layerControls.map((layer) => (
              <button
                key={layer.id}
                type="button"
                aria-pressed={layer.visible}
                disabled={layer.disabled}
                title={layer.description}
                onClick={() => onLayerToggle?.(layer.id, !layer.visible)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  layer.visible
                    ? "border-[#8caf9d] bg-[#edf8f2] text-[#285c45]"
                    : "border-[#d7e0da] bg-white text-[#68776f]"
                }`}
              >
                <span
                  className={`map-legend-marker map-legend-marker--${layer.markerKind ?? "catalog"}`}
                  aria-hidden="true"
                />
                <span>{layer.label}</span>
                <span className="font-semibold text-[#748078]">{layer.count}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#748078]">
            모양과 글자로 출처를 구분합니다. 레이어를 바꿔도 현재 지도 위치는 유지됩니다.
          </p>
        </fieldset>
      ) : null}
    </section>
  );
}
