"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  LoaderCircle,
  MapPinned,
  PawPrint,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MapPanel } from "@/components/map/map-panel";
import { RecommendationStopProvenance } from "@/components/itinerary/recommendation-stop-provenance";
import { usePlannerState } from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import {
  recommendationActions,
  recommendationReasonCopy,
  recommendationWarningCopy,
} from "@/lib/recommendation/recommendation-copy";
import { createRouteRecommendationRequest } from "@/lib/recommendation/recommendation-ui-request";
import { getRecommendationStopEditCopy } from "@/lib/recommendation/recommendation-stop-ui";
import {
  manualRouteValidationResponseSchema,
  routeRecommendationResponseSchema,
} from "@/lib/recommendation/recommendation-response";
import { saveRouteRecommendation } from "@/lib/storage/recommendation-storage";
import {
  getSelectedItineraryCategories,
  loadSelectedItinerary,
  removeSelectedItineraryPlace,
  saveSelectedItinerary,
} from "@/lib/storage/selected-itinerary-storage";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import type {
  ProductRouteV1,
  RouteRecommendationResponseV1,
} from "@/types/recommendation";

const PACE_LABEL = {
  relaxed: "여유롭게",
  balanced: "적당한 속도로",
  packed: "알차게",
} as const;

const CATEGORY_LABEL = {
  attraction: "관광지",
  culture: "문화시설",
  festival: "축제",
  leisure: "레저",
  accommodation: "숙소",
  food: "음식점",
  shopping: "쇼핑",
} as const;

const LOADING_STAGES = [
  "방문 가능한 공식 장소를 확인하고 있어요",
  "동반 조건과 운영 정보를 확인하고 있어요",
  "실제 이동시간을 비교하고 있어요",
  "가장 자연스러운 일정 순서를 찾고 있어요",
  "최종 이동 경로를 확인하고 있어요",
] as const;

