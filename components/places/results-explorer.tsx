"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, Route, Rows3 } from "lucide-react";
import { RecommendationPlanner } from "@/components/itinerary/recommendation-planner";
import { MapPanel, type MapLayerControl } from "@/components/map/map-panel";
import { PublicCatalogCard } from "@/components/places/public-catalog-card";
import { usePlannerState } from "@/components/planner/planner-state";
import {
  PUBLIC_CATALOG_LAYERS,
  PUBLIC_CATALOG_PAGE_SIZE,
  getPublicCatalogDistrictName,
  type PublicCatalogUrlState,
} from "@/lib/map-places/catalog-url";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import { BUSAN_DISTRICTS, BUSAN_REGION } from "@/lib/tour-api/catalog";
import type { ApiResult } from "@/types/api";
import {
  normalizeKakaoCatalogPlace,
  normalizeTourCatalogPlace,
  type PublicCatalogLayer,
  type PublicCatalogPlace,
} from "@/types/public-catalog-place";
import {
  PUBLIC_MAP_PLACE_CATEGORIES,
  type PublicMapPlacePage,
} from "@/types/public-map-place";
import type { TourPlaceList, TourPlaceSummary } from "@/types/place";

type ExplorerTab = "catalog" | "recommendations";
type ProviderState = "loading" | "ready" | "error";

