"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  List,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { HomepagePlaceCarousel } from "@/components/home/official-place-carousel";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceImage } from "@/components/places/place-image";
import { PlaceCategoryToggleGroup } from "@/components/places/place-category-toggle-group";
import { createHomepageMapLocations } from "@/lib/homepage/homepage-map-locations";
import { HomepageCatalogIndex } from "@/lib/homepage/homepage-catalog-index";
import { getHomepageCatalogDatasets } from "@/lib/homepage/catalog-datasets";
import {
  recordHomepageBrowserTiming,
  type HomepageBrowserTimingStage,
} from "@/lib/homepage/browser-performance";
import {
  mergeHomepageEnrichment,
  mergeHomepageCompletion,
  mergeHomepageOptionalInitial,
  projectHomepageInitialSnapshot,
  shouldApplyHomepageResponse,
} from "@/lib/homepage/homepage-progressive";
import { getRegionConfig } from "@/lib/regions/config";
import {
  DEFAULT_PLACE_CATEGORIES,
  OPTIONAL_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/lib/map-places/place-categories";
import type { ApiError, ApiResult } from "@/types/api";
import {
  isHomepageCompletionSnapshot,
  type HomepageCompletionSnapshot,
} from "@/types/homepage-completion";
import {
  isHomepageEnrichmentSnapshot,
  type HomepageEnrichmentSnapshot,
} from "@/types/homepage-enrichment";
import {
  isHomepageInitialPlacesSnapshot,
  type HomepageInitialPlacesSnapshot,
} from "@/types/homepage-initial";
import {
  isHomepageOptionalSnapshot,
  type HomepageOptionalDatasetId,
  type HomepageOptionalSnapshot,
} from "@/types/homepage-optional";
import {
  HOMEPAGE_PLACE_LAYERS,
  type HomepagePlacesSnapshot,
} from "@/types/homepage-places";
import type { RegionId } from "@/types/region";

const EMPTY_ROUTE_COORDINATES: [] = [];
const STRICT_EFFECT_ABORT_GRACE_MS = 50;
type HomepageOptionalCategory = (typeof OPTIONAL_PLACE_CATEGORIES)[number];
type HomepageOptionalLoadState = Record<
  HomepageOptionalCategory,
  "idle" | "loading" | "ready" | "error"
>;
const EMPTY_OPTIONAL_LOAD_STATE: HomepageOptionalLoadState = {
  shopping: "idle",
  veterinary: "idle",
  pet_shop: "idle",
};
const browserOptionalDatasetCache = new Map<string, HomepageOptionalSnapshot>();

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

function parseHomepageResult<T>(
  value: unknown,
  validate: (data: unknown) => data is T,
): ApiResult<T> | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") return null;
  const requestId =
    typeof value.requestId === "string" ? value.requestId : "homepage";
  if (value.ok) {
    return validate(value.data)
      ? { ok: true, data: value.data, requestId }
      : null;
  }
  return isApiError(value.error)
    ? { ok: false, error: value.error, requestId }
    : null;
}

async function requestHomepageData<T>({
  url,
  stage,
  validate,
  signal,
}: {
  url: string;
  stage: HomepageBrowserTimingStage;
  validate: (data: unknown) => data is T;
  signal?: AbortSignal;
}): Promise<ApiResult<T>> {
  const requestStartedAt = performance.now();
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  recordHomepageBrowserTiming(stage, "headers", requestStartedAt);
  const downloadStartedAt = performance.now();
  const raw = await response.text();
  recordHomepageBrowserTiming(stage, "download", downloadStartedAt);
  let value: unknown;
  const parseStartedAt = performance.now();
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: GENERIC_ERROR, requestId: "homepage" };
  } finally {
    recordHomepageBrowserTiming(stage, "parse", parseStartedAt);
  }
  const validationStartedAt = performance.now();
  const body = parseHomepageResult(value, validate);
  recordHomepageBrowserTiming(stage, "validation", validationStartedAt);
  if (!body || (!response.ok && body.ok)) {
    return { ok: false, error: GENERIC_ERROR, requestId: "homepage" };
  }
  return body;
}

