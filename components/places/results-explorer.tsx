"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  RotateCcw,
  Route,
  Rows3,
  SlidersHorizontal,
} from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceCategoryToggleGroup } from "@/components/places/place-category-toggle-group";
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
  mapCatalogPlaceToCategory,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { KakaoMapLocation, KakaoViewportIdleCause } from "@/lib/kakao/maps";
import {
  BUSAN_REGION_CONFIG,
  getMapEnabledRegionConfigs,
  getRegionConfig,
} from "@/lib/regions/config";
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
import type { RegionId } from "@/types/region";

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
  kakao: { label: "카카오맵", markerKind: "kakao-candidate", color: "yellow" },
  veterinary: { label: "동물병원", markerKind: "veterinary", color: "red" },
  pet_shop: { label: "펫샵·용품점", markerKind: "pet-shop", color: "purple" },
};

const MAP_ENABLED_REGIONS = getMapEnabledRegionConfigs();

async function fetchAllBusanTourPlaces(
  district: string,
  signal: AbortSignal,
  categories: readonly PlaceCategory[],
): Promise<PublicCatalogMarker[]> {
  const places: PublicCatalogMarker[] = [];
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;
  while (places.length < totalCount) {
    const params = new URLSearchParams({
      regionCode: BUSAN_REGION_CONFIG.providerCodes.korPetTourService2.legalDongRegionCode,
      page: String(page),
      pageSize: "1000",
      view: "markers",
      categories: categories.join(","),
    });
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

async function fetchMapMarkerPages(
  regionId: RegionId,
  district: string,
  signal: AbortSignal,
  providers: "tour" | "kakao",
  kinds: string,
  categories?: readonly string[],
): Promise<PublicCatalogMarker[]> {
  const places: PublicCatalogMarker[] = [];
  let page = 1;
  let hasNext = true;
  let afterId: number | null = null;
  while (hasNext) {
    const params = new URLSearchParams({
      region: regionId,
      providers,
      page: String(page),
      pageSize: "200",
      view: "markers",
      kinds,
    });
    if (categories) params.set("categories", categories.join(","));
    if (afterId !== null) params.set("afterId", String(afterId));
    if (district !== "all") params.set("district", district);
    const response = await fetch(`/api/map/places?${params}`, { signal, headers: { Accept: "application/json" } });
    const body = await response.json() as ApiResult<PublicMapPlacePage | PublicCatalogMarkerPage>;
    if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error.message : "Kakao 장소를 불러오지 못했습니다.");
    places.push(...body.data.items.map((place) => "layer" in place
      ? place
      : normalizeKakaoCatalogMarker(place, regionId)));
    hasNext = body.data.hasNext;
    afterId = body.data.nextCursor ?? null;
    if (hasNext && afterId === null) {
      throw new Error("지도 장소 페이지 커서를 확인하지 못했습니다.");
    }
    page += 1;
  }
  return places;
}

async function fetchAllKakaoPlaces(
  regionId: RegionId,
  district: string,
  signal: AbortSignal,
  scope: "default" | "optional",
): Promise<PublicCatalogMarker[]> {
  const groups = scope === "default"
    ? [fetchMapMarkerPages(regionId, district, signal, "kakao", "pet_travel_candidate", DEFAULT_KAKAO_CATEGORIES)]
    : [
        fetchMapMarkerPages(regionId, district, signal, "kakao", "pet_travel_candidate", ["shopping"]),
        fetchMapMarkerPages(regionId, district, signal, "kakao", "veterinary,pet_shop"),
      ];
  return (await Promise.all(groups)).flat();
}

function fetchAllJejuOfficialPlaces(
  district: string,
  signal: AbortSignal,
): Promise<PublicCatalogMarker[]> {
  return fetchMapMarkerPages(
    "jeju",
    district,
    signal,
    "tour",
    "tourism_place",
  );
}

function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, currentPage - 2), totalPages - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export function ResultsExplorer({ initialTab = "catalog", initialCatalogState, staticMapEnabled = false }: {
  initialTab?: ExplorerTab;
  initialCatalogState: PublicCatalogUrlState;
  staticMapEnabled?: boolean;
}) {
  const router = useRouter();
  const { generationRequested, consumeGenerationRequest } = usePlannerState();
  const [region, setRegion] = useState<RegionId>(initialCatalogState.region);
  const regionConfig = getRegionConfig(region);
  const [activeTab, setActiveTab] = useState<ExplorerTab>(() =>
    initialTab === "recommendations" && !regionConfig.itineraryEnabled
      ? "catalog"
      : initialTab);
  const [district, setDistrict] = useState(initialCatalogState.district);
  const [categories, setCategories] = useState<PlaceCategory[]>(initialCatalogState.categories);
  const [draftCategories, setDraftCategories] = useState<PlaceCategory[]>(initialCatalogState.categories);
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(initialCatalogState.page);
  const [sort, setSort] = useState<ExplorerSort>(initialCatalogState.sort);
  const [mobileMode, setMobileMode] = useState<MobileExplorerMode>("map");
  const [tourPlaces, setTourPlaces] = useState<PublicCatalogMarker[]>([]);
  const [kakaoPlaces, setKakaoPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalTourPlaces, setOptionalTourPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalKakaoPlaces, setOptionalKakaoPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalLoadedFor, setOptionalLoadedFor] = useState<string | null>(null);
  const [tourState, setTourState] = useState<ProviderState>("loading");
  const [kakaoState, setKakaoState] = useState<ProviderState>(() =>
    regionConfig.kakaoDiscoveryEnabled ? "loading" : "ready");
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
  const filterDropdownRef = useRef<HTMLElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [rankingAsOf] = useState(() => new Date().toISOString());

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
    if (activeTab !== "catalog") return;
    const controller = new AbortController();
    const tourRequest = region === "jeju"
      ? fetchAllJejuOfficialPlaces(district, controller.signal)
      : fetchAllBusanTourPlaces(district, controller.signal, DEFAULT_PLACE_CATEGORIES);
    void tourRequest
      .then((places) => { setTourPlaces(places); setTourState("ready"); setTourError(""); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setTourState("error"); setTourError(error instanceof Error ? error.message : "관광공사 오류"); } });
    const kakaoRequest = regionConfig.kakaoDiscoveryEnabled
      ? fetchAllKakaoPlaces(region, district, controller.signal, "default")
      : Promise.resolve<PublicCatalogMarker[]>([]);
    void kakaoRequest
      .then((places) => { setKakaoPlaces(places); setKakaoState("ready"); setKakaoError(""); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setKakaoState("error"); setKakaoError(error instanceof Error ? error.message : "Kakao 오류"); } });
    return () => controller.abort();
  }, [activeTab, district, region, regionConfig.kakaoDiscoveryEnabled, retry]);

  const needsOptionalPlaces = regionConfig.kakaoDiscoveryEnabled &&
    categories.some((category) => OPTIONAL_PLACE_CATEGORIES.includes(category));
  useEffect(() => {
    const scopeKey = `${region}:${district}:${retry}`;
    if (activeTab !== "catalog" || !needsOptionalPlaces || optionalLoadedFor === scopeKey) return;
    const controller = new AbortController();
    void Promise.all([
      fetchAllBusanTourPlaces(district, controller.signal, ["shopping"]),
      fetchAllKakaoPlaces(region, district, controller.signal, "optional"),
    ]).then(([tour, kakao]) => {
      setOptionalTourPlaces(tour);
      setOptionalKakaoPlaces(kakao);
      setOptionalLoadedFor(scopeKey);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setKakaoError(error instanceof Error ? error.message : "추가 장소 오류");
    });
    return () => controller.abort();
  }, [activeTab, district, needsOptionalPlaces, optionalLoadedFor, region, retry]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    params.set("region", region);
    if (activeTab === "catalog") {
      if (district !== "all") params.set("district", district);
      const categoryState = serializePublicCatalogCategories(categories);
      if (categoryState) params.set("categories", categoryState);
      if (sort !== "recommendation") params.set("sort", sort);
      params.set("page", String(page));
    }
    router.replace(`/results?${params}`, { scroll: false });
  }, [activeTab, categories, district, page, region, router, sort]);

  const allPlaces = useMemo(() => {
    const unique = new Map<string, PublicCatalogMarker>();
    const optionalPlaces = optionalLoadedFor === `${region}:${district}:${retry}`
      ? [...optionalTourPlaces, ...optionalKakaoPlaces]
      : [];
    for (const place of [...tourPlaces, ...kakaoPlaces, ...optionalPlaces]) {
      if (place.regionId === region && !unique.has(place.id)) unique.set(place.id, place);
    }
    return [...unique.values()];
  }, [district, kakaoPlaces, optionalKakaoPlaces, optionalLoadedFor, optionalTourPlaces, region, retry, tourPlaces]);

  const rankingCenter = useMemo(() => activeBounds ? ({
    latitude: (activeBounds.south + activeBounds.north) / 2,
    longitude: (activeBounds.west + activeBounds.east) / 2,
  }) : null, [activeBounds]);
  const scopedCollections = useMemo(() => getExplorerCollections({
    places: allPlaces,
    regionId: region,
    district,
    categories: [...PLACE_CATEGORIES],
    layers: [...PUBLIC_CATALOG_LAYERS],
    activeBounds,
    page: 1,
    sort,
    rankingAsOf,
    rankingCenter,
  }), [activeBounds, allPlaces, district, rankingAsOf, rankingCenter, region, sort]);
  const categoryCounts = useMemo(() => Object.fromEntries(
    PLACE_CATEGORIES.map((category) => [
      category,
      scopedCollections.filteredPlaces.filter((place) => mapCatalogPlaceToCategory(place) === category).length,
    ]),
  ) as Record<PlaceCategory, number>, [scopedCollections.filteredPlaces]);
  const displayedCategoryCounts = useMemo(() => Object.fromEntries(
    PLACE_CATEGORIES.map((category) => [
      category,
      OPTIONAL_PLACE_CATEGORIES.includes(category) && optionalLoadedFor !== `${region}:${district}:${retry}`
        ? null
        : categoryCounts[category],
    ]),
  ) as Record<PlaceCategory, number | null>, [categoryCounts, district, optionalLoadedFor, region, retry]);
  const filteredCollections = useMemo(() => getExplorerCollections({
    places: allPlaces,
    regionId: region,
    district,
    categories,
    layers: region === "jeju" ? ["tourism"] : [...PUBLIC_CATALOG_LAYERS],
    activeBounds,
    page: 1,
    sort,
    rankingAsOf,
    rankingCenter,
  }), [activeBounds, allPlaces, categories, district, rankingAsOf, rankingCenter, region, sort]);
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
    if (region !== "busan") return;
    const missingIds = pagedMarkers
      .filter(({ layer, id }) => layer === "tourism" && !tourCardsById.has(id))
      .map(({ providerPlaceId }) => providerPlaceId);
    if (missingIds.length === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      regionCode: BUSAN_REGION_CONFIG.providerCodes.korPetTourService2.legalDongRegionCode,
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
  }, [district, pagedMarkers, region, tourCardsById]);
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
  const districtName = getPublicCatalogDistrictName(region, district);
  const anyReady = region === "jeju"
    ? tourState === "ready"
    : tourState === "ready" || kakaoState === "ready";
  const allPopularityInsufficient = filteredPlaces.length > 0;
  const visibleDefaultCategories = region === "jeju" && tourState === "ready"
    ? DEFAULT_PLACE_CATEGORIES.filter((category) => categoryCounts[category] > 0)
    : DEFAULT_PLACE_CATEGORIES;
  const visibleOptionalCategories = region === "jeju"
    ? []
    : OPTIONAL_PLACE_CATEGORIES;
  const visibleLayers = region === "jeju"
    ? (["tourism"] as const)
    : PUBLIC_CATALOG_LAYERS;
  const resetViewportScope = () => {
    activeBoundsRef.current = null;
    viewportBaselineRef.current = null;
    latestViewportRef.current = null;
    setActiveBounds(null);
    setViewportDirty(false);
  };
  const changeRegion = (nextRegion: RegionId) => {
    if (nextRegion === region) return;
    const nextConfig = getRegionConfig(nextRegion);
    setRegion(nextRegion);
    setActiveTab("catalog");
    setDistrict("all");
    setCategories([...DEFAULT_PLACE_CATEGORIES]);
    setDraftCategories([...DEFAULT_PLACE_CATEGORIES]);
    setPage(1);
    setSelectedId(null);
    setTourPlaces([]);
    setKakaoPlaces([]);
    setOptionalTourPlaces([]);
    setOptionalKakaoPlaces([]);
    setOptionalLoadedFor(null);
    setTourCardsById(new Map());
    setTourError("");
    setKakaoError("");
    setTourState("loading");
    setKakaoState(nextConfig.kakaoDiscoveryEnabled ? "loading" : "ready");
    resetViewportScope();
  };
  const changeFilter = (update: () => void) => {
    update(); setPage(1); setSelectedId(null); resetViewportScope();
  };
  const changeDistrict = (nextDistrict: string) => {
    changeFilter(() => {
      setDistrict(nextDistrict);
      setTourState("loading");
      setKakaoState(regionConfig.kakaoDiscoveryEnabled ? "loading" : "ready");
      setTourPlaces([]);
      setKakaoPlaces([]);
      setOptionalLoadedFor(null);
    });
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
    setDraftCategories([...categories]);
    setFilterOpen(true);
  };
  const closeFilters = () => {
    setFilterOpen(false);
  };
  const applyFilters = () => {
    setCategories([...draftCategories]);
    setPage(1);
    setSelectedId(null);
    resetViewportScope();
    closeFilters();
  };
  const resetDraftFilters = () => {
    setDraftCategories([...DEFAULT_PLACE_CATEGORIES]);
  };
  const selectPlace = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const index = placeIndex.get(id);
    if (index !== undefined) setPage(Math.floor(index / PUBLIC_CATALOG_PAGE_SIZE) + 1);
    requestAnimationFrame(() => document.getElementById(`place-card-${id.replace(":", "-")}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const handleViewportIdle = (viewport: KakaoCurrentMapSearch, cause: KakaoViewportIdleCause) => {
    latestViewportRef.current = viewport;
    if (!viewportBaselineRef.current || cause === "initial") {
      viewportBaselineRef.current = viewport.rectangle;
      if (!activeBoundsRef.current) setViewportDirty(false);
      return;
    }
    if (cause === "programmatic") return;
    const comparisonBounds = activeBoundsRef.current ?? viewportBaselineRef.current;
    setViewportDirty(!explorerBoundsAreEquivalent(comparisonBounds, viewport.rectangle));
  };
  const commitCurrentViewport = (viewport: KakaoCurrentMapSearch) => {
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
  };

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
          {regionConfig.itineraryEnabled ? (
            <button id="recommendations-tab" type="button" role="tab" aria-selected="false" onClick={() => setActiveTab("recommendations")} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-extrabold text-[#52665b]"><Route size={16} aria-hidden="true" />추천 코스</button>
          ) : (
            <button id="recommendations-tab" type="button" role="tab" aria-selected="false" aria-disabled="true" disabled className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-extrabold text-[#7a8780]"><Route size={16} aria-hidden="true" />제주 경로 추천은 준비 중입니다.</button>
          )}
        </div>
        <fieldset className="explorer-region-selector">
          <legend className="sr-only">지역 선택</legend>
          {MAP_ENABLED_REGIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={region === item.id}
              onClick={() => changeRegion(item.id)}
            >
              {item.displayName}
            </button>
          ))}
        </fieldset>
        <div className="full-map-explorer__mobile-switch" role="group" aria-label="지도 또는 목록 보기">
          <button type="button" aria-pressed={mobileMode === "map"} onClick={() => setMobileMode("map")}><MapIcon size={17} aria-hidden="true" />지도</button>
          <button type="button" aria-pressed={mobileMode === "list"} onClick={() => setMobileMode("list")}><List size={17} aria-hidden="true" />목록</button>
        </div>
        <label className="explorer-district-control">
          <span className="sr-only">{regionConfig.displayName} 세부 지역</span>
          <select value={district} onChange={(event) => changeDistrict(event.target.value)}>
            <option value="all">{regionConfig.displayName} 전체</option>
            {regionConfig.districts.map((item) => <option key={item.legalDongDistrictCode} value={item.legalDongDistrictCode}>{item.name}</option>)}
          </select>
        </label>
        <p className="full-map-explorer__scope"><span>{region === "jeju" ? "한국관광공사 공식 장소만 표시합니다." : "공식 관광 장소와 공개된 지역 후보를 함께 비교합니다."}</span></p>
      </div>

      <div className="full-map-explorer__main" data-mobile-mode={mobileMode}>
        <section className="full-map-explorer__map" aria-label={`${districtName} 전체 장소 지도`}>
          <div className="explorer-source-legend" aria-label="장소 출처 범례">
            {visibleLayers.map((layer) => (
              <span key={layer}><i data-color={LAYER_META[layer].color} aria-hidden="true" />{LAYER_META[layer].label}</span>
            ))}
          </div>
          <MapPanel
            regionId={region}
            locations={mapLocations}
            selectedLocationId={selectedId}
            onLocationSelect={selectPlace}
            onViewportIdle={handleViewportIdle}
            onCurrentMapSearch={commitCurrentViewport}
            showCurrentMapSearch={viewportDirty}
            currentMapSearchLabel="이 지역 검색 다시하기"
            viewportKey={`catalog:${region}:${district}:${categories.join(",")}`}
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
            <button
              ref={filterButtonRef}
              type="button"
              className="explorer-filter-trigger"
              aria-expanded={filterOpen}
              aria-controls="explorer-filter-dropdown"
              onClick={toggleFilters}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />필터
            </button>
            {filterOpen ? (
              <section
                ref={filterDropdownRef}
                id="explorer-filter-dropdown"
                className="explorer-filter-dropdown"
                role="region"
                aria-label="장소 필터"
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
                      categories={[...visibleDefaultCategories, ...visibleOptionalCategories]}
                      active={draftCategories}
                      counts={displayedCategoryCounts}
                      onToggle={toggleDraftCategory}
                    />
                  </div>
                  <div className="explorer-filter-dropdown__actions">
                    <button type="button" className="explorer-filter-dropdown__reset" onClick={resetDraftFilters}><RotateCcw size={19} aria-hidden="true" />초기화</button>
                    <button type="submit" className="explorer-filter-dropdown__apply">적용하기 <SlidersHorizontal size={18} aria-hidden="true" /></button>
                  </div>
                </form>
              </section>
            ) : null}
          </header>

          <div className="explorer-sort-row">
            <label htmlFor="explorer-sort">정렬</label>
            <select id="explorer-sort" value={sort} onChange={(event) => { setSort(event.target.value as ExplorerSort); setPage(1); }}><option value="recommendation">추천순</option><option value="popularity">인기도순</option></select>
            {activeBounds ? <span>지도 범위 적용 중</span> : null}
          </div>
          {sort === "popularity" && allPopularityInsufficient ? <p className="explorer-popularity-notice" role="status">이용 데이터가 쌓이는 동안 추천순을 함께 반영합니다.</p> : null}
          <div className="explorer-results-status">
            {tourState === "error" ? <div role="alert"><b>관광공사 장소를 불러오지 못했습니다.</b> {tourError}</div> : null}
            {regionConfig.kakaoDiscoveryEnabled && kakaoState === "error" ? <div role="alert"><b>Kakao 장소를 불러오지 못했습니다.</b> {kakaoError}</div> : null}
            {tourState === "loading" || (regionConfig.kakaoDiscoveryEnabled && kakaoState === "loading") ? <p role="status">장소를 불러오는 중입니다…</p> : null}
            {!anyReady && tourState === "error" && (!regionConfig.kakaoDiscoveryEnabled || kakaoState === "error") ? <button type="button" onClick={() => { setTourState("loading"); setKakaoState(regionConfig.kakaoDiscoveryEnabled ? "loading" : "ready"); setRetry((value) => value + 1); }}><RefreshCw size={15} aria-hidden="true" />다시 시도</button> : null}
          </div>
          <div className="explorer-results-list">
            {anyReady && pagedPlaces.length === 0 ? <p className="explorer-empty-state">선택한 조건의 장소가 없습니다.</p> : null}
            {pagedPlaces.map((place) => (
              <PublicCatalogCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                onSelect={() => {
                  selectPlace(place.id);
                  setMobileMode("map");
                }}
                staticMapEnabled={staticMapEnabled}
              />
            ))}
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
