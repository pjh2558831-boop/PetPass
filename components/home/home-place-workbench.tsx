"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  List,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import { resolveHomepageCardImage } from "@/lib/homepage/homepage-card-image";
import { requestMapPlaceCardDetails } from "@/lib/map-places/card-details-client";
import { createHomepageMapLocations } from "@/lib/homepage/homepage-map-locations";
import { PLACE_CATEGORY_LABELS } from "@/lib/map-places/place-categories";
import {
  addSelectedItineraryPlace,
  type SelectedItineraryPlace,
  type SelectedItinerarySnapshot,
} from "@/lib/storage/selected-itinerary-storage";
import type { ApiError } from "@/types/api";
import type { HomepageMapMarker } from "@/types/homepage-places";
import type { RegionId } from "@/types/region";

const EMPTY_ROUTE_COORDINATES: [] = [];
const HOME_LIST_PAGE_SIZE = 12;

type WorkbenchMode = "browse" | "search";

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/gu, " ")
    .trim();
}

function markerSearchValue(marker: HomepageMapMarker): string {
  return normalizeSearchValue([
    marker.name,
    marker.address,
    marker.district ?? "",
    PLACE_CATEGORY_LABELS[marker.category],
    marker.sourceLabel,
    marker.statusLabel,
  ].join(" "));
}

function WorkbenchModes({
  mode,
  onModeChange,
  regionId,
  panelId,
  interactive = true,
}: {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  regionId: RegionId;
  panelId?: string;
  interactive?: boolean;
}) {
  const focusTab = (nextMode: WorkbenchMode) => {
    onModeChange(nextMode);
    requestAnimationFrame(() => {
      document.getElementById(`homepage-workbench-${nextMode}-tab`)?.focus();
    });
  };
  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentMode: WorkbenchMode,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" &&
      event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") {
      focusTab("browse");
      return;
    }
    if (event.key === "End") {
      focusTab("search");
      return;
    }
    focusTab(currentMode === "browse" ? "search" : "browse");
  };

  return (
    <div className="homepage-workbench-modes">
      {interactive && panelId ? (
        <div role="tablist" aria-label="홈 장소 탐색 모드">
          <button
            id="homepage-workbench-browse-tab"
            type="button"
            role="tab"
            aria-controls={panelId}
            aria-selected={mode === "browse"}
            tabIndex={mode === "browse" ? 0 : -1}
            onClick={() => onModeChange("browse")}
            onKeyDown={(event) => handleTabKeyDown(event, "browse")}
          >
            장소 찾기
          </button>
          <button
            id="homepage-workbench-search-tab"
            type="button"
            role="tab"
            aria-controls={panelId}
            aria-selected={mode === "search"}
            tabIndex={mode === "search" ? 0 : -1}
            onClick={() => onModeChange("search")}
            onKeyDown={(event) => handleTabKeyDown(event, "search")}
          >
            검색
          </button>
        </div>
      ) : (
        <div aria-label="홈 장소 탐색 모드">
          <span className="homepage-workbench-mode-label is-active">장소 찾기</span>
          <span className="homepage-workbench-mode-label">검색</span>
        </div>
      )}
      <Link href={`/results?tab=recommendations&region=${encodeURIComponent(regionId)}`}>
        맞춤 일정 <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}

