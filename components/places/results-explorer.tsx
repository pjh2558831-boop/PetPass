"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight, Filter, RefreshCw, Route, Rows3 } from "lucide-react";
import { RecommendationPlanner } from "@/components/itinerary/recommendation-planner";
import { MapPanel, type MapLayerControl } from "@/components/map/map-panel";
import { usePlannerState } from "@/components/planner/planner-state";
import { PlaceCard } from "@/components/places/place-card";
import {
  CATALOG_PAGE_SIZE,
  deduplicateCatalogPlaces,
  getCatalogPageRange,
  getPaginatedPlaces,
} from "@/components/places/catalog-collections";
import {
  BUSAN_DISTRICTS,
  BUSAN_REGION,
  getBusanDistrictName,
  getCatalogContentTypeId,
  isBusanDistrictCode,
  TOUR_CATALOG_FILTERS,
  type BusanDistrictCode,
  type TourCatalogFilter,
} from "@/lib/tour-api/catalog";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import {
  PLACE_SOURCE_LAYERS,
  createDefaultSourceLayerVisibility,
  type SourceLayerVisibility,
} from "@/lib/places/source-layers";
import { deriveRegionLabel } from "@/lib/regions/label";
import type { ApiResult } from "@/types/api";
import type {
  KakaoCurrentMapSearch,
} from "@/types/kakao";
import type { MapPlace } from "@/types/map-place";
import type { PlaceSourceLayerId } from "@/types/place-source";
import type { PetProfile, TravelPreferences } from "@/types/pet";
import type { TourPlaceList, TourPlaceSummary } from "@/types/place";

const COMPLETE_CATALOG_PAGE_SIZE = 1_000;

const DEFAULT_PROFILE: PetProfile = {
  id: "route-profile",
  name: "내 반려동물",
  species: "DOG",
  size: "SMALL",
  hasCarrier: true,
  hasLeash: true,
  hasMuzzle: false,
  acceptsOutdoorOnly: true,
};

const DEFAULT_PREFERENCES: TravelPreferences = {
  regionCode: BUSAN_REGION.code,
  regionName: BUSAN_REGION.name,
  tripDate: "2026-08-15",
  tripType: "DAY_TRIP",
  tripPace: "balanced",
  startTime: "10:00",
  preferredCategories: ["ATTRACTION", "RESTAURANT", "WALK"],
};

type ExplorerTab = "catalog" | "recommendations";
type ListState = "loading" | "ready" | "empty" | "unavailable";
const EXPLORER_TABS = ["catalog", "recommendations"] as const;

