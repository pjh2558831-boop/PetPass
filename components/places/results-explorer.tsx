"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, List, Map as MapIcon, RefreshCw, Route, Rows3, SlidersHorizontal } from "lucide-react";
import { RecommendationPlanner } from "@/components/itinerary/recommendation-planner";
import { MapPanel } from "@/components/map/map-panel";
import { PublicCatalogCard } from "@/components/places/public-catalog-card";
import { usePlannerState } from "@/components/planner/planner-state";
import {
  PUBLIC_CATALOG_LAYERS,
  PUBLIC_CATALOG_PAGE_SIZE,
  getPublicCatalogDistrictName,
  type PublicCatalogUrlState,
} from "@/lib/map-places/catalog-url";
import {
  explorerBoundsAreEquivalent,
  getExplorerCollections,
  isInsideExplorerBounds,
  type ExplorerSort,
} from "@/lib/map-places/explorer-collections";
import type { KakaoMapLocation, KakaoViewportIdleCause } from "@/lib/kakao/maps";
import { BUSAN_DISTRICTS, BUSAN_REGION } from "@/lib/tour-api/catalog";
import type { ApiResult } from "@/types/api";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import {
  normalizeKakaoCatalogPlace,
  normalizeTourCatalogPlace,
  type PublicCatalogLayer,
  type PublicCatalogPlace,
} from "@/types/public-catalog-place";
import { PUBLIC_MAP_PLACE_CATEGORIES, type PublicMapPlacePage } from "@/types/public-map-place";
import type { TourPlaceList, TourPlaceSummary } from "@/types/place";

type ExplorerTab = "catalog" | "recommendations";
type ProviderState = "loading" | "ready" | "error";
type MobileExplorerMode = "map" | "list";

const LAYER_META: Record<PublicCatalogLayer, {
  label: string;
  markerKind: KakaoMapLocation["markerKind"];
  asset: string;
}> = {
  tourism: { label: "관광공사", markerKind: "tourism-official", asset: "/map-pins/tourism-official.svg" },
  kakao: { label: "Kakao 여행 후보", markerKind: "kakao-candidate", asset: "/map-pins/kakao-candidate.svg" },
  veterinary: { label: "동물병원", markerKind: "veterinary", asset: "/map-pins/veterinary.svg" },
  pet_shop: { label: "펫샵", markerKind: "pet-shop", asset: "/map-pins/pet-shop.svg" },
};

const CATEGORY_OPTIONS = [
  { value: "all", label: "전체 여행 유형" },
  ...PUBLIC_MAP_PLACE_CATEGORIES.map((value) => ({
    value,
    label: ({ cafe: "카페", food: "음식점", accommodation: "숙박", attraction: "관광·문화", park_walk: "공원·산책", leisure: "레저", camping: "캠핑", other: "기타" } as const)[value],
  })),
] as const;

async function fetchAllTourPlaces(district: string, signal: AbortSignal): Promise<TourPlaceSummary[]> {
  const places: TourPlaceSummary[] = [];
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;
  while (places.length < totalCount) {
    const params = new URLSearchParams({ regionCode: BUSAN_REGION.code, page: String(page), pageSize: "1000" });
    if (district !== "all") params.set("districtCode", district);
    const response = await fetch(`/api/tour/places?${params}`, { signal, headers: { Accept: "application/json" } });
    const body = await response.json() as ApiResult<TourPlaceList>;
    if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error.message : "관광공사 장소를 불러오지 못했습니다.");
    places.push(...body.data.places);
    totalCount = body.data.totalCount;
    if (body.data.places.length === 0) break;
    page += 1;
  }
  return places;
}

