"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  HeartPulse,
  Map as MapIcon,
  MapPin,
  PawPrint,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HomepagePlaceCarousel } from "@/components/home/official-place-carousel";
import { MapPanel, type MapLayerControl } from "@/components/map/map-panel";
import { PlaceImage } from "@/components/places/place-image";
import { createHomepageMapLocations } from "@/lib/homepage/homepage-map-locations";
import type { ApiError, ApiResult } from "@/types/api";
import {
  HOMEPAGE_PLACE_LAYERS,
  type HomepageMapMarker,
  type HomepagePlaceLayer,
  type HomepagePlacesSnapshot,
} from "@/types/homepage-places";

const EMPTY_ROUTE_COORDINATES: [] = [];

const LAYER_UI: Array<{
  id: HomepagePlaceLayer;
  label: string;
  markerKind: NonNullable<MapLayerControl["markerKind"]>;
}> = [
  { id: "official", label: "공식 장소", markerKind: "tourism-official" },
  { id: "kakao_candidate", label: "카카오 후보", markerKind: "kakao-candidate" },
  { id: "veterinary", label: "동물병원", markerKind: "veterinary" },
  { id: "pet_shop", label: "펫샵·용품점", markerKind: "pet-shop" },
];

const API_ERROR_CODES = new Set<ApiError["code"]>([
  "CONFIGURATION_REQUIRED",
  "UPSTREAM_ERROR",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_AUTHENTICATION",
  "UPSTREAM_FORBIDDEN",
  "UPSTREAM_QUOTA",
  "INVALID_RESPONSE",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "NOT_FOUND",
]);

const GENERIC_ERROR: ApiError = {
  code: "UPSTREAM_ERROR",
  message: "공식 관광 정보를 불러오지 못했습니다.",
  retryable: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    API_ERROR_CODES.has(value.code as ApiError["code"]) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean"
  );
}

function isHomepagePlacesSnapshot(
  value: unknown,
): value is HomepagePlacesSnapshot {
  if (!isRecord(value) || !isRecord(value.official) || !isRecord(value.layers)) {
    return false;
  }
  if (!Array.isArray(value.markers) || !Array.isArray(value.cards)) return false;
  if (
    typeof value.official.totalCount !== "number" ||
    typeof value.official.markerCount !== "number" ||
    typeof value.official.omittedCoordinateCount !== "number" ||
    !Array.isArray(value.official.categoryCounts) ||
    typeof value.official.retrievedAt !== "string"
  ) {
    return false;
  }
  for (const layer of HOMEPAGE_PLACE_LAYERS) {
    const entry = value.layers[layer];
    if (
      !isRecord(entry) ||
      !["ready", "empty", "unavailable"].includes(String(entry.state)) ||
      !(typeof entry.count === "number" || entry.count === null) ||
      !(typeof entry.markerCount === "number" || entry.markerCount === null) ||
      typeof entry.enabledByDefault !== "boolean"
    ) {
      return false;
    }
  }
  return value.markers.every(
    (marker) =>
      isRecord(marker) &&
      typeof marker.id === "string" &&
      HOMEPAGE_PLACE_LAYERS.includes(marker.layer as HomepagePlaceLayer) &&
      typeof marker.name === "string" &&
      isRecord(marker.coordinates) &&
      typeof marker.coordinates.latitude === "number" &&
      typeof marker.coordinates.longitude === "number",
  ) && value.cards.every(
    (card) =>
      isRecord(card) &&
      typeof card.id === "string" &&
      HOMEPAGE_PLACE_LAYERS.includes(card.layer as HomepagePlaceLayer) &&
      typeof card.name === "string" &&
      typeof card.sourceLabel === "string",
  );
}

function parseHomepageResult(
  value: unknown,
): ApiResult<HomepagePlacesSnapshot> | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") return null;
  const requestId =
    typeof value.requestId === "string" ? value.requestId : "homepage";
  if (value.ok) {
    return isHomepagePlacesSnapshot(value.data)
      ? { ok: true, data: value.data, requestId }
      : null;
  }
  return isApiError(value.error)
    ? { ok: false, error: value.error, requestId }
    : null;
}

async function requestHomepageSnapshot(): Promise<
  ApiResult<HomepagePlacesSnapshot>
> {
  const response = await fetch("/api/homepage/places", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return { ok: false, error: GENERIC_ERROR, requestId: "homepage" };
  }
  const body = parseHomepageResult(value);
  if (!body || (!response.ok && body.ok)) {
    return { ok: false, error: GENERIC_ERROR, requestId: "homepage" };
  }
  return body;
}

function HomepageLiveSkeleton() {
  return (
    <div className="homepage-live-loading" aria-live="polite" aria-busy="true">
      <section className="homepage-map-loading" aria-label="부산 장소 지도 불러오는 중">
        <div className="homepage-loading-copy"><span /><span /><span /></div>
        <p>공식 관광 정보와 저장된 장소 카탈로그를 불러오고 있어요.</p>
      </section>
      <section className="homepage-carousel-loading" aria-label="장소 카드 불러오는 중">
        <div className="homepage-loading-heading" />
        <div className="homepage-loading-cards" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
        </div>
      </section>
    </div>
  );
}