export function ResultsExplorer({
  initialTab = "catalog",
}: {
  initialTab?: ExplorerTab;
}) {
  const {
    profile: plannerProfile,
    preferences: plannerPreferences,
    profileConfirmed,
    preferencesConfirmed,
    generationRequested,
    consumeGenerationRequest,
  } = usePlannerState();
  const profile = profileConfirmed ? plannerProfile : DEFAULT_PROFILE;
  const preferences = preferencesConfirmed
    ? plannerPreferences
    : DEFAULT_PREFERENCES;
  const [activeTab, setActiveTab] = useState<ExplorerTab>(initialTab);
  const explorerTabRefs = useRef<Record<ExplorerTab, HTMLButtonElement | null>>({
    catalog: null,
    recommendations: null,
  });
  const [catalogPlaces, setCatalogPlaces] = useState<TourPlaceSummary[]>([]);
  const [providerTotalCount, setProviderTotalCount] = useState(0);
  const [listState, setListState] = useState<ListState>("loading");
  const [listError, setListError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [districtCode, setDistrictCode] = useState<BusanDistrictCode | "all">(
    preferences.regionCode === BUSAN_REGION.code &&
      isBusanDistrictCode(preferences.districtCode)
      ? preferences.districtCode
      : "all",
  );
  const [category, setCategory] = useState<TourCatalogFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [storedMapPlaces, setStoredMapPlaces] = useState<MapPlace[]>([]);
  const [storedMapState, setStoredMapState] =
    useState<"idle" | "loading" | "ready" | "error">("idle");
  const storedMapRequestRef = useRef<AbortController | null>(null);
  const storedMapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sourceLayerVisibility, setSourceLayerVisibility] =
    useState<SourceLayerVisibility>(createDefaultSourceLayerVisibility);
  const [shoppingMapVisible, setShoppingMapVisible] = useState(false);

  const chooseExplorerTab = useCallback(
    (tab: ExplorerTab, moveFocus = false) => {
      setActiveTab(tab);
      setSelectedLocationId(null);
      if (moveFocus) {
        window.requestAnimationFrame(() => explorerTabRefs.current[tab]?.focus());
      }
    },
    [],
  );

  const handleExplorerTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % EXPLORER_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + EXPLORER_TABS.length) % EXPLORER_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = EXPLORER_TABS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    chooseExplorerTab(EXPLORER_TABS[nextIndex], true);
  };

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const controller = new AbortController();
    const load = async () => {
      setListState("loading");
      try {
        const params = new URLSearchParams({
          regionCode: BUSAN_REGION.code,
          page: "1",
          pageSize: String(COMPLETE_CATALOG_PAGE_SIZE),
        });
        if (districtCode !== "all") params.set("districtCode", districtCode);
        const contentTypeId = getCatalogContentTypeId(category);
        if (contentTypeId) params.set("contentTypeId", contentTypeId);
        const response = await fetch(`/api/tour/places?${params}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const body = (await response.json()) as ApiResult<TourPlaceList>;
        if (!response.ok || !body.ok) {
          const timeout = !body.ok && body.error.code === "UPSTREAM_TIMEOUT";
          throw new Error(
            timeout
              ? "관광공사 응답 시간이 초과되었습니다."
              : !body.ok
                ? body.error.message
                : "관광지 목록을 불러오지 못했습니다.",
          );
        }
        setCatalogPlaces(body.data.places);
        setProviderTotalCount(body.data.totalCount);
        setListState(body.data.totalCount > 0 ? "ready" : "empty");
        setListError("");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setCatalogPlaces([]);
        setProviderTotalCount(0);
        setListState("unavailable");
        setListError(
          loadError instanceof Error
            ? loadError.message
            : "관광지 목록을 불러오지 못했습니다.",
        );
      }
    };
    void load();
    return () => controller.abort();
  }, [activeTab, category, districtCode, retryCount]);

  const changeDistrict = useCallback(
    (nextDistrict: BusanDistrictCode | "all") => {
      setDistrictCode(nextDistrict);
      setPage(1);
      setSelectedLocationId(null);
    },
    [],
  );

  const sizeLabel = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" }[
    profile.size
  ];

  const filteredPlaces = useMemo(
    () => deduplicateCatalogPlaces(catalogPlaces),
    [catalogPlaces],
  );
  const totalCount = filteredPlaces.length;
  const resultSetTruncated = catalogPlaces.length < providerTotalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / CATALOG_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedPlaces = useMemo(
    () => getPaginatedPlaces(filteredPlaces, currentPage),
    [currentPage, filteredPlaces],
  );
  const pageRange = getCatalogPageRange(totalCount, currentPage);
  const catalogPlaceIndex = useMemo(
    () =>
      new Map(
        filteredPlaces.map((place, index) => [place.contentId, index] as const),
      ),
    [filteredPlaces],
  );
  const selectMapLocation = useCallback(
    (contentId: string | null) => {
      setSelectedLocationId(contentId || null);
      if (
        activeTab !== "catalog" ||
        !contentId ||
        contentId.startsWith("map-place:")
      ) {
        return;
      }
      const selectedIndex = catalogPlaceIndex.get(contentId);
      if (selectedIndex === undefined) return;
      setPage(Math.floor(selectedIndex / CATALOG_PAGE_SIZE) + 1);
    },
    [activeTab, catalogPlaceIndex],
  );

  const catalogLocations = useMemo(
    () =>
      storedMapPlaces
        .filter((place) =>
          place.provider === "tour"
            ? sourceLayerVisibility.tourism_official
            : sourceLayerVisibility.kakao_discovery,
        )
        .filter(
          (place) =>
            place.category_group !== "shopping" || shoppingMapVisible,
        )
        .map(
          (place): KakaoMapLocation => ({
            id: `map-place:${place.provider}:${place.provider_place_id}`,
            name: place.name,
            address: place.road_address ?? place.lot_address ?? "",
            coordinates: {
              latitude: place.latitude,
              longitude: place.longitude,
            },
            markerKind:
              place.provider === "tour"
                ? place.category_group === "shopping"
                  ? "shopping"
                  : "tourism-official"
                : "kakao-candidate",
            markerLabel: place.provider === "tour" ? "공" : "K",
            sourceLabel:
              place.provider === "tour"
                ? "한국관광공사 제공 장소"
                : "카카오 검색 장소 · 반려동물 동반 여부 확인 필요",
            interactive: true,
            clusterable: true,
          }),
        ),
    [shoppingMapVisible, sourceLayerVisibility, storedMapPlaces],
  );

  const loadStoredMapPlaces = useCallback(
    (viewport: KakaoCurrentMapSearch) => {
      if (storedMapTimerRef.current) clearTimeout(storedMapTimerRef.current);
      storedMapRequestRef.current?.abort();
      storedMapTimerRef.current = setTimeout(() => {
        const controller = new AbortController();
        storedMapRequestRef.current = controller;
        const rectangle = {
          west: Math.max(viewport.rectangle.west, 128.75),
          south: Math.max(viewport.rectangle.south, 34.95),
          east: Math.min(viewport.rectangle.east, 129.4),
          north: Math.min(viewport.rectangle.north, 35.5),
        };
        if (rectangle.west >= rectangle.east || rectangle.south >= rectangle.north) {
          setStoredMapPlaces([]);
          setStoredMapState("ready");
          return;
        }
        const params = new URLSearchParams({
          west: String(rectangle.west),
          south: String(rectangle.south),
          east: String(rectangle.east),
          north: String(rectangle.north),
          providers: "tour,kakao",
          limit: "1000",
        });
        if (category !== "all") params.set("categories", category);
        setStoredMapState("loading");
        void fetch(`/api/map/places?${params}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })
          .then(async (response) => {
            const body = (await response.json()) as ApiResult<{
              places: MapPlace[];
              count: number;
            }>;
            if (!response.ok || !body.ok) throw new Error();
            setStoredMapPlaces(body.data.places);
            setStoredMapState("ready");
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setStoredMapPlaces([]);
            setStoredMapState("error");
          });
      }, 300);
    },
    [category],
  );

  useEffect(
    () => () => {
      if (storedMapTimerRef.current) clearTimeout(storedMapTimerRef.current);
      storedMapRequestRef.current?.abort();
    },
    [],
  );

  const districtName =
    districtCode === "all"
      ? "부산 전체"
      : getBusanDistrictName(districtCode) ?? "부산 전체";
  const mapRegionLabel =
    districtCode === "all"
      ? "부산 전체"
      : deriveRegionLabel({
          regionCode: BUSAN_REGION.code,
          districtCode,
        });
  const mapViewportKey = `catalog:${districtCode}:${category}`;

  const layerControls = useMemo<MapLayerControl[]>(() => {
    const counts: Record<PlaceSourceLayerId, number> = {
      tourism_official: storedMapPlaces.filter(({ provider }) => provider === "tour").length,
      business_confirmed: 0,
      administrator_confirmed: 0,
      user_reported: 0,
      kakao_discovery: storedMapPlaces.filter(({ provider }) => provider === "kakao").length,
    };
    const controls: MapLayerControl[] = PLACE_SOURCE_LAYERS.map((layer) => ({
      id: layer.id,
      label: layer.label,
      markerKind: layer.markerKind,
      count: counts[layer.id],
      visible: counts[layer.id] > 0 && sourceLayerVisibility[layer.id],
      disabled: counts[layer.id] === 0,
      description: layer.description,
    }));
    if (category === "shopping") {
      controls.push({
        id: "shopping",
        label: "쇼핑(선택형)",
        markerKind: "shopping",
        count: storedMapPlaces.filter(({ category_group }) => category_group === "shopping").length,
        visible: shoppingMapVisible,
        disabled: !storedMapPlaces.some(({ category_group }) => category_group === "shopping"),
        description: "명시적으로 쇼핑을 선택했을 때만 켜지는 지도 레이어",
      });
    }
    return controls;
  }, [category, shoppingMapVisible, sourceLayerVisibility, storedMapPlaces]);

  const toggleMapLayer = useCallback((id: string, visible: boolean) => {
    if (id === "shopping") {
      setShoppingMapVisible(visible);
      return;
    }
    if (!PLACE_SOURCE_LAYERS.some((layer) => layer.id === id)) return;
    setSourceLayerVisibility((current) => ({
      ...current,
      [id as PlaceSourceLayerId]: visible,
    }));
  }, []);

  useEffect(() => {
    if (
      activeTab !== "catalog" ||
      !selectedLocationId ||
      selectedLocationId.startsWith("map-place:")
    ) {
      return;
    }
    document
      .getElementById(`place-card-${selectedLocationId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeTab, currentPage, selectedLocationId]);

  return (
    <div className="space-y-6">
      {activeTab === "catalog" ? (
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Busan pet-friendly places</p>
            <h1 className="balance mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
              부산의 실제 장소를
              <br />
              근거와 함께 살펴보세요.
            </h1>
          </div>
          <p className="max-w-md text-sm leading-7 text-[#66766e]">
            한국관광공사 장소와 반려동물 동반 원문을 확인하고, 카카오 지도에서
            위치를 함께 살펴볼 수 있습니다.
          </p>
        </header>
      ) : null}

      {activeTab === "catalog" ? (
        <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#edf8f2] px-3 py-1.5 text-xs font-extrabold text-[#236148]">
              한국관광공사 실시간 장소 · 카카오 실제 경로
            </span>
            <span className="rounded-full border border-[#cadbd2] bg-white px-3 py-1.5 text-xs font-extrabold text-[#315b48]">
              선택 범위 {districtName}
            </span>
          </div>
          <p className="mt-3 text-sm font-extrabold text-[#2a4036]">
            {profile.name} · {sizeLabel} 반려동물 · {profile.hasCarrier ? "이동장 있음" : "이동장 없음"}
          </p>
          <p className="mt-1 text-xs text-[#718078]">
            {districtName} · {preferences.tripDate} · {preferences.startTime} 출발
          </p>
        </div>
        <p className="max-w-sm text-xs font-bold leading-5 text-[#64746c]">
          장소 목록과 추천 코스는 같은 부산 범위를 사용합니다. 추천은 지원되는 동반 근거가 있는 실제 장소만 결정론적으로 조합합니다.
        </p>
        </div>
      ) : null}

      <div
        className="inline-flex w-full rounded-2xl border border-[#d7e0da] bg-white p-1 sm:w-auto"
        role="tablist"
        aria-label="장소 및 추천 보기"
      >
        <button
          ref={(node) => {
            explorerTabRefs.current.catalog = node;
          }}
          id="catalog-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "catalog"}
          aria-controls="catalog-panel"
          tabIndex={activeTab === "catalog" ? 0 : -1}
          onClick={() => chooseExplorerTab("catalog")}
          onKeyDown={(event) => handleExplorerTabKeyDown(event, 0)}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold sm:flex-none ${
            activeTab === "catalog"
              ? "bg-[#236148] text-white"
              : "text-[#52665b] hover:bg-[#edf6f0]"
          }`}
        >
          <Rows3 size={16} aria-hidden="true" /> 전체 장소
        </button>
        <button
          ref={(node) => {
            explorerTabRefs.current.recommendations = node;
          }}
          id="recommendations-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === "recommendations"}
          aria-controls="recommendations-panel"
          tabIndex={activeTab === "recommendations" ? 0 : -1}
          onClick={() => chooseExplorerTab("recommendations")}
          onKeyDown={(event) => handleExplorerTabKeyDown(event, 1)}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold sm:flex-none ${
            activeTab === "recommendations"
              ? "bg-[#236148] text-white"
              : "text-[#52665b] hover:bg-[#edf6f0]"
          }`}
        >
          <Route size={16} aria-hidden="true" /> 추천 코스
        </button>
      </div>

      <div
        className={
          activeTab === "catalog"
            ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(390px,.98fr)]"
            : "min-w-0"
        }
      >
        {activeTab === "catalog" ? (
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <MapPanel
            locations={catalogLocations}
            routeCoordinates={[]}
            viewportKey={mapViewportKey}
            layerControls={layerControls}
            onLayerToggle={toggleMapLayer}
            selectedLocationId={selectedLocationId}
            onLocationSelect={selectMapLocation}
            onViewportIdle={loadStoredMapPlaces}
            title={`${districtName} 관광 장소 지도`}
            locationLabel={mapRegionLabel}
            emptyMessage="현재 지도 범위에 저장된 장소가 없습니다."
          />
          <p className="mt-3 px-1 text-xs font-semibold leading-5 text-[#6c7b73]">
            {storedMapState === "loading"
              ? "현재 지도 범위의 저장된 장소를 불러오는 중입니다."
              : storedMapState === "error"
                ? "저장된 장소를 불러오지 못했습니다. 지도 이동 후 다시 시도해 주세요."
                : `현재 지도 범위의 DB 저장 장소 ${catalogLocations.length}곳을 표시합니다.`}
          </p>
          </div>
        ) : null}

        <section
          id="catalog-panel"
          role="tabpanel"
          aria-labelledby="catalog-tab"
          hidden={activeTab !== "catalog"}
          className="min-w-0"
        >
          <div className="surface-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Supabase map storage</p>
                <h2 className="mt-1 text-lg font-black">저장된 부산 장소</h2>
              </div>
              <span className="rounded-full bg-[#fff6cc] px-3 py-1.5 text-xs font-extrabold text-[#6b5200]">
                카카오 후보는 방문 전 동반 여부 확인
              </span>
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-[#66756d]">
              지도를 움직이면 현재 화면 범위만 DB에서 다시 조회합니다. 지도 이동으로
              카카오 Local API를 직접 호출하지 않습니다.
            </p>
          </div>

          <div className="mb-4 mt-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{districtName} 실시간 관광 데이터</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">
                장소 {providerTotalCount}곳
              </h2>
              <div
                className="mt-3 flex max-w-full flex-wrap gap-2 text-[11px] font-extrabold text-[#52665b]"
                aria-live="polite"
                aria-label="관광 장소 표시 개수"
              >
                <span className="rounded-full border border-[#cfd9d3] bg-white px-3 py-1.5">
                  제공자 전체 {providerTotalCount}곳
                </span>
                {resultSetTruncated ? (
                  <span className="rounded-full bg-[#fff8f1] px-3 py-1.5 text-[#76542f]">
                    불러온 결과 {totalCount}곳 · 일부만 표시
                  </span>
                ) : null}
                <span className="rounded-full border border-[#cfd9d3] bg-white px-3 py-1.5">
                  현재 목록 {pageRange.start}–{pageRange.end}곳
                </span>
                <span className="rounded-full bg-[#edf8f2] px-3 py-1.5 text-[#236148]">
                  DB 지도 {catalogLocations.length}곳 표시
                </span>
              </div>
            </div>
            <span className="flex max-w-full items-start gap-1 text-xs font-bold leading-5 text-[#6c7b73]">
              <Filter className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
              동반 가능 여부는 관광공사 원문과 추가 근거를 확인 후 판정합니다.
            </span>
          </div>

          <div className="mb-4">
            <label htmlFor="catalog-district" className="mb-2 block text-sm font-extrabold">
              부산 세부 지역
            </label>
            <select
              id="catalog-district"
              value={districtCode}
              onChange={(event) => {
                const nextDistrict = event.target.value;
                changeDistrict(isBusanDistrictCode(nextDistrict) ? nextDistrict : "all");
              }}
              className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white px-4 font-semibold"
            >
              <option value="all">부산 전체</option>
              {BUSAN_DISTRICTS.map((district) => (
                <option key={district.code} value={district.code}>
                  {district.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="장소 유형 필터">
            {TOUR_CATALOG_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={category === option.value}
                onClick={() => {
                  setCategory(option.value);
                  setShoppingMapVisible(option.value === "shopping");
                  setPage(1);
                  setSelectedLocationId(null);
                  setStoredMapPlaces([]);
                }}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-extrabold ${
                  category === option.value
                    ? "border-[#236148] bg-[#236148] text-white"
                    : "border-[#d2dbd6] bg-white text-[#596c62]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {category === "shopping" ? (
            <div className="mb-4 rounded-2xl border border-[#ddd2e8] bg-[#f7f2fb] p-4 text-sm text-[#5e4d74]" role="status">
              <p className="font-extrabold">쇼핑은 선택형 카테고리입니다.</p>
              <p className="mt-1 text-xs font-semibold leading-5">
                기본 전체 목록·기본 지도·자동 추천에는 포함되지 않습니다. 현재 선택으로만 {providerTotalCount}곳을 12개 카드씩 불러오며, 지도는 클러스터를 사용합니다.
              </p>
              {resultSetTruncated ? (
                <p className="mt-2 text-xs font-extrabold text-[#76542f]">
                  제공자 총계 중 {totalCount}곳만 반환되어 결과가 잘렸습니다.
                </p>
              ) : null}
            </div>
          ) : null}

          {listState === "loading" ? (
            <div className="surface-card p-8 text-center" role="status">
              <p className="font-extrabold">한국관광공사 장소를 불러오는 중입니다.</p>
            </div>
          ) : null}
          {listState === "unavailable" ? (
            <div className="surface-card p-8 text-center" role="alert">
              <p className="font-extrabold">현재 장소 제공자 정보를 사용할 수 없습니다.</p>
              <p className="mt-2 text-sm text-[#6b7972]">{listError}</p>
              <p className="mt-2 text-xs text-[#7b6860]">제공자 오류를 반려동물 출입 거절로 해석하지 않았습니다.</p>
              <button
                type="button"
                onClick={() => setRetryCount((value) => value + 1)}
                className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-extrabold text-[#236148]"
              >
                <RefreshCw size={15} aria-hidden="true" /> 다시 시도
              </button>
            </div>
          ) : null}
          {listState === "empty" ? (
            <div className="surface-card p-8 text-center">
              <p className="font-extrabold">
                {districtName}에서 이 유형으로 제공된 장소가 없습니다.
              </p>
              <p className="mt-2 text-xs text-[#6b7972]">다른 지역이나 카테고리를 선택해 보세요.</p>
            </div>
          ) : null}
          {listState === "ready" ? (
            <div className="space-y-4">
              {paginatedPlaces.map((place, index) => (
                <PlaceCard
                  key={place.contentId}
                  place={place}
                  order={(currentPage - 1) * CATALOG_PAGE_SIZE + index + 1}
                  priority={currentPage === 1 && index === 0}
                  selected={selectedLocationId === place.contentId}
                  onSelect={() => selectMapLocation(place.contentId)}
                />
              ))}
            </div>
          ) : null}

          {listState === "ready" && totalPages > 1 ? (
            <nav className="mt-5 flex items-center justify-between gap-3" aria-label="관광지 목록 페이지">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1));
                  setSelectedLocationId(null);
                }}
                className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[#d2dbd6] bg-white px-4 text-sm font-bold text-[#236148] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={15} aria-hidden="true" /> 이전
              </button>
              <span className="text-xs font-bold text-[#6c7b73]">
                {currentPage} / {totalPages}페이지 · 현재 {paginatedPlaces.length}곳
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setPage((current) => Math.min(totalPages, current + 1));
                  setSelectedLocationId(null);
                }}
                className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[#d2dbd6] bg-white px-4 text-sm font-bold text-[#236148] disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음 <ChevronRight size={15} aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </section>

        <div
          id="recommendations-panel"
          role="tabpanel"
          aria-labelledby="recommendations-tab"
          hidden={activeTab !== "recommendations"}
          className="min-w-0"
        >
          <RecommendationPlanner
            autoGenerate={generationRequested}
            onAutoGenerateStart={consumeGenerationRequest}
          />
        </div>
      </div>
    </div>
  );
}