const LAYER_META: Record<PublicCatalogLayer, { label: string; markerKind: KakaoMapLocation["markerKind"]; markerLabel: string }> = {
  tourism: { label: "관광공사", markerKind: "tourism-official", markerLabel: "공" },
  kakao: { label: "Kakao 여행 후보", markerKind: "kakao-candidate", markerLabel: "K" },
  veterinary: { label: "동물병원", markerKind: "veterinary", markerLabel: "+" },
  pet_shop: { label: "펫샵", markerKind: "pet-shop", markerLabel: "▣" },
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

export function ResultsExplorer({
  initialTab = "catalog",
  initialCatalogState,
}: {
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
  const [tourPlaces, setTourPlaces] = useState<PublicCatalogPlace[]>([]);
  const [kakaoPlaces, setKakaoPlaces] = useState<PublicCatalogPlace[]>([]);
  const [tourState, setTourState] = useState<ProviderState>("loading");
  const [kakaoState, setKakaoState] = useState<ProviderState>("loading");
  const [tourError, setTourError] = useState("");
  const [kakaoError, setKakaoError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    const seen = new Set<string>();
    return [...tourPlaces, ...kakaoPlaces].filter((place) => !seen.has(place.id) && Boolean(seen.add(place.id)));
  }, [kakaoPlaces, tourPlaces]);
  const categoryFiltered = useMemo(() => allPlaces.filter((place) => (
    category === "all" || place.layer === "veterinary" || place.layer === "pet_shop" || place.category === category
  )), [allPlaces, category]);
  const layerCounts = useMemo(() => Object.fromEntries(PUBLIC_CATALOG_LAYERS.map((layer) => [layer, categoryFiltered.filter((place) => place.layer === layer).length])) as Record<PublicCatalogLayer, number>, [categoryFiltered]);
  const visibleLayerSet = useMemo(() => new Set(layers), [layers]);
  const visiblePlaces = useMemo(() => categoryFiltered.filter((place) => visibleLayerSet.has(place.layer)), [categoryFiltered, visibleLayerSet]);
  const totalPages = Math.max(1, Math.ceil(visiblePlaces.length / PUBLIC_CATALOG_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagePlaces = visiblePlaces.slice((currentPage - 1) * PUBLIC_CATALOG_PAGE_SIZE, currentPage * PUBLIC_CATALOG_PAGE_SIZE);
  const placeIndex = useMemo(() => new Map(visiblePlaces.map((place, index) => [place.id, index])), [visiblePlaces]);

  const mapLocations = useMemo<KakaoMapLocation[]>(() => visiblePlaces.map((place) => ({
    id: place.id,
    name: place.name,
    address: place.address,
    coordinates: place.coordinates,
    markerKind: LAYER_META[place.layer].markerKind,
    markerLabel: LAYER_META[place.layer].markerLabel,
    sourceLabel: `${place.sourceLabel} · ${place.publicLabel}`,
    interactive: true,
    clusterable: true,
  })), [visiblePlaces]);

  const layerControls = useMemo<MapLayerControl[]>(() => [
    { id: "all", label: "전체", markerKind: "catalog", count: categoryFiltered.length, visible: layers.length === PUBLIC_CATALOG_LAYERS.length },
    ...PUBLIC_CATALOG_LAYERS.map((layer) => ({ id: layer, label: LAYER_META[layer].label, markerKind: LAYER_META[layer].markerKind, count: layerCounts[layer], visible: visibleLayerSet.has(layer) })),
  ], [categoryFiltered.length, layerCounts, layers.length, visibleLayerSet]);

  const toggleLayer = useCallback((id: string, visible: boolean) => {
    setPage(1);
    setSelectedId(null);
    if (id === "all") { setLayers(visible ? [...PUBLIC_CATALOG_LAYERS] : []); return; }
    if (!PUBLIC_CATALOG_LAYERS.includes(id as PublicCatalogLayer)) return;
    setLayers((current) => visible ? [...new Set([...current, id as PublicCatalogLayer])] : current.filter((layer) => layer !== id));
  }, []);

  const selectPlace = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const index = placeIndex.get(id);
    if (index !== undefined) setPage(Math.floor(index / PUBLIC_CATALOG_PAGE_SIZE) + 1);
    requestAnimationFrame(() => document.getElementById(`place-card-${id.replace(":", "-")}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [placeIndex]);

  const changeFilter = (update: () => void) => { update(); setPage(1); setSelectedId(null); };
  const districtName = district === "all" ? "부산 전체" : getPublicCatalogDistrictName(district);
  const anyReady = tourState === "ready" || kakaoState === "ready";

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-2xl border border-[#d7e0da] bg-white p-1" role="tablist" aria-label="장소 및 추천 보기">
        <button id="catalog-tab" type="button" role="tab" aria-selected={activeTab === "catalog"} onClick={() => setActiveTab("catalog")} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold ${activeTab === "catalog" ? "bg-[#236148] text-white" : "text-[#52665b]"}`}><Rows3 size={16} aria-hidden="true" /> 전체 장소</button>
        <button id="recommendations-tab" type="button" role="tab" aria-selected={activeTab === "recommendations"} onClick={() => setActiveTab("recommendations")} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold ${activeTab === "recommendations" ? "bg-[#236148] text-white" : "text-[#52665b]"}`}><Route size={16} aria-hidden="true" /> 추천 코스</button>
      </div>

      {activeTab === "catalog" ? (
        <div id="catalog-panel" role="tabpanel" aria-labelledby="catalog-tab" className="space-y-5">
          <header><p className="eyebrow">Busan public place catalog</p><h1 className="mt-2 text-3xl font-black tracking-[-0.045em]">부산 반려동물 장소 지도</h1><p className="mt-3 text-sm text-[#66766e]">관광공사 공식 장소와 Kakao 검색 후보, 동물병원, 펫샵을 함께 비교하세요.</p></header>
          <div className="surface-card grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-sm font-extrabold">부산 세부 지역<select value={district} onChange={(event) => changeFilter(() => { setDistrict(event.target.value as typeof district); setTourState("loading"); setKakaoState("loading"); setTourPlaces([]); setKakaoPlaces([]); })} className="mt-2 min-h-11 w-full rounded-xl border border-[#cfd9d3] bg-white px-3"><option value="all">부산 전체</option>{BUSAN_DISTRICTS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
            <label className="text-sm font-extrabold">여행 장소 유형<select value={category} onChange={(event) => changeFilter(() => setCategory(event.target.value as typeof category))} className="mt-2 min-h-11 w-full rounded-xl border border-[#cfd9d3] bg-white px-3">{CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(390px,.98fr)]">
            <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <MapPanel locations={mapLocations} selectedLocationId={selectedId} onLocationSelect={selectPlace} viewportKey={`catalog:${district}:${category}`} layerControls={layerControls} onLayerToggle={toggleLayer} title={`${districtName} 장소 지도`} locationLabel={districtName} emptyMessage="선택한 조건에 표시할 장소가 없습니다." />
            </div>
            <section className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black">장소 {visiblePlaces.length}곳</h2><span className="text-xs font-bold text-[#6c7b73]">카드는 페이지당 12개 · 지도는 전체 결과</span></div>
              {tourState === "error" ? <div role="alert" className="mb-3 rounded-xl bg-[#fff4f1] p-3 text-sm"><b>관광공사 장소를 불러오지 못했습니다.</b> {tourError}</div> : null}
              {kakaoState === "error" ? <div role="alert" className="mb-3 rounded-xl bg-[#fff4f1] p-3 text-sm"><b>Kakao 장소를 불러오지 못했습니다.</b> {kakaoError}</div> : null}
              {(tourState === "loading" || kakaoState === "loading") ? <p role="status" className="surface-card p-5 font-bold">장소를 불러오는 중입니다…</p> : null}
              {!anyReady && tourState === "error" && kakaoState === "error" ? <button type="button" onClick={() => { setTourState("loading"); setKakaoState("loading"); setRetry((value) => value + 1); }} className="inline-flex min-h-10 items-center gap-2 font-extrabold text-[#236148]"><RefreshCw size={15} aria-hidden="true" /> 다시 시도</button> : null}
              {anyReady && pagePlaces.length === 0 ? <p className="surface-card p-8 text-center font-bold">선택한 조건의 장소가 없습니다.</p> : null}
              <div className="space-y-4">{pagePlaces.map((place) => <PublicCatalogCard key={place.id} place={place} selected={selectedId === place.id} onSelect={() => selectPlace(place.id)} />)}</div>
              {totalPages > 1 ? <nav className="mt-5 flex items-center justify-between" aria-label="장소 목록 페이지"><button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedId(null); }} className="inline-flex min-h-10 items-center gap-1 disabled:opacity-40"><ChevronLeft size={15} /> 이전</button><span className="text-xs font-bold">{currentPage} / {totalPages}</span><button type="button" disabled={currentPage === totalPages} onClick={() => { setPage(currentPage + 1); setSelectedId(null); }} className="inline-flex min-h-10 items-center gap-1 disabled:opacity-40">다음 <ChevronRight size={15} /></button></nav> : null}
            </section>
          </div>
        </div>
      ) : <div id="recommendations-panel" role="tabpanel" aria-labelledby="recommendations-tab"><RecommendationPlanner autoGenerate={generationRequested} onAutoGenerateStart={consumeGenerationRequest} /></div>}
    </div>
  );
}
