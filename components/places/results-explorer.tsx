"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  List,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  RotateCcw,
  Route,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PlannerProgress } from "@/components/layout/planner-progress";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceCategoryToggleGroup } from "@/components/places/place-category-toggle-group";
import { PublicCatalogCard } from "@/components/places/public-catalog-card";
import { RegionSelector } from "@/components/places/region-selector";
import { SelectedItineraryTray } from "@/components/places/selected-itinerary-tray";
import { useSelectedItinerarySelection } from "@/components/places/use-selected-itinerary-selection";
import { usePlannerState } from "@/components/planner/planner-state";
import { AppDialog } from "@/components/ui/app-dialog";
import {
  PUBLIC_CATALOG_LAYERS,
  PUBLIC_CATALOG_PAGE_SIZE,
  getPublicCatalogDistrictName,
  parsePublicCatalogUrlState,
  resolvePublicCatalogDistrictQuery,
  serializeResultsUrl,
  type PublicCatalogUrlState,
} from "@/lib/map-places/catalog-url";
import {
  loadSnapshotWithFallback,
  mapPlacesSnapshotBrowserClient,
} from "@/lib/map-places/snapshot-client";
import {
  buildMeasuredMapPlaceIndex,
  recordMapExplorerMetric,
} from "@/lib/map-places/browser-performance";
import {
  explorerBoundsAreEquivalent,
  getExplorerCategoryCounts,
  getExplorerCollections,
  isInsideExplorerBounds,
  type ExplorerSort,
} from "@/lib/map-places/explorer-collections";
import { filterCatalogPlacesByQuery } from "@/lib/map-places/catalog-search";
import {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  isOptionalPlaceCategory,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { KakaoMapLocation, KakaoViewportIdleCause } from "@/lib/kakao/maps";
import {
  BUSAN_REGION_CONFIG,
  getRegionConfig,
  getRegionDefaultCatalogCategories,
  getRegionDistrict,
  type RegionConfig,
} from "@/lib/regions/config";
import type { ApiResult } from "@/types/api";
import type { KakaoCurrentMapSearch } from "@/types/kakao";
import { requestMapPlaceCardDetails } from "@/lib/map-places/card-details-client";
import type {
  MapPlacesSnapshotDataset,
  MapPlacesSnapshotMarker,
} from "@/types/map-places-snapshot";
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
import {
  createPlanDraft,
  loadPlanDraft,
  plannerInputFromPlanDraft,
  savePlanDraft,
  updatePlanDraftScope,
} from "@/lib/storage/plan-draft-storage";
import {
  MAX_SELECTED_ITINERARY_PLACES,
  requiresSelectionRegionClear,
  selectedItineraryPlaceFromCatalog,
} from "@/lib/storage/selected-itinerary-storage";

type ExplorerTab = "catalog" | "recommendations";
type ProviderState = "loading" | "ready" | "error";
type ExplorerPresentationState = "loading" | "partial" | "ready" | "empty" | "error";
type MobileExplorerMode = "map" | "list";
type FilterAnchor = "toolbar";

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

const STRICT_EFFECT_ABORT_GRACE_MS = 50;

const TECHNICAL_PROVIDER_ERROR =
  /(?:\bAPI\b|Authorization|Bearer|secret|token|환경\s*변수|개발자\s*콘솔|도메인\s*설정|(?:KAKAO|TOUR|SUPABASE|NEXT_PUBLIC)_[A-Z0-9_]+)/iu;

function publicProviderErrorMessage(message: string, fallback: string): string {
  const normalized = message.trim();
  if (!normalized || TECHNICAL_PROVIDER_ERROR.test(normalized)) return fallback;
  return normalized;
}

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
  let expectedTotal: number | null = null;
  const seenIds = new Set<string>();
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
    if ("region" in body.data && body.data.region.id !== regionId) {
      throw new Error("지도 장소 페이지 지역이 일치하지 않습니다.");
    }
    if (expectedTotal === null) expectedTotal = body.data.totalCount;
    if (body.data.totalCount !== expectedTotal) {
      throw new Error("지도 장소 페이지 개수가 조회 중 변경되었습니다.");
    }
    const nextPlaces = body.data.items.map((place) => "layer" in place
      ? place
      : normalizeKakaoCatalogMarker(place, regionId));
    if (nextPlaces.some((place) => place.regionId !== regionId || seenIds.has(place.id))) {
      throw new Error("지도 장소 페이지에 잘못된 지역 또는 중복 장소가 있습니다.");
    }
    for (const place of nextPlaces) seenIds.add(place.id);
    places.push(...nextPlaces);
    hasNext = body.data.hasNext;
    const nextCursor = body.data.nextCursor ?? null;
    if (hasNext && (nextCursor === null || (afterId !== null && nextCursor <= afterId))) {
      throw new Error("지도 장소 페이지 커서를 확인하지 못했습니다.");
    }
    afterId = nextCursor;
    page += 1;
  }
  if (places.length !== (expectedTotal ?? 0)) {
    throw new Error("지도 장소 페이지가 완전하지 않습니다.");
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

function fetchAllRegionalOfficialPlaces(
  regionId: RegionId,
  district: string,
  signal: AbortSignal,
): Promise<PublicCatalogMarker[]> {
  return fetchMapMarkerPages(
    regionId,
    district,
    signal,
    "tour",
    "tourism_place",
  );
}

interface DefaultCatalogResult {
  tour: PublicCatalogMarker[];
  kakao: PublicCatalogMarker[];
  delivery: "snapshot" | "fallback";
  freshness: "fresh" | "stale" | null;
  tourError?: string;
  kakaoError?: string;
}

function snapshotCatalogMarker(
  marker: MapPlacesSnapshotMarker,
  region: RegionConfig,
): PublicCatalogMarker {
  const districtName = marker.districtName ??
    (marker.districtCode ? getRegionDistrict(region, marker.districtCode)?.name ?? null : null);
  return {
    ...marker,
    districtName,
    address: marker.address ?? districtName ?? "주소 확인 필요",
  };
}

async function requestDefaultCatalog(
  region: RegionConfig,
  signal: AbortSignal,
): Promise<DefaultCatalogResult> {
  const requestSnapshot = async () => {
      const snapshot = await mapPlacesSnapshotBrowserClient.load(region.id, "core", signal);
      const markers = snapshot.items.map((marker) => snapshotCatalogMarker(marker, region));
      return {
        tour: markers.filter(({ layer }) => layer === "tourism"),
        kakao: markers.filter(({ layer }) => layer === "kakao"),
        freshness: snapshot.freshness.status,
      };
  };
  if (region.mapCatalog.fallbackSource === "public_catalog") {
    return { ...(await requestSnapshot()), delivery: "snapshot" };
  }
  const loaded = await loadSnapshotWithFallback<Omit<DefaultCatalogResult, "delivery">>({
    requestSnapshot,
    requestFallback: async () => {
      const results = await Promise.allSettled([
        region.mapCatalog.fallbackSource === "public_catalog"
          ? fetchAllRegionalOfficialPlaces(region.id, "all", signal)
          : fetchAllBusanTourPlaces("all", signal, DEFAULT_PLACE_CATEGORIES),
        region.kakaoDiscoveryEnabled
          ? fetchAllKakaoPlaces(region.id, "all", signal, "default")
          : Promise.resolve<PublicCatalogMarker[]>([]),
      ]);
      if (
        results[0].status === "rejected" &&
        (!region.kakaoDiscoveryEnabled || results[1].status === "rejected")
      ) {
        throw results[0].status === "rejected" ? results[0].reason : new Error("지도 장소 오류");
      }
      return {
        tour: results[0].status === "fulfilled" ? results[0].value : [],
        kakao: results[1].status === "fulfilled" ? results[1].value : [],
        ...(results[0].status === "rejected" ? {
          tourError: results[0].reason instanceof Error ? results[0].reason.message : "관광공사 오류",
        } : {}),
        ...(results[1].status === "rejected" ? {
          kakaoError: results[1].reason instanceof Error ? results[1].reason.message : "Kakao 오류",
        } : {}),
        freshness: null,
      };
    },
  });
  return { ...loaded.items, delivery: loaded.source };
}


function getVisiblePageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, currentPage - 1), totalPages - 2);
  return Array.from({ length: 3 }, (_, index) => start + index);
}

