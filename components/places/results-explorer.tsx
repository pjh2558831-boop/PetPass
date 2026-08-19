"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Check, ChevronLeft, ChevronRight, List, Map as MapIcon, RefreshCw, Route, Rows3, SlidersHorizontal } from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { PublicCatalogCard } from "@/components/places/public-catalog-card";
import { usePlannerState } from "@/components/planner/planner-state";
import {
  PUBLIC_CATALOG_LAYERS,
  PUBLIC_CATALOG_PAGE_SIZE,
  getPublicCatalogDistrictName,
  serializePublicCatalogCategories,
  type PublicCatalogUrlState,
} from "@/lib/map-places/catalog-url";
import {
  explorerBoundsAreEquivalent,
  getExplorerCollections,
  isInsideExplorerBounds,
  type ExplorerSort,
} from "@/lib/map-places/explorer-collections";
import {
  DEFAULT_PLACE_CATEGORIES,
  OPTIONAL_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
  mapCatalogPlaceToCategory,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { KakaoMapLocation, KakaoViewportIdleCause } from "@/lib/kakao/maps";
import { BUSAN_DISTRICTS, BUSAN_REGION } from "@/lib/tour-api/catalog";
import type { ApiResult } from "@/types/api";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import {
  normalizeKakaoCatalogMarker,
  normalizeTourCatalogPlace,
  normalizeTourCatalogMarker,
  markerToCatalogCard,
  type PublicCatalogLayer,
  type PublicCatalogMarker,
  type PublicCatalogMarkerPage,
  type PublicCatalogPlace,
} from "@/types/public-catalog-place";
import type { PublicMapPlacePage } from "@/types/public-map-place";
import type { TourPlaceList } from "@/types/place";

type ExplorerTab = "catalog" | "recommendations";
type ProviderState = "loading" | "ready" | "error";
type MobileExplorerMode = "map" | "list";

const RecommendationPlanner = dynamic(
  () => import("@/components/itinerary/recommendation-planner").then((module) => module.RecommendationPlanner),
  { loading: () => <p role="status">추천 코스를 준비하는 중입니다…</p>, ssr: false },
);

const LAYER_META: Record<PublicCatalogLayer, {
  label: string;
  markerKind: KakaoMapLocation["markerKind"];
  color: string;
}> = {
  tourism: { label: "한국관광공사", markerKind: "tourism-official", color: "green" },
  kakao: { label: "카카오 검색 후보", markerKind: "kakao-candidate", color: "yellow" },
  veterinary: { label: "동물병원", markerKind: "veterinary", color: "red" },
  pet_shop: { label: "펫샵·용품점", markerKind: "pet-shop", color: "purple" },
};

async function fetchAllTourPlaces(
  district: string,
  signal: AbortSignal,
  categories: readonly PlaceCategory[],
): Promise<PublicCatalogMarker[]> {
  const places: PublicCatalogMarker[] = [];
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;
  while (places.length < totalCount) {
    const params = new URLSearchParams({ regionCode: BUSAN_REGION.code, page: String(page), pageSize: "1000", view: "markers", categories: categories.join(",") });
    if (district !== "all") params.set("districtCode", district);
    const response = await fetch(`/api/tour/places?${params}`, { signal, headers: { Accept: "application/json" } });
    const body = await response.json() as ApiResult<PublicCatalogMarkerPage | TourPlaceList>;
    if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error.message : "관광공사 장소를 불러오지 못했습니다.");
    const next = "items" in body.data
      ? body.data.items
      : body.data.places.map(normalizeTourCatalogMarker);
    places.push(...next);
    totalCount = body.data.totalCount;
    if (next.length === 0) break;
    page += 1;
  }
  return places;
}

const DEFAULT_KAKAO_CATEGORIES = ["attraction", "park_walk", "leisure", "camping", "food", "cafe", "accommodation"] as const;

