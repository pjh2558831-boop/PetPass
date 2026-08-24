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
import { usePlannerState } from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import {
  recommendationActions,
  recommendationReasonCopy,
  recommendationWarningCopy,
} from "@/lib/recommendation/recommendation-copy";
import { createRouteRecommendationRequest } from "@/lib/recommendation/recommendation-ui-request";
import {
  manualRouteValidationResponseSchema,
  routeRecommendationResponseSchema,
} from "@/lib/recommendation/recommendation-response";
import { saveRouteRecommendation } from "@/lib/storage/recommendation-storage";
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

function EmptyResult() {
  return (
    <section className="surface-panel mx-auto max-w-3xl p-8 text-center" aria-labelledby="route-empty-heading">
      <PawPrint className="mx-auto text-[var(--brand)]" aria-hidden="true" />
      <h1 id="route-empty-heading" className="mt-4 text-2xl font-black">여행 조건이 아직 확정되지 않았어요.</h1>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">반려동물과 여행 조건을 입력하면 공식 동반 근거와 실제 이동 경로를 확인해 일정을 만듭니다.</p>
      <Link href="/planner/pet" className="mt-6 inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-sm font-extrabold text-white">여행 정보 입력하기</Link>
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
}: {
  response: Exclude<RouteRecommendationResponseV1, { status: "ready" }>;
  onRetry: () => void;
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
        <Link href="/planner/pet" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">여행 조건 수정</Link>
        <Link href="/results?tab=catalog&region=busan" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">방문 가능한 장소 보기</Link>
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
}: {
  route: ProductRouteV1;
  validated: boolean;
  selectedPlaceId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ol className="space-y-4" aria-label={`${route.label} 방문 순서`}>
      {route.stops.map((stop, index) => {
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
            className={`surface-card p-5 ${selectedPlaceId === stop.placeId ? "ring-2 ring-[var(--mint-500)]" : ""}`}
          >
            <button type="button" onClick={() => onSelect(stop.placeId)} className="w-full text-left focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#3d8b6859]">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-black text-[var(--brand)]"><span className="grid size-8 place-items-center rounded-full bg-[var(--brand)] text-white">{stop.sequence}</span>{validated ? `${koreaTime(stop.arrivalAt)} 도착` : "경로 재계산 전"}</span>
                <span className="text-xs font-bold text-[var(--muted)]">예상 체류 {stop.dwellMinutes}분{validated ? ` · ${koreaTime(stop.departureAt)} 출발` : ""}</span>
              </span>
              <h3 className="mt-4 text-xl font-black tracking-[-0.03em]">{stop.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{CATEGORY_LABEL[stop.category]} · {stop.sourceLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-extrabold">
                <span className="rounded-full bg-[#edf8f2] px-3 py-1.5 text-[#285c45]">{stop.petAssessment === "allowed" ? "동반 가능" : "조건부 가능"}</span>
                <span className="rounded-full border border-[#d7e0da] bg-white px-3 py-1.5 text-[#52665b]">정보 신뢰도 {trustLabel(stop.informationTrust)}</span>
                <span className="rounded-full border border-[#d7e0da] bg-white px-3 py-1.5 text-[#52665b]">공식 관광 정보</span>
                {stop.licensingStatus === "no_match" || stop.licensingStatus === "verification_required" ? <span className="rounded-full border border-[#dfccb3] bg-[#fff8ec] px-3 py-1.5 text-[#76542f]">인허가 데이터 추가 확인 필요</span> : null}
              </div>
              {validated && stop.driveSecondsFromPrevious > 0 ? <p className="mt-3 text-xs font-bold text-[#607168]">이전 지점에서 {formatDistance(stop.distanceMetersFromPrevious)} · 약 {formatDuration(stop.driveSecondsFromPrevious)}</p> : null}
            </button>
            {stop.mandatoryConditions.length > 0 ? (
              <ul className="mt-4 space-y-1 rounded-xl bg-[#fff8ec] p-3 text-sm font-bold text-[#76542f]">
                {stop.mandatoryConditions.map((condition) => <li key={`${condition.type}:${condition.label}`}>· {condition.label}</li>)}
              </ul>
            ) : null}
            <details className="mt-4 rounded-xl border border-[var(--line)] p-3">
              <summary className="cursor-pointer text-sm font-black text-[var(--brand)]">추천 근거와 확인사항</summary>
              <div className="mt-3 grid gap-4 text-sm leading-6 sm:grid-cols-2">
                <div><h4 className="font-black">포함한 이유</h4><ul className="mt-1 space-y-1 text-[var(--muted)]">{inclusion.map((copy) => <li key={copy}>· {copy}</li>)}</ul></div>
                <div><h4 className="font-black">이 위치에 둔 이유</h4>{validated ? <ul className="mt-1 space-y-1 text-[var(--muted)]">{ordering.map((copy) => <li key={copy}>· {copy}</li>)}</ul> : <p className="mt-1 text-[var(--muted)]">경로를 다시 계산한 뒤 표시합니다.</p>}</div>
              </div>
              {warnings.length > 0 ? <ul className="mt-3 space-y-1 text-sm font-bold text-[#76542f]">{[...new Set(warnings)].map((warning) => <li key={warning}>· {warning}</li>)}</ul> : null}
              {stop.evidence.length > 0 ? <div className="mt-3 border-t border-[var(--line)] pt-3"><h4 className="text-sm font-black">한국관광공사 동반 근거</h4>{stop.evidence.map((evidence) => <p key={`${evidence.field}:${evidence.originalText}`} className="mt-2 text-xs leading-5 text-[var(--muted)]"><span className="font-black text-[#405249]">{evidence.label}</span> · {evidence.originalText}</p>)}</div> : null}
            </details>
            <div className="mt-4 flex flex-wrap gap-2" aria-label={`${stop.title} 순서 편집`}>
              <button type="button" disabled={index === 0} onClick={() => onMove(stop.placeId, -1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-xs font-extrabold disabled:opacity-40"><ArrowUp size={15} aria-hidden="true" /> 앞으로</button>
              <button type="button" disabled={index === route.stops.length - 1} onClick={() => onMove(stop.placeId, 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-xs font-extrabold disabled:opacity-40"><ArrowDown size={15} aria-hidden="true" /> 뒤로</button>
              <button type="button" disabled={route.stops.length <= 1} onClick={() => onRemove(stop.placeId)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e5bdb7] px-3 text-xs font-extrabold text-[#8d3838] disabled:opacity-40"><Trash2 size={15} aria-hidden="true" /> 제외</button>
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
}: {
  autoGenerate?: boolean;
  onAutoGenerateStart?: () => void;
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
  const submittingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const runRecommendation = useCallback(async () => {
    if (submittingRef.current || !profileConfirmed || !preferencesConfirmed) return;
    submittingRef.current = true;
    setLoading(true);
    setSlow(false);
    setSaveMessage("");
    setManualError("");
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const slowTimer = window.setTimeout(() => setSlow(true), 8_000);
    try {
      const request = createRouteRecommendationRequest(profile, preferences);
      const result = await fetch("/api/itineraries/generate", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const parsed = routeRecommendationResponseSchema.safeParse(await result.json());
      if (!parsed.success) throw new Error("추천 응답 형식을 확인하지 못했습니다.");
      if (controller.signal.aborted) return;
      setResponse(parsed.data);
      if (parsed.data.status === "ready") {
        setActiveRoute(parsed.data.route);
        setEditableIds(parsed.data.route.stops.map(({ placeId }) => placeId));
        setEditDirty(false);
        setSelectedPlaceId(parsed.data.route.stops[0]?.placeId ?? null);
      } else {
        setActiveRoute(null);
        setEditableIds([]);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
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
      submittingRef.current = false;
      setLoading(false);
    }
  }, [preferences, preferencesConfirmed, profile, profileConfirmed]);

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
        sourceLabel: "한국관광공사 공식 장소",
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

  if (!profileConfirmed || !preferencesConfirmed) return <EmptyResult />;
  if (loading) return <LoadingResult slow={slow} />;
  if (response && response.status !== "ready") {
    return <div ref={errorRef} tabIndex={-1}><FailureResult response={response} onRetry={() => void runRecommendation()} /></div>;
  }
  if (!ready || !displayedRoute) {
    return <section className="surface-panel p-8 text-center"><h1 className="text-2xl font-black">추천 일정을 만들어 볼까요?</h1><Button type="button" variant="brand" className="mt-5" onClick={() => void runRecommendation()}>추천 일정 만들기</Button></section>;
  }

  const summary = displayedRoute.routeSummary;
  const exact = ready.optimality === "optimal_within_candidate_set_current_matrix";
  return (
    <div className="space-y-6">
      <header className="surface-panel p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <p className="eyebrow">{editDirty ? "수정 중인 일정" : displayedRoute.kind === "manual" ? "직접 수정한 일정" : "WEEKENDOG 추천 일정"}</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em]">{ready.requestSummary.departureLabel}에서 시작하는 {summary.stopCount}곳 일정</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">{editDirty ? "방문 순서를 수정했습니다. 실제 거리와 운영시간을 다시 확인해야 확정됩니다." : displayedRoute.kind === "manual" ? "직접 정한 방문 순서를 Kakao 경로로 다시 확인한 결과입니다." : exact ? "현재 후보와 확인된 이동 정보 안에서 가장 적합한 일정을 찾았습니다." : "제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다."}</p>
            {!editDirty && displayedRoute.temporalBasis.searchMatrix !== displayedRoute.temporalBasis.finalRoute ? <p className="mt-2 text-xs font-bold text-[#76542f]">장소 순서는 확인된 이동 정보로 비교하고, 표시된 시간과 경로는 Kakao의 최종 길찾기 결과를 반영했습니다.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="brandSecondary" disabled={editDirty} onClick={() => { const saved = saveRouteRecommendation(ready, displayedRoute); setSaveMessage(saved ? "현재 일정을 이 브라우저에 저장했습니다." : "저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요."); }}><Save size={16} aria-hidden="true" /> 일정 저장</Button>
            <Button type="button" variant="brandSecondary" onClick={() => void runRecommendation()}><RefreshCw size={16} aria-hidden="true" /> 추천 일정 다시 만들기</Button>
          </div>
        </div>
        {saveMessage ? <p className="mt-3 text-sm font-bold text-[var(--brand)]" role="status">{saveMessage}</p> : null}
        <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-[#f3f6f2] p-4"><dt className="text-xs font-bold text-[var(--muted)]">일정</dt><dd className="mt-1 font-black">{ready.requestSummary.tripDate} · {editDirty ? "시간 재계산 필요" : `${koreaTime(summary.startAt)}~${koreaTime(summary.endAt)}`}</dd></div>
          <div className="rounded-xl bg-[#f3f6f2] p-4"><dt className="text-xs font-bold text-[var(--muted)]">여행 속도</dt><dd className="mt-1 font-black">{PACE_LABEL[ready.requestSummary.tripPace]} · 총 {summary.stopCount}곳</dd></div>
          <div className="rounded-xl bg-[#f3f6f2] p-4"><dt className="text-xs font-bold text-[var(--muted)]">이동</dt><dd className="mt-1 font-black">{editDirty ? "경로 재계산 필요" : `${formatDistance(summary.totalDistanceMeters)} · 약 ${formatDuration(summary.totalDrivingSeconds)}`}</dd></div>
          <div className="rounded-xl bg-[#f3f6f2] p-4"><dt className="text-xs font-bold text-[var(--muted)]">방문</dt><dd className="mt-1 font-black">{editDirty ? `총 ${summary.stopCount}곳` : `${formatDuration(summary.totalVisitSeconds)}${summary.totalWaitSeconds > 0 ? ` · 대기 ${formatDuration(summary.totalWaitSeconds)}` : ""}`}</dd></div>
        </dl>
      </header>

      {ready.alternatives.length > 0 ? (
        <section className="surface-card p-4" aria-labelledby="route-alternatives-heading">
          <h2 id="route-alternatives-heading" className="text-sm font-black">검증된 다른 일정</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="일정 대안">
            {[ready.route, ...ready.alternatives].map((route) => (
              <button key={route.id} type="button" role="tab" aria-selected={activeRoute?.id === route.id} onClick={() => { setActiveRoute(route); setEditableIds(route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(route.stops[0]?.placeId ?? null); setManualError(""); }} className={`min-h-11 rounded-full border px-4 text-sm font-extrabold ${activeRoute?.id === route.id ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}>{route.label}</button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,.92fr)]">
        <section className="min-w-0" aria-labelledby="route-timeline-heading">
          <div className="mb-4"><p className="eyebrow">시간순 방문 일정</p><h2 id="route-timeline-heading" className="mt-1 text-2xl font-black">출발지부터 이어지는 실제 이동 순서</h2></div>
          <Timeline route={displayedRoute} validated={!editDirty} selectedPlaceId={selectedPlaceId} onSelect={selectPlace} onMove={moveStop} onRemove={(id) => { setEditableIds((current) => current.filter((value) => value !== id)); setEditDirty(true); setManualError(""); }} />
          {editDirty ? <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[#aac2b4] bg-white/95 p-4 shadow-lg backdrop-blur"><p className="mr-auto text-sm font-bold text-[#52665b]">순서 또는 방문지를 바꿨습니다. 실제 경로를 다시 확인해 주세요.</p><Button type="button" variant="brand" disabled={revalidating} onClick={() => void revalidate()}>{revalidating ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} 경로 다시 계산</Button><Button type="button" variant="brandSecondary" onClick={() => { setActiveRoute(ready.route); setEditableIds(ready.route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(ready.route.stops[0]?.placeId ?? null); setManualError(""); }}><RotateCcw size={16} aria-hidden="true" /> 원래 추천 복원</Button></div> : null}
          {manualError ? <p className="mt-3 rounded-xl border border-[#e5bdb7] bg-[#fff1ef] p-4 text-sm font-bold text-[#823f36]" role="alert">{manualError}</p> : null}
        </section>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="추천 일정 지도">
          <MapPanel regionId="busan" compact locations={routeLocations} routeCoordinates={editDirty ? [] : displayedRoute.geometry} selectedLocationId={selectedPlaceId} onLocationSelect={selectPlace} viewportKey={`route:${displayedRoute.id}:${editDirty ? "draft" : "validated"}`} title="추천 일정의 Kakao 실제 이동 경로" locationLabel={`${summary.stopCount}곳 방문 일정`} emptyMessage={editDirty ? "수정한 순서를 재계산하면 실제 경로를 표시합니다." : "검증된 경로 geometry가 없습니다."} />
          <p className="mt-3 rounded-xl bg-[#f4f7f4] p-3 text-xs font-semibold leading-5 text-[var(--muted)]"><MapPinned className="mr-1 inline" size={14} aria-hidden="true" /> {editDirty ? "번호는 수정한 방문 순서입니다. 경로 재계산 전에는 선을 표시하지 않습니다." : "번호는 방문 순서이며 선은 최종 Kakao 길찾기가 반환한 geometry입니다."}</p>
          <section className="surface-card mt-4 p-4" aria-labelledby="route-reliability-heading"><h2 id="route-reliability-heading" className="flex items-center gap-2 text-sm font-black"><ShieldCheck size={17} className="text-[var(--brand)]" aria-hidden="true" /> 정보 안내</h2><p className="mt-2 text-xs leading-6 text-[var(--muted)]">자동 일정에는 한국관광공사의 공식 동반 근거와 노출 상태를 확인한 장소만 포함합니다. 운영 정책은 바뀔 수 있어 방문 전 최종 확인을 권합니다.</p></section>
          {displayedRoute.kind === "manual" ? <Button type="button" variant="brandSecondary" className="mt-4 w-full" onClick={() => { setActiveRoute(ready.route); setEditableIds(ready.route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(ready.route.stops[0]?.placeId ?? null); }}><RotateCcw size={16} aria-hidden="true" /> 원래 추천 일정 복원</Button> : null}
        </aside>
      </div>
    </div>
  );
}