function ExplorerResultsSkeleton() {
  return (
    <div className="explorer-results-skeleton" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="explorer-result-skeleton" key={index}>
          <span className="explorer-result-skeleton__image" />
          <span className="explorer-result-skeleton__body">
            <i />
            <i />
            <i />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ResultsExplorer({ initialTab = "catalog", initialCatalogState, staticMapEnabled = false, itineraryMode = "browse" }: {
  initialTab?: ExplorerTab;
  initialCatalogState: PublicCatalogUrlState;
  staticMapEnabled?: boolean;
  itineraryMode?: "browse" | "selection" | "hybrid";
}) {
  const router = useRouter();
  const {
    generationRequested,
    consumeGenerationRequest,
    profileConfirmed,
    preferencesConfirmed,
    confirmPlannerAndRequestGeneration,
  } = usePlannerState();
  const [region, setRegion] = useState<RegionId>(initialCatalogState.region);
  const regionConfig = getRegionConfig(region);
  const [activeTab, setActiveTab] = useState<ExplorerTab>(() =>
    itineraryMode === "selection"
      ? "catalog"
      : itineraryMode === "hybrid"
        ? "recommendations"
        : initialTab === "recommendations" && !regionConfig.routeCapabilities.fullyAutomaticRecommendation
      ? "catalog"
      : initialTab);
  const [district, setDistrict] = useState(initialCatalogState.district);
  const [districtQuery, setDistrictQuery] = useState(() =>
    getPublicCatalogDistrictName(initialCatalogState.region, initialCatalogState.district));
  const [categories, setCategories] = useState<PlaceCategory[]>(initialCatalogState.categories);
  const [layers, setLayers] = useState<PublicCatalogLayer[]>(initialCatalogState.layers);
  const [draftCategories, setDraftCategories] = useState<PlaceCategory[]>(initialCatalogState.categories);
  const [filterAnchor, setFilterAnchor] = useState<FilterAnchor | null>(null);
  const [isFilterPending, startFilterTransition] = useTransition();
  const filterOpen = filterAnchor !== null;
  const [page, setPage] = useState(initialCatalogState.page);
  const [sort, setSort] = useState<ExplorerSort>(initialCatalogState.sort);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMode, setMobileMode] = useState<MobileExplorerMode>("list");
  const [tourPlaces, setTourPlaces] = useState<PublicCatalogMarker[]>([]);
  const [kakaoPlaces, setKakaoPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalTourPlaces, setOptionalTourPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalKakaoPlaces, setOptionalKakaoPlaces] = useState<PublicCatalogMarker[]>([]);
  const [optionalLoadedFor, setOptionalLoadedFor] = useState<string | null>(null);
  const [optionalTourState, setOptionalTourState] = useState<ProviderState>("ready");
  const [optionalTourError, setOptionalTourError] = useState("");
  const [optionalRetry, setOptionalRetry] = useState(0);
  const [tourState, setTourState] = useState<ProviderState>("loading");
  const [kakaoState, setKakaoState] = useState<ProviderState>(() =>
    regionConfig.kakaoDiscoveryEnabled ? "loading" : "ready");
  const [tourError, setTourError] = useState("");
  const [kakaoError, setKakaoError] = useState("");
  const [catalogFreshness, setCatalogFreshness] = useState<"fresh" | "stale" | "fallback" | null>(null);
  const [tourCardsById, setTourCardsById] = useState<Map<string, PublicCatalogPlace>>(() => new Map());
  const [cardDetailsError, setCardDetailsError] = useState("");
  const [cardDetailsRetry, setCardDetailsRetry] = useState(0);
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReadyForRegion, setMapReadyForRegion] = useState<RegionId | null>(null);
  const [activeBounds, setActiveBounds] = useState<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const [viewportDirty, setViewportDirty] = useState(false);
  const {
    snapshot: selectionSnapshot,
    hydrated: selectionHydrated,
    message: selectionMessage,
    toggle: toggleSelection,
    remove: removeSelection,
    move: moveSelection,
    setAutoFill,
    resetRegion: resetSelectionRegion,
  } = useSelectedItinerarySelection({
    regionId: region,
    enabled: itineraryMode !== "browse",
  });
  const [pendingRegionChange, setPendingRegionChange] = useState<{
    regionId: RegionId;
    startedAt: number;
  } | null>(null);
  const latestViewportRef = useRef<KakaoCurrentMapSearch | null>(null);
  const viewportBaselineRef = useRef<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const activeBoundsRef = useRef<KakaoCurrentMapSearch["rectangle"] | null>(null);
  const filterDropdownRef = useRef<HTMLElement>(null);
  const mapFilterButtonRef = useRef<HTMLButtonElement>(null);
  const hasSynchronizedUrlRef = useRef(false);
  const applyingBrowserHistoryRef = useRef(false);
  const requestStartedAtRef = useRef<number | null>(null);
  const stateUpdateStartedAtRef = useRef<number | null>(null);
  const filterStartedAtRef = useRef<number | null>(null);
  const revisitStartedAtRef = useRef<number | null>(null);
  const visitedRegionsRef = useRef(new Set<RegionId>([initialCatalogState.region]));
  const catalogRequestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<DefaultCatalogResult>;
    abortTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const optionalRequestRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<{ tour: PublicCatalogMarker[]; kakao: PublicCatalogMarker[] }>;
    abortTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [rankingAsOf] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (
      activeTab !== "recommendations" ||
      (profileConfirmed && preferencesConfirmed)
    ) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const draft = loadPlanDraft();
      const restored = draft ? plannerInputFromPlanDraft(draft) : null;
      if (!restored) return;
      confirmPlannerAndRequestGeneration(
        restored.petProfile,
        restored.preferences,
      );
    });
    return () => { active = false; };
  }, [
    activeTab,
    confirmPlannerAndRequestGeneration,
    preferencesConfirmed,
    profileConfirmed,
  ]);

  useEffect(() => {
    if (!filterOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        filterDropdownRef.current?.contains(event.target) ||
        mapFilterButtonRef.current?.contains(event.target)
      ) return;
      setFilterAnchor(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFilterAnchor(null);
      requestAnimationFrame(() => mapFilterButtonRef.current?.focus());
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filterAnchor, filterOpen]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    const requestKey = `${region}:${retry}`;
    let pending = catalogRequestRef.current;
    if (pending?.key === requestKey) {
      if (pending.abortTimer) clearTimeout(pending.abortTimer);
      pending.abortTimer = null;
    } else {
      if (pending?.abortTimer) clearTimeout(pending.abortTimer);
      pending?.controller.abort();
      const controller = new AbortController();
      requestStartedAtRef.current = performance.now();
      pending = {
        key: requestKey,
        controller,
        promise: requestDefaultCatalog(regionConfig, controller.signal),
        abortTimer: null,
      };
      catalogRequestRef.current = pending;
    }
    let active = true;
    void pending.promise.then((result) => {
      if (!active) return;
      stateUpdateStartedAtRef.current = performance.now();
      setTourPlaces(result.tour);
      setKakaoPlaces(result.kakao);
      setTourState(result.tourError ? "error" : "ready");
      setKakaoState(result.kakaoError ? "error" : "ready");
      setTourError(result.tourError ?? "");
      setKakaoError(result.kakaoError ?? "");
      setCatalogFreshness(result.delivery === "fallback" ? "fallback" : result.freshness);
    }).catch((error: unknown) => {
      if (!active || pending.controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "지도 장소 오류";
      setTourState("error");
      setTourError(message);
      if (regionConfig.kakaoDiscoveryEnabled) {
        setKakaoState("error");
        setKakaoError(message);
      }
    });
    return () => {
      active = false;
      pending.abortTimer = setTimeout(() => {
        if (catalogRequestRef.current !== pending) return;
        pending.controller.abort();
        catalogRequestRef.current = null;
      }, STRICT_EFFECT_ABORT_GRACE_MS);
    };
  }, [activeTab, region, regionConfig, regionConfig.kakaoDiscoveryEnabled, retry]);

  const needsOptionalPlaces = categories.some((category) =>
    regionConfig.mapCatalog.deferredCategories.includes(category));
  const optionalScopeKey = regionConfig.mapCatalog.snapshotDatasets.includes("shopping")
    ? `${region}:shopping:${optionalRetry}`
    : `${region}:${district}:${retry}`;
  useEffect(() => {
    if (activeTab !== "catalog" || !needsOptionalPlaces || optionalLoadedFor === optionalScopeKey) return;
    let pending = optionalRequestRef.current;
    if (pending?.key === optionalScopeKey) {
      if (pending.abortTimer) clearTimeout(pending.abortTimer);
      pending.abortTimer = null;
    } else {
      if (pending?.abortTimer) clearTimeout(pending.abortTimer);
      pending?.controller.abort();
      const controller = new AbortController();
      pending = {
        key: optionalScopeKey,
        controller,
        promise: regionConfig.mapCatalog.snapshotDatasets.includes("shopping")
          ? mapPlacesSnapshotBrowserClient.load(region, "shopping", controller.signal).then((snapshot) => ({
              tour: snapshot.items
                .map((marker) => snapshotCatalogMarker(marker, regionConfig))
                .filter(({ layer }) => layer === "tourism"),
              kakao: [],
            }))
          : Promise.all([
              fetchAllBusanTourPlaces(district, controller.signal, ["shopping"]),
              fetchAllKakaoPlaces(region, district, controller.signal, "optional"),
            ]).then(([tour, kakao]) => ({ tour, kakao })),
        abortTimer: null,
      };
      optionalRequestRef.current = pending;
    }
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setOptionalTourState("loading");
      setOptionalTourError("");
    });
    void pending.promise.then(({ tour, kakao }) => {
      if (!active) return;
      setOptionalTourPlaces(tour);
      setOptionalKakaoPlaces(kakao);
      setOptionalLoadedFor(optionalScopeKey);
      setOptionalTourState("ready");
    }).catch((error: unknown) => {
      if (!active || pending.controller.signal.aborted) return;
      setOptionalTourState("error");
      setOptionalTourError(error instanceof Error ? error.message : "추가 장소 오류");
    });
    return () => {
      active = false;
      pending.abortTimer = setTimeout(() => {
        if (optionalRequestRef.current !== pending) return;
        pending.controller.abort();
        optionalRequestRef.current = null;
      }, STRICT_EFFECT_ABORT_GRACE_MS);
    };
  }, [activeTab, district, needsOptionalPlaces, optionalLoadedFor, optionalScopeKey, region, regionConfig, retry]);

  useEffect(() => {
    const restoreFromHistory = () => {
      const params = Object.fromEntries(new URLSearchParams(window.location.search));
      const restored = parsePublicCatalogUrlState(params);
      if (!restored) {
        window.location.reload();
        return;
      }
      const restoredRegion = getRegionConfig(restored.region);
      applyingBrowserHistoryRef.current = true;
      setRegion(restored.region);
      setDistrict(restored.district);
      setDistrictQuery(getPublicCatalogDistrictName(restored.region, restored.district));
      setCategories(restored.categories);
      setDraftCategories(restored.categories);
      setLayers(restored.layers);
      setPage(restored.page);
      setSort(restored.sort);
      setActiveTab(itineraryMode === "selection"
        ? "catalog"
        : itineraryMode === "hybrid"
          ? "recommendations"
          : params.tab === "recommendations" && restoredRegion.routeCapabilities.fullyAutomaticRecommendation
            ? "recommendations"
            : "catalog");
      setSelectedId(null);
      activeBoundsRef.current = null;
      setActiveBounds(null);
      setViewportDirty(false);
    };
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, [itineraryMode]);

  useEffect(() => {
    const baseUrl = serializeResultsUrl(activeTab, {
      region,
      district,
      categories,
      layers,
      page,
      sort,
    });
    const desiredUrl = itineraryMode === "selection"
      ? `${baseUrl}&mode=select`
      : itineraryMode === "hybrid"
        ? `${baseUrl}&mode=selected`
        : baseUrl;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const isInitialSync = !hasSynchronizedUrlRef.current;
    hasSynchronizedUrlRef.current = true;
    if (currentUrl === desiredUrl) {
      applyingBrowserHistoryRef.current = false;
      return;
    }
    if (isInitialSync || applyingBrowserHistoryRef.current) {
      window.history.replaceState(null, "", desiredUrl);
    } else {
      window.history.pushState(null, "", desiredUrl);
    }
    applyingBrowserHistoryRef.current = false;
  }, [activeTab, categories, district, itineraryMode, layers, page, region, sort]);

  const allPlaces = useMemo(() => {
    const unique = new Map<string, PublicCatalogMarker>();
    const optionalPlaces = optionalLoadedFor === optionalScopeKey
      ? [...optionalTourPlaces, ...optionalKakaoPlaces]
      : [];
    for (const place of [...tourPlaces, ...kakaoPlaces, ...optionalPlaces]) {
      if (place.regionId === region && !unique.has(place.id)) unique.set(place.id, place);
    }
    return [...unique.values()];
  }, [kakaoPlaces, optionalKakaoPlaces, optionalLoadedFor, optionalScopeKey, optionalTourPlaces, region, tourPlaces]);
  const searchedPlaces = useMemo(
    () => filterCatalogPlacesByQuery(allPlaces, searchQuery),
    [allPlaces, searchQuery],
  );

  const rankingCenter = useMemo(() => activeBounds ? ({
    latitude: (activeBounds.south + activeBounds.north) / 2,
    longitude: (activeBounds.west + activeBounds.east) / 2,
  }) : null, [activeBounds]);
  const categoryCounts = useMemo(() => getExplorerCategoryCounts({
    places: searchedPlaces,
    regionId: region,
    district,
    layers: [...PUBLIC_CATALOG_LAYERS],
    activeBounds,
  }), [activeBounds, district, region, searchedPlaces]);
  const displayedCategoryCounts = useMemo(() => Object.fromEntries(
    PLACE_CATEGORIES.map((category) => [
      category,
      regionConfig.mapCatalog.deferredCategories.includes(category) &&
        optionalLoadedFor !== optionalScopeKey
        ? null
        : categoryCounts[category],
    ]),
  ) as Record<PlaceCategory, number | null>, [categoryCounts, optionalLoadedFor, optionalScopeKey, regionConfig.mapCatalog.deferredCategories]);
  const visibleLayers = useMemo<PublicCatalogLayer[]>(() => [
    ...(regionConfig.allowedMapProviders.includes("tour") ? ["tourism" as const] : []),
    ...(regionConfig.allowedMapProviders.includes("kakao")
      ? ["kakao" as const, "veterinary" as const, "pet_shop" as const]
      : []),
  ], [regionConfig]);
  const filteredCollections = useMemo(() => getExplorerCollections({
    places: searchedPlaces,
    regionId: region,
    district,
    categories,
    layers: layers.filter((layer) => visibleLayers.includes(layer)),
    activeBounds,
    page: 1,
    sort,
    rankingAsOf,
    rankingCenter,
  }), [activeBounds, categories, district, layers, rankingAsOf, rankingCenter, region, searchedPlaces, sort, visibleLayers]);
  const { filteredPlaces, mapPlaces, totalPages } = filteredCollections;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedMarkers = useMemo(() => {
    const offset = (currentPage - 1) * PUBLIC_CATALOG_PAGE_SIZE;
    return filteredPlaces.slice(offset, offset + PUBLIC_CATALOG_PAGE_SIZE);
  }, [currentPage, filteredPlaces]);
  const pagedPlaces = useMemo(() => pagedMarkers.map((marker) =>
    tourCardsById.get(marker.id) ?? markerToCatalogCard(marker)), [pagedMarkers, tourCardsById]);

  useEffect(() => {
    if (regionConfig.mapCatalog.fallbackSource === "public_catalog") {
      if (pagedMarkers.length === 0) return;
      const missing = pagedMarkers.filter(({ id, dataset, category }) =>
        !tourCardsById.has(id) && dataset !== "shopping" && category !== "shopping");
      if (missing.length === 0) return;
      const controller = new AbortController();
      const groups = new Map<MapPlacesSnapshotDataset, PublicCatalogMarker[]>();
      for (const marker of missing) {
        const dataset = marker.dataset ?? (marker.category === "shopping" ? "shopping" : "core");
        groups.set(dataset, [...(groups.get(dataset) ?? []), marker]);
      }
      void Promise.all([...groups].map(async ([dataset, markers]) => ({
        markers,
        details: await requestMapPlaceCardDetails(
          region,
          dataset,
          markers.map(({ id }) => id),
          controller.signal,
        ),
      }))).then((results) => {
        if (controller.signal.aborted) return;
        setCardDetailsError("");
        setTourCardsById((current) => {
          const next = new Map(current);
          let changed = false;
          for (const { markers, details } of results) {
            const detailsById = new Map(details.items.map((detail) => [detail.id, detail] as const));
            for (const marker of markers) {
              const detail = detailsById.get(marker.id);
              if (!detail) continue;
              changed = true;
              next.set(marker.id, {
                ...markerToCatalogCard(marker),
                address: detail.address,
                phone: detail.phone,
                imageUrl: detail.imageUrl,
                placeUrl: detail.placeUrl,
                contentTypeId: detail.contentTypeId,
              });
            }
          }
          return changed ? next : current;
        });
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCardDetailsError(error instanceof Error
          ? error.message
          : "지도 장소 카드 정보를 불러오지 못했습니다.");
      });
      return () => controller.abort();
    }
    if (regionConfig.mapCatalog.fallbackSource !== "tour_api") return;
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
      if (controller.signal.aborted) return;
      if (!response.ok || !body.ok) return;
      if (!Array.isArray(body.data.places)) return;
      const places = body.data.places;
      setTourCardsById((current) => {
        const next = new Map(current);
        for (const place of places) {
          if (missingIds.includes(place.contentId)) {
            const card = normalizeTourCatalogPlace(place);
            const marker = pagedMarkers.find(({ id }) => id === card.id);
            next.set(card.id, marker ? {
              ...card,
              petAccessVerdict: marker.petAccessVerdict ?? card.petAccessVerdict,
              publicLabel: marker.publicLabel,
              petConditions: marker.petConditions ?? card.petConditions,
              verificationRequired: marker.verificationRequired ?? card.verificationRequired,
            } : card);
          }
        }
        return next;
      });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [cardDetailsRetry, district, pagedMarkers, region, regionConfig.mapCatalog.fallbackSource, tourCardsById]);
  const mapLocations = useMemo<KakaoMapLocation[]>(() => mapPlaces.map((place) => ({
    id: place.id,
    name: place.name,
    address: place.address ?? place.districtName ?? getPublicCatalogDistrictName(region, place.districtCode ?? "all"),
    coordinates: place.coordinates,
    markerKind: LAYER_META[place.layer].markerKind,
    sourceLabel: `${place.sourceLabel} · ${place.publicLabel}`,
    interactive: true,
    clusterable: true,
  })), [mapPlaces, region]);
  const placeIndex = useMemo(() => buildMeasuredMapPlaceIndex(filteredPlaces), [filteredPlaces]);
  const districtName = getPublicCatalogDistrictName(region, district);
  const anyReady = tourState === "ready" ||
    (regionConfig.kakaoDiscoveryEnabled && kakaoState === "ready");
  const mapDataPending = mapLocations.length === 0 && (
    tourState === "loading" ||
    (regionConfig.kakaoDiscoveryEnabled && kakaoState === "loading") ||
    (needsOptionalPlaces && optionalTourState === "loading")
  );
  const providerLoading = tourState === "loading" ||
    (regionConfig.kakaoDiscoveryEnabled && kakaoState === "loading") ||
    (needsOptionalPlaces && optionalTourState === "loading");
  const providerError = tourState === "error" ||
    (regionConfig.kakaoDiscoveryEnabled && kakaoState === "error") ||
    (needsOptionalPlaces && optionalTourState === "error");
  const hasUsableResults = filteredPlaces.length > 0;
  // Presentation-only state: provider, URL, sorting, pagination, and map semantics stay unchanged.
  const presentationState: ExplorerPresentationState = hasUsableResults
    ? providerError
      ? "error"
      : providerLoading
        ? "partial"
        : "ready"
    : providerLoading
      ? "loading"
      : providerError
        ? "error"
        : "empty";
  const shoppingLoaded = optionalLoadedFor === optionalScopeKey;
  const allPopularityInsufficient = filteredPlaces.length > 0;
  const availableCategories = regionConfig.mapCatalog.availableCategories as readonly PlaceCategory[];
  const presentCategories = !regionConfig.kakaoDiscoveryEnabled && tourState === "ready"
    ? availableCategories.filter((category) =>
        regionConfig.mapCatalog.deferredCategories.includes(category) || categoryCounts[category] > 0)
    : [...availableCategories];
  const visibleDefaultCategories = presentCategories.filter((category) => !isOptionalPlaceCategory(category));
  const visibleOptionalCategories = presentCategories.filter(isOptionalPlaceCategory);
  useEffect(() => {
    if (stateUpdateStartedAtRef.current !== null) {
      recordMapExplorerMetric("react_commit", stateUpdateStartedAtRef.current);
      stateUpdateStartedAtRef.current = null;
    }
    if (pagedPlaces.length > 0 && requestStartedAtRef.current !== null) {
      recordMapExplorerMetric("first_useful_cards", requestStartedAtRef.current);
      requestStartedAtRef.current = null;
    }
    if (filterStartedAtRef.current !== null) {
      recordMapExplorerMetric("warm_filter_feedback", filterStartedAtRef.current);
      filterStartedAtRef.current = null;
    }
    if (anyReady && revisitStartedAtRef.current !== null) {
      recordMapExplorerMetric("warm_region_revisit", revisitStartedAtRef.current);
      revisitStartedAtRef.current = null;
    }
  }, [anyReady, filteredPlaces, pagedPlaces.length]);
  const resetViewportScope = () => {
    activeBoundsRef.current = null;
    viewportBaselineRef.current = null;
    latestViewportRef.current = null;
    setActiveBounds(null);
    setViewportDirty(false);
  };
  const changeRegion = (nextRegion: RegionId, startedAt: number) => {
    if (nextRegion === region) return;
    const nextConfig = getRegionConfig(nextRegion);
    if (visitedRegionsRef.current.has(nextRegion)) {
      revisitStartedAtRef.current = startedAt;
    } else {
      visitedRegionsRef.current.add(nextRegion);
      revisitStartedAtRef.current = null;
    }
    setRegion(nextRegion);
    setActiveTab("catalog");
    setDistrict("all");
    setDistrictQuery(getPublicCatalogDistrictName(nextRegion, "all"));
    const nextDefaultCategories = getRegionDefaultCatalogCategories(nextConfig) as PlaceCategory[];
    setCategories([...nextDefaultCategories]);
    setDraftCategories([...nextDefaultCategories]);
    setLayers([
      ...(nextConfig.allowedMapProviders.includes("tour") ? ["tourism" as const] : []),
      ...(nextConfig.allowedMapProviders.includes("kakao")
        ? ["kakao" as const, "veterinary" as const, "pet_shop" as const]
        : []),
    ]);
    setPage(1);
    setSearchQuery("");
    setSelectedId(null);
    setTourPlaces([]);
    setKakaoPlaces([]);
    setOptionalTourPlaces([]);
    setOptionalKakaoPlaces([]);
    setOptionalLoadedFor(null);
    setTourCardsById(new Map());
    setCardDetailsError("");
    setTourError("");
    setKakaoError("");
    setCatalogFreshness(null);
    setTourState("loading");
    setKakaoState(nextConfig.kakaoDiscoveryEnabled ? "loading" : "ready");
    resetViewportScope();
    const draft = loadPlanDraft() ?? createPlanDraft(nextRegion);
    savePlanDraft(updatePlanDraftScope(draft, nextRegion, null));
  };
  const requestRegionChange = (nextRegion: RegionId, startedAt: number) => {
    if (nextRegion === region) return;
    if (
      itineraryMode === "selection" &&
      requiresSelectionRegionClear(selectionSnapshot, nextRegion)
    ) {
      setPendingRegionChange({ regionId: nextRegion, startedAt });
      return;
    }
    if (itineraryMode === "selection" && selectionSnapshot.regionId !== nextRegion) {
      resetSelectionRegion(nextRegion, { preserveAutoFill: true });
    }
    changeRegion(nextRegion, startedAt);
  };
  const confirmRegionChange = () => {
    if (!pendingRegionChange) return;
    resetSelectionRegion(pendingRegionChange.regionId, {
      message: "선택한 장소를 비우고 지역을 변경했습니다.",
    });
    changeRegion(pendingRegionChange.regionId, pendingRegionChange.startedAt);
    setPendingRegionChange(null);
  };
  const changeFilter = (update: () => void) => {
    update(); setPage(1); setSelectedId(null); resetViewportScope();
  };
  const changeDistrict = (nextDistrict: string) => {
    changeFilter(() => {
      setDistrict(nextDistrict);
      setDistrictQuery(getPublicCatalogDistrictName(region, nextDistrict));
      setOptionalLoadedFor(null);
    });
    const draft = loadPlanDraft() ?? createPlanDraft(region);
    savePlanDraft(updatePlanDraftScope(
      draft,
      region,
      nextDistrict === "all" ? null : nextDistrict,
    ));
  };
  const toggleDraftCategory = (category: PlaceCategory) => {
    setDraftCategories((current) => current.includes(category)
      ? current.filter((value) => value !== category)
      : PLACE_CATEGORIES.filter((value) => value === category || current.includes(value)));
  };
  const toggleFilters = (anchor: FilterAnchor) => {
    if (filterAnchor === anchor) {
      setFilterAnchor(null);
      return;
    }
    if (!filterOpen) setDraftCategories([...categories]);
    setFilterAnchor(anchor);
  };
  const closeFilters = () => {
    setFilterAnchor(null);
  };
  const applyFilters = (startedAt: number) => {
    filterStartedAtRef.current = startedAt;
    closeFilters();
    startFilterTransition(() => {
      setCategories([...draftCategories]);
      setPage(1);
      setSelectedId(null);
      resetViewportScope();
    });
  };
  const resetDraftFilters = () => {
    setDraftCategories(getRegionDefaultCatalogCategories(regionConfig) as PlaceCategory[]);
  };
  const [selectionFocusKey, setSelectionFocusKey] = useState(0);
  const resultsListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = resultsListRef.current;
    const card = selectedId ? document.getElementById("place-card-" + selectedId.replace(":", "-")) : null;
    if (!list || !card) return;
    list.scrollTo({ top: list.scrollTop + card.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - card.clientHeight) / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [selectedId, currentPage]);
  const selectPlace = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    setSelectionFocusKey(value => value + 1);
    const index = placeIndex.get(id);
    if (index !== undefined) setPage(Math.floor(index / PUBLIC_CATALOG_PAGE_SIZE) + 1);
  };
  const toggleItineraryPlace = (place: PublicCatalogPlace) => {
    const result = toggleSelection(selectedItineraryPlaceFromCatalog(place));
    if (result.status === "selected") {
      selectPlace(place.id);
    }
  };
  const removeItineraryPlace = (placeId: string) => {
    removeSelection(placeId);
  };
  const continueSelectedItinerary = () => {
    if (selectionSnapshot.places.length === 0) return;
    router.push("/planner/pet?mode=selected");
  };
  const startAutomaticItinerary = () => {
    if (!regionConfig.routeCapabilities.fullyAutomaticRecommendation) return;
    router.push("/planner/pet");
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
      <div className="page-shell results-recommendations-view py-8">
        <div className="results-recommendation-progress">
          <PlannerProgress
            current={itineraryMode === "hybrid" ? 3 : 2}
            variant={itineraryMode === "hybrid" ? "selected" : "automatic"}
          />
        </div>
        <div className="mb-6 inline-flex rounded-lg border border-[#d7e0da] bg-white p-1" role="navigation" aria-label="장소 및 추천 보기">
          {itineraryMode === "hybrid" ? (
            <Link href={`/results?tab=catalog&region=${region}&mode=select`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-extrabold text-[#52665b]"><Rows3 size={16} aria-hidden="true" />장소 다시 선택</Link>
          ) : (
            <Link href={`/results?tab=catalog&region=${region}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-extrabold text-[#52665b]"><Rows3 size={16} aria-hidden="true" />전체 장소</Link>
          )}
          <Link href={`/results?tab=recommendations&region=${region}`} aria-current="page" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#236148] px-5 text-sm font-extrabold text-white"><Route size={16} aria-hidden="true" />맞춤 일정</Link>
        </div>
        <div id="recommendations-panel"><RecommendationPlanner autoGenerate={generationRequested} onAutoGenerateStart={consumeGenerationRequest} selectionMode={itineraryMode === "hybrid" ? "hybrid" : "automatic"} /></div>
      </div>
    );
  }

  const visiblePages = getVisiblePageNumbers(currentPage, totalPages);
  const selectedMarker = filteredPlaces.find(({ id }) => id === selectedId);
  const selectedPlace = selectedMarker
    ? tourCardsById.get(selectedMarker.id) ?? markerToCatalogCard(selectedMarker)
    : null;
  const closePlacePreview = () => {
    if (selectedId) document.getElementById(`place-card-${selectedId.replace(":", "-")}`)
      ?.querySelector<HTMLButtonElement>('button[aria-label$="지도에서 보기"]')?.focus({ preventScroll: true });
    setSelectedId(null);
  };
  const renderFilterDropdown = (anchor: FilterAnchor) => filterAnchor === anchor ? (
    <section
      ref={filterDropdownRef}
      id="explorer-filter-dropdown"
      className={`explorer-filter-dropdown explorer-filter-dropdown--${anchor}`}
      role="region"
      aria-label="장소 필터"
    >
        <form noValidate onSubmit={(event) => { event.preventDefault(); applyFilters(event.timeStamp); }}>
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
  ) : null;

  return (
    <div className={`full-map-explorer ${itineraryMode === "selection" ? "is-itinerary-selection" : ""}`} id="catalog-panel">
      <div className="full-map-explorer__toolbar">
        {itineraryMode !== "selection" ? (
          <div className="explorer-toolbar-row explorer-mode-row" role="group" aria-label="탐색 모드">
            <span className="explorer-toolbar-label">탐색 모드</span>
            <div className="explorer-mode-tabs" role="navigation" aria-label="장소 및 추천 보기">
              <Link href={`/results?tab=catalog&region=${region}`} aria-current="page"><Rows3 size={16} aria-hidden="true" />장소 찾기</Link>
              {regionConfig.routeCapabilities.selectedPlaceRouting ? (
                <Link href={`/results?tab=catalog&region=${region}&page=${currentPage}&mode=select`}><Route size={16} aria-hidden="true" />맞춤 일정</Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="explorer-toolbar-row explorer-scope-row" role="group" aria-label="탐색 범위">
          <span className="explorer-toolbar-label">탐색 범위</span>
          <RegionSelector value={region} onChange={requestRegionChange} />
          <label className="explorer-district-control">
            <span className="sr-only">{regionConfig.displayName} 세부 지역</span>
            <input
              type="search"
              list={`district-options-${region}`}
              value={districtQuery}
              aria-label={`${regionConfig.displayName} 세부 지역 검색`}
              autoComplete="off"
              onChange={(event) => {
                const value = event.target.value;
                setDistrictQuery(value);
                const resolved = resolvePublicCatalogDistrictQuery(region, value);
                if (resolved !== null) changeDistrict(resolved);
              }}
              onBlur={() => setDistrictQuery(getPublicCatalogDistrictName(region, district))}
            />
            <datalist id={`district-options-${region}`}>
              <option value={`${regionConfig.displayName} 전체`} />
              {regionConfig.districts.map((item) => (
                <option key={item.legalDongDistrictCode} value={item.name} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="explorer-toolbar-row explorer-tools-row" role="group" aria-label="결과 도구">
          <span className="explorer-toolbar-label">결과 도구</span>
          <label className="explorer-place-search">
            <span className="sr-only">장소 검색</span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              placeholder="이름·주소·카테고리 검색"
              aria-label="장소 검색"
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
                setSelectedId(null);
              }}
            />
            {searchQuery ? (
              <button type="button" aria-label="장소 검색어 지우기" onClick={() => { setSearchQuery(""); setPage(1); setSelectedId(null); }}>
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="explorer-toolbar-filter">
            <button
              ref={mapFilterButtonRef}
              type="button"
              className="explorer-filter-trigger"
              aria-expanded={filterAnchor === "toolbar"}
              aria-controls="explorer-filter-dropdown"
              onClick={() => toggleFilters("toolbar")}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />필터
            </button>
            {renderFilterDropdown("toolbar")}
          </div>
          <div className="full-map-explorer__mobile-switch" role="group" aria-label="지도 또는 목록 보기">
            <button type="button" aria-pressed={mobileMode === "list"} onClick={() => setMobileMode("list")}><List size={17} aria-hidden="true" />목록</button>
            <button type="button" aria-pressed={mobileMode === "map"} onClick={() => setMobileMode("map")}><MapIcon size={17} aria-hidden="true" />지도</button>
          </div>
        </div>

      </div>

      {itineraryMode === "selection" && !regionConfig.routeCapabilities.automaticFill ? (
        <p className="selected-itinerary-region-notice" role="status">
          {regionConfig.displayName}에서는 직접 고른 장소의 경로와 순서를 만들 수 있습니다. 자동 채우기와 전체 자동 추천은 아직 지원하지 않습니다.
        </p>
      ) : null}

      <div className="full-map-explorer__main" data-mobile-mode={mobileMode}>
        <section className="full-map-explorer__map" aria-label={`${districtName} 전체 장소 지도`}>
          <MapPanel
            regionId={region}
            locations={mapLocations}
            selectedLocationId={selectedId}
            selectionFocusKey={selectionFocusKey}
            onLocationSelect={selectPlace}
            onDataUpdate={() => {
              if (mapReadyForRegion !== region) {
                document.documentElement.dataset.mapReadyAt = String(performance.now());
                setMapReadyForRegion(region);
              }
            }}
            onViewportIdle={handleViewportIdle}
            onCurrentMapSearch={commitCurrentViewport}
            showCurrentMapSearch={viewportDirty}
            currentMapSearchLabel="이 지역 검색 다시하기"
            viewportKey={`catalog:${region}:${district}:${categories.join(",")}`}
            showLocationLabel={false}
            showWatermark={false}
            selectionContent={selectedPlace ? (
              <section className="explorer-map-place-preview" aria-label="선택한 장소 미리보기" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closePlacePreview(); } }}>
                <button type="button" className="explorer-map-place-preview__close" aria-label="장소 미리보기 닫기" onClick={closePlacePreview}><X size={18} aria-hidden="true" /></button>
                <PublicCatalogCard
                  place={selectedPlace}
                  selected={false}
                  onSelect={() => setSelectionFocusKey(value => value + 1)}
                  staticMapEnabled={staticMapEnabled}
                  idPrefix="map-preview"
                />
              </section>
            ) : null}
            showSelectionInfo={false}
            showNavigationControls
            title={`${districtName} 장소 지도`}
            locationLabel={districtName}
            emptyMessage="선택한 조건에 표시할 장소가 없습니다."
            isDataLoading={mapDataPending}
            showEmptyMessage={presentationState === "empty"}
            loadingPresentation="visual-only"
          />

          <p className="sr-only" aria-live="polite">{viewportDirty ? "지도 범위가 변경되었습니다. 이 지역 검색 다시하기를 선택하면 결과에 반영됩니다." : ""}</p>
        </section>

        <aside className="full-map-explorer__sidebar" aria-label="장소 검색 결과">
          {itineraryMode === "selection" && regionConfig.routeCapabilities.selectedPlaceRouting && selectionHydrated ? (
            <SelectedItineraryTray
              variant="desktop"
              snapshot={selectionSnapshot}
              onRemove={removeItineraryPlace}
              onMove={moveSelection}
              onContinue={continueSelectedItinerary}
              onAutomaticStart={startAutomaticItinerary}
              onAutoFillChange={setAutoFill}
              automaticFillSupported={regionConfig.routeCapabilities.automaticFill}
              automaticRecommendationSupported={regionConfig.routeCapabilities.fullyAutomaticRecommendation}
              regionName={regionConfig.displayName}
            />
          ) : null}
          <header className="explorer-results-header" data-presentation-state={presentationState}>
            <div>
              <h1>
                {presentationState === "loading"
                  ? "장소 수를 확인하고 있어요"
                  : presentationState === "empty"
                    ? "조건에 맞는 장소가 없어요"
                    : presentationState === "error" && !hasUsableResults
                      ? "장소 정보를 확인하지 못했어요"
                      : `총 ${filteredPlaces.length.toLocaleString("ko-KR")}곳`}
              </h1>
              {presentationState !== "loading" ? <p>
                {presentationState === "partial"
                  ? "현재 확인된 장소를 먼저 보여드리며 추가 장소를 확인하고 있어요."
                  : presentationState === "error" && hasUsableResults
                    ? "일부 제공처를 확인하지 못했지만 현재 장소는 계속 볼 수 있어요."
                    : "방문 전 장소별 동반 조건을 확인해 주세요."}
              </p> : null}
            </div>
            <label className="explorer-sort-control" htmlFor="explorer-sort">
              <span className="sr-only">정렬</span>
              <select id="explorer-sort" value={sort} onChange={(event) => { setSort(event.target.value as ExplorerSort); setPage(1); }}>
                <option value="recommendation">추천순</option>
                <option value="popularity">인기도순</option>
              </select>
            </label>
          </header>
          {activeBounds ? <p className="explorer-active-bounds">지도 범위 적용 중</p> : null}
          {sort === "popularity" && allPopularityInsufficient ? <p className="explorer-popularity-notice" role="status">이용 데이터가 쌓이는 동안 추천순을 함께 반영합니다.</p> : null}
          <div className="explorer-results-status">
            {isFilterPending ? <p role="status">필터 결과를 반영하는 중입니다…</p> : null}
            {tourState === "error" ? <div role="alert"><b>관광공사 장소를 불러오지 못했습니다.</b> {publicProviderErrorMessage(tourError, "공식 장소 제공처 연결을 확인하지 못했습니다.")}</div> : null}
            {regionConfig.kakaoDiscoveryEnabled && kakaoState === "error" ? <div role="alert"><b>카카오맵 장소를 불러오지 못했습니다.</b> {publicProviderErrorMessage(kakaoError, "장소 제공처 연결을 확인하지 못했습니다.")}</div> : null}
            {needsOptionalPlaces && optionalTourState === "error" ? <div role="alert"><b>쇼핑 장소를 불러오지 못했습니다.</b> {publicProviderErrorMessage(optionalTourError, "쇼핑 장소 제공처 연결을 확인하지 못했습니다.")} <button type="button" onClick={() => { setOptionalTourState("loading"); setOptionalRetry((value) => value + 1); }}><RefreshCw size={15} aria-hidden="true" />쇼핑 다시 시도</button></div> : null}
            {catalogFreshness === "stale" ? <div role="status"><b>저장된 장소 데이터를 표시하고 있습니다.</b> 최신 데이터 확인이 지연되고 있어요.</div> : null}
            {catalogFreshness === "fallback" ? <div role="status"><b>호환 조회로 장소를 표시하고 있습니다.</b> 지역 스냅샷을 확인하지 못했어요.</div> : null}
            {cardDetailsError ? <div role="alert"><b>카드 상세 정보를 불러오지 못했습니다.</b> {publicProviderErrorMessage(cardDetailsError, "상세 정보 제공처 연결을 확인하지 못했습니다.")} <button type="button" onClick={() => setCardDetailsRetry((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />카드 다시 시도</button></div> : null}
            {presentationState === "partial" ? <p role="status">추가 장소를 불러오는 중입니다…</p> : null}
            {needsOptionalPlaces && optionalTourState === "loading" ? <p role="status">쇼핑 장소를 불러오는 중입니다…</p> : null}
            {shoppingLoaded && optionalTourState === "ready" && categoryCounts.shopping > 0 ? <p role="status">쇼핑 장소 {categoryCounts.shopping.toLocaleString("ko-KR")}곳을 불러왔습니다.</p> : null}
            {shoppingLoaded && optionalTourState === "ready" && categoryCounts.shopping === 0 ? <p role="status">불러온 쇼핑 장소가 없습니다.</p> : null}
            {!anyReady && tourState === "error" && (!regionConfig.kakaoDiscoveryEnabled || kakaoState === "error") ? <button type="button" onClick={() => { setTourState("loading"); setKakaoState(regionConfig.kakaoDiscoveryEnabled ? "loading" : "ready"); setRetry((value) => value + 1); }}><RefreshCw size={15} aria-hidden="true" />다시 시도</button> : null}
          </div>
          <div ref={resultsListRef} className="explorer-results-list">
            {presentationState === "loading" ? <ExplorerResultsSkeleton /> : null}
            {presentationState === "empty" ? (
              <div className="explorer-empty-state" role="status"><strong>선택한 조건의 장소가 없습니다.</strong><span>지역이나 장소 유형을 조정해 다시 확인해 보세요.</span></div>
            ) : null}
            {presentationState === "error" && !hasUsableResults ? (
              <div className="explorer-empty-state is-error" role="alert"><strong>지금은 장소 목록을 표시할 수 없습니다.</strong><span>잠시 후 다시 시도해 주세요.</span></div>
            ) : null}
            {presentationState !== "loading" && presentationState !== "empty" && pagedPlaces.map((place) => (
              <PublicCatalogCard
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                onSelect={() => {
                  setSelectedId(place.id);
                  setMobileMode("map");
                  setSelectionFocusKey(value => value + 1);
                }}
                staticMapEnabled={staticMapEnabled}
                itinerarySelection={itineraryMode === "selection" && regionConfig.routeCapabilities.selectedPlaceRouting ? {
                  selected: selectionSnapshot.places.some(({ id }) => id === place.id),
                  disabledReason: selectionSnapshot.places.some(({ id }) => id === place.id)
                    ? undefined
                    : selectionSnapshot.places.length >= MAX_SELECTED_ITINERARY_PLACES
                            ? `최대 ${MAX_SELECTED_ITINERARY_PLACES}곳까지 담을 수 있어요`
                            : undefined,
                  onToggle: () => toggleItineraryPlace(place),
                } : undefined}
              />
            ))}
          </div>
          {hasUsableResults ? <nav className="explorer-pagination" aria-label="장소 목록 페이지">
            <button type="button" disabled={currentPage === 1} onClick={() => { setPage(1); setSelectedId(null); }} aria-label="첫 페이지"><ChevronsLeft size={17} aria-hidden="true" /></button>
            <button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedId(null); }} aria-label="이전 페이지"><ChevronLeft size={17} aria-hidden="true" /></button>
            {visiblePages.map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => { setPage(pageNumber); setSelectedId(null); }}>{pageNumber}</button>)}
            <button type="button" disabled={currentPage === totalPages} onClick={() => { setPage(currentPage + 1); setSelectedId(null); }} aria-label="다음 페이지"><ChevronRight size={17} aria-hidden="true" /></button>
            <button type="button" disabled={currentPage === totalPages} onClick={() => { setPage(totalPages); setSelectedId(null); }} aria-label="마지막 페이지"><ChevronsRight size={17} aria-hidden="true" /></button>
          </nav> : null}
        </aside>
      </div>
      {itineraryMode === "selection" && regionConfig.routeCapabilities.selectedPlaceRouting && selectionHydrated ? (
        <SelectedItineraryTray
          variant="mobile"
          snapshot={selectionSnapshot}
          onRemove={removeItineraryPlace}
          onMove={moveSelection}
          onContinue={continueSelectedItinerary}
          onAutomaticStart={startAutomaticItinerary}
          onAutoFillChange={setAutoFill}
          automaticFillSupported={regionConfig.routeCapabilities.automaticFill}
          automaticRecommendationSupported={regionConfig.routeCapabilities.fullyAutomaticRecommendation}
          regionName={regionConfig.displayName}
        />
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{selectionMessage}</p>
      <AppDialog
        open={Boolean(pendingRegionChange)}
        onClose={() => setPendingRegionChange(null)}
        title="선택한 장소를 비우고 지역을 바꿀까요?"
        description="일정에는 한 지역의 장소만 담을 수 있습니다. 지역을 변경하면 현재 선택한 장소가 모두 해제됩니다."
      >
        <div className="app-confirm-dialog__actions">
          <button type="button" onClick={() => setPendingRegionChange(null)}>선택 유지</button>
          <button type="button" className="is-warning" onClick={confirmRegionChange}>비우고 지역 변경</button>
        </div>
      </AppDialog>
    </div>
  );
}