async function fetchKakaoMarkerPages(
  district: string,
  signal: AbortSignal,
  kinds: string,
  categories?: readonly string[],
): Promise<PublicCatalogMarker[]> {
  const places: PublicCatalogMarker[] = [];
  let page = 1;
  let hasNext = true;
  let afterId: number | null = null;
  while (hasNext) {
    const params = new URLSearchParams({ page: String(page), pageSize: "200", view: "markers", kinds });
    if (categories) params.set("categories", categories.join(","));
    if (afterId !== null) params.set("afterId", String(afterId));
    if (district !== "all") params.set("district", district);
    const response = await fetch(`/api/map/places?${params}`, { signal, headers: { Accept: "application/json" } });
    const body = await response.json() as ApiResult<PublicMapPlacePage | PublicCatalogMarkerPage>;
    if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error.message : "Kakao 장소를 불러오지 못했습니다.");
    places.push(...body.data.items.map((place) => "layer" in place
      ? place
      : normalizeKakaoCatalogMarker(place)));
    hasNext = body.data.hasNext;
    afterId = body.data.nextCursor ?? null;
    if (hasNext && afterId === null) {
      throw new Error("Kakao 장소 페이지 커서를 확인하지 못했습니다.");
    }
    page += 1;
  }
  return places;
}