function HomepageLiveError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <section className="homepage-live-error" role="alert">
      <span className="homepage-error-icon"><MapIcon size={24} aria-hidden="true" /></span>
      <div>
        <p className="homepage-kicker">OFFICIAL DATA UNAVAILABLE</p>
        <h2>공식 관광 정보를 지금 불러올 수 없어요</h2>
        <p>{error.message}</p>
        <p className="homepage-error-truth">
          확인되지 않은 수치나 데모 장소로 대신 보여드리지 않습니다.
        </p>
      </div>
      {error.retryable ? (
        <button type="button" onClick={onRetry} className="homepage-retry-button">
          <RefreshCw size={16} aria-hidden="true" /> 다시 시도
        </button>
      ) : null}
    </section>
  );
}

function SelectedPlaceholder({ layer }: { layer: HomepagePlaceLayer }) {
  const Icon = layer === "veterinary" ? HeartPulse : layer === "pet_shop" ? ShoppingBag : PawPrint;
  return <span className={`homepage-selected-placeholder homepage-selected-placeholder--${layer}`}><Icon size={24} aria-hidden="true" /></span>;
}

export function HomepageLiveExperience() {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [snapshot, setSnapshot] = useState<HomepagePlacesSnapshot | null>(null);
  const [error, setError] = useState<ApiError>(GENERIC_ERROR);
  const [retryToken, setRetryToken] = useState(0);
  const [requestedSelectionId, setRequestedSelectionId] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Record<HomepagePlaceLayer, boolean>>({
    official: true,
    kakao_candidate: true,
    veterinary: false,
    pet_shop: false,
  });
  const requestRef = useRef<Promise<ApiResult<HomepagePlacesSnapshot>> | null>(null);

  useEffect(() => {
    let active = true;
    const request = requestRef.current ?? requestHomepageSnapshot();
    requestRef.current = request;
    void request.then((result) => {
      if (!active) return;
      if (!result.ok) {
        setSnapshot(null);
        setError(result.error);
        setLoadState("error");
        return;
      }
      setSnapshot(result.data);
      setVisibleLayers(Object.fromEntries(
        HOMEPAGE_PLACE_LAYERS.map((layer) => [
          layer,
          result.data.layers[layer].state !== "unavailable" &&
            result.data.layers[layer].enabledByDefault,
        ]),
      ) as Record<HomepagePlaceLayer, boolean>);
      setLoadState("ready");
    }).catch(() => {
      if (!active) return;
      setSnapshot(null);
      setError(GENERIC_ERROR);
      setLoadState("error");
    });
    return () => { active = false; };
  }, [retryToken]);

  const retry = () => {
    requestRef.current = null;
    setSnapshot(null);
    setRequestedSelectionId(null);
    setLoadState("loading");
    setRetryToken((current) => current + 1);
  };

  const visibleMarkers = useMemo(
    () => snapshot?.markers.filter((marker) => visibleLayers[marker.layer]) ?? [],
    [snapshot, visibleLayers],
  );
  const locations = useMemo(
    () => createHomepageMapLocations(visibleMarkers),
    [visibleMarkers],
  );
  const markerById = useMemo(
    () => new Map((snapshot?.markers ?? []).map((marker) => [marker.id, marker] as const)),
    [snapshot],
  );
  const visibleIds = useMemo(() => new Set(locations.map(({ id }) => id)), [locations]);
  const defaultSelectionId =
    visibleMarkers.find((marker) => marker.layer === "official" && marker.isAllowed)?.id ??
    visibleMarkers.find((marker) => marker.layer === "official")?.id ??
    visibleMarkers[0]?.id ?? null;
  const selectedLocationId =
    requestedSelectionId && visibleIds.has(requestedSelectionId)
      ? requestedSelectionId
      : defaultSelectionId;
  const selectedMarker: HomepageMapMarker | null = selectedLocationId
    ? markerById.get(selectedLocationId) ?? null
    : null;

  if (loadState === "loading") return <HomepageLiveSkeleton />;
  if (loadState === "error" || !snapshot) {
    return <HomepageLiveError error={error} onRetry={retry} />;
  }

  const layerControls: MapLayerControl[] = LAYER_UI.map((layer) => {
    const status = snapshot.layers[layer.id];
    return {
      ...layer,
      count: status.count,
      visible: visibleLayers[layer.id],
      disabled: status.state === "unavailable",
      description:
        status.state === "unavailable"
          ? "카카오 장소 데이터 준비 중"
          : `${layer.label} 레이어 ${visibleLayers[layer.id] ? "숨기기" : "보기"}`,
    };
  });
  const publicUnavailable = LAYER_UI.slice(1).some(
    ({ id }) => snapshot.layers[id].state === "unavailable",
  );

  return (
    <div className="homepage-live-ready">
      <section className="homepage-map-section" aria-labelledby="homepage-map-title">
        <div className="homepage-map-shell">
          <div className="homepage-area-summary">
            <p className="homepage-kicker">BUSAN PLACE MAP</p>
            <h2 id="homepage-map-title">
              부산 공식 관광 장소
              <strong>{snapshot.official.totalCount}곳</strong>
            </h2>
            <p>
              공식 관광 정보와 카카오 검색 후보를 출처별로 구분합니다. 공식 수치는
              동반 가능 장소 수를 뜻하지 않습니다.
            </p>
            {snapshot.official.categoryCounts.length > 0 ? (
              <dl>
                {snapshot.official.categoryCounts.map(({ label, count }) => (
                  <div key={label}><dt>{label}</dt><dd>{count}</dd></div>
                ))}
              </dl>
            ) : null}
            <p className="homepage-map-count-note">
              공식 지도 표시 {snapshot.official.markerCount}곳
              {snapshot.official.omittedCoordinateCount > 0
                ? ` · 좌표 미확인 또는 중복 위치 ${snapshot.official.omittedCoordinateCount}곳 제외`
                : ""}
            </p>
            {publicUnavailable ? (
              <p className="homepage-map-provider-status" role="status">
                카카오 장소 데이터 준비 중
              </p>
            ) : null}
          </div>

          <Link href="/results?tab=catalog" className="homepage-map-open-link">
            지도 크게 보기 <ArrowUpRight size={15} aria-hidden="true" />
          </Link>

          <div className="homepage-map-canvas-wrap">
            <MapPanel
              title="부산 공식·카카오 장소 지도"
              locationLabel="부산 전체"
              locations={locations}
              routeCoordinates={EMPTY_ROUTE_COORDINATES}
              selectedLocationId={selectedLocationId}
              onLocationSelect={(id) => setRequestedSelectionId(id ?? defaultSelectionId)}
              viewportKey="homepage:busan:mixed-source"
              layerControls={layerControls}
              onLayerToggle={(id, visible) => {
                if (!HOMEPAGE_PLACE_LAYERS.includes(id as HomepagePlaceLayer)) return;
                const layer = id as HomepagePlaceLayer;
                if (snapshot.layers[layer].state === "unavailable") return;
                setVisibleLayers((current) => ({ ...current, [layer]: visible }));
              }}
              showLocationLabel={false}
              showSelectionInfo={false}
              emptyMessage="선택한 레이어에 지도에 표시할 장소가 없습니다."
            />
          </div>

          {selectedMarker ? (
            <article className="homepage-selected-place" aria-live="polite" aria-atomic="true">
              {selectedMarker.layer === "official" ? (
                <PlaceImage
                  imageUrl={selectedMarker.imageUrl}
                  title={selectedMarker.name}
                  className="homepage-selected-image"
                  sizes="92px"
                />
              ) : <SelectedPlaceholder layer={selectedMarker.layer} />}
              <div className="homepage-selected-body">
                <div className="homepage-selected-meta">
                  <span>{selectedMarker.categoryLabel}</span>
                  {selectedMarker.isAllowed ? (
                    <span className="homepage-allowed-badge"><ShieldCheck size={12} aria-hidden="true" />동반 가능</span>
                  ) : (
                    <span className="homepage-confirm-badge">{selectedMarker.statusLabel}</span>
                  )}
                </div>
                <h3>{selectedMarker.name}</h3>
                <p><MapPin size={12} aria-hidden="true" />{selectedMarker.district ?? selectedMarker.address}</p>
                <span className={`homepage-selected-source homepage-selected-source--${selectedMarker.layer}`}>
                  {selectedMarker.sourceLabel}
                </span>
              </div>
              {selectedMarker.href ? (
                selectedMarker.external ? (
                  <a
                    href={selectedMarker.href}
                    target="_blank"
                    rel="noreferrer"
                    className="homepage-selected-link"
                    aria-label={`${selectedMarker.name} 카카오 장소 정보 새 창에서 보기`}
                  ><ArrowUpRight size={16} aria-hidden="true" /></a>
                ) : (
                  <Link
                    href={selectedMarker.href}
                    className="homepage-selected-link"
                    aria-label={`${selectedMarker.name} 상세 보기`}
                  ><ArrowUpRight size={16} aria-hidden="true" /></Link>
                )
              ) : null}
            </article>
          ) : null}
        </div>
      </section>

      <HomepagePlaceCarousel
        key={`${snapshot.official.retrievedAt}:${snapshot.cards.map(({ id }) => id).join(",")}`}
        places={snapshot.cards}
        layers={snapshot.layers}
        featuredState={snapshot.official.featuredState}
      />
    </div>
  );
}
