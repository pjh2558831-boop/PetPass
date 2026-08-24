"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  HeartPulse,
  Map as MapIcon,
  MapPin,
  PawPrint,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HomepagePlaceCarousel } from "@/components/home/official-place-carousel";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceImage } from "@/components/places/place-image";
import { PlaceCategoryToggleGroup } from "@/components/places/place-category-toggle-group";
import { createHomepageMapLocations } from "@/lib/homepage/homepage-map-locations";
import {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
  isPlaceCategory,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { ApiError, ApiResult } from "@/types/api";
import {
  HOMEPAGE_PLACE_LAYERS,
  type HomepageMapMarker,
  type HomepagePlaceLayer,
  type HomepagePlacesSnapshot,
} from "@/types/homepage-places";

const EMPTY_ROUTE_COORDINATES: [] = [];
const STRICT_EFFECT_ABORT_GRACE_MS = 50;

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
    !value.official.categoryCounts.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.category === "string" &&
        isPlaceCategory(entry.category) &&
        typeof entry.label === "string" &&
        typeof entry.count === "number",
    ) ||
    typeof value.official.retrievedAt !== "string"
  ) {
    return false;
  }
  for (const layer of HOMEPAGE_PLACE_LAYERS) {
    const entry = value.layers[layer];
    if (
      !isRecord(entry) ||
      !["ready", "empty", "deferred", "unavailable"].includes(String(entry.state)) ||
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
      typeof marker.category === "string" &&
      isPlaceCategory(marker.category) &&
      isRecord(marker.coordinates) &&
      typeof marker.coordinates.latitude === "number" &&
      typeof marker.coordinates.longitude === "number",
  ) && value.cards.every(
    (card) =>
      isRecord(card) &&
      typeof card.id === "string" &&
      HOMEPAGE_PLACE_LAYERS.includes(card.layer as HomepagePlaceLayer) &&
      typeof card.name === "string" &&
      typeof card.category === "string" &&
      isPlaceCategory(card.category) &&
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

async function requestHomepageSnapshot(includeOptional = false, signal?: AbortSignal): Promise<
  ApiResult<HomepagePlacesSnapshot>
> {
  const response = await fetch(`/api/homepage/places${includeOptional ? "?includeOptional=true" : ""}`, {
    signal,
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

export function HomepageLiveExperience({
  staticMapEnabled = false,
}: {
  staticMapEnabled?: boolean;
}) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [snapshot, setSnapshot] = useState<HomepagePlacesSnapshot | null>(null);
  const [error, setError] = useState<ApiError>(GENERIC_ERROR);
  const [retryToken, setRetryToken] = useState(0);
  const [requestedSelectionId, setRequestedSelectionId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [draftCategories, setDraftCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [filterOpen, setFilterOpen] = useState(false);
  type PendingRequest = {
    controller: AbortController;
    promise: Promise<ApiResult<HomepagePlacesSnapshot>>;
    abortTimer: ReturnType<typeof setTimeout> | null;
  };
  const requestRef = useRef<PendingRequest | null>(null);
  const optionalRequestRef = useRef<PendingRequest | null>(null);
  const filterDropdownRef = useRef<HTMLElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (filterDropdownRef.current?.contains(event.target) || filterButtonRef.current?.contains(event.target)) return;
      setFilterOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFilterOpen(false);
      requestAnimationFrame(() => filterButtonRef.current?.focus());
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filterOpen]);

  useEffect(() => {
    let active = true;
    const pending = requestRef.current ?? (() => {
      const controller = new AbortController();
      return { controller, promise: requestHomepageSnapshot(false, controller.signal), abortTimer: null };
    })();
    if (pending.abortTimer) clearTimeout(pending.abortTimer);
    pending.abortTimer = null;
    requestRef.current = pending;
    void pending.promise.then((result) => {
      if (!active) return;
      if (!result.ok) {
        setSnapshot(null);
        setError(result.error);
        setLoadState("error");
        return;
      }
      setSnapshot(result.data);
      setActiveCategories([...DEFAULT_PLACE_CATEGORIES]);
      setDraftCategories([...DEFAULT_PLACE_CATEGORIES]);
      setLoadState("ready");
    }).catch(() => {
      if (!active || pending.controller.signal.aborted) return;
      setSnapshot(null);
      setError(GENERIC_ERROR);
      setLoadState("error");
    });
    return () => {
      active = false;
      pending.abortTimer = setTimeout(() => {
        if (requestRef.current !== pending) return;
        pending.controller.abort();
        requestRef.current = null;
      }, STRICT_EFFECT_ABORT_GRACE_MS);
    };
  }, [retryToken]);

  useEffect(() => () => {
    optionalRequestRef.current?.controller.abort();
    optionalRequestRef.current = null;
  }, []);

  const retry = () => {
    requestRef.current?.controller.abort();
    optionalRequestRef.current?.controller.abort();
    requestRef.current = null;
    optionalRequestRef.current = null;
    setSnapshot(null);
    setRequestedSelectionId(null);
    setLoadState("loading");
    setRetryToken((current) => current + 1);
  };

  const visibleMarkers = useMemo(
    () => snapshot?.markers.filter((marker) => activeCategories.includes(marker.category)) ?? [],
    [activeCategories, snapshot],
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

  const officialCategoryCounts = new Map(
    snapshot.official.categoryCounts.map(({ category, count }) => [category, count] as const),
  );
  const categoryCounts = Object.fromEntries(PLACE_CATEGORIES.map((category) => {
    const optionalLayer = category === "veterinary" ? "veterinary" : category === "pet_shop" ? "pet_shop" : null;
    if (optionalLayer && snapshot.layers[optionalLayer].state !== "ready" && snapshot.layers[optionalLayer].state !== "empty") {
      return [category, null];
    }
    const publicCount = snapshot.markers.filter((marker) => marker.layer !== "official" && marker.category === category).length;
    return [category, (officialCategoryCounts.get(category) ?? 0) + publicCount];
  })) as Record<PlaceCategory, number | null>;
  const publicUnavailable = HOMEPAGE_PLACE_LAYERS.slice(1).some(
    (layer) => snapshot.layers[layer].state === "unavailable",
  );

  const loadOptionalPlaces = (categories: readonly PlaceCategory[]) => {
    const needsOptional = categories.some((category) => category === "veterinary" || category === "pet_shop") &&
      (snapshot.layers.veterinary.state === "deferred" || snapshot.layers.pet_shop.state === "deferred");
    if (needsOptional) {
      const pending = optionalRequestRef.current ?? (() => {
        const controller = new AbortController();
        return { controller, promise: requestHomepageSnapshot(true, controller.signal), abortTimer: null };
      })();
      optionalRequestRef.current = pending;
      void pending.promise.then((result) => {
        if (!result.ok) {
          if (optionalRequestRef.current === pending) optionalRequestRef.current = null;
          return;
        }
        setSnapshot(result.data);
      }).catch(() => {
        if (optionalRequestRef.current === pending) optionalRequestRef.current = null;
      });
    }
  };
  const toggleDraftCategory = (category: PlaceCategory) => {
    setDraftCategories((current) => current.includes(category)
      ? current.filter((value) => value !== category)
      : PLACE_CATEGORIES.filter((value) => value === category || current.includes(value)));
  };
  const toggleFilters = () => {
    if (filterOpen) {
      setFilterOpen(false);
      return;
    }
    setDraftCategories([...activeCategories]);
    setFilterOpen(true);
  };
  const applyFilters = () => {
    setActiveCategories([...draftCategories]);
    setRequestedSelectionId(null);
    loadOptionalPlaces(draftCategories);
    setFilterOpen(false);
  };
  const resetDraftFilters = () => {
    setDraftCategories([...DEFAULT_PLACE_CATEGORIES]);
  };

  return (
    <div className="homepage-live-ready">
      <section className="homepage-map-section" aria-labelledby="homepage-map-title">
        <div className="homepage-map-shell">
          <h2 id="homepage-map-title" className="sr-only">
            부산 공식 관광 장소 {snapshot.official.totalCount}곳
          </h2>

          <div className="homepage-map-filter-control">
            <button
              ref={filterButtonRef}
              type="button"
              className="homepage-map-filter-trigger"
              aria-expanded={filterOpen}
              aria-controls="homepage-map-filter-dropdown"
              onClick={toggleFilters}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />필터
            </button>
            {filterOpen ? (
              <section
                ref={filterDropdownRef}
                id="homepage-map-filter-dropdown"
                className="explorer-filter-dropdown homepage-map-filter-dropdown"
                role="region"
                aria-label="지도 장소 필터"
              >
                <form onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
                  <div className="explorer-filter-dropdown__body">
                    <div className="explorer-category-panel__heading">
                      <span aria-hidden="true"><MapPin size={28} fill="currentColor" /></span>
                      <div>
                        <h2>여행 장소</h2>
                        <p>반려견과 함께 방문 가능한 장소를 선택해보세요.</p>
                      </div>
                    </div>
                    <PlaceCategoryToggleGroup
                      title="장소 유형"
                      categories={PLACE_CATEGORIES}
                      active={draftCategories}
                      counts={categoryCounts}
                      onToggle={toggleDraftCategory}
                    />
                    {publicUnavailable ? (
                      <p className="homepage-map-provider-status" role="status">
                        일부 카카오 장소 데이터 준비 중
                      </p>
                    ) : null}
                  </div>
                  <div className="explorer-filter-dropdown__actions">
                    <button type="button" className="explorer-filter-dropdown__reset" onClick={resetDraftFilters}><RotateCcw size={19} aria-hidden="true" />초기화</button>
                    <button type="submit" className="explorer-filter-dropdown__apply">적용하기 <SlidersHorizontal size={18} aria-hidden="true" /></button>
                  </div>
                </form>
              </section>
            ) : null}
          </div>

          <Link href="/results?tab=catalog&region=busan" className="homepage-map-open-link">
            지도 크게 보기 <ArrowUpRight size={15} aria-hidden="true" />
          </Link>

          <div className="homepage-map-canvas-wrap">
            <MapPanel
              regionId="busan"
              title="부산 공식·카카오 장소 지도"
              locationLabel="부산 전체"
              locations={locations}
              routeCoordinates={EMPTY_ROUTE_COORDINATES}
              selectedLocationId={selectedLocationId}
              onLocationSelect={(id) => setRequestedSelectionId(id ?? defaultSelectionId)}
              viewportKey="homepage:busan:mixed-source"
              showLocationLabel={false}
              showSelectionInfo={false}
              emptyMessage="선택한 장소 유형에 지도에 표시할 장소가 없습니다."
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
                  <span>{PLACE_CATEGORY_LABELS[selectedMarker.category]}</span>
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
                selectedMarker.href.startsWith("http") ? (
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
        staticMapEnabled={staticMapEnabled}
      />
    </div>
  );
}