function requestHomepageInitial(
  region: RegionId,
  signal?: AbortSignal,
): Promise<ApiResult<HomepageInitialPlacesSnapshot>> {
  const params = new URLSearchParams({
    version: "1",
    region,
    scope: "default",
    providers: "default",
  });
  return requestHomepageData({
    url: `/api/homepage/places/initial?${params}`,
    stage: "initial",
    validate: isHomepageInitialPlacesSnapshot,
    signal,
  });
}

function requestHomepageOptional(
  region: RegionId,
  dataset: HomepageOptionalDatasetId,
  signal?: AbortSignal,
): Promise<ApiResult<HomepageOptionalSnapshot>> {
  const params = new URLSearchParams({ version: "1", region, scope: "optional", dataset });
  return requestHomepageData({
    url: `/api/homepage/places/optional?${params}`,
    stage: "optional",
    validate: isHomepageOptionalSnapshot,
    signal,
  });
}

function requestHomepageEnrichment(
  region: RegionId,
  signal?: AbortSignal,
): Promise<ApiResult<HomepageEnrichmentSnapshot>> {
  return requestHomepageData({
    url: `/api/homepage/places/enrichment?version=1&region=${encodeURIComponent(region)}&scope=featured`,
    stage: "enrichment",
    validate: isHomepageEnrichmentSnapshot,
    signal,
  });
}

function requestHomepageCompletion(
  initial: HomepageInitialPlacesSnapshot,
  signal?: AbortSignal,
): Promise<ApiResult<HomepageCompletionSnapshot>> {
  const params = new URLSearchParams({
    version: "1",
    region: initial.region,
    scope: "default",
    dataset: "default-map",
    base: initial.dataVersion,
    generation: initial.generationId,
    continuations: JSON.stringify(initial.continuations),
  });
  return requestHomepageData({
    url: `/api/homepage/places/completion?${params}`,
    stage: "completion",
    validate: isHomepageCompletionSnapshot,
    signal,
  });
}

function scheduleLowPriority(callback: () => void): () => void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 250 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(callback, 0);
  return () => globalThis.clearTimeout(id);
}