export function HomePlaceWorkbenchLoading({
  regionId,
  regionLabel,
}: {
  regionId: RegionId;
  regionLabel: string;
}) {
  return (
    <section className="homepage-map-section" aria-label={`${regionLabel} 장소 작업 화면 불러오는 중`}>
      <WorkbenchModes mode="browse" onModeChange={() => undefined} regionId={regionId} interactive={false} />
      <div className="homepage-workbench-heading" aria-live="polite" aria-busy="true">
        <div>
          <p className="homepage-kicker">{regionLabel} 장소 작업 화면</p>
          <h2>장소 수를 확인하고 있어요</h2>
        </div>
      </div>
      <div className="homepage-workbench homepage-workbench--loading">
        <div className="homepage-workbench__map homepage-workbench__map--skeleton" aria-hidden="true">
          <span /><span /><span />
        </div>
        <aside className="homepage-workbench__list" aria-hidden="true">
          <div className="homepage-workbench__scroller">
            {Array.from({ length: 5 }, (_, index) => (
              <span className="homepage-workbench-row homepage-workbench-row--skeleton" key={index} />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function HomePlaceWorkbenchError({
  error,
  onRetry,
  regionId,
  regionLabel,
}: {
  error: ApiError;
  onRetry: () => void;
  regionId: RegionId;
  regionLabel: string;
}) {
  return (
    <section className="homepage-map-section" aria-label={`${regionLabel} 장소 작업 화면 연결 오류`}>
      <WorkbenchModes mode="browse" onModeChange={() => undefined} regionId={regionId} interactive={false} />
      <div className="homepage-workbench-heading">
        <div>
          <p className="homepage-kicker">{regionLabel} 장소 작업 화면</p>
          <h2>공식 관광 정보를 지금 불러올 수 없어요</h2>
        </div>
      </div>
      <div className="homepage-workbench homepage-workbench--error">
        <div className="homepage-workbench-error" role="alert">
          <span aria-hidden="true"><MapIcon size={24} /></span>
          <div>
            <strong>확인된 장소 목록을 불러오지 못했습니다.</strong>
            <p>{error.message}</p>
            <small>확인되지 않은 수치나 데모 장소로 대신 보여드리지 않습니다.</small>
          </div>
          {error.retryable ? (
            <button type="button" onClick={onRetry} className="homepage-retry-button">
              <RefreshCw size={16} aria-hidden="true" /> 다시 시도
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function HomePlaceWorkbench({
  regionId,
  regionLabel,
  markers,
  selectedLocationId,
  onLocationFocus,
  onMapDataUpdate,
  filterControl,
  selectionSnapshot,
  selectionCandidates,
  onToggleItinerary,
  completionState,
  onRetryCompletion,
  providerUnavailable,
  staticMapEnabled,
  nationwide = false,
}: {
  regionId: RegionId;
  regionLabel: string;
  markers: HomepageMapMarker[];
  selectedLocationId: string | null;
  onLocationFocus: (id: string) => void;
  onMapDataUpdate: () => void;
  filterControl: ReactNode;
  selectionSnapshot: SelectedItinerarySnapshot;
  selectionCandidates: ReadonlyMap<string, SelectedItineraryPlace>;
  onToggleItinerary: (place: SelectedItineraryPlace) => void;
  completionState: "initial" | "loading" | "complete" | "partial";
  onRetryCompletion: () => void;
  providerUnavailable: boolean;
  staticMapEnabled: boolean;
  nationwide?: boolean;
}) {
  const [mode, setMode] = useState<WorkbenchMode>("browse");
  const [query, setQuery] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [listPage, setListPage] = useState({ key: "", page: 0 });
  const composingRef = useRef(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeSearchValue(query);
  const visibleMarkers = useMemo(() => {
    if (mode !== "search" || !normalizedQuery) return markers;
    return markers.filter((marker) => markerSearchValue(marker).includes(normalizedQuery));
  }, [markers, mode, normalizedQuery]);
  const locations = useMemo(
    () => createHomepageMapLocations(visibleMarkers),
    [visibleMarkers],
  );
  const visibleIds = useMemo(
    () => new Set(visibleMarkers.map(({ id }) => id)),
    [visibleMarkers],
  );
  const resolvedSelectionId = selectedLocationId && visibleIds.has(selectedLocationId)
    ? selectedLocationId
    : nationwide ? null : visibleMarkers[0]?.id ?? null;
  const selectedIds = useMemo(
    () => new Set(selectionSnapshot.places.map(({ id }) => id)),
    [selectionSnapshot.places],
  );
  const listDataKey = useMemo(
    () => `${mode}:${normalizedQuery}:${visibleMarkers.map(({ id }) => id).join("\u001f")}`,
    [mode, normalizedQuery, visibleMarkers],
  );
  const pageCount = Math.max(1, Math.ceil(visibleMarkers.length / HOME_LIST_PAGE_SIZE));
  const activeListPage = listPage.key === listDataKey
    ? Math.min(listPage.page, pageCount - 1)
    : 0;
  const renderedMarkers = visibleMarkers.slice(
    activeListPage * HOME_LIST_PAGE_SIZE,
    (activeListPage + 1) * HOME_LIST_PAGE_SIZE,
  );
  const photoKey = JSON.stringify(renderedMarkers
    .filter((marker) => marker.layer === "official" && !marker.imageUrl)
    .map((marker) => [marker.regionId ?? regionId, marker.category === "shopping" ? "shopping" : "core", marker.id]));
  const [photos, setPhotos] = useState<{ key: string; urls: Map<string, string | null> }>({ key: "", urls: new Map() });
  const [photoError, setPhotoError] = useState("");
  const [photoRetry, setPhotoRetry] = useState(0);
  useEffect(() => {
    const entries = JSON.parse(photoKey) as Array<[RegionId, "core" | "shopping", string]>;
    if (!entries.length) return;
    const controller = new AbortController();
    const groups = new Map<string, { region: RegionId; dataset: "core" | "shopping"; ids: string[] }>();
    for (const [region, dataset, id] of entries) {
      const key = `${region}:${dataset}`;
      const group = groups.get(key) ?? { region, dataset, ids: [] };
      group.ids.push(id);
      groups.set(key, group);
    }
    void Promise.all([...groups.values()].map(({ region, dataset, ids }) =>
      requestMapPlaceCardDetails(region, dataset, ids, controller.signal)))
      .then((pages) => {
        if (controller.signal.aborted) return;
        setPhotos({ key: photoKey, urls: new Map(pages.flatMap((page) => page.items.map(({ id, imageUrl }) => [id, imageUrl] as const))) });
        setPhotoError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhotoError(photoKey);
      });
    return () => controller.abort();
  }, [photoKey, photoRetry]);

  const showListPage = (page: number) => {
    const nextPage = Math.max(0, Math.min(page, pageCount - 1));
    setListPage({ key: listDataKey, page: nextPage });
    const firstMarker = visibleMarkers[nextPage * HOME_LIST_PAGE_SIZE];
    if (firstMarker) onLocationFocus(firstMarker.id);
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      scroller?.querySelector<HTMLButtonElement>(".homepage-workbench-row__focus")
        ?.focus({ preventScroll: true });
      scroller?.scrollTo({ top: 0 });
    });
  };

  const focusLocation = (id: string) => {
    const index = visibleMarkers.findIndex((marker) => marker.id === id);
    if (index >= 0) {
      setListPage({ key: listDataKey, page: Math.floor(index / HOME_LIST_PAGE_SIZE) });
    }
    onLocationFocus(id);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape" || composingRef.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (query) {
      setQuery("");
      return;
    }
    setMode("browse");
    requestAnimationFrame(() => {
      document.getElementById("homepage-workbench-browse-tab")?.focus();
    });
  };

  return (
    <section className="homepage-map-section" aria-labelledby="homepage-map-title">
      <WorkbenchModes
        mode={mode}
        onModeChange={setMode}
        regionId={regionId}
        panelId="homepage-workbench-mode-panel"
      />
      <div className="homepage-workbench-heading">
        <div>
          <p className="homepage-kicker">{regionLabel} 장소 작업 화면</p>
          <h2 id="homepage-map-title">함께 갈 곳을 지도와 목록에서 고르세요</h2>
        </div>
        <strong aria-live="polite">{visibleMarkers.length.toLocaleString("ko-KR")}곳</strong>
      </div>

      <div
        id="homepage-workbench-mode-panel"
        className="homepage-workbench-tools"
        role="tabpanel"
        aria-labelledby={`homepage-workbench-${mode}-tab`}
      >
        {mode === "search" ? (
          <div className="homepage-place-search" role="search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              name="homepage-place-search"
              value={query}
              aria-label="불러온 장소 검색"
              placeholder="이름, 지역, 카테고리 검색…"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기">
                <X size={17} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : (
          <p>현재 불러온 장소를 유형별로 살펴보고 일정에 담을 수 있어요.</p>
        )}
        {filterControl}
      </div>

      {providerUnavailable ? (
        <div className="homepage-workbench-notice" role="status">
          일부 공개 장소 제공자와 연결되지 않았습니다. 현재 목록과 검색, 일정 선택은 계속 사용할 수 있어요.
        </div>
      ) : null}
      {completionState === "loading" ? (
        <div className="homepage-workbench-notice" role="status">나머지 저장 장소를 목록에 추가하고 있어요.</div>
      ) : completionState === "partial" ? (
        <div className="homepage-workbench-notice homepage-workbench-notice--warning" role="status">
          <span>일부 저장 장소를 불러오지 못했습니다. 현재 목록과 선택은 그대로 유지됩니다.</span>
          <button type="button" onClick={onRetryCompletion}><RefreshCw size={15} aria-hidden="true" /> 다시 시도</button>
        </div>
      ) : null}

      <div className="homepage-workbench-switch" role="group" aria-label="홈 장소 지도 또는 목록 보기">
        <button type="button" aria-pressed={mobileView === "list"} onClick={() => setMobileView("list")}>
          <List size={17} aria-hidden="true" />목록
        </button>
        <button type="button" aria-pressed={mobileView === "map"} onClick={() => setMobileView("map")}>
          <MapIcon size={17} aria-hidden="true" />지도
        </button>
      </div>

      <div className="homepage-workbench" data-mobile-view={mobileView}>
        <div className="homepage-workbench__map">
          <Link href={`/results?tab=catalog&region=${encodeURIComponent(regionId)}`} className="homepage-map-open-link">
            지도 크게 보기 <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <div className="homepage-map-canvas-wrap">
            <MapPanel
              regionId={nationwide ? "busan" : regionId}
              fitOnResize={nationwide}
              title={`${regionLabel} 공식·공개 장소 지도`}
              locationLabel={`${regionLabel} 전체`}
              locations={locations}
              routeCoordinates={EMPTY_ROUTE_COORDINATES}
              selectedLocationId={resolvedSelectionId}
              onLocationSelect={(id) => {
                if (id) focusLocation(id);
              }}
              onDataUpdate={onMapDataUpdate}
              viewportKey={`homepage:${nationwide ? `nationwide:${listDataKey}` : regionId}:mixed-source:${mode}:${normalizedQuery}`}
              showLocationLabel={false}
              showSelectionInfo={false}
              emptyMessage={mode === "search"
                ? "검색 결과와 일치하는 장소가 없습니다."
                : "선택한 장소 유형에 지도에 표시할 장소가 없습니다."}
            />
          </div>
        </div>

        <aside className="homepage-workbench__list" aria-label={`${regionLabel} 장소 목록`}>
          {photoError === photoKey && photoKey !== "[]" ? (
            <p role="status" className="px-3 py-2 text-xs">
              장소 사진을 불러오지 못했습니다. <button type="button" className="min-h-11 underline" onClick={() => setPhotoRetry((value) => value + 1)}>사진 다시 불러오기</button>
            </p>
          ) : null}
          <div ref={scrollerRef} className="homepage-workbench__scroller" key={listDataKey}>
            {visibleMarkers.length === 0 ? (
              <div className="homepage-workbench-empty" role="status">
                <Search size={22} aria-hidden="true" />
                <strong>{mode === "search" ? "검색 결과가 없습니다" : "선택한 유형의 장소가 없습니다"}</strong>
                <p>{mode === "search"
                  ? "다른 이름, 지역 또는 카테고리로 검색해 보세요."
                  : "필터에서 다른 장소 유형을 선택해 보세요."}</p>
              </div>
            ) : renderedMarkers.map((marker) => {
              const candidate = selectionCandidates.get(marker.id);
              const isSelected = selectedIds.has(marker.id);
              const canonicalStatus = candidate && !isSelected
                ? addSelectedItineraryPlace(selectionSnapshot, candidate).status
                : null;
              const canonicalSelectable = isSelected || canonicalStatus === "selected" || canonicalStatus === "limit_reached";
              const surfaceLimitReached = !isSelected && selectionSnapshot.places.length >= 3;
              const external = marker.href?.startsWith("http") ?? false;
              return (
                <article
                  key={marker.id}
                  className="homepage-workbench-row"
                  data-map-focused={resolvedSelectionId === marker.id ? "true" : "false"}
                >
                  {canonicalSelectable && candidate ? (
                    <label
                      className="homepage-workbench-row__check"
                      title={surfaceLimitReached ? "홈에서는 최대 3곳까지 선택할 수 있어요." : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={surfaceLimitReached}
                        aria-label={`${marker.name} 일정에 담기`}
                        onChange={() => onToggleItinerary(candidate)}
                      />
                      <span aria-hidden="true"><Check size={13} /></span>
                    </label>
                  ) : (
                    <span className="homepage-workbench-row__check-spacer" aria-hidden="true" />
                  )}
                  {marker.layer === "official" ? (
                    <PlaceCardMedia
                      image={resolveHomepageCardImage({ ...marker, imageUrl: marker.imageUrl ?? (photos.key === photoKey ? photos.urls.get(marker.id) ?? null : null) }, { regionId: marker.regionId ?? regionId, staticMapEnabled })}
                      fallbackCategory={marker.category}
                      className="homepage-workbench-row__image"
                      sizes="80px"
                    />
                  ) : (
                    <span className={`homepage-workbench-row__source homepage-workbench-row__source--${marker.layer}`} aria-hidden="true">
                      <MapPin size={19} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="homepage-workbench-row__focus"
                    aria-label={`${marker.name} 지도에서 보기`}
                    aria-current={resolvedSelectionId === marker.id ? "true" : undefined}
                    onClick={() => focusLocation(marker.id)}
                  >
                    <span className="homepage-workbench-row__meta">
                      <span>{PLACE_CATEGORY_LABELS[marker.category]}</span>
                      <span>{marker.statusLabel}</span>
                    </span>
                    <strong>{marker.name}</strong>
                    <small><MapPin size={12} aria-hidden="true" />{marker.district ?? marker.address}</small>
                    <i>{marker.sourceLabel}</i>
                  </button>
                  {marker.href ? (
                    <Link
                      href={marker.href}
                      className="homepage-workbench-row__detail"
                      aria-label={`${marker.name} 상세 보기${external ? " (새 창)" : ""}`}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noreferrer" : undefined}
                    >
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  ) : null}
                </article>
              );
            })}
            {visibleMarkers.length > HOME_LIST_PAGE_SIZE ? (
              <nav className="homepage-workbench-pager" aria-label="홈 장소 목록 페이지">
                <button
                  type="button"
                  disabled={activeListPage === 0}
                  onClick={() => showListPage(activeListPage - 1)}
                >
                  이전 장소
                </button>
                <span aria-live="polite">{activeListPage + 1} / {pageCount}</span>
                <button
                  type="button"
                  disabled={activeListPage >= pageCount - 1}
                  onClick={() => showListPage(activeListPage + 1)}
                >
                  다음 장소
                </button>
              </nav>
            ) : null}
          </div>
          <Link href={`/results?tab=catalog&region=${encodeURIComponent(regionId)}`} className="homepage-more-places-link">
            더 많은 장소 보기 <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </section>
  );
}
