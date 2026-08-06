"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { LocateFixed, MapPinned } from "lucide-react";
import {
  createKakaoMapController,
  getKakaoMapJavaScriptKey,
  getKakaoMapsSdkUrl,
  type KakaoMapController,
  type KakaoMapLocation,
} from "@/lib/kakao/maps";
import type { Coordinates } from "@/types/place";

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
  title = "부산 해운대 데모 경로",
  locationLabel = "부산 · 해운대구",
  locations = DEFAULT_LOCATIONS,
  routeCoordinates = [],
  selectedLocationId = null,
  onLocationSelect,
}: {
  compact?: boolean;
  title?: string;
  locationLabel?: string;
  locations?: KakaoMapLocation[];
  routeCoordinates?: Coordinates[];
  selectedLocationId?: string | null;
  onLocationSelect?: (id: string) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<KakaoMapController | null>(null);
  const sdkLoadRequestedRef = useRef(false);
  const initializationRequestedRef = useRef(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const [mapVersion, setMapVersion] = useState(0);

  const initializeMap = useCallback(() => {
    const container = mapContainerRef.current;
    const maps = window.kakao?.maps;
    if (!container || !maps?.Map) return false;
    if (initializationRequestedRef.current) return true;
    initializationRequestedRef.current = true;

    try {
      controllerRef.current?.destroy();
      controllerRef.current = createKakaoMapController(container, {
        locations,
        routeCoordinates,
        onLocationSelect,
      });
      controllerRef.current.selectLocation(selectedLocationId);
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
    return true;
  }, [locations, onLocationSelect, routeCoordinates, selectedLocationId]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const checkSdk = () => {
      if (cancelled) return;
      const maps = window.kakao?.maps;
      if (!sdkLoadRequestedRef.current && typeof maps?.load === "function") {
        sdkLoadRequestedRef.current = true;
        maps.load(() => {
          initializeMap();
        });
      }
      if (initializeMap()) return;
      attempts += 1;
      if (attempts >= 200) {
        setLoadState("error");
        setLoadError(
          "카카오 지도 SDK를 불러오지 못했습니다. JavaScript 키와 허용 도메인을 확인해 주세요.",
        );
        return;
      }
      timer = window.setTimeout(checkSdk, 50);
    };
    checkSdk();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [initializeMap]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.updateData(locations, routeCoordinates);
    controller.selectLocation(selectedLocationId);
  }, [locations, routeCoordinates, selectedLocationId]);

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
    },
    [],
  );

  let mapKey = "";
  try {
    mapKey = getKakaoMapJavaScriptKey();
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
          <p className="relative z-10 max-w-md rounded-2xl bg-white/90 p-4 text-sm font-bold text-[#8d3838] shadow-sm">
            카카오 지도 설정 오류: {message}
          </p>
        </div>
      </section>
    );
  }

  const missingCoordinateCount = locations.filter(
    (location) => !location.coordinates,
  ).length;

  return (
    <section className="relative" aria-label={title}>
      <div
        className={`map-canvas kakao-map-canvas ${compact ? "!min-h-[300px]" : ""}`}
        data-location-count={locations.length}
        data-route-point-count={routeCoordinates.length}
      >
        <div ref={mapContainerRef} className="absolute inset-0" aria-hidden="true" />
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
        {missingCoordinateCount > 0 ? (
          <p className="absolute inset-x-4 bottom-16 z-10 rounded-xl bg-[#fff8f1]/95 p-3 text-xs font-bold text-[#7a4b2f] shadow-sm">
            좌표 확인이 필요한 장소 {missingCoordinateCount}곳은 지도에서 제외했어요.
          </p>
        ) : null}
        <div className="map-watermark">Kakao Maps · 실제 장소 및 경로</div>
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-xs font-bold text-[#314b3f] shadow-sm">
          <MapPinned size={15} aria-hidden="true" />
          {locationLabel}
        </div>
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
      </div>
      <Script
        id="kakao-maps-sdk"
        src={getKakaoMapsSdkUrl(mapKey)}
        strategy="afterInteractive"
        onLoad={() => {
          initializeMap();
        }}
        onReady={() => {
          initializeMap();
        }}
        onError={() => {
          setLoadState("error");
          setLoadError(
            "카카오 지도 SDK를 불러오지 못했습니다. JavaScript 키와 허용 도메인을 확인해 주세요.",
          );
        }}
      />
    </section>
  );
}
