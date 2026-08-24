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
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { HomepagePlaceCarousel } from "@/components/home/official-place-carousel";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceImage } from "@/components/places/place-image";
import { PlaceCategoryToggleGroup } from "@/components/places/place-category-toggle-group";
import { createHomepageMapLocations } from "@/lib/homepage/homepage-map-locations";
import { HomepageCatalogIndex } from "@/lib/homepage/homepage-catalog-index";
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
  HOMEPAGE_PLACE_LAYERS,
  type HomepageMapMarker,
  type HomepagePlaceLayer,
  type HomepagePlacesSnapshot,
} from "@/types/homepage-places";
import type { RegionId } from "@/types/region";

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
  scope: "default" | "optional",
  signal?: AbortSignal,
): Promise<ApiResult<HomepageInitialPlacesSnapshot>> {
  const params = new URLSearchParams({
    version: "1",
    region,
    scope,
    providers: scope === "default" ? "default" : "kakao",
  });
  return requestHomepageData({
    url: `/api/homepage/places/initial?${params}`,
    stage: scope === "default" ? "initial" : "optional",
    validate: isHomepageInitialPlacesSnapshot,
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
      <section className="homepage-map-loading" aria-label={`${regionLabel} 장소 지도 불러오는 중`}>
        <div className="homepage-loading-copy"><span /><span /><span /></div>
        <p>저장된 공식·공개 장소 지도를 불러오고 있어요.</p>
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

function markEnrichmentUnavailable(
  current: HomepagePlacesSnapshot | null,
): HomepagePlacesSnapshot | null {
  return current ? {
    ...current,
    official: { ...current.official, featuredState: "unavailable" },
  } : current;
}

function markOptionalLayersUnavailable(
  current: HomepagePlacesSnapshot | null,
): HomepagePlacesSnapshot | null {
  return current ? {
    ...current,
    layers: {
      ...current.layers,
      veterinary: { state: "unavailable", count: null, markerCount: null, enabledByDefault: false },
      pet_shop: { state: "unavailable", count: null, markerCount: null, enabledByDefault: false },
    },
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
  const [snapshot, setSnapshot] = useState<HomepagePlacesSnapshot | null>(null);
  const [error, setError] = useState<ApiError>(GENERIC_ERROR);
  const [retryToken, setRetryToken] = useState(0);
  const initialKey = `${regionId}:${retryToken}`;
  const [loadedInitialKey, setLoadedInitialKey] = useState<string | null>(null);
  const [baseRequestKey, setBaseRequestKey] = useState<string | null>(null);
  const [requestedSelectionId, setRequestedSelectionId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [draftCategories, setDraftCategories] = useState<PlaceCategory[]>([...DEFAULT_PLACE_CATEGORIES]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [completionState, setCompletionState] = useState<"initial" | "loading" | "complete" | "partial">("initial");
  const [filterPending, startFilterTransition] = useTransition();
  const region = getRegionConfig(regionId);
  const initialRequestRef = useRef<PendingRequest<HomepageInitialPlacesSnapshot> | null>(null);
  const completionRequestRef = useRef<PendingRequest<HomepageCompletionSnapshot> | null>(null);
  const enrichmentRequestRef = useRef<PendingRequest<HomepageEnrichmentSnapshot> | null>(null);
  const optionalRequestRef = useRef<PendingRequest<HomepageInitialPlacesSnapshot> | null>(null);
  const initialAbortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enrichmentAbortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionAbortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestKeyRef = useRef<string | null>(null);
  const stateUpdateStartedAtRef = useRef<number | null>(null);
  const completionUpdateStartedAtRef = useRef<number | null>(null);
  const initialUsableAtRef = useRef<number | null>(null);
  const baseInitialRef = useRef<HomepageInitialPlacesSnapshot | null>(null);
  const filterUpdateStartedAtRef = useRef<number | null>(null);
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
    optionalRequestRef.current?.controller.abort();
    optionalRequestRef.current = null;
    completionRequestRef.current?.controller.abort();
    completionRequestRef.current = null;
    baseInitialRef.current = null;
    activeRequestKeyRef.current = null;
    const pending = initialRequestRef.current ?? (() => {
      const controller = new AbortController();
      return {
        key: initialKey,
        controller,
        promise: requestHomepageInitial(regionId, "default", controller.signal),
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
  }, [initialKey, regionId]);

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
  }, [baseRequestKey, loadState, regionId]);

  useEffect(() => {
    if (completionUpdateStartedAtRef.current === null) return;
    recordHomepageBrowserTiming("completion", "react_commit", completionUpdateStartedAtRef.current);
    if (initialUsableAtRef.current !== null) {
      recordHomepageBrowserTiming("completion", "total", initialUsableAtRef.current);
    }
    completionUpdateStartedAtRef.current = null;
  }, [snapshot]);

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
  }, [baseRequestKey, region?.homepageFeaturedEnabled, regionId]);

  useEffect(() => () => {
    enrichmentRequestRef.current?.controller.abort();
    enrichmentRequestRef.current = null;
    optionalRequestRef.current?.controller.abort();
    optionalRequestRef.current = null;
    completionRequestRef.current?.controller.abort();
    completionRequestRef.current = null;
    activeRequestKeyRef.current = null;
    if (enrichmentAbortTimerRef.current) clearTimeout(enrichmentAbortTimerRef.current);
    if (completionAbortTimerRef.current) clearTimeout(completionAbortTimerRef.current);
  }, []);

  const retry = () => {
    initialRequestRef.current?.controller.abort();
    enrichmentRequestRef.current?.controller.abort();
    optionalRequestRef.current?.controller.abort();
    completionRequestRef.current?.controller.abort();
    initialRequestRef.current = null;
    enrichmentRequestRef.current = null;
    optionalRequestRef.current = null;
    completionRequestRef.current = null;
    baseInitialRef.current = null;
    activeRequestKeyRef.current = null;
    if (initialAbortTimerRef.current) clearTimeout(initialAbortTimerRef.current);
    if (enrichmentAbortTimerRef.current) clearTimeout(enrichmentAbortTimerRef.current);
    initialAbortTimerRef.current = null;
    enrichmentAbortTimerRef.current = null;
    setLoadedInitialKey(null);
    setBaseRequestKey(null);
    setSnapshot(null);
    setCompletionState("initial");
    setRequestedSelectionId(null);
    setLoadState("loading");
    setRetryToken((current) => current + 1);
  };

  const catalogIndex = useMemo(
    () => new HomepageCatalogIndex(regionId, snapshot?.markers ?? []),
    [regionId, snapshot?.markers],
  );
  const visibleMarkers = useMemo(
    () => catalogIndex.filter({ categories: activeCategories }).markers,
    [activeCategories, catalogIndex],
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
    const optionalLayer = category === "veterinary" ? "veterinary" : category === "pet_shop" ? "pet_shop" : null;
    if (optionalLayer && snapshot.layers[optionalLayer].state !== "ready" && snapshot.layers[optionalLayer].state !== "empty") {
      return [category, null];
    }
    return [category, catalogIndex.countCategory(category)];
  })) as Record<PlaceCategory, number | null>;
  const publicUnavailable = HOMEPAGE_PLACE_LAYERS.slice(1).some(
    (layer) => snapshot.layers[layer].state === "unavailable",
  );

  const loadOptionalPlaces = (categories: readonly PlaceCategory[]) => {
    const needsOptional = categories.some((category) => category === "veterinary" || category === "pet_shop") &&
      (snapshot.layers.veterinary.state === "deferred" || snapshot.layers.pet_shop.state === "deferred");
    if (needsOptional && baseRequestKey) {
      if (optionalRequestRef.current && optionalRequestRef.current.key !== baseRequestKey) {
        optionalRequestRef.current.controller.abort();
        optionalRequestRef.current = null;
      }
      const pending = optionalRequestRef.current ?? (() => {
        const controller = new AbortController();
        return {
          key: baseRequestKey,
          controller,
          promise: requestHomepageInitial(regionId, "optional", controller.signal),
        };
      })();
      optionalRequestRef.current = pending;
      void pending.promise.then((result) => {
        if (!shouldApplyHomepageResponse(activeRequestKeyRef.current, pending.key)) return;
        if (
          !result.ok ||
          result.data.region !== regionId ||
          result.data.scope !== "optional" ||
          result.data.providers !== "kakao"
        ) {
          setSnapshot(markOptionalLayersUnavailable);
          if (optionalRequestRef.current === pending) optionalRequestRef.current = null;
          return;
        }
        setSnapshot((current) => current
          ? mergeHomepageOptionalInitial(current, result.data, regionId)
          : current);
      }).catch(() => {
        if (!pending.controller.signal.aborted &&
          shouldApplyHomepageResponse(activeRequestKeyRef.current, pending.key)) {
          setSnapshot(markOptionalLayersUnavailable);
        }
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
    const startedAt = performance.now();
    catalogIndex.filter({ categories: draftCategories });
    recordHomepageBrowserTiming("filter", "computation", startedAt);
    filterUpdateStartedAtRef.current = startedAt;
    setFilterOpen(false);
    requestAnimationFrame(() => recordHomepageBrowserTiming("filter", "feedback", startedAt));
    startFilterTransition(() => setActiveCategories([...draftCategories]));
    loadOptionalPlaces(draftCategories);
  };
  const resetDraftFilters = () => {
    setDraftCategories([...DEFAULT_PLACE_CATEGORIES]);
  };

  return (
    <div className="homepage-live-ready">
      <section className="homepage-map-section" aria-labelledby="homepage-map-title">
        <div className="homepage-map-shell">
          <h2 id="homepage-map-title" className="sr-only">
            {region?.displayName ?? regionId} 공식 관광 장소 {snapshot.official.totalCount}곳
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
              viewportKey={`homepage:${regionId}:mixed-source`}
              showLocationLabel={false}
              showSelectionInfo={false}
              emptyMessage="선택한 장소 유형에 지도에 표시할 장소가 없습니다."
            />
          </div>

          {completionState === "loading" || filterPending ? (
            <p className="homepage-map-provider-status" role="status">
              {filterPending ? "선택한 필터를 지도에 적용 중" : "나머지 저장 장소를 지도에 추가 중"}
            </p>
          ) : completionState === "partial" ? (
            <p className="homepage-map-provider-status" role="status">
              일부 저장 장소를 불러오지 못했지만 현재 지도는 계속 사용할 수 있습니다.
            </p>
          ) : null}

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