function HomepageLiveSkeleton({ regionLabel }: { regionLabel: string }) {
  return (
    <div className="homepage-live-loading" aria-live="polite" aria-busy="true">
      <section className="homepage-map-loading" aria-label={`${regionLabel} 장소 작업 화면 불러오는 중`}>
        <div className="homepage-map-loading__canvas">
          <div className="homepage-loading-copy"><span /><span /><span /></div>
          <p>저장된 공식·공개 장소 지도를 불러오고 있어요.</p>
        </div>
        <div className="homepage-map-loading__list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => <span key={index} />)}
        </div>
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

function markEnrichmentUnavailable(
  current: HomepagePlacesSnapshot | null,
): HomepagePlacesSnapshot | null {
  return current ? {
    ...current,
    official: { ...current.official, featuredState: "unavailable" },
  } : current;
}

type PendingRequest<T> = {
  key: string;
  controller: AbortController;
  promise: Promise<ApiResult<T>>;
};

export function HomepageLiveExperience({
  staticMapEnabled = false,
  regionId = "busan",
}: {
  staticMapEnabled?: boolean;
  regionId?: RegionId;
}) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogState, setCatalogState] = useState(() => ({
    snapshot: null as HomepagePlacesSnapshot | null,
    index: new HomepageCatalogIndex(regionId, []),
  }));
  const snapshot = catalogState.snapshot;
  const catalogIndex = catalogState.index;
  const setSnapshot = useCallback((update: SetStateAction<HomepagePlacesSnapshot | null>) => {
    setCatalogState((current) => {
      const nextSnapshot = typeof update === "function" ? update(current.snapshot) : update;
      return {
        snapshot: nextSnapshot,
        index: new HomepageCatalogIndex(
          regionId,
          nextSnapshot?.markers ?? [],
          current.index,
        ),
      };
    });
  }, [regionId]);
  const [error, setError] = useState<ApiError>(GENERIC_ERROR);
  const [retryToken, setRetryToken] = useState(0);
  const initialKey = `${regionId}:${retryToken}`;
  const [loadedInitialKey, setLoadedInitialKey] = useState<string | null>(null);
  const [baseRequestKey, setBaseRequestKey] = useState<string | null>(null);
  const [requestedSelectionId, setRequestedSelectionId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [activeCategories, setActiveCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [draftCategories, setDraftCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [completionState, setCompletionState] = useState<"initial" | "loading" | "complete" | "partial">("initial");
  const [optionalLoadState, setOptionalLoadState] = useState<HomepageOptionalLoadState>(EMPTY_OPTIONAL_LOAD_STATE);
  const [readyOptionalDatasets, setReadyOptionalDatasets] = useState<HomepageOptionalDatasetId[]>([]);
  const region = getRegionConfig(regionId);
  const optionalDatasetByCategory = useMemo(() => {
    const entries = (region ? getHomepageCatalogDatasets(region, "optional") : [])
      .flatMap((dataset) => dataset.categories.map((category) => [
        category,
        dataset.id as HomepageOptionalDatasetId,
      ] as const));
    return new Map<PlaceCategory, HomepageOptionalDatasetId>(entries);
  }, [region]);
  const availableCategories = useMemo(
    () => PLACE_CATEGORIES.filter((category) =>
      !OPTIONAL_PLACE_CATEGORIES.includes(category as HomepageOptionalCategory) ||
      optionalDatasetByCategory.has(category)),
    [optionalDatasetByCategory],
  );
  const initialRequestRef = useRef<PendingRequest<HomepageInitialPlacesSnapshot> | null>(null);
  const completionRequestRef = useRef<PendingRequest<HomepageCompletionSnapshot> | null>(null);
  const enrichmentRequestRef = useRef<PendingRequest<HomepageEnrichmentSnapshot> | null>(null);
  const optionalRequestsRef = useRef(new Map<HomepageOptionalDatasetId, PendingRequest<HomepageOptionalSnapshot>>());
  const initialAbortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enrichmentAbortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionAbortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestKeyRef = useRef<string | null>(null);
  const stateUpdateStartedAtRef = useRef<number | null>(null);
  const completionUpdateStartedAtRef = useRef<number | null>(null);
  const completionMapUpdatePendingRef = useRef(false);
  const initialUsableAtRef = useRef<number | null>(null);
  const baseInitialRef = useRef<HomepageInitialPlacesSnapshot | null>(null);
  const filterUpdateStartedAtRef = useRef<number | null>(null);
  const pendingFilterCategoriesRef = useRef<PlaceCategory[] | null>(null);
  const readyOptionalDatasetsRef = useRef(new Set<HomepageOptionalDatasetId>());
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
    if (initialRequestRef.current && initialRequestRef.current.key !== initialKey) {
      initialRequestRef.current.controller.abort();
      initialRequestRef.current = null;
    }
    enrichmentRequestRef.current?.controller.abort();
    enrichmentRequestRef.current = null;
    for (const request of optionalRequestsRef.current.values()) request.controller.abort();
    optionalRequestsRef.current.clear();
    completionRequestRef.current?.controller.abort();
    completionRequestRef.current = null;
    baseInitialRef.current = null;
    completionMapUpdatePendingRef.current = false;
    pendingFilterCategoriesRef.current = null;
    readyOptionalDatasetsRef.current.clear();
    activeRequestKeyRef.current = null;
    const pending = initialRequestRef.current ?? (() => {
      const controller = new AbortController();
      return {
        key: initialKey,
        controller,
        promise: requestHomepageInitial(regionId, controller.signal),
      };
    })();
    if (initialAbortTimerRef.current) clearTimeout(initialAbortTimerRef.current);
    initialAbortTimerRef.current = null;
    initialRequestRef.current = pending;
    void pending.promise.then((result) => {
      if (!active || pending.key !== initialKey) return;
      if (!result.ok) {
        setSnapshot(null);
        setError(result.error);
        setLoadedInitialKey(initialKey);
        setLoadState("error");
        return;
      }
      if (
        result.data.region !== regionId ||
        result.data.scope !== "default" ||
        result.data.providers !== "default"
      ) {
        setSnapshot(null);
        setError(GENERIC_ERROR);
        setLoadedInitialKey(initialKey);
        setLoadState("error");
        return;
      }
      const requestKey = `${regionId}:${result.data.dataVersion}`;
      activeRequestKeyRef.current = requestKey;
      baseInitialRef.current = result.data;
      stateUpdateStartedAtRef.current = performance.now();
      setSnapshot(projectHomepageInitialSnapshot(result.data));
      setLoadedInitialKey(initialKey);
      setBaseRequestKey(requestKey);
      setActiveCategories([...DEFAULT_PLACE_CATEGORIES]);
      setDraftCategories([...DEFAULT_PLACE_CATEGORIES]);
      setOptionalLoadState(EMPTY_OPTIONAL_LOAD_STATE);
      setReadyOptionalDatasets([]);
      setLoadState("ready");
    }).catch(() => {
      if (!active || pending.controller.signal.aborted) return;
      setSnapshot(null);
      setError(GENERIC_ERROR);
      setLoadedInitialKey(initialKey);
      setLoadState("error");
    });
    return () => {
      active = false;
      initialAbortTimerRef.current = setTimeout(() => {
        if (initialRequestRef.current !== pending) return;
        pending.controller.abort();
        initialRequestRef.current = null;
      }, STRICT_EFFECT_ABORT_GRACE_MS);
    };
  }, [initialKey, regionId, setSnapshot]);

  useEffect(() => {
    if (loadState !== "ready" || !snapshot || stateUpdateStartedAtRef.current === null) return;
    recordHomepageBrowserTiming("initial", "react_commit", stateUpdateStartedAtRef.current);
    initialUsableAtRef.current = performance.now();
    stateUpdateStartedAtRef.current = null;
  }, [loadState, snapshot]);

  useEffect(() => {
    const initial = baseInitialRef.current;
    if (!baseRequestKey || loadState !== "ready" || !initial || initial.scope !== "default" ||
      !shouldApplyHomepageResponse(activeRequestKeyRef.current, baseRequestKey)) return;
    const needsCompletion = initial.continuations.some(({ complete }) => !complete);
    if (!needsCompletion) {
      setCompletionState("complete");
      return;
    }
    let active = true;
    let pending: PendingRequest<HomepageCompletionSnapshot> | null = null;
    const cancelSchedule = scheduleLowPriority(() => {
      if (!active || !shouldApplyHomepageResponse(activeRequestKeyRef.current, baseRequestKey)) return;
      if (initialUsableAtRef.current !== null) {
        recordHomepageBrowserTiming("completion", "request_delay", initialUsableAtRef.current);
      }
      if (completionRequestRef.current && completionRequestRef.current.key !== baseRequestKey) {
        completionRequestRef.current.controller.abort();
        completionRequestRef.current = null;
      }
      pending = completionRequestRef.current ?? (() => {
        const controller = new AbortController();
        return {
          key: baseRequestKey,
          controller,
          promise: requestHomepageCompletion(initial, controller.signal),
        };
      })();
      completionRequestRef.current = pending;
      setCompletionState("loading");
      void pending.promise.then((result) => {
        if (!active || !pending || !shouldApplyHomepageResponse(activeRequestKeyRef.current, pending.key)) return;
        if (!result.ok) {
          setCompletionState("partial");
          return;
        }
        const mergeStartedAt = performance.now();
        completionUpdateStartedAtRef.current = mergeStartedAt;
        completionMapUpdatePendingRef.current = true;
        setSnapshot((current) => current
          ? mergeHomepageCompletion(current, result.data, initial, regionId)
          : current);
        recordHomepageBrowserTiming("completion", "deduplication", mergeStartedAt);
        setCompletionState(result.data.complete ? "complete" : "partial");
      }).catch(() => {
        if (active && pending && !pending.controller.signal.aborted &&
          shouldApplyHomepageResponse(activeRequestKeyRef.current, pending.key)) setCompletionState("partial");
      });
    });
    if (completionAbortTimerRef.current) clearTimeout(completionAbortTimerRef.current);
    completionAbortTimerRef.current = null;
    return () => {
      active = false;
      cancelSchedule();
      if (!pending) return;
      const pendingRequest = pending;
      completionAbortTimerRef.current = setTimeout(() => {
        if (completionRequestRef.current !== pendingRequest) return;
        pendingRequest.controller.abort();
        completionRequestRef.current = null;
      }, STRICT_EFFECT_ABORT_GRACE_MS);
    };
  }, [baseRequestKey, loadState, regionId, setSnapshot]);

  useEffect(() => {
    if (completionUpdateStartedAtRef.current === null) return;
    recordHomepageBrowserTiming("completion", "react_commit", completionUpdateStartedAtRef.current);
    completionUpdateStartedAtRef.current = null;
  }, [snapshot]);

  const handleMapDataUpdate = useCallback(() => {
    if (!completionMapUpdatePendingRef.current) return;
    completionMapUpdatePendingRef.current = false;
    if (initialUsableAtRef.current !== null) {
      recordHomepageBrowserTiming("completion", "total", initialUsableAtRef.current);
    }
  }, []);

  useEffect(() => {
    if (
      !baseRequestKey ||
      !region?.homepageFeaturedEnabled ||
      !shouldApplyHomepageResponse(activeRequestKeyRef.current, baseRequestKey)
    ) return;
    let active = true;
    if (enrichmentRequestRef.current && enrichmentRequestRef.current.key !== baseRequestKey) {
      enrichmentRequestRef.current.controller.abort();
      enrichmentRequestRef.current = null;
    }
    const pending = enrichmentRequestRef.current ?? (() => {
      const controller = new AbortController();
      return {
        key: baseRequestKey,
        controller,
        promise: requestHomepageEnrichment(regionId, controller.signal),
      };
    })();
    if (enrichmentAbortTimerRef.current) clearTimeout(enrichmentAbortTimerRef.current);
    enrichmentAbortTimerRef.current = null;
    enrichmentRequestRef.current = pending;
    void pending.promise.then((result) => {
      if (!active || !shouldApplyHomepageResponse(activeRequestKeyRef.current, pending.key)) return;
      if (!result.ok) {
        setSnapshot(markEnrichmentUnavailable);
        return;
      }
      setSnapshot((current) => current
        ? mergeHomepageEnrichment(current, result.data, regionId)
        : current);
    }).catch(() => {
      if (!active || pending.controller.signal.aborted ||
        !shouldApplyHomepageResponse(activeRequestKeyRef.current, pending.key)) return;
      setSnapshot(markEnrichmentUnavailable);
    });
    return () => {
      active = false;
      enrichmentAbortTimerRef.current = setTimeout(() => {
        if (enrichmentRequestRef.current !== pending) return;
        pending.controller.abort();
        enrichmentRequestRef.current = null;
      }, STRICT_EFFECT_ABORT_GRACE_MS);
    };
  }, [baseRequestKey, region?.homepageFeaturedEnabled, regionId, setSnapshot]);

  useEffect(() => () => {
    enrichmentRequestRef.current?.controller.abort();
    enrichmentRequestRef.current = null;
    for (const request of optionalRequestsRef.current.values()) request.controller.abort();
    optionalRequestsRef.current.clear();
    completionRequestRef.current?.controller.abort();
    completionRequestRef.current = null;
    activeRequestKeyRef.current = null;
    if (enrichmentAbortTimerRef.current) clearTimeout(enrichmentAbortTimerRef.current);
    if (completionAbortTimerRef.current) clearTimeout(completionAbortTimerRef.current);
  }, []);

  const retry = () => {
    initialRequestRef.current?.controller.abort();
    enrichmentRequestRef.current?.controller.abort();
    for (const request of optionalRequestsRef.current.values()) request.controller.abort();
    completionRequestRef.current?.controller.abort();
    initialRequestRef.current = null;
    enrichmentRequestRef.current = null;
    optionalRequestsRef.current.clear();
    completionRequestRef.current = null;
    baseInitialRef.current = null;
    completionMapUpdatePendingRef.current = false;
    pendingFilterCategoriesRef.current = null;
    readyOptionalDatasetsRef.current.clear();
    setReadyOptionalDatasets([]);
    activeRequestKeyRef.current = null;
    if (initialAbortTimerRef.current) clearTimeout(initialAbortTimerRef.current);
    if (enrichmentAbortTimerRef.current) clearTimeout(enrichmentAbortTimerRef.current);
    initialAbortTimerRef.current = null;
    enrichmentAbortTimerRef.current = null;
    setLoadedInitialKey(null);
    setBaseRequestKey(null);
    setSnapshot(null);
    setCompletionState("initial");
    setOptionalLoadState(EMPTY_OPTIONAL_LOAD_STATE);
    setRequestedSelectionId(null);
    setLoadState("loading");
    setRetryToken((current) => current + 1);
  };

  const visibleMarkers = useMemo(
    () => catalogIndex.filter({ categories: activeCategories }).markers,
    [activeCategories, catalogIndex],
  );
  const locations = useMemo(
    () => createHomepageMapLocations(visibleMarkers),
    [visibleMarkers],
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
  useEffect(() => {
    if (filterUpdateStartedAtRef.current === null) return;
    recordHomepageBrowserTiming("filter", "react_commit", filterUpdateStartedAtRef.current);
    filterUpdateStartedAtRef.current = null;
  }, [visibleMarkers]);

  if (loadedInitialKey !== initialKey || loadState === "loading") {
    return <HomepageLiveSkeleton regionLabel={region?.displayName ?? regionId} />;
  }
  if (loadState === "error" || !snapshot) {
    return <HomepageLiveError error={error} onRetry={retry} />;
  }

  const categoryCounts = Object.fromEntries(PLACE_CATEGORIES.map((category) => {
    const dataset = optionalDatasetByCategory.get(category);
    const optionalLayer = category === "veterinary" ? "veterinary" : category === "pet_shop" ? "pet_shop" : null;
    if (dataset && !readyOptionalDatasets.includes(dataset) &&
      (!optionalLayer || (snapshot.layers[optionalLayer].state !== "ready" && snapshot.layers[optionalLayer].state !== "empty"))) {
      return [category, null];
    }
    return [category, catalogIndex.countCategory(category)];
  })) as Record<PlaceCategory, number | null>;
  const publicUnavailable = HOMEPAGE_PLACE_LAYERS.slice(1).some(
    (layer) => snapshot.layers[layer].state === "unavailable",
  );

  const loadOptionalPlaces = (categories: readonly PlaceCategory[]) => {
    if (!baseRequestKey) return;
    const requestedCategories = categories.filter(
      (category): category is HomepageOptionalCategory =>
        OPTIONAL_PLACE_CATEGORIES.includes(category as HomepageOptionalCategory) &&
        optionalDatasetByCategory.has(category),
    );
    for (const category of requestedCategories) {
      const dataset = optionalDatasetByCategory.get(category);
      if (!dataset || readyOptionalDatasetsRef.current.has(dataset)) continue;
      const requestKey = `${baseRequestKey}:${dataset}`;
      const browserCacheKey = `${regionId}:${dataset}`;
      const retained = browserOptionalDatasetCache.get(browserCacheKey);
      if (retained) {
        const mergeStartedAt = performance.now();
        setSnapshot((current) => current
          ? mergeHomepageOptionalInitial(current, retained, regionId)
          : current);
        recordHomepageBrowserTiming("optional", "deduplication", mergeStartedAt);
        readyOptionalDatasetsRef.current.add(dataset);
        setReadyOptionalDatasets((current) => current.includes(dataset)
          ? current
          : [...current, dataset]);
        setOptionalLoadState((current) => ({ ...current, [category]: "ready" }));
        continue;
      }
      const currentPending = optionalRequestsRef.current.get(dataset);
      if (currentPending && currentPending.key !== requestKey) {
        currentPending.controller.abort();
        optionalRequestsRef.current.delete(dataset);
      }
      const pending = optionalRequestsRef.current.get(dataset) ?? (() => {
        const controller = new AbortController();
        return {
          key: requestKey,
          controller,
          promise: requestHomepageOptional(regionId, dataset, controller.signal),
        };
      })();
      optionalRequestsRef.current.set(dataset, pending);
      setOptionalLoadState((current) => ({ ...current, [category]: "loading" }));
      void pending.promise.then((result) => {
        if (!shouldApplyHomepageResponse(activeRequestKeyRef.current, baseRequestKey)) return;
        if (
          !result.ok ||
          result.data.region !== regionId ||
          result.data.scope !== "optional" ||
          result.data.dataset !== dataset
        ) {
          setOptionalLoadState((current) => ({ ...current, [category]: "error" }));
          optionalRequestsRef.current.delete(dataset);
          return;
        }
        const mergeStartedAt = performance.now();
        setSnapshot((current) => current
          ? mergeHomepageOptionalInitial(current, result.data, regionId)
          : current);
        recordHomepageBrowserTiming("optional", "deduplication", mergeStartedAt);
        browserOptionalDatasetCache.set(browserCacheKey, result.data);
        readyOptionalDatasetsRef.current.add(dataset);
        setReadyOptionalDatasets((current) => current.includes(dataset)
          ? current
          : [...current, dataset]);
        setOptionalLoadState((current) => ({ ...current, [category]: "ready" }));
        const pendingCategories = pendingFilterCategoriesRef.current;
        const pendingDatasets = pendingCategories?.flatMap((pendingCategory) =>
          optionalDatasetByCategory.get(pendingCategory) ?? []);
        if (pendingCategories && pendingDatasets?.every((pendingDataset) =>
          readyOptionalDatasetsRef.current.has(pendingDataset))) {
          pendingFilterCategoriesRef.current = null;
          setActiveCategories(pendingCategories);
        }
      }).catch(() => {
        if (!pending.controller.signal.aborted &&
          shouldApplyHomepageResponse(activeRequestKeyRef.current, baseRequestKey)) {
          setOptionalLoadState((current) => ({ ...current, [category]: "error" }));
        }
        optionalRequestsRef.current.delete(dataset);
      });
    }
  };
  const toggleDraftCategory = (category: PlaceCategory) => {
    if (!draftCategories.includes(category)) loadOptionalPlaces([category]);
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
    const startedAt = performance.now();
    catalogIndex.filter({ categories: draftCategories });
    recordHomepageBrowserTiming("filter", "computation", startedAt);
    filterUpdateStartedAtRef.current = startedAt;
    setFilterOpen(false);
    requestAnimationFrame(() => recordHomepageBrowserTiming("filter", "feedback", startedAt));
    const unresolvedOptional = draftCategories.flatMap((category) =>
      optionalDatasetByCategory.get(category) ?? [])
      .filter((dataset) => !readyOptionalDatasetsRef.current.has(dataset));
    if (unresolvedOptional.length > 0) {
      pendingFilterCategoriesRef.current = [...draftCategories];
    } else {
      pendingFilterCategoriesRef.current = null;
      setActiveCategories([...draftCategories]);
    }
    loadOptionalPlaces(draftCategories);
  };
  const resetDraftFilters = () => {
    setDraftCategories([...DEFAULT_PLACE_CATEGORIES]);
  };

  return (
    <div className="homepage-live-ready">
      <section className="homepage-map-section" aria-labelledby="homepage-map-title">
        <h2 id="homepage-map-title" className="sr-only">
          {region?.displayName ?? regionId} 공식 관광 장소 {snapshot.official.totalCount}곳
        </h2>
        <div className="homepage-workbench-switch" role="group" aria-label="홈 장소 지도 또는 목록 보기">
          <button type="button" aria-pressed={mobileView === "list"} onClick={() => setMobileView("list")}><List size={17} aria-hidden="true" />목록</button>
          <button type="button" aria-pressed={mobileView === "map"} onClick={() => setMobileView("map")}><MapIcon size={17} aria-hidden="true" />지도</button>
        </div>
        <div className="homepage-workbench" data-mobile-view={mobileView}>
          <div className="homepage-workbench__map">
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
                  <form noValidate onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
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
                        categories={availableCategories}
                        active={draftCategories}
                        counts={categoryCounts}
                        onToggle={toggleDraftCategory}
                      />
                      {publicUnavailable ? <p className="homepage-map-provider-status" role="status">일부 카카오 장소 데이터 준비 중</p> : null}
                      {([...OPTIONAL_PLACE_CATEGORIES] as HomepageOptionalCategory[])
                        .filter((category) => optionalDatasetByCategory.has(category))
                        .map((category) => optionalLoadState[category] === "loading" ? (
                          <p key={category} className="homepage-map-provider-status" role="status">{PLACE_CATEGORY_LABELS[category]} 데이터를 불러오는 중</p>
                        ) : optionalLoadState[category] === "error" ? (
                          <p key={category} className="homepage-map-provider-status" role="alert">{PLACE_CATEGORY_LABELS[category]}을 불러오지 못했습니다. <button type="button" onClick={() => loadOptionalPlaces([category])}>다시 시도</button></p>
                        ) : null)}
                    </div>
                    <div className="explorer-filter-dropdown__actions">
                      <button type="button" className="explorer-filter-dropdown__reset" onClick={resetDraftFilters}><RotateCcw size={19} aria-hidden="true" />초기화</button>
                      <button type="submit" className="explorer-filter-dropdown__apply">적용하기 <SlidersHorizontal size={18} aria-hidden="true" /></button>
                    </div>
                  </form>
                </section>
              ) : null}
            </div>
            <Link href={`/results?tab=catalog&region=${encodeURIComponent(regionId)}`} className="homepage-map-open-link">
              지도 크게 보기 <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <div className="homepage-map-canvas-wrap">
              <MapPanel
                regionId={regionId}
                title={`${region?.displayName ?? regionId} 공식·공개 장소 지도`}
                locationLabel={`${region?.displayName ?? regionId} 전체`}
                locations={locations}
                routeCoordinates={EMPTY_ROUTE_COORDINATES}
                selectedLocationId={selectedLocationId}
                onLocationSelect={(id) => setRequestedSelectionId(id ?? defaultSelectionId)}
                onDataUpdate={handleMapDataUpdate}
                viewportKey={`homepage:${regionId}:mixed-source`}
                showLocationLabel={false}
                showSelectionInfo={false}
                emptyMessage="선택한 장소 유형에 지도에 표시할 장소가 없습니다."
              />
            </div>
          </div>
          <aside className="homepage-workbench__list" aria-label={`${region?.displayName ?? regionId} 장소 목록`}>
            <header>
              <div><p className="homepage-kicker">장소 찾기</p><h3>함께 갈 곳을 지도에서 확인해 보세요</h3></div>
              <strong>{visibleMarkers.length.toLocaleString("ko-KR")}곳</strong>
            </header>
            <div className="homepage-workbench__scroller">
              {visibleMarkers.map((marker) => (
                <button
                  type="button"
                  key={marker.id}
                  className="homepage-workbench-row"
                  aria-pressed={selectedLocationId === marker.id}
                  onClick={() => setRequestedSelectionId(marker.id)}
                >
                  {marker.layer === "official" ? (
                    <PlaceImage imageUrl={marker.imageUrl} title={marker.name} className="homepage-workbench-row__image" sizes="78px" />
                  ) : (
                    <span className={`homepage-workbench-row__source homepage-workbench-row__source--${marker.layer}`} aria-hidden="true"><MapPin size={19} /></span>
                  )}
                  <span className="homepage-workbench-row__body">
                    <span className="homepage-workbench-row__meta">
                      <span>{PLACE_CATEGORY_LABELS[marker.category]}</span>
                      {marker.isAllowed ? <span><ShieldCheck size={12} aria-hidden="true" />동반 가능</span> : <span>{marker.statusLabel}</span>}
                    </span>
                    <strong>{marker.name}</strong>
                    <small><MapPin size={12} aria-hidden="true" />{marker.district ?? marker.address}</small>
                    <i>{marker.sourceLabel}</i>
                  </span>
                </button>
              ))}
            </div>
            {completionState === "loading" ? <p className="homepage-map-provider-status" role="status">나머지 저장 장소를 지도에 추가 중</p> : completionState === "partial" ? <p className="homepage-map-provider-status" role="status">일부 저장 장소를 불러오지 못했지만 현재 지도와 목록은 계속 사용할 수 있습니다.</p> : null}
          </aside>
        </div>
      </section>

      <HomepagePlaceCarousel
        key={regionId}
        places={snapshot.cards}
        layers={snapshot.layers}
        featuredState={snapshot.official.featuredState}
        staticMapEnabled={staticMapEnabled}
        onOptionalLayerRequest={(layer) => loadOptionalPlaces([layer])}
      />
    </div>
  );
}