function formatDistance(meters: number): string {
  return meters >= 1_000
    ? `${(meters / 1_000).toFixed(1)}km`
    : `${Math.round(meters)}m`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}분`;
  return remainder === 0 ? `${hours}시간` : `${hours}시간 ${remainder}분`;
}

function koreaTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function trustLabel(value: "high" | "medium" | "low"): string {
  return value === "high" ? "높음" : value === "medium" ? "보통" : "낮음";
}

function petStatusLabel(value: "allowed" | "conditional" | "unknown"): string {
  if (value === "allowed") return "동반 근거 확인";
  if (value === "conditional") return "조건부 동반";
  return "동반 여부 확인 필요";
}

function evidenceStatusLabel(
  value: "verified" | "conditional" | "unverified" | undefined,
): string {
  if (value === "verified") return "근거 확인됨";
  if (value === "conditional") return "조건 근거 있음";
  return "근거 미확인";
}

const ROUTE_STYLE_COPY = {
  comfort: "긴 이동과 활동 부담을 낮추고 동반 근거가 더 분명한 장소를 우선했어요.",
  preference: "선택한 관심사와 여행 분위기에 가장 잘 맞는 조합을 우선했어요.",
  efficient: "실제 이동시간과 거리가 가장 작은 실용적인 동선을 우선했어요.",
} as const;

const SELECTION_ISSUE_COPY: Record<string, string> = {
  selected_place_not_found_in_region: "선택한 장소를 현재 지역 데이터에서 찾지 못했습니다.",
  selected_place_cross_region: "다른 지역의 장소가 포함되어 있습니다.",
  selected_place_missing_coordinates: "선택한 장소의 좌표를 확인하지 못했습니다.",
  selected_place_not_allowed: "동반 불가로 확인된 장소가 포함되어 있습니다.",
  selected_place_condition_unsatisfied: "반려동물 준비 조건과 맞지 않는 장소가 있습니다.",
  selected_place_trip_incompatible: "여행 형태와 맞지 않는 선택 장소가 있습니다.",
  selected_place_explicitly_excluded: "제외한 장소가 선택 목록에도 포함되어 있습니다.",
  selected_anchor_large_detour: "직접 고른 장소를 유지해 이동 거리가 길어졌습니다.",
};

function EmptyResult({ selectionMode }: { selectionMode: "automatic" | "hybrid" }) {
  return (
    <section className="surface-panel mx-auto max-w-3xl p-8 text-center" aria-labelledby="route-empty-heading">
      <PawPrint className="mx-auto text-[var(--brand)]" aria-hidden="true" />
      <h1 id="route-empty-heading" className="mt-4 text-2xl font-black">여행 조건이 아직 확정되지 않았어요.</h1>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">반려동물과 여행 조건을 입력하면 공식 동반 근거와 실제 이동 경로를 확인해 일정을 만듭니다.</p>
      {selectionMode === "hybrid" ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/results?tab=catalog&region=busan&mode=select" className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-sm font-extrabold text-white">장소를 직접 골라 시작</Link>
          <Link href="/planner/pet" className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-[var(--brand-border)] bg-white px-5 text-sm font-extrabold text-[var(--brand)]">전체 자동 추천 받기</Link>
        </div>
      ) : (
        <Link href="/planner/pet" className="mt-6 inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-sm font-extrabold text-white">여행 정보 입력하기</Link>
      )}
    </section>
  );
}

function LoadingResult({ slow }: { slow: boolean }) {
  return (
    <section className="surface-panel p-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3">
        <LoaderCircle className="animate-spin text-[var(--brand)]" aria-hidden="true" />
        <div>
          <p className="eyebrow">추천 일정 생성 중</p>
          <h1 className="mt-1 text-xl font-black">공식 근거와 실제 경로를 차례로 확인하고 있어요.</h1>
        </div>
      </div>
      <ol className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="추천 일정 생성 단계">
        {LOADING_STAGES.map((stage, index) => (
          <li key={stage} className="flex items-center gap-2 rounded-xl bg-[#f3f7f4] p-3 text-sm font-bold text-[#52665b]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs text-[var(--brand)]">{index + 1}</span>
            {stage}
          </li>
        ))}
      </ol>
      {slow ? <p className="mt-4 rounded-xl bg-[#fff8ec] p-3 text-sm font-bold text-[#76542f]">공식 데이터를 확인하는 데 시간이 조금 더 걸리고 있습니다.</p> : null}
    </section>
  );
}

function FailureResult({
  response,
  onRetry,
  selectionMode,
}: {
  response: Exclude<RouteRecommendationResponseV1, { status: "ready" }>;
  onRetry: () => void;
  selectionMode: "automatic" | "hybrid";
}) {
  return (
    <section className="surface-panel p-6" role="alert" aria-labelledby="route-error-heading">
      <AlertTriangle className="text-[#a44537]" aria-hidden="true" />
      <h1 id="route-error-heading" className="mt-3 text-2xl font-black">일정을 표시할 수 없어요.</h1>
      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{response.userMessage}</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm font-semibold text-[#52665b]">
        {recommendationActions(response.status).map((action) => <li key={action}>{action}</li>)}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        {response.retryable ? <Button type="button" variant="brand" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> 다시 시도</Button> : null}
        <Link href={selectionMode === "hybrid" ? "/planner/pet?mode=selected" : "/planner/pet"} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">여행 조건 수정</Link>
        <Link href={selectionMode === "hybrid" ? "/results?tab=catalog&region=busan&mode=select" : "/results?tab=catalog&region=busan"} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">{selectionMode === "hybrid" ? "장소 다시 선택" : "방문 가능한 장소 보기"}</Link>
        {selectionMode === "hybrid" ? <Link href="/planner/pet" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">전체 자동 추천</Link> : null}
      </div>
    </section>
  );
}

function Timeline({
  route,
  validated,
  selectedPlaceId,
  onSelect,
  onMove,
  onRemove,
  onReplace,
  replacementSupported,
}: {
  route: ProductRouteV1;
  validated: boolean;
  selectedPlaceId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string) => void;
  replacementSupported: boolean;
}) {
  return (
    <ol className="route-result-timeline" aria-label={`${route.label} 방문 순서`}>
      {route.stops.map((stop, index) => {
        const editCopy = getRecommendationStopEditCopy(stop, replacementSupported);
        const inclusion = stop.inclusionReasonCodes.flatMap((code) => {
          const copy = recommendationReasonCopy(code);
          return copy ? [copy] : [];
        });
        const ordering = (validated ? stop.orderingReasonCodes : []).flatMap((code) => {
          const copy = recommendationReasonCopy(code);
          return copy ? [copy] : [];
        });
        const warnings = [...stop.operatingHoursWarnings, ...stop.warningCodes].flatMap((code) => {
          const copy = recommendationWarningCopy(code);
          return copy ? [copy] : [];
        });
        return (
          <li
            key={stop.placeId}
            id={`recommended-stop-${stop.placeId}`}
            className="route-result-stop"
            data-selected={selectedPlaceId === stop.placeId || undefined}
          >
            <button type="button" onClick={() => onSelect(stop.placeId)} className="route-result-stop__select">
              <span className="route-result-stop__time">
                <span>{stop.sequence}</span>
                <b>{validated ? `${koreaTime(stop.arrivalAt)} 도착` : "경로 재계산 전"}</b>
              </span>
              <h3>{stop.title}</h3>
              <p className="route-result-stop__category">{CATEGORY_LABEL[stop.category]} · {stop.sourceLabel}</p>
              <dl className="route-result-stop__facts">
                <div><dt>체류</dt><dd>{stop.dwellMinutes}분{validated ? ` · ${koreaTime(stop.departureAt)} 출발` : ""}</dd></div>
                <div><dt>이동</dt><dd>{validated && stop.driveSecondsFromPrevious > 0 ? `이전 지점에서 ${formatDistance(stop.distanceMetersFromPrevious)} · 약 ${formatDuration(stop.driveSecondsFromPrevious)}` : validated ? "첫 방문지" : "경로 재계산 필요"}</dd></div>
                <div><dt>반려동물</dt><dd><span>{petStatusLabel(stop.petAssessment)}</span> · <span>{evidenceStatusLabel(stop.evidenceStatus)}</span></dd></div>
                <div><dt>근거</dt><dd>정보 신뢰도 {trustLabel(stop.informationTrust)} · {stop.sourceLabel}{stop.retrievedAt ? ` · 확인 ${new Date(stop.retrievedAt).toLocaleDateString("ko-KR")}` : ""}</dd></div>
              </dl>
            </button>
            <RecommendationStopProvenance
              stop={stop}
              replacementSupported={editCopy.canReplace}
              onReplace={editCopy.canReplace ? () => onReplace(stop.placeId) : undefined}
            />
            {stop.mandatoryConditions.length > 0 ? (
              <ul className="route-result-stop__conditions">
                {stop.mandatoryConditions.map((condition) => <li key={`${condition.type}:${condition.label}`}>· {condition.label}</li>)}
              </ul>
            ) : null}
            <details className="route-result-stop__details">
              <summary className="cursor-pointer text-sm font-black text-[var(--brand)]">추천 근거와 확인사항</summary>
              <div className="mt-3 grid gap-4 text-sm leading-6 sm:grid-cols-2">
                <div><h4 className="font-black">포함한 이유</h4><ul className="mt-1 space-y-1 text-[var(--muted)]">{inclusion.map((copy) => <li key={copy}>· {copy}</li>)}</ul></div>
                <div><h4 className="font-black">이 위치에 둔 이유</h4>{validated ? <ul className="mt-1 space-y-1 text-[var(--muted)]">{ordering.map((copy) => <li key={copy}>· {copy}</li>)}</ul> : <p className="mt-1 text-[var(--muted)]">경로를 다시 계산한 뒤 표시합니다.</p>}</div>
              </div>
              {warnings.length > 0 ? <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">{[...new Set(warnings)].map((warning) => <li key={warning}>· {warning}</li>)}</ul> : null}
              {stop.evidence.length > 0 ? <div className="mt-3 border-t border-[var(--line)] pt-3"><h4 className="text-sm font-black">한국관광공사 동반 근거</h4>{stop.evidence.map((evidence) => <p key={`${evidence.field}:${evidence.originalText}`} className="mt-2 text-xs leading-5 text-[var(--muted)]"><span className="font-black text-[#405249]">{evidence.label}</span> · {evidence.originalText}</p>)}</div> : null}
            </details>
            <div className="route-result-stop__actions" aria-label={`${stop.title} 순서 편집`}>
              <button type="button" disabled={index === 0} onClick={() => onMove(stop.placeId, -1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-xs font-extrabold disabled:opacity-40"><ArrowUp size={15} aria-hidden="true" /> 앞으로</button>
              <button type="button" disabled={index === route.stops.length - 1} onClick={() => onMove(stop.placeId, 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-xs font-extrabold disabled:opacity-40"><ArrowDown size={15} aria-hidden="true" /> 뒤로</button>
              <button type="button" disabled={route.stops.length <= 1} onClick={() => onRemove(stop.placeId)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e5bdb7] px-3 text-xs font-extrabold text-[#8d3838] disabled:opacity-40"><Trash2 size={15} aria-hidden="true" /> {editCopy.removeLabel}</button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function RecommendationPlanner({
  autoGenerate = false,
  onAutoGenerateStart,
  selectionMode = "automatic",
}: {
  autoGenerate?: boolean;
  onAutoGenerateStart?: () => void;
  selectionMode?: "automatic" | "hybrid";
}) {
  const { profile, preferences, profileConfirmed, preferencesConfirmed } = usePlannerState();
  const [response, setResponse] = useState<RouteRecommendationResponseV1 | null>(null);
  const [activeRoute, setActiveRoute] = useState<ProductRouteV1 | null>(null);
  const [editableIds, setEditableIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [slow, setSlow] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [manualError, setManualError] = useState("");
  const [editDirty, setEditDirty] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const rerollVariantRef = useRef(0);
  const recentSignaturesRef = useRef<string[]>([]);
  const recentCandidateIdsRef = useRef<string[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  const [hybridSelection, setHybridSelection] = useState(() =>
    selectionMode === "hybrid" ? loadSelectedItinerary() : null);

  const runRecommendation = useCallback(async (
    mode: "initial" | "reroll" = "initial",
    excludedAutoPlaceId?: string,
  ) => {
    if (!profileConfirmed || !preferencesConfirmed) return;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    if (mode === "reroll") rerollVariantRef.current += 1;
    setLoading(true);
    setSlow(false);
    setSaveMessage("");
    setManualError("");
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const slowTimer = window.setTimeout(() => setSlow(true), 8_000);
    try {
      const request = createRouteRecommendationRequest(profile, preferences, {
        rerollVariant: rerollVariantRef.current,
        recentRouteSignatures: recentSignaturesRef.current,
        recentlySelectedCandidateIds: recentCandidateIdsRef.current,
        explicitlyExcludedPlaceIds: excludedAutoPlaceId ? [excludedAutoPlaceId] : [],
      }, selectionMode === "hybrid" ? (() => {
        const selection = hybridSelection;
        if (!selection || selection.places.length === 0) {
          throw new Error("선택한 장소를 불러오지 못했습니다. 장소를 다시 선택해 주세요.");
        }
        const categories = getSelectedItineraryCategories(selection.places);
        if (
          selection.autoFill &&
          preferences.tripType === "OVERNIGHT" &&
          !categories.includes("accommodation")
        ) {
          categories.push("accommodation");
        }
        if (categories.length === 0) {
          throw new Error("선택한 장소 유형을 일정 후보로 변환하지 못했습니다.");
        }
        return {
          selectedPlaces: selection.places.map(({ id, regionId }) => ({ id, regionId })),
          autoFill: selection.autoFill,
          selectedCategories: categories,
          acknowledgedVerificationRequiredPlaceIds:
            selection.acknowledgedVerificationRequiredPlaceIds,
        };
      })() : undefined);
      const result = await fetch("/api/itineraries/generate", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const parsed = routeRecommendationResponseSchema.safeParse(await result.json());
      if (!parsed.success) throw new Error("추천 응답 형식을 확인하지 못했습니다.");
      if (controller.signal.aborted || requestSequenceRef.current !== requestSequence) return;
      setResponse(parsed.data);
      if (parsed.data.status === "ready") {
        const returnedRoutes = parsed.data.routeOptions ?? [parsed.data.route, ...parsed.data.alternatives];
        const selected = returnedRoutes[0] ?? parsed.data.route;
        recentSignaturesRef.current = [...new Set([
          ...recentSignaturesRef.current,
          ...returnedRoutes.flatMap(({ routeSignature }) => routeSignature ? [routeSignature] : []),
        ])].slice(-12);
        recentCandidateIdsRef.current = [...new Set([
          ...recentCandidateIdsRef.current,
          ...returnedRoutes.flatMap(({ stops }) => stops.map(({ placeId }) => placeId)),
        ])].slice(-40);
        setActiveRoute(selected);
        setEditableIds(selected.stops.map(({ placeId }) => placeId));
        setEditDirty(false);
        setSelectedPlaceId(selected.stops[0]?.placeId ?? null);
      } else {
        setActiveRoute(null);
        setEditableIds([]);
      }
    } catch (error) {
      if (controller.signal.aborted || requestSequenceRef.current !== requestSequence) return;
      setResponse({
        status: "internal_error",
        apiVersion: "route-recommendation-response-v1",
        reasonCodes: ["client_request_failed"],
        userMessage: error instanceof Error ? error.message : "추천 일정을 요청하지 못했습니다.",
        retryable: true,
      });
      setActiveRoute(null);
    } finally {
      window.clearTimeout(slowTimer);
      if (controllerRef.current === controller) controllerRef.current = null;
      if (requestSequenceRef.current === requestSequence) setLoading(false);
    }
  }, [hybridSelection, preferences, preferencesConfirmed, profile, profileConfirmed, selectionMode]);

  useEffect(() => {
    if (!autoGenerate || startedRef.current) return;
    // React development Strict Mode mounts and immediately cleans up effects
    // once. Deferring the first request lets that synthetic cleanup cancel the
    // timer without aborting the only real recommendation request.
    const timer = window.setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      onAutoGenerateStart?.();
      void runRecommendation();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoGenerate, onAutoGenerateStart, runRecommendation]);

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (response && response.status !== "ready") errorRef.current?.focus();
  }, [response]);

  const ready = response?.status === "ready" ? response : null;
  const editableStops = useMemo(() => {
    if (!activeRoute) return [];
    const byId = new Map(activeRoute.stops.map((stop) => [stop.placeId, stop]));
    return editableIds.flatMap((id) => {
      const stop = byId.get(id);
      return stop ? [stop] : [];
    });
  }, [activeRoute, editableIds]);
  const displayedRoute = useMemo(
    () =>
      activeRoute
        ? editDirty
          ? {
              ...activeRoute,
              stops: editableStops.map((stop, index) => ({
                ...stop,
                sequence: index + 1,
              })),
              routeSummary: {
                ...activeRoute.routeSummary,
                stopCount: editableStops.length,
              },
            }
          : activeRoute
        : null,
    [activeRoute, editDirty, editableStops],
  );
  const routeLocations = useMemo<KakaoMapLocation[]>(() => {
    if (!displayedRoute || !ready) return [];
    return [
      {
        id: "route-departure",
        name: ready.requestSummary.departureLabel,
        address: "출발지",
        coordinates: preferences.departure?.coordinates,
        markerKind: "departure",
        markerLabel: "출",
        sourceLabel: "선택한 출발지",
        interactive: true,
        clusterable: false,
      },
      ...displayedRoute.stops.map((stop) => ({
        id: stop.placeId,
        name: stop.title,
        address: stop.address ?? "주소 정보 없음",
        coordinates: stop.coordinates,
        order: stop.sequence,
        markerKind: "itinerary" as const,
        sourceLabel: stop.sourceLabel,
        interactive: true,
        clusterable: false,
      })),
    ];
  }, [displayedRoute, preferences.departure?.coordinates, ready]);

  const selectPlace = useCallback((id: string | null) => {
    setSelectedPlaceId(id);
    if (!id || id === "route-departure") return;
    window.requestAnimationFrame(() => {
      document.getElementById(`recommended-stop-${id}`)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "nearest",
      });
    });
  }, []);

  const moveStop = (id: string, direction: -1 | 1) => {
    setEditableIds((current) => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setEditDirty(true);
    setManualError("");
  };

  const removeStop = (id: string) => {
    const removedStop = displayedRoute?.stops.find(({ placeId }) => placeId === id);
    let persistenceError = "";
    if (
      selectionMode === "hybrid" &&
      removedStop?.provenance === "user_selected" &&
      hybridSelection
    ) {
      const nextSelection = removeSelectedItineraryPlace(hybridSelection, id);
      setHybridSelection(nextSelection);
      if (!saveSelectedItinerary(nextSelection)) {
        persistenceError = "선택 해제를 저장하지 못했습니다. 현재 결과에서는 제외되지만 새로 열면 다시 나타날 수 있습니다.";
      }
    }
    setEditableIds((current) => current.filter((value) => value !== id));
    setEditDirty(true);
    setManualError(persistenceError);
  };

  const revalidate = async () => {
    if (!ready || !editDirty || revalidating) return;
    setRevalidating(true);
    setManualError("");
    try {
      const responseValue = await fetch("/api/itineraries/revalidate", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ editSessionId: ready.editSessionId, orderedPlaceIds: editableIds }),
      });
      const parsed = manualRouteValidationResponseSchema.safeParse(await responseValue.json());
      if (!parsed.success) throw new Error("수정한 일정의 응답을 확인하지 못했습니다.");
      if (parsed.data.status !== "ready") {
        setManualError(parsed.data.userMessage);
        return;
      }
      setActiveRoute(parsed.data.route);
      setEditableIds(parsed.data.route.stops.map(({ placeId }) => placeId));
      setEditDirty(false);
      setSelectedPlaceId(parsed.data.route.stops[0]?.placeId ?? null);
    } catch {
      setManualError("이 순서로는 운영시간 또는 전체 일정 조건을 맞추기 어렵습니다.");
    } finally {
      setRevalidating(false);
    }
  };

  if (!profileConfirmed || !preferencesConfirmed) return <EmptyResult selectionMode={selectionMode} />;
  if (loading) return <LoadingResult slow={slow} />;
  if (response && response.status !== "ready") {
    return <div ref={errorRef} tabIndex={-1}><FailureResult response={response} onRetry={() => void runRecommendation()} selectionMode={selectionMode} /></div>;
  }
  if (!ready || !displayedRoute) {
    return <section className="surface-panel p-8 text-center"><h1 className="text-2xl font-black">추천 일정을 만들어 볼까요?</h1><Button type="button" variant="brand" className="mt-5" onClick={() => void runRecommendation()}>추천 일정 만들기</Button></section>;
  }

  const summary = displayedRoute.routeSummary;
  const exact = ready.optimality === "optimal_within_candidate_set_current_matrix";
  const availableRoutes = ready.routeOptions ?? [ready.route, ...ready.alternatives];
  const activeStyle = displayedRoute.style;
  const replacementSupported = ready.alternativeAvailability === "available";
  const hybridAutoFill = selectionMode === "hybrid" && hybridSelection?.autoFill === true;
  const hasAutoFilledStops = displayedRoute.stops.some(({ provenance }) => provenance === "auto_fill");
  const reducedCopy = ready.resultState === "single_stop_suggestion"
    ? "지금 확인된 한 곳을 중심으로 짧고 확실한 일정을 만들었어요."
    : ready.resultState === "ready_with_reduced_stops"
      ? `요청한 ${displayedRoute.requestedTarget ?? "목표"}곳보다 적지만, 실제로 방문 가능한 ${summary.stopCount}곳으로 완성했어요.`
      : null;
  return (
    <div className="space-y-6">
      <header className="route-result-header">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <p className="eyebrow">{editDirty ? "수정 중인 일정" : displayedRoute.kind === "manual" ? "직접 수정한 일정" : "WEEKENDOG 추천 일정"}</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em]">{ready.requestSummary.departureLabel}에서 시작하는 {summary.stopCount}곳 일정</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">{editDirty ? "방문 순서를 수정했습니다. 실제 거리와 운영시간을 다시 확인해야 확정됩니다." : displayedRoute.kind === "manual" ? "직접 정한 방문 순서를 Kakao 경로로 다시 확인한 결과입니다." : reducedCopy ?? (exact ? "현재 후보와 확인된 이동 정보 안에서 가장 적합한 일정을 찾았습니다." : "제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다.")}</p>
            {!editDirty && displayedRoute.kind !== "manual" && reducedCopy && !exact ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다.</p> : null}
            {!editDirty && displayedRoute.temporalBasis.searchMatrix !== displayedRoute.temporalBasis.finalRoute ? <p className="mt-2 text-xs font-bold text-[#76542f]">장소 순서는 확인된 이동 정보로 비교하고, 표시된 시간과 경로는 Kakao의 최종 길찾기 결과를 반영했습니다.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="brandSecondary" disabled={editDirty} onClick={() => { const saved = saveRouteRecommendation(ready, displayedRoute); setSaveMessage(saved ? "현재 일정을 이 브라우저에 저장했습니다." : "저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요."); }}><Save size={16} aria-hidden="true" /> 일정 저장</Button>
            {selectionMode === "automatic" || (hybridAutoFill && hasAutoFilledStops) ? (
              <Button type="button" variant="brandSecondary" onClick={() => void runRecommendation("reroll")}><RefreshCw size={16} aria-hidden="true" /> {selectionMode === "hybrid" ? "자동 장소 다시 채우기" : "다른 조합 보기"}</Button>
            ) : null}
          </div>
        </div>
        {saveMessage ? <p className="mt-3 text-sm font-bold text-[var(--brand)]" role="status">{saveMessage}</p> : null}
        <dl className="route-result-summary">
          <div><dt>일정</dt><dd>{ready.requestSummary.tripDate} · {editDirty ? "시간 재계산 필요" : `${koreaTime(summary.startAt)}~${koreaTime(summary.endAt)}`}</dd></div>
          <div><dt>여행 속도</dt><dd>{PACE_LABEL[ready.requestSummary.tripPace]} · 총 {summary.stopCount}곳</dd></div>
          <div><dt>이동</dt><dd>{editDirty ? "경로 재계산 필요" : `${formatDistance(summary.totalDistanceMeters)} · 약 ${formatDuration(summary.totalDrivingSeconds)}`}</dd></div>
          <div><dt>방문</dt><dd>{editDirty ? `총 ${summary.stopCount}곳` : `${formatDuration(summary.totalVisitSeconds)}${summary.totalWaitSeconds > 0 ? ` · 대기 ${formatDuration(summary.totalWaitSeconds)}` : ""}`}</dd></div>
        </dl>
      </header>

      {ready.selectionIssues && ready.selectionIssues.length > 0 ? (
        <section className="rounded-[var(--radius-card)] border border-[#eed8ae] bg-[#fff8ec] p-4" aria-labelledby="selection-issues-heading">
          <h2 id="selection-issues-heading" className="flex items-center gap-2 text-sm font-black text-[#76542f]"><AlertTriangle size={17} aria-hidden="true" /> 선택 장소 확인사항</h2>
          <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-[#76542f]">
            {ready.selectionIssues.map((issue) => <li key={`${issue.placeId}:${issue.code}`}>· {SELECTION_ISSUE_COPY[issue.code] ?? "선택한 장소에 추가 확인이 필요합니다."}</li>)}
          </ul>
        </section>
      ) : null}

      {ready.routeOptions || availableRoutes.length > 1 ? (
        <section className="route-result-alternatives" aria-labelledby="route-alternatives-heading">
          <h2 id="route-alternatives-heading" className="text-sm font-black">추천 기준을 바꿔 비교해 보세요</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="일정 대안">
            {availableRoutes.map((route) => (
              <button key={route.id} type="button" role="tab" aria-selected={activeRoute?.id === route.id} onClick={() => { setActiveRoute(route); setEditableIds(route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(route.stops[0]?.placeId ?? null); setManualError(""); }} className={`min-h-11 rounded-full border px-4 text-sm font-extrabold ${activeRoute?.id === route.id ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}>{route.label}</button>
            ))}
          </div>
          {activeStyle ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]" role="tabpanel">{ROUTE_STYLE_COPY[activeStyle]}</p> : null}
          {ready.alternativeAvailability === "limited" ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">현재 후보에서는 서로 다른 검증 경로만 표시했어요.</p> : null}
        </section>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,.92fr)]">
        <section className="min-w-0" aria-labelledby="route-timeline-heading">
          <div className="mb-4"><p className="eyebrow">시간순 방문 일정</p><h2 id="route-timeline-heading" className="mt-1 text-2xl font-black">출발지부터 이어지는 실제 이동 순서</h2></div>
          <Timeline route={displayedRoute} validated={!editDirty} selectedPlaceId={selectedPlaceId} onSelect={selectPlace} onMove={moveStop} onRemove={removeStop} onReplace={(id) => void runRecommendation("reroll", id)} replacementSupported={replacementSupported} />
          {editDirty ? <div className="route-result-edit-bar"><p className="mr-auto text-sm font-bold text-[#52665b]">순서 또는 방문지를 바꿨습니다. 실제 경로를 다시 확인해 주세요.</p><Button type="button" variant="brand" disabled={revalidating} onClick={() => void revalidate()}>{revalidating ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} 경로 다시 계산</Button><Button type="button" variant="brandSecondary" onClick={() => { setActiveRoute(ready.route); setEditableIds(ready.route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(ready.route.stops[0]?.placeId ?? null); setManualError(""); }}><RotateCcw size={16} aria-hidden="true" /> 원래 추천 복원</Button></div> : null}
          {manualError ? <p className="mt-3 rounded-xl border border-[#e5bdb7] bg-[#fff1ef] p-4 text-sm font-bold text-[#823f36]" role="alert">{manualError}</p> : null}
        </section>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="추천 일정 지도">
          <MapPanel regionId="busan" compact locations={routeLocations} routeCoordinates={editDirty ? [] : displayedRoute.geometry} selectedLocationId={selectedPlaceId} onLocationSelect={selectPlace} viewportKey={`route:${displayedRoute.id}:${editDirty ? "draft" : "validated"}`} title="추천 일정의 Kakao 실제 이동 경로" locationLabel={`${summary.stopCount}곳 방문 일정`} emptyMessage={editDirty ? "수정한 순서를 재계산하면 실제 경로를 표시합니다." : "검증된 경로 geometry가 없습니다."} />
          <p className="route-result-map-note"><MapPinned className="mr-1 inline" size={14} aria-hidden="true" /> {editDirty ? "번호는 수정한 방문 순서입니다. 경로 재계산 전에는 선을 표시하지 않습니다." : "번호는 방문 순서이며 선은 최종 Kakao 길찾기가 반환한 geometry입니다."}</p>
          <section className="route-result-reliability" aria-labelledby="route-reliability-heading"><h2 id="route-reliability-heading" className="flex items-center gap-2 text-sm font-black"><ShieldCheck size={17} className="text-[var(--brand)]" aria-hidden="true" /> 정보 안내</h2><p className="mt-2 text-xs leading-6 text-[var(--muted)]">한국관광공사 근거 장소와 저장된 카카오 후보를 출처·근거 상태와 함께 표시합니다. 미확인 정보는 동반 가능으로 단정하지 않으며 방문 전 확인할 수 있어요.</p></section>
          {displayedRoute.kind === "manual" ? <Button type="button" variant="brandSecondary" className="mt-4 w-full" onClick={() => { setActiveRoute(ready.route); setEditableIds(ready.route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(ready.route.stops[0]?.placeId ?? null); }}><RotateCcw size={16} aria-hidden="true" /> 원래 추천 일정 복원</Button> : null}
        </aside>
      </div>
    </div>
  );
}