async function fetchAllKakaoPlaces(district: string, signal: AbortSignal): Promise<PublicCatalogPlace[]> {
  const places: PublicCatalogPlace[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const params = new URLSearchParams({ page: String(page), pageSize: "200" });
    if (district !== "all") params.set("district", district);
    const response = await fetch(`/api/map/places?${params}`, { signal, headers: { Accept: "application/json" } });
    const body = await response.json() as ApiResult<PublicMapPlacePage>;
    if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error.message : "Kakao 장소를 불러오지 못했습니다.");
    places.push(...body.data.items.map(normalizeKakaoCatalogPlace));
    hasNext = body.data.hasNext;
    page += 1;
  }
  return places;
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, currentPage - 2), totalPages - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export function ResultsExplorer({ initialTab = "catalog", initialCatalogState }: {
  initialTab?: ExplorerTab;
  initialCatalogState: PublicCatalogUrlState;
}) {
  const router = useRouter();
  const { generationRequested, consumeGenerationRequest } = usePlannerState();
  const [activeTab, setActiveTab] = useState<ExplorerTab>(initialTab);
  const [district, setDistrict] = useState(initialCatalogState.district);
  const [category, setCategory] = useState(initialCatalogState.category);
  const [layers, setLayers] = useState<PublicCatalogLayer[]>(initialCatalogState.layers);
  const [page, setPage] = useState(initialCatalogState.page);
  const [sort, setSort] = useState<ExplorerSort>("source");
  const [mobileMode, setMobileMode] = useState<MobileExplorerMode>("map");
  const [tourPlaces, setTourPlaces] = useState<PublicCatalogPlace[]>([]);
  const [kakaoPlaces, setKakaoPlaces] = useState<PublicCatalogPlace[]>([]);
  const [tourState, setTourState] = useState<ProviderState>("loading");
  const [kakaoState, setKakaoState] = useState<ProviderState>("loading");
  const [tourError, setTourError] = useState("");
  const [kakaoError, setKakaoError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeBounds, setActiveBounds] = useState<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const [viewportDirty, setViewportDirty] = useState(false);
  const latestViewportRef = useRef<KakaoCurrentMapSearch | null>(null);
  const viewportBaselineRef = useRef<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const activeBoundsRef = useRef<KakaoCurrentMapSearch["rectangle"] | null>(null);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const controller = new AbortController();
    void fetchAllTourPlaces(district, controller.signal)
      .then((places) => { setTourPlaces(places.map(normalizeTourCatalogPlace)); setTourState("ready"); setTourError(""); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setTourState("error"); setTourError(error instanceof Error ? error.message : "관광공사 오류"); } });
    void fetchAllKakaoPlaces(district, controller.signal)
      .then((places) => { setKakaoPlaces(places); setKakaoState("ready"); setKakaoError(""); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setKakaoState("error"); setKakaoError(error instanceof Error ? error.message : "Kakao 오류"); } });
    return () => controller.abort();
  }, [activeTab, district, retry]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (activeTab === "catalog") {
      if (district !== "all") params.set("district", district);
      if (category !== "all") params.set("category", category);
      params.set("layers", layers.length > 0 ? layers.join(",") : "none");
      params.set("page", String(page));
    }
    router.replace(`/results?${params}`, { scroll: false });
  }, [activeTab, category, district, layers, page, router]);

  const allPlaces = useMemo(() => {
    const unique = new Map<string, PublicCatalogPlace>();
    for (const place of [...tourPlaces, ...kakaoPlaces]) if (!unique.has(place.id)) unique.set(place.id, place);
    return [...unique.values()];
  }, [kakaoPlaces, tourPlaces]);

  const scopedCollections = useMemo(() => getExplorerCollections({
    places: allPlaces,
    district,
    category,
    layers: [...PUBLIC_CATALOG_LAYERS],
    activeBounds,
    page: 1,
    sort,
  }), [activeBounds, allPlaces, category, district, sort]);
  const layerCounts = useMemo(() => Object.fromEntries(PUBLIC_CATALOG_LAYERS.map((layer) => [layer, scopedCollections.filteredPlaces.filter((place) => place.layer === layer).length])) as Record<PublicCatalogLayer, number>, [scopedCollections.filteredPlaces]);
  const filteredCollections = useMemo(() => getExplorerCollections({
    places: allPlaces,
    district,
    category,
    layers,
    activeBounds,
    page: 1,
    sort,
  }), [activeBounds, allPlaces, category, district, layers, sort]);
  const { filteredPlaces, mapPlaces, totalPages } = filteredCollections;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedPlaces = useMemo(() => {
    const offset = (currentPage - 1) * PUBLIC_CATALOG_PAGE_SIZE;
    return filteredPlaces.slice(offset, offset + PUBLIC_CATALOG_PAGE_SIZE);
  }, [currentPage, filteredPlaces]);
  const mapLocations = useMemo<KakaoMapLocation[]>(() => mapPlaces.map((place) => ({
    id: place.id,
    name: place.name,
    address: place.address,
    coordinates: place.coordinates,
    markerKind: LAYER_META[place.layer].markerKind,
    sourceLabel: `${place.sourceLabel} · ${place.publicLabel}`,
    interactive: true,
    clusterable: true,
  })), [mapPlaces]);
  const placeIndex = useMemo(() => new Map(filteredPlaces.map((place, index) => [place.id, index])), [filteredPlaces]);
  const visibleLayerSet = useMemo(() => new Set(layers), [layers]);
  const districtName = district === "all" ? "부산 전체" : getPublicCatalogDistrictName(district);
  const anyReady = tourState === "ready" || kakaoState === "ready";
  const activeFilterCount = Number(district !== "all") + Number(category !== "all") + Number(Boolean(activeBounds));

  const resetViewportScope = useCallback(() => {
    activeBoundsRef.current = null;
    viewportBaselineRef.current = null;
    latestViewportRef.current = null;
    setActiveBounds(null);
    setViewportDirty(false);
  }, []);
  const changeFilter = useCallback((update: () => void) => {
    update(); setPage(1); setSelectedId(null); resetViewportScope();
  }, [resetViewportScope]);
  const toggleLayer = useCallback((id: "all" | PublicCatalogLayer) => {
    setPage(1);
    setSelectedId(null);
    if (id === "all") { setLayers([...PUBLIC_CATALOG_LAYERS]); return; }
    setLayers((current) => current.includes(id) ? current.filter((layer) => layer !== id) : [...current, id]);
  }, []);
  const selectPlace = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const index = placeIndex.get(id);
    if (index !== undefined) setPage(Math.floor(index / PUBLIC_CATALOG_PAGE_SIZE) + 1);
    requestAnimationFrame(() => document.getElementById(`place-card-${id.replace(":", "-")}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [placeIndex]);
  const handleViewportIdle = useCallback((viewport: KakaoCurrentMapSearch, cause: KakaoViewportIdleCause) => {
    latestViewportRef.current = viewport;
    if (!viewportBaselineRef.current || cause === "initial") {
      viewportBaselineRef.current = viewport.rectangle;
      if (!activeBoundsRef.current) setViewportDirty(false);
      return;
    }
    if (cause === "programmatic") return;
    const comparisonBounds = activeBoundsRef.current ?? viewportBaselineRef.current;
    setViewportDirty(!explorerBoundsAreEquivalent(comparisonBounds, viewport.rectangle));
  }, []);
  const commitCurrentViewport = useCallback((viewport: KakaoCurrentMapSearch) => {
    latestViewportRef.current = viewport;
    if (explorerBoundsAreEquivalent(activeBoundsRef.current, viewport.rectangle)) { setViewportDirty(false); return; }
    activeBoundsRef.current = viewport.rectangle;
    viewportBaselineRef.current = viewport.rectangle;
    setActiveBounds(viewport.rectangle);
    setViewportDirty(false);
    if (selectedId) {
      const selectedPlace = allPlaces.find((place) => place.id === selectedId);
      if (!selectedPlace || !isInsideExplorerBounds(selectedPlace, viewport.rectangle)) {
        setSelectedId(null);
      }
    }
    setPage(1);
  }, [allPlaces, selectedId]);

  if (activeTab === "recommendations") {
    return (
      <div className="page-shell py-8">
        <div className="mb-6 inline-flex rounded-2xl border border-[#d7e0da] bg-white p-1" role="tablist" aria-label="장소 및 추천 보기">
          <button id="catalog-tab" type="button" role="tab" aria-selected="false" onClick={() => setActiveTab("catalog")} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold text-[#52665b]"><Rows3 size={16} aria-hidden="true" />전체 장소</button>
          <button id="recommendations-tab" type="button" role="tab" aria-selected="true" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#236148] px-5 text-sm font-extrabold text-white"><Route size={16} aria-hidden="true" />추천 코스</button>
        </div>
        <div id="recommendations-panel" role="tabpanel" aria-labelledby="recommendations-tab"><RecommendationPlanner autoGenerate={generationRequested} onAutoGenerateStart={consumeGenerationRequest} /></div>
      </div>
    );
  }

  const visiblePages = getVisiblePageNumbers(currentPage, totalPages);
  return (
    <div className="full-map-explorer" id="catalog-panel" role="tabpanel" aria-labelledby="catalog-tab">
      <div className="full-map-explorer__toolbar">
        <div className="inline-flex rounded-xl border border-[#d7e0da] bg-white p-1" role="tablist" aria-label="장소 및 추천 보기">
          <button id="catalog-tab" type="button" role="tab" aria-selected="true" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#236148] px-4 text-sm font-extrabold text-white"><Rows3 size={16} aria-hidden="true" />장소 찾기</button>
          <button id="recommendations-tab" type="button" role="tab" aria-selected="false" onClick={() => setActiveTab("recommendations")} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-extrabold text-[#52665b]"><Route size={16} aria-hidden="true" />추천 코스</button>
        </div>
        <div className="full-map-explorer__mobile-switch" role="group" aria-label="지도 또는 목록 보기">
          <button type="button" aria-pressed={mobileMode === "map"} onClick={() => setMobileMode("map")}><MapIcon size={17} aria-hidden="true" />지도</button>
          <button type="button" aria-pressed={mobileMode === "list"} onClick={() => setMobileMode("list")}><List size={17} aria-hidden="true" />목록</button>
        </div>
        <p className="full-map-explorer__scope"><strong>{districtName}</strong><span>공식 관광 장소와 공개된 지역 후보를 함께 비교합니다.</span></p>
      </div>

      <div className="full-map-explorer__main" data-mobile-mode={mobileMode}>
        <section className="full-map-explorer__map" aria-label={`${districtName} 전체 장소 지도`}>
          <fieldset className="explorer-source-toolbar">
            <legend className="sr-only">지도 소스 필터</legend>
            <button type="button" aria-pressed={layers.length === PUBLIC_CATALOG_LAYERS.length} onClick={() => toggleLayer("all")}><span className="explorer-source-toolbar__all" aria-hidden="true" />전체</button>
            {PUBLIC_CATALOG_LAYERS.map((layer) => (
              <button key={layer} type="button" aria-pressed={visibleLayerSet.has(layer)} onClick={() => toggleLayer(layer)}>
                <Image src={LAYER_META[layer].asset} width={20} height={24} alt="" aria-hidden="true" />{LAYER_META[layer].label}<span>{layerCounts[layer]}</span>
              </button>
            ))}
          </fieldset>
          <MapPanel
            locations={mapLocations}
            selectedLocationId={selectedId}
            onLocationSelect={selectPlace}
            onViewportIdle={handleViewportIdle}
            onCurrentMapSearch={commitCurrentViewport}
            showCurrentMapSearch={viewportDirty}
            currentMapSearchLabel="이 지역 검색 다시하기"
            viewportKey={`catalog:${district}:${category}`}
            showLocationLabel={false}
            title={`${districtName} 장소 지도`}
            locationLabel={districtName}
            emptyMessage="선택한 조건에 표시할 장소가 없습니다."
          />
          <p className="sr-only" aria-live="polite">{viewportDirty ? "지도 범위가 변경되었습니다. 이 지역 검색 다시하기를 선택하면 결과에 반영됩니다." : ""}</p>
        </section>

        <aside className="full-map-explorer__sidebar" aria-label="장소 검색 결과">
          <header className="explorer-results-header">
            <div><h1>총 {filteredPlaces.length.toLocaleString("ko-KR")}곳</h1><p>카드는 페이지당 12개 <span aria-hidden="true">·</span> 지도는 현재 필터의 전체 결과</p></div>
            <details className="explorer-filter-menu">
              <summary><SlidersHorizontal size={16} aria-hidden="true" />필터{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}</summary>
              <div>
                <label>부산 세부 지역<select value={district} onChange={(event) => changeFilter(() => { setDistrict(event.target.value as typeof district); setTourState("loading"); setKakaoState("loading"); setTourPlaces([]); setKakaoPlaces([]); })}><option value="all">부산 전체</option>{BUSAN_DISTRICTS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                <label>여행 장소 유형<select value={category} onChange={(event) => changeFilter(() => setCategory(event.target.value as typeof category))}>{CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                {activeBounds ? <button type="button" onClick={() => { resetViewportScope(); setPage(1); }}>지도 검색 범위 초기화</button> : null}
              </div>
            </details>
          </header>

          <div className="explorer-sort-row">
            <label htmlFor="explorer-sort">정렬</label>
            <select id="explorer-sort" value={sort} onChange={(event) => { setSort(event.target.value as ExplorerSort); setPage(1); }}><option value="source">소스순</option><option value="name">이름순</option></select>
            {activeBounds ? <span>지도 범위 적용 중</span> : null}
          </div>
          <div className="explorer-results-status">
            {tourState === "error" ? <div role="alert"><b>관광공사 장소를 불러오지 못했습니다.</b> {tourError}</div> : null}
            {kakaoState === "error" ? <div role="alert"><b>Kakao 장소를 불러오지 못했습니다.</b> {kakaoError}</div> : null}
            {tourState === "loading" || kakaoState === "loading" ? <p role="status">장소를 불러오는 중입니다…</p> : null}
            {!anyReady && tourState === "error" && kakaoState === "error" ? <button type="button" onClick={() => { setTourState("loading"); setKakaoState("loading"); setRetry((value) => value + 1); }}><RefreshCw size={15} aria-hidden="true" />다시 시도</button> : null}
          </div>
          <div className="explorer-results-list">
            {anyReady && pagedPlaces.length === 0 ? <p className="explorer-empty-state">선택한 조건의 장소가 없습니다.</p> : null}
            {pagedPlaces.map((place) => <PublicCatalogCard key={place.id} place={place} selected={selectedId === place.id} onSelect={() => selectPlace(place.id)} />)}
          </div>
          <nav className="explorer-pagination" aria-label="장소 목록 페이지">
            <button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedId(null); }} aria-label="이전 페이지"><ChevronLeft size={17} aria-hidden="true" /></button>
            {visiblePages.map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => { setPage(pageNumber); setSelectedId(null); }}>{pageNumber}</button>)}
            {totalPages > 5 && currentPage < totalPages - 2 ? <span aria-hidden="true">…</span> : null}
            {totalPages > 5 && !visiblePages.includes(totalPages) ? <button type="button" onClick={() => { setPage(totalPages); setSelectedId(null); }}>{totalPages}</button> : null}
            <button type="button" disabled={currentPage === totalPages} onClick={() => { setPage(currentPage + 1); setSelectedId(null); }} aria-label="다음 페이지"><ChevronRight size={17} aria-hidden="true" /></button>
          </nav>
        </aside>
      </div>
    </div>
  );
}
