"use client";

import { useRouter } from "next/navigation";
import {
  MapPin,
  RotateCcw,
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
import {
  HomePlaceWorkbench,
  HomePlaceWorkbenchError,
  HomePlaceWorkbenchLoading,
} from "@/components/home/home-place-workbench";
import { HomeSelectedItineraryTray } from "@/components/home/home-selected-itinerary-tray";
import {
  homepageSelectionCandidates,
  mergeHomepageSelectionMetadata,
} from "@/components/home/homepage-selected-itinerary";
import { HomepagePlaceCarousel } from "@/components/home/official-place-carousel";
import { PlaceCategoryToggleGroup } from "@/components/places/place-category-toggle-group";
import { useSelectedItinerarySelection } from "@/components/places/use-selected-itinerary-selection";
import { HomepageCatalogIndex } from "@/lib/homepage/homepage-catalog-index";
import { getHomepageCatalogDatasets } from "@/lib/homepage/catalog-datasets";
import type { SelectedItineraryPlace } from "@/lib/storage/selected-itinerary-storage";
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
    credentials: "same-origin",
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

function HomepageLiveSkeleton({
  regionId,
  regionLabel,
}: {
  regionId: RegionId;
  regionLabel: string;
}) {
  return (
    <div className="homepage-live-loading" aria-live="polite" aria-busy="true">
      <HomePlaceWorkbenchLoading regionId={regionId} regionLabel={regionLabel} />
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
  regionId,
  regionLabel,
}: {
  error: ApiError;
  onRetry: () => void;
  regionId: RegionId;
  regionLabel: string;
}) {
  return (
    <HomePlaceWorkbenchError
      error={error}
      onRetry={onRetry}
      regionId={regionId}
      regionLabel={regionLabel}
    />
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
  const router = useRouter();
  const itinerarySelection = useSelectedItinerarySelection({
    regionId,
    surfaceAddLimit: 3,
  });
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
  const [activeCategories, setActiveCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [draftCategories, setDraftCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPlacement, setFilterPlacement] = useState<{
    side: "above" | "below";
    maxHeight: number;
  }>({ side: "below", maxHeight: 520 });
  const [completionState, setCompletionState] = useState<"initial" | "loading" | "complete" | "partial">("initial");
  const [completionRetryToken, setCompletionRetryToken] = useState(0);
  const [optionalLoadState, setOptionalLoadState] = useState<HomepageOptionalLoadState>(EMPTY_OPTIONAL_LOAD_STATE);
  const [readyOptionalDatasets, setReadyOptionalDatasets] = useState<HomepageOptionalDatasetId[]>([]);
  const [selectionMetadata, setSelectionMetadata] = useState<Map<string, SelectedItineraryPlace>>(
    () => new Map(),
  );
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
    if (!itinerarySelection.hydrated || itinerarySelection.snapshot.regionId === regionId) return;
    itinerarySelection.resetRegion(regionId, {
      preserveAutoFill: true,
      message: "지역이 달라 기존 선택을 정리했습니다.",
    });
  }, [itinerarySelection, regionId]);

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
    if (!filterOpen) return;
    const updatePlacement = () => {
      const rect = filterButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const side = below >= 360 || below >= above ? "below" : "above";
      const available = side === "below" ? below : above;
      setFilterPlacement({ side, maxHeight: Math.max(240, Math.min(520, available)) });
    };
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
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
      setSelectionMetadata(() => mergeHomepageSelectionMetadata(
        new Map(),
        result.data.markers,
        regionId,
      ));
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
        setSelectionMetadata((current) => mergeHomepageSelectionMetadata(
          current,
          result.data.markers,
          regionId,
        ));
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
  }, [baseRequestKey, completionRetryToken, loadState, regionId, setSnapshot]);

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

  const retryCompletion = () => {
    completionRequestRef.current?.controller.abort();
    completionRequestRef.current = null;
    setCompletionState("loading");
    setCompletionRetryToken((current) => current + 1);
  };

  const visibleMarkers = useMemo(
    () => catalogIndex.filter({ categories: activeCategories }).markers,
    [activeCategories, catalogIndex],
  );
  const visibleIds = useMemo(() => new Set(visibleMarkers.map(({ id }) => id)), [visibleMarkers]);
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
  const selectionCandidates = useMemo(
    () => homepageSelectionCandidates(
      selectionMetadata,
      snapshot?.markers ?? [],
    ),
    [selectionMetadata, snapshot],
  );

  if (loadedInitialKey !== initialKey || loadState === "loading") {
    return (
      <HomepageLiveSkeleton
        regionId={regionId}
        regionLabel={region?.displayName ?? regionId}
      />
    );
  }
  if (loadState === "error" || !snapshot) {
    return (
      <HomepageLiveError
        error={error}
        onRetry={retry}
        regionId={regionId}
        regionLabel={region?.displayName ?? regionId}
      />
    );
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
        setSelectionMetadata((current) => mergeHomepageSelectionMetadata(
          current,
          retained.markers,
          regionId,
        ));
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
        setSelectionMetadata((current) => mergeHomepageSelectionMetadata(
          current,
          result.data.markers,
          regionId,
        ));
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
  const filterControl = (
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
          data-placement={filterPlacement.side}
          style={{ maxHeight: `${filterPlacement.maxHeight}px` }}
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
              {([...OPTIONAL_PLACE_CATEGORIES] as HomepageOptionalCategory[])
                .filter((category) => optionalDatasetByCategory.has(category))
                .map((category) => optionalLoadState[category] === "loading" ? (
                  <p key={category} className="homepage-map-provider-status" role="status">
                    {PLACE_CATEGORY_LABELS[category]} 데이터를 불러오는 중
                  </p>
                ) : optionalLoadState[category] === "error" ? (
                  <p key={category} className="homepage-map-provider-status" role="alert">
                    {PLACE_CATEGORY_LABELS[category]}을 불러오지 못했습니다.{" "}
                    <button type="button" onClick={() => loadOptionalPlaces([category])}>다시 시도</button>
                  </p>
                ) : null)}
            </div>
            <div className="explorer-filter-dropdown__actions">
              <button type="button" className="explorer-filter-dropdown__reset" onClick={resetDraftFilters}>
                <RotateCcw size={19} aria-hidden="true" />초기화
              </button>
              <button type="submit" className="explorer-filter-dropdown__apply">
                적용하기 <SlidersHorizontal size={18} aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );

  return (
    <div className="homepage-live-ready">
      <HomePlaceWorkbench
        regionId={regionId}
        regionLabel={region?.displayName ?? regionId}
        markers={visibleMarkers}
        selectedLocationId={selectedLocationId}
        onLocationFocus={setRequestedSelectionId}
        onMapDataUpdate={handleMapDataUpdate}
        filterControl={filterControl}
        selectionSnapshot={itinerarySelection.snapshot}
        selectionCandidates={selectionCandidates}
        onToggleItinerary={(place) => { itinerarySelection.toggle(place); }}
        completionState={completionState}
        onRetryCompletion={retryCompletion}
        providerUnavailable={publicUnavailable}
        staticMapEnabled={staticMapEnabled}
      />

      <HomeSelectedItineraryTray
        snapshot={itinerarySelection.snapshot}
        message={itinerarySelection.message}
        catalogHref={`/results?tab=catalog&region=${encodeURIComponent(regionId)}&mode=select`}
        onRemove={itinerarySelection.remove}
        onMove={itinerarySelection.move}
        onContinue={() => router.push("/planner/pet?mode=selected")}
      />

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