async function fetchAllKakaoPlaces(
  district: string,
  signal: AbortSignal,
  scope: "default" | "optional",
): Promise<PublicCatalogMarker[]> {
  const groups = scope === "default"
    ? [fetchKakaoMarkerPages(district, signal, "pet_travel_candidate", DEFAULT_KAKAO_CATEGORIES)]
    : [
        fetchKakaoMarkerPages(district, signal, "pet_travel_candidate", ["shopping"]),
        fetchKakaoMarkerPages(district, signal, "veterinary,pet_shop"),
      ];
  return (await Promise.all(groups)).flat();
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, currentPage - 2), totalPages - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function CategoryToggleGroup({
  title,
  categories,
  active,
  counts,
  onToggle,
}: {
  title: string;
  categories: readonly PlaceCategory[];
  active: readonly PlaceCategory[];
  counts: Record<PlaceCategory, number | null>;
  onToggle: (category: PlaceCategory) => void;
}) {
  return (
    <fieldset className="explorer-category-group">
      <legend>{title}</legend>
      <div>
        {categories.map((category) => {
          const selected = active.includes(category);
          return (
            <button key={category} type="button" aria-pressed={selected} onClick={() => onToggle(category)}>
              <span className="explorer-category-group__check" aria-hidden="true">{selected ? <Check size={12} /> : null}</span>
              <span>{PLACE_CATEGORY_LABELS[category]}</span>
              <small>{counts[category] ?? "…"}</small>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ResultsExplorer({ initialTab = "catalog", initialCatalogState, staticMapEnabled = false }: {
  initialTab?: ExplorerTab;
  initialCatalogState: PublicCatalogUrlState;
  staticMapEnabled?: boolean;
}) {
  const router = useRouter();
  const { generationRequested, consumeGenerationRequest } = usePlannerState();
  const [activeTab, setActiveTab] = useState<ExplorerTab>(initialTab);
  const [district, setDistrict] = useState(initialCatalogState.district);
  const [categories, setCategories] = useState<PlaceCategory[]>(initialCatalogState.categories);
  const [page, setPage] = useState(initialCatalogState.page);
  const [sort, setSort] = useState<ExplorerSort>(initialCatalogState.sort);
  const [mobileMode, setMobileMode] = useState<MobileExplorerMode>("map");
  const [tourPlaces, setTourPlaces] = useState<PublicCatalogMarker[]>([]);
  const [kakaoPlaces, setKakaoPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalTourPlaces, setOptionalTourPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalKakaoPlaces, setOptionalKakaoPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalLoadedFor, setOptionalLoadedFor] = useState<string | null>(null);
  const [tourState, setTourState] = useState<ProviderState>("loading");
  const [kakaoState, setKakaoState] = useState<ProviderState>("loading");
  const [tourError, setTourError] = useState("");
  const [kakaoError, setKakaoError] = useState("");
  const [tourCardsById, setTourCardsById] = useState<Map<string, PublicCatalogPlace>>(() => new Map());
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeBounds, setActiveBounds] = useState<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const [viewportDirty, setViewportDirty] = useState(false);
  const latestViewportRef = useRef<KakaoCurrentMapSearch | null>(null);
  const viewportBaselineRef = useRef<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const activeBoundsRef = useRef<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const [rankingAsOf] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const controller = new AbortController();
    void fetchAllTourPlaces(district, controller.signal, DEFAULT_PLACE_CATEGORIES)
      .then((places) => { setTourPlaces(places); setTourState("ready"); setTourError(""); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setTourState("error"); setTourError(error instanceof Error ? error.message : "관광공사 오류"); } });
    void fetchAllKakaoPlaces(district, controller.signal, "default")
      .then((places) => { setKakaoPlaces(places); setKakaoState("ready"); setKakaoError(""); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setKakaoState("error"); setKakaoError(error instanceof Error ? error.message : "Kakao 오류"); } });
    return () => controller.abort();
  }, [activeTab, district, retry]);

  const needsOptionalPlaces = categories.some((category) => OPTIONAL_PLACE_CATEGORIES.includes(category));
  useEffect(() => {
    const scopeKey = `${district}:${retry}`;
    if (activeTab !== "catalog" || !needsOptionalPlaces || optionalLoadedFor === scopeKey) return;
    const controller = new AbortController();
    void Promise.all([
      fetchAllTourPlaces(district, controller.signal, ["shopping"]),
      fetchAllKakaoPlaces(district, controller.signal, "optional"),
    ]).then(([tour, kakao]) => {
      setOptionalTourPlaces(tour);
      setOptionalKakaoPlaces(kakao);
      setOptionalLoadedFor(scopeKey);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setKakaoError(error instanceof Error ? error.message : "추가 장소 오류");
    });
    return () => controller.abort();
  }, [activeTab, district, needsOptionalPlaces, optionalLoadedFor, retry]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (activeTab === "catalog") {
      if (district !== "all") params.set("district", district);
      const categoryState = serializePublicCatalogCategories(categories);
      if (categoryState) params.set("categories", categoryState);
      if (sort !== "recommendation") params.set("sort", sort);
      params.set("page", String(page));
    }
    router.replace(`/results?${params}`, { scroll: false });
  }, [activeTab, categories, district, page, router, sort]);

  const allPlaces = useMemo(() => {
    const unique = new Map<string, PublicCatalogMarker>();
    const optionalPlaces = optionalLoadedFor === `${district}:${retry}`
      ? [...optionalTourPlaces, ...optionalKakaoPlaces]
      : [];
    for (const place of [...tourPlaces, ...kakaoPlaces, ...optionalPlaces]) if (!unique.has(place.id)) unique.set(place.id, place);
    return [...unique.values()];
  }, [district, kakaoPlaces, optionalKakaoPlaces, optionalLoadedFor, optionalTourPlaces, retry, tourPlaces]);

  const rankingCenter = useMemo(() => activeBounds ? ({
    latitude: (activeBounds.south + activeBounds.north) / 2,
    longitude: (activeBounds.west + activeBounds.east) / 2,
  }) : null, [activeBounds]);
  const scopedCollections = useMemo(() => getExplorerCollections({
    places: allPlaces,
    district,
    categories: [...PLACE_CATEGORIES],
    layers: [...PUBLIC_CATALOG_LAYERS],
    activeBounds,
    page: 1,
    sort,
    rankingAsOf,
    rankingCenter,
  }), [activeBounds, allPlaces, district, rankingAsOf, rankingCenter, sort]);
  const categoryCounts = useMemo(() => Object.fromEntries(
    PLACE_CATEGORIES.map((category) => [
      category,
      scopedCollections.filteredPlaces.filter((place) => mapCatalogPlaceToCategory(place) === category).length,
    ]),
  ) as Record<PlaceCategory, number>, [scopedCollections.filteredPlaces]);
  const displayedCategoryCounts = useMemo(() => Object.fromEntries(
    PLACE_CATEGORIES.map((category) => [
      category,
      OPTIONAL_PLACE_CATEGORIES.includes(category) && optionalLoadedFor !== `${district}:${retry}`
        ? null
        : categoryCounts[category],
    ]),
  ) as Record<PlaceCategory, number | null>, [categoryCounts, district, optionalLoadedFor, retry]);
  const filteredCollections = useMemo(() => getExplorerCollections({
    places: allPlaces,
    district,
    categories,
    layers: [...PUBLIC_CATALOG_LAYERS],
    activeBounds,
    page: 1,
    sort,
    rankingAsOf,
    rankingCenter,
  }), [activeBounds, allPlaces, categories, district, rankingAsOf, rankingCenter, sort]);
  const { filteredPlaces, mapPlaces, totalPages } = filteredCollections;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedMarkers = useMemo(() => {
    const offset = (currentPage - 1) * PUBLIC_CATALOG_PAGE_SIZE;
    return filteredPlaces.slice(offset, offset + PUBLIC_CATALOG_PAGE_SIZE);
  }, [currentPage, filteredPlaces]);
  const pagedPlaces = useMemo(() => pagedMarkers.map((marker) =>
    tourCardsById.get(marker.id) ?? markerToCatalogCard(marker)
  ), [pagedMarkers, tourCardsById]);

  useEffect(() => {
    const missingIds = pagedMarkers
      .filter(({ layer, id }) => layer === "tourism" && !tourCardsById.has(id))
      .map(({ providerPlaceId }) => providerPlaceId);
    if (missingIds.length === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      regionCode: BUSAN_REGION.code,
      ids: missingIds.join(","),
      page: "1",
      pageSize: String(missingIds.length),
    });
    if (district !== "all") params.set("districtCode", district);
    void fetch(`/api/tour/places?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      const body = await response.json() as ApiResult<TourPlaceList>;
      if (!response.ok || !body.ok) return;
      if (!Array.isArray(body.data.places)) return;
      const places = body.data.places;
      setTourCardsById((current) => {
        const next = new Map(current);
        for (const place of places) {
          if (missingIds.includes(place.contentId)) {
            const card = normalizeTourCatalogPlace(place);
            next.set(card.id, card);
          }
        }
        return next;
      });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [district, pagedMarkers, tourCardsById]);
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
  const districtName = district === "all" ? "부산 전체" : getPublicCatalogDistrictName(district);
  const anyReady = tourState === "ready" || kakaoState === "ready";
  const isDefaultCategoryState = DEFAULT_PLACE_CATEGORIES.length === categories.length &&
    DEFAULT_PLACE_CATEGORIES.every((category) => categories.includes(category));
  const activeFilterCount = Number(district !== "all") + Number(!isDefaultCategoryState) + Number(Boolean(activeBounds));
  const allPopularityInsufficient = filteredPlaces.length > 0;

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
  const toggleCategory = useCallback((category: PlaceCategory) => {
    setCategories((current) => current.includes(category)
      ? current.filter((value) => value !== category)
      : PLACE_CATEGORIES.filter((value) => value === category || current.includes(value)));
    setPage(1);
    setSelectedId(null);
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
          <div className="explorer-category-panel">
            <div className="explorer-category-panel__heading">
              <p>BUSAN PET PLACE MAP</p>
              <h2>부산 반려동물 장소</h2>
              <strong>현재 표시 {filteredPlaces.length.toLocaleString("ko-KR")}곳</strong>
            </div>
            <CategoryToggleGroup
              title="여행 장소"
              categories={DEFAULT_PLACE_CATEGORIES}
              active={categories}
              counts={displayedCategoryCounts}
              onToggle={toggleCategory}
            />
            <CategoryToggleGroup
              title="추가로 보기"
              categories={OPTIONAL_PLACE_CATEGORIES}
              active={categories}
              counts={displayedCategoryCounts}
              onToggle={toggleCategory}
            />
            <div className="explorer-category-panel__actions">
              <button type="button" onClick={() => { setCategories([...PLACE_CATEGORIES]); setPage(1); setSelectedId(null); }}>전체</button>
              <button type="button" onClick={() => { setCategories([...DEFAULT_PLACE_CATEGORIES]); setPage(1); setSelectedId(null); }}>기본으로</button>
            </div>
          </div>
          <div className="explorer-source-legend" aria-label="장소 출처 범례">
            {PUBLIC_CATALOG_LAYERS.map((layer) => (
              <span key={layer}><i data-color={LAYER_META[layer].color} aria-hidden="true" />{LAYER_META[layer].label}</span>
            ))}
          </div>
          <MapPanel
            locations={mapLocations}
            selectedLocationId={selectedId}
            onLocationSelect={selectPlace}
            onViewportIdle={handleViewportIdle}
            onCurrentMapSearch={commitCurrentViewport}
            showCurrentMapSearch={viewportDirty}
            currentMapSearchLabel="이 지역 검색 다시하기"
            viewportKey={`catalog:${district}:${categories.join(",")}`}
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
                <CategoryToggleGroup title="여행 장소" categories={DEFAULT_PLACE_CATEGORIES} active={categories} counts={displayedCategoryCounts} onToggle={toggleCategory} />
                <CategoryToggleGroup title="추가로 보기" categories={OPTIONAL_PLACE_CATEGORIES} active={categories} counts={displayedCategoryCounts} onToggle={toggleCategory} />
                <div className="explorer-filter-menu__category-actions">
                  <button type="button" onClick={() => { setCategories([...PLACE_CATEGORIES]); setPage(1); setSelectedId(null); }}>전체 카테고리</button>
                  <button type="button" onClick={() => { setCategories([...DEFAULT_PLACE_CATEGORIES]); setPage(1); setSelectedId(null); }}>기본 카테고리</button>
                </div>
                {activeBounds ? <button type="button" onClick={() => { resetViewportScope(); setPage(1); }}>지도 검색 범위 초기화</button> : null}
              </div>
            </details>
          </header>

          <div className="explorer-sort-row">
            <label htmlFor="explorer-sort">정렬</label>
            <select id="explorer-sort" value={sort} onChange={(event) => { setSort(event.target.value as ExplorerSort); setPage(1); }}><option value="recommendation">추천순</option><option value="popularity">인기도순</option></select>
            {activeBounds ? <span>지도 범위 적용 중</span> : null}
          </div>
          {sort === "popularity" && allPopularityInsufficient ? <p className="explorer-popularity-notice" role="status">이용 데이터가 쌓이는 동안 추천순을 함께 반영합니다.</p> : null}
          <div className="explorer-results-status">
            {tourState === "error" ? <div role="alert"><b>관광공사 장소를 불러오지 못했습니다.</b> {tourError}</div> : null}
            {kakaoState === "error" ? <div role="alert"><b>Kakao 장소를 불러오지 못했습니다.</b> {kakaoError}</div> : null}
            {tourState === "loading" || kakaoState === "loading" ? <p role="status">장소를 불러오는 중입니다…</p> : null}
            {!anyReady && tourState === "error" && kakaoState === "error" ? <button type="button" onClick={() => { setTourState("loading"); setKakaoState("loading"); setRetry((value) => value + 1); }}><RefreshCw size={15} aria-hidden="true" />다시 시도</button> : null}
          </div>
          <div className="explorer-results-list">
            {anyReady && pagedPlaces.length === 0 ? <p className="explorer-empty-state">선택한 조건의 장소가 없습니다.</p> : null}
            {pagedPlaces.map((place) => <PublicCatalogCard key={place.id} place={place} selected={selectedId === place.id} onSelect={() => selectPlace(place.id)} staticMapEnabled={staticMapEnabled} />)}
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
