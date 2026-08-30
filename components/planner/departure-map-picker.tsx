"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  LocateFixed,
  MapPinned,
  MousePointerClick,
} from "lucide-react";
import {
  currentLocationDeparture,
  currentLocationErrorMessage,
} from "@/components/planner/current-location-departure";
import {
  createKakaoCoordinatePicker,
  type KakaoCoordinatePickerController,
} from "@/lib/kakao/maps";
import {
  getKakaoMapsPublicError,
  isClustererOnlySdkFailure,
  isKakaoBaseMapsReady,
  loadKakaoMapsSdk,
} from "@/lib/kakao/sdk-loader";
import { BUSAN_REGION_CONFIG } from "@/lib/regions/config";
import type { Coordinates } from "@/types/place";
import type { ResolvedDeparture } from "@/types/pet";

function mapDeparture(coordinates: Coordinates): ResolvedDeparture {
  return {
    label: `지도에서 선택한 위치 (${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)})`,
    source: "map_selection",
    coordinates,
  };
}

export function DepartureMapPicker({
  value,
  onChange,
}: {
  value?: ResolvedDeparture;
  onChange: (value: ResolvedDeparture) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<KakaoCoordinatePickerController | null>(null);
  const onChangeRef = useRef(onChange);
  const selectionModeRef = useRef(false);
  const locationRequestRef = useRef(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [locationState, setLocationState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [locationError, setLocationError] = useState("");
  const selectedLatitude = value?.coordinates.latitude;
  const selectedLongitude = value?.coordinates.longitude;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  const initialize = useCallback(() => {
    const container = mapContainerRef.current;
    if (!container || !isKakaoBaseMapsReady() || controllerRef.current) return;
    try {
      controllerRef.current = createKakaoCoordinatePicker(container, {
        defaultCenter: BUSAN_REGION_CONFIG.defaultMapCenter,
        initialCoordinates:
          selectedLatitude !== undefined && selectedLongitude !== undefined
            ? { latitude: selectedLatitude, longitude: selectedLongitude }
            : undefined,
        onSelect: (coordinates) => {
          if (!selectionModeRef.current) return;
          const departure = mapDeparture(coordinates);
          onChangeRef.current(departure);
          setSelectionMode(false);
          setLocationError("");
          setLocationState("idle");
          setAnnouncement("지도에서 출발지를 선택했습니다.");
        },
      });
      setLoadState("ready");
      setLoadError("");
    } catch (error) {
      setLoadState("error");
      setLoadError(getKakaoMapsPublicError(error));
    }
  }, [selectedLatitude, selectedLongitude]);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMapsSdk()
      .then(() => {
        if (!cancelled) initialize();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isClustererOnlySdkFailure(error) && isKakaoBaseMapsReady()) {
          initialize();
          return;
        }
        setLoadState("error");
        setLoadError(getKakaoMapsPublicError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [initialize]);

  useEffect(() => {
    controllerRef.current?.setSelection(
      selectedLatitude !== undefined && selectedLongitude !== undefined
        ? { latitude: selectedLatitude, longitude: selectedLongitude }
        : null,
      true,
    );
  }, [selectedLatitude, selectedLongitude]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => controllerRef.current?.relayout());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      locationRequestRef.current += 1;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    },
    [],
  );

  const useCurrentLocation = () => {
    setSelectionMode(false);
    setAnnouncement("");
    setLocationError("");

    if (!("geolocation" in navigator)) {
      setLocationState("error");
      setLocationError("이 브라우저에서는 현재 위치를 사용할 수 없어요.");
      return;
    }

    const requestId = ++locationRequestRef.current;
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequestRef.current) return;
        try {
          onChangeRef.current(
            currentLocationDeparture({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
          );
          setLocationState("idle");
          setLocationError("");
          setAnnouncement("현재 위치를 출발지로 설정했습니다.");
        } catch {
          setLocationState("error");
          setLocationError("현재 위치 좌표를 확인할 수 없어요. 장소를 검색해 주세요.");
        }
      },
      (error) => {
        if (requestId !== locationRequestRef.current) return;
        setLocationState("error");
        setLocationError(currentLocationErrorMessage(error.code));
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000,
      },
    );
  };

  return (
    <div className="planner-departure-map">
      <div
        className={`relative min-h-[300px] overflow-hidden rounded-lg border bg-[#edf4ef] ${
          selectionMode
            ? "border-[var(--brand)] ring-2 ring-[var(--brand-soft)]"
            : "border-[var(--line)]"
        }`}
        data-selection-mode={selectionMode}
      >
        <div
          ref={mapContainerRef}
          className="absolute inset-0"
          role="group"
          aria-label="출발지 선택 지도"
        />
        <div className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-lg border border-white/80 bg-white/95 px-3 py-2 text-xs font-extrabold text-[var(--brand)]">
          <MapPinned size={15} aria-hidden="true" />
          출발지 미리보기
        </div>
        {loadState === "loading" ? (
          <p className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-white/95 p-4 text-center text-sm font-bold text-[var(--muted)]">
            카카오 지도를 불러오고 있어요.
          </p>
        ) : null}
        {loadError ? (
          <p className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-white/95 p-4 text-center text-sm font-bold text-[#8d3838]" role="alert">
            {loadError} 검색으로 출발지를 선택할 수 있어요.
          </p>
        ) : null}
        {selectionMode ? (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 z-10 rounded-lg bg-[var(--brand)] px-4 py-3 text-center text-xs font-extrabold text-white">
            지도에서 원하는 출발 지점을 클릭하세요.
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loadState !== "ready"}
          aria-pressed={selectionMode}
          onClick={() => {
            setSelectionMode((current) => !current);
            setAnnouncement("");
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#a9beb1] bg-white px-4 text-sm font-extrabold text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MousePointerClick size={17} aria-hidden="true" />
          {selectionMode ? "지도 선택 취소" : "지도에서 선택"}
        </button>
        <button
          type="button"
          disabled={locationState === "loading"}
          onClick={useCurrentLocation}
          aria-describedby={locationError ? "current-location-error" : undefined}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#a9beb1] bg-white px-4 text-sm font-extrabold text-[var(--brand)] disabled:cursor-wait disabled:opacity-65"
        >
          {locationState === "loading" ? (
            <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
          ) : (
            <LocateFixed size={17} aria-hidden="true" />
          )}
          {locationState === "loading" ? "위치 확인 중" : "내 위치"}
        </button>
      </div>
      {locationError ? (
        <p
          id="current-location-error"
          className="mt-3 text-xs font-bold leading-5 text-[#a44537]"
          role="alert"
        >
          {locationError}
        </p>
      ) : null}
      {value ? (
        <p className="mt-3 flex items-start gap-2 text-xs font-bold leading-5 text-[var(--brand)]">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          <span className="break-words">{value.label}</span>
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
