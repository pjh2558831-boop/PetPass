"use client";

import Link from "next/link";
import {
  AlertTriangle,
  PawPrint,
  Route,
  Clock3,
  Car,
  MapPin,
  ArrowDown,
  ArrowUp,
  Check,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlaceImage } from "@/components/places/place-image";
import { requestMapPlaceCardDetails } from "@/lib/map-places/card-details-client";
import type { RegionId } from "@/types/region";
import { MapPanel } from "@/components/map/map-panel";
import { RecommendationStopProvenance } from "@/components/itinerary/recommendation-stop-provenance";
import { usePlannerState } from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import { saveAccountItinerary } from "@/app/itinerary/actions";
import { ProductState } from "@/components/ui/product-state";
import {
  REGION_CONFIGS,
  getRegionConfigByService2LegalDongCode,
} from "@/lib/regions/config";
import {
  recommendationActions,
  recommendationReasonCopy,
  recommendationWarningCopy,
  recommendationPetAccessCopy,
  recommendationOperatingWarning,
  RECOVERY_ACTION_COPY,
} from "@/lib/recommendation/recommendation-copy";
import { createRouteRecommendationRequest } from "@/lib/recommendation/recommendation-ui-request";
import { getRecommendationStopEditCopy } from "@/lib/recommendation/recommendation-stop-ui";
import {
  recommendationRerollUiState,
} from "@/lib/recommendation/recommendation-reroll-ui";
import {
  manualRouteValidationResponseSchema,
  routeRecommendationResponseSchema,
} from "@/lib/recommendation/recommendation-response";
import { createSavedRouteRecommendation } from "@/lib/storage/recommendation-storage";
import { loadRecommendationHistory, saveRecommendationHistory } from "@/lib/storage/recommendation-history-storage";
import { formatScheduleTime as koreaTime } from "@/lib/recommendation/schedule/schedule-display";
import { saveTravelPreferences } from "@/lib/storage/profile-storage";
import { loadPlanDraft, savePlanDraft } from "@/lib/storage/plan-draft-storage";
import {
  getSelectedItineraryCategories,
  loadSelectedItinerary,
  removeSelectedItineraryPlace,
  saveSelectedItinerary,
} from "@/lib/storage/selected-itinerary-storage";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import type {
  ProductRouteV1,
  RouteRecommendationRequest,
  RouteRecommendationReadyResponseV1,
  RouteRecommendationFailureResponseV1,
  ConditionAnswer,
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
  transportation: "교통시설",
  unknown: "장소 유형 미확인",
} as const;

const PET_SPECIES_LABEL = {
  DOG: "강아지",
  CAT: "고양이",
  OTHER: "기타",
} as const;

const PET_SIZE_LABEL = {
  SMALL: "소형",
  MEDIUM: "중형",
  LARGE: "대형",
} as const;

type RecommendationPresentationState =
  | "missing_input"
  | "ready_to_generate"
  | "generating"
  | "generated"
  | "failed";

function getRecommendationPresentationState({
  inputConfirmed,
  loading,
  response,
  hasDisplayedRoute,
}: {
  inputConfirmed: boolean;
  loading: boolean;
  response: RouteRecommendationResponseV1 | null;
  hasDisplayedRoute: boolean;
}): RecommendationPresentationState {
  if (!inputConfirmed) return "missing_input";
  if (loading) return "generating";
  if (response && response.status !== "ready") return "failed";
  if (response?.status === "ready" && hasDisplayedRoute) return "generated";
  return "ready_to_generate";
}

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


const ROUTE_STYLE_COPY = {
  balanced: "카테고리, 이동, 대기, 취향을 함께 고려한 균형 경로예요.",
  shortest: "검증된 실제 이동시간과 거리가 가장 작은 동선을 우선했어요.",
  relaxed: "긴 단일 이동과 대기 부담이 더 낮은 여유 경로예요.",
} as const;

const ROUTE_DIFFERENCE_COPY: Record<string, string> = {
  primary_balanced_objective: "이동·대기·장소 구성을 함께 고려한 기준 경로",
  different_places_or_order: "방문 장소 또는 순서가 다른 경로",
  different_travel_time: "총 이동시간이 다른 경로",
  different_wait_time: "예상 대기시간이 다른 경로",
  different_category_composition: "장소 유형 구성이 다른 경로",
};

function routeCategorySummary(route: ProductRouteV1): string {
  const composition = route.categoryComposition ?? Object.fromEntries(
    [...new Set(route.stops.map(({ category }) => category))].map((category) => [
      category,
      route.stops.filter((stop) => stop.category === category).length,
    ]),
  );
  return Object.entries(composition)
    .filter(([, count]) => count > 0)
    .map(([category, count]) =>
      `${CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]} ${count}`)
    .join(" · ");
}

function routeDifferenceSummary(route: ProductRouteV1): string {
  return route.differenceExplanationCodes
    ?.map((code) => ROUTE_DIFFERENCE_COPY[code])
    .find(Boolean) ?? ROUTE_STYLE_COPY[route.style ?? "balanced"];
}

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

function EmptyResult({
  selectionMode,
}: {
  selectionMode: "automatic" | "hybrid";
}) {
  const plannerHref = selectionMode === "hybrid"
    ? "/planner/pet?mode=selected"
    : "/planner/pet";
  return (
    <section className="recommendation-preinput" aria-labelledby="route-empty-heading">
      <h1 id="route-empty-heading">맞춤 일정을 만들려면 여행 조건이 필요합니다.</h1>
      <p>반려견과 출발지, 원하는 하루를 입력하면 확인 가능한 장소부터 일정으로 구성합니다.</p>
      <Link href={plannerHref}>여행 조건 입력하기</Link>
    </section>
  );
}

function LoadingResult({
  conditions,
  onCancel,
}: {
  conditions: string[];
  onCancel: () => void;
}) {
  return (
    <section
      className="recommendation-loading"
      role="status"
      aria-label="맞춤 일정 생성 상태"
      aria-live="polite"
      aria-busy="true"
    >
      <header>
        <h1>맞춤 일정을 만들고 있습니다</h1>
        <p>반려견 동반 근거와 실제 이동 경로를 확인하고 있어요.</p>
      </header>
      {conditions.length > 0 ? (
        <ul className="recommendation-loading__conditions" aria-label="입력한 여행 조건">
          {conditions.map((condition) => <li key={condition}>{condition}</li>)}
        </ul>
      ) : null}
      <div className="recommendation-loading__process">
        <div className="recommendation-loading__activity"><LoaderCircle size={96} strokeWidth={1.5} className="animate-spin" aria-hidden="true" /><PawPrint size={32} aria-hidden="true" /><h2>동선을 계산하고 있어요</h2><p>잠시만 기다려 주세요.</p></div>
        <ol className="recommendation-loading__checks">
          <li><PawPrint size={20} aria-hidden="true" /><div><b>반려동물 조건 확인</b><p>입력한 조건과 장소의 동반 안내를 비교합니다.</p></div></li>
          <li><Route size={20} aria-hidden="true" /><div><b>실제 이동 경로 계산</b><p>장소 사이의 도로와 이동 시간을 확인합니다.</p></div></li>
          <li><Clock3 size={20} aria-hidden="true" /><div><b>방문 순서 구성</b><p>머무는 시간까지 반영해 하루 일정을 구성합니다.</p></div></li>
        </ol>
      </div>
      <div className="recommendation-loading__preview-heading"><h2>추천 일정 미리보기</h2><p>결과가 준비되면 아래에서 확인할 수 있어요.</p></div>
      <ol className="recommendation-loading__stops" aria-hidden="true">
        {[1, 2, 3].map((sequence) => (
          <li key={sequence} className="recommendation-loading-stop">
            <span>{sequence}</span>
            <div><i /><i /></div>
          </li>
        ))}
      </ol>
      <Button type="button" variant="brandSecondary" onClick={onCancel}>요청 취소</Button>
    </section>
  );
}

function FailureResult({
  response,
  onRetry,
  selectionMode,
  regionId,
  hasDistrict,
  hasTimeWindow,
}: {
  response: Exclude<RouteRecommendationResponseV1, { status: "ready" }>;
  onRetry: () => void;
  selectionMode: "automatic" | "hybrid";
  regionId: string;
  hasDistrict: boolean;
  hasTimeWindow: boolean;
}) {
  return (
    <ProductState status="alert" title="일정을 표시할 수 없어요." description={response.userMessage} headingProps={{ id: "route-error-heading" }}>
      <div className="text-left">
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm font-semibold text-[#52665b]">
        {(response.recoveryActions
          ? response.recoveryActions.filter(action =>
            (action !== "widen_district" || hasDistrict) &&
            (action !== "change_time_window" || hasTimeWindow) &&
            !action.startsWith("acknowledge_")
          ).map(action => RECOVERY_ACTION_COPY[action])
          : recommendationActions(response.status)).map((action) => <li key={action}>{action}</li>)}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        {response.retryable ? <Button type="button" variant="brand" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> 다시 시도</Button> : null}
        <Link href={selectionMode === "hybrid" ? "/planner/pet?mode=selected" : "/planner/pet"} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">여행 조건 수정</Link>
        <Link href={selectionMode === "hybrid" ? `/results?tab=catalog&region=${regionId}&mode=select` : `/results?tab=catalog&region=${regionId}`} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">{selectionMode === "hybrid" ? "장소 다시 선택" : "방문 가능한 장소 보기"}</Link>
        {selectionMode === "hybrid" ? <Link href="/planner/pet" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">전체 자동 추천</Link> : null}
      </div>
      </div>
    </ProductState>
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
  regionId,
}: {
  regionId: RegionId;
  route: ProductRouteV1;
  validated: boolean;
  selectedPlaceId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string) => void;
  replacementSupported: boolean;
}) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    const ids = route.stops.filter(stop => stop.source === "tourism_service2").map(stop => stop.placeId.startsWith("tour:") ? stop.placeId : `tour:${stop.placeId}`).filter(id => /^tour:\d+$/.test(id));
    if (ids.length) void requestMapPlaceCardDetails(regionId, "core", ids, controller.signal).then(data => {
      if (!controller.signal.aborted) setPhotos(Object.fromEntries(data.items.filter(item => item.imageUrl).map(item => [item.id, item.imageUrl!])));
    }).catch(() => { /* Photos are optional; keep the complete route usable. */ });
    return () => controller.abort();
  }, [route.stops, regionId]);
  return (
    <ol className="route-result-timeline" aria-label={`${route.label} 방문 순서`}>
      {route.stops.map((stop, index) => {
        const catalogPlaceId = stop.placeId.includes(":")
          ? stop.placeId
          : `${stop.source === "tourism_service2" ? "tour" : "kakao"}:${stop.placeId}`;
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
            <div className="route-result-stop__topline">
            <span className="route-result-stop__time">
              <span>{stop.sequence}</span>
              <b>{validated ? `${koreaTime(stop.arrivalAt, stop.arrivalOffsetSeconds, route.schedule)} 도착` : "경로 재계산 전"}</b>
            </span>
            <button type="button" onClick={() => onSelect(stop.placeId)} className="route-result-stop__select" aria-label={`${stop.title} 지도에서 보기`} aria-pressed={selectedPlaceId === stop.placeId}>
              <MapPinned size={16} aria-hidden="true" /> 지도에서 보기
            </button>
            </div>
            <div className="route-result-stop__overview">
            {photos[stop.placeId.startsWith("tour:") ? stop.placeId : `tour:${stop.placeId}`] ? <PlaceImage imageUrl={photos[stop.placeId.startsWith("tour:") ? stop.placeId : `tour:${stop.placeId}`]} title={stop.title} className="route-result-stop__photo" sizes="140px" /> : null}
            <div className="route-result-stop__body">
            <span className="route-result-stop__tag">{CATEGORY_LABEL[stop.category]}</span>
            <h3 className="route-result-stop__title">{stop.title}</h3>
            <p className="route-result-stop__category">{stop.sourceLabel}</p>
            <p className="route-result-stop__address"><MapPin size={14} aria-hidden="true" />{stop.address}</p>
            <dl className="route-result-stop__facts">
              <div><dt><Clock3 size={15} aria-hidden="true" />예상 체류</dt><dd>{stop.dwellMinutes}분</dd></div>
              <div><dt><PawPrint size={15} aria-hidden="true" />반려동물</dt><dd>{recommendationPetAccessCopy(stop)}</dd></div>
              <div><dt><Car size={15} aria-hidden="true" />이전 지점에서</dt><dd>{validated && stop.driveSecondsFromPrevious > 0 ? `${formatDistance(stop.distanceMetersFromPrevious)} · 약 ${formatDuration(stop.driveSecondsFromPrevious)}` : validated ? "첫 방문지" : "경로 재계산 필요"}</dd></div>
            </dl>
            </div>
            </div>
            {recommendationOperatingWarning(stop) ? <p className="text-sm font-bold text-[#76542f]">{recommendationOperatingWarning(stop)}</p> : null}
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
            <div className="route-result-stop__footer">
            <details className="route-result-stop__details">
              <summary className="cursor-pointer text-sm font-black text-[var(--brand)]">추천 근거와 이용 안내</summary>
              <dl className="route-result-stop__source-facts">
                <div><dt>출발</dt><dd>{validated ? koreaTime(stop.departureAt, stop.departureOffsetSeconds, route.schedule) : "경로 재계산 필요"}</dd></div>
                <div><dt>운영시간</dt><dd>{stop.operatingInformation ?? "정보 없음 · 방문 전 확인"}</dd></div>
                <div><dt>휴무일</dt><dd>{stop.restDayInformation ?? "정보 없음 · 방문 전 확인"}</dd></div>
                <div><dt>출처</dt><dd>{stop.sourceLabel}{stop.retrievedAt ? ` · 확인 ${new Date(stop.retrievedAt).toLocaleDateString("ko-KR")}` : ""}</dd></div>
              </dl>
              <p className="text-xs leading-5 text-[var(--muted)]">운영시간·휴무일은 일정 계산에 반영하지 않으며 방문 전에 확인해 주세요.{stop.operatingInformationRetrievedAt ? ` · 안내 조회 ${new Date(stop.operatingInformationRetrievedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}` : ""}</p>
              <div className="mt-3 grid gap-4 text-sm leading-6 sm:grid-cols-2">
                <div><h4 className="font-black">포함한 이유</h4><ul className="mt-1 space-y-1 text-[var(--muted)]">{inclusion.map((copy) => <li key={copy}>· {copy}</li>)}</ul></div>
                <div><h4 className="font-black">이 위치에 둔 이유</h4>{validated ? <ul className="mt-1 space-y-1 text-[var(--muted)]">{ordering.map((copy) => <li key={copy}>· {copy}</li>)}</ul> : <p className="mt-1 text-[var(--muted)]">경로를 다시 계산한 뒤 표시합니다.</p>}</div>
              </div>
              {warnings.length > 0 ? <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">{[...new Set(warnings)].map((warning) => <li key={warning}>· {warning}</li>)}</ul> : null}
              {stop.evidence.length > 0 ? <div className="mt-3 border-t border-[var(--line)] pt-3"><h4 className="text-sm font-black">보존된 동반 안내 원문</h4>{stop.evidence.map((evidence) => <p key={`${evidence.field}:${evidence.originalText}`} className="mt-2 text-xs leading-5 text-[var(--muted)]"><span className="font-black text-[#405249]">{evidence.label}</span> · {evidence.originalText}</p>)}</div> : null}
              {stop.catalogEvidence?.length ? <div className="mt-3 border-t border-[var(--line)] pt-3"><h4 className="text-sm font-black">공개 카탈로그 출처</h4>{stop.catalogEvidence.map((item) => <p key={`${item.provider}:${item.providerPlaceId}`} className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.provider === "kto" ? "한국관광공사" : "카카오맵"}{item.retrievedAt ? ` · 조회 ${new Date(item.retrievedAt).toLocaleDateString("ko-KR")}` : ""}{item.originalText ? ` · ${item.originalText}` : " · 동반 안내 원문 없음"}</p>)}</div> : null}
            </details>
            <div className="route-result-stop__actions" aria-label={`${stop.title} 순서 편집`}>
              {stop.source === "tourism_service2" ? <Link href={`/places/${catalogPlaceId.slice(5)}?region=${regionId}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-xs font-extrabold text-[var(--brand)]">장소 정보 보기</Link> : null}
              <button type="button" disabled={index === 0} onClick={() => onMove(stop.placeId, -1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-xs font-extrabold disabled:opacity-40"><ArrowUp size={15} aria-hidden="true" /> 앞으로</button>
              <button type="button" disabled={index === route.stops.length - 1} onClick={() => onMove(stop.placeId, 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--line)] px-3 text-xs font-extrabold disabled:opacity-40"><ArrowDown size={15} aria-hidden="true" /> 뒤로</button>
              <button type="button" disabled={route.stops.length <= 1} onClick={() => onRemove(stop.placeId)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#e5bdb7] px-3 text-xs font-extrabold text-[#8d3838] disabled:opacity-40"><Trash2 size={15} aria-hidden="true" /> {editCopy.removeLabel}</button>
            </div>
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
  const { profile, preferences, profileConfirmed, preferencesConfirmed, confirmPlannerAndRequestGeneration, consumeGenerationRequest } = usePlannerState();
  const plannerRegion = getRegionConfigByService2LegalDongCode(preferences.regionCode) ??
    REGION_CONFIGS[0];
  const [response, setResponse] = useState<RouteRecommendationResponseV1 | null>(null);
  const [lastReady, setLastReady] = useState<RouteRecommendationReadyResponseV1 | null>(null);
  const [lastReadyRequest, setLastReadyRequest] = useState<RouteRecommendationRequest | null>(null);
  const lastRequestRef = useRef<RouteRecommendationRequest | null>(null);
  const [answers, setAnswers] = useState<Record<string, ConditionAnswer["answer"]>>({});
  const [manualConfirmation, setManualConfirmation] = useState<RouteRecommendationFailureResponseV1 | null>(null);
  const [excludedIds, setExcludedIds] = useState<string[]>(() => loadPlanDraft()?.excludedPlaceIds ?? []);
  const excludedRef = useRef(excludedIds);
  const [canUndoExclusion, setCanUndoExclusion] = useState(false);
  const exclusionUndo = useRef<Array<{
    ids: string[];
    selection: ReturnType<typeof loadSelectedItinerary>;
    route: ProductRouteV1 | null;
    ready: RouteRecommendationReadyResponseV1 | null;
    request: RouteRecommendationRequest | null;
    editableIds: string[];
    dirty: boolean;
  }>>([]);
  const [saved, setSaved] = useState(false);
  const mapRef = useRef<HTMLElement>(null);
  const [mapFocusKey, setMapFocusKey] = useState(0);
  const [manualError, setManualError] = useState("");
  const persistExclusions = useCallback((ids: string[]) => {
    excludedRef.current = ids; setExcludedIds(ids);
    const draft = loadPlanDraft();
    if (draft && !savePlanDraft({ ...draft, excludedPlaceIds: ids })) setManualError("이번 여행 제외 목록을 저장하지 못했습니다.");
  }, []);
  const [activeRoute, setActiveRoute] = useState<ProductRouteV1 | null>(null);
  const [editableIds, setEditableIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [editDirty, setEditDirty] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const rerollVariantRef = useRef(0);
  const recentSignaturesRef = useRef<string[]>([]);
  const recentCandidateIdsRef = useRef<string[]>([]);
  const historyContextKeyRef = useRef<string | null>(null);
  const historyRegionRef = useRef<RegionId | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusedReadyResponseRef = useRef<RouteRecommendationResponseV1 | null>(null);
  const [hybridSelection, setHybridSelection] = useState(() =>
    selectionMode === "hybrid" ? loadSelectedItinerary() : null);

  const rememberExclusion = useCallback(() => {
    exclusionUndo.current.push({ ids: [...excludedRef.current], selection: hybridSelection,
      route: activeRoute, ready: lastReady, request: lastReadyRequest, editableIds, dirty: editDirty });
    exclusionUndo.current = exclusionUndo.current.slice(-30);
    setCanUndoExclusion(true);
  }, [hybridSelection, activeRoute, lastReady, lastReadyRequest, editableIds, editDirty]);

  const cancelRequest = () => {
    controllerRef.current?.abort();
    requestSequenceRef.current++;
    setLoading(false);
    setRevalidating(false);
  };

  const undoExclusion = () => {
    const previous = exclusionUndo.current.pop();
    setCanUndoExclusion(exclusionUndo.current.length > 0);
    if (!previous) return;
    cancelRequest();
    persistExclusions(previous.ids);
    setHybridSelection(previous.selection);
    if (previous.selection && !saveSelectedItinerary(previous.selection)) setManualError("선택 장소 복원을 저장하지 못했습니다.");
    if (previous.route && previous.ready) {
      setActiveRoute(previous.route); setLastReady(previous.ready); setResponse(previous.ready);
      setLastReadyRequest(previous.request); setEditableIds(previous.editableIds); setEditDirty(previous.dirty);
    }
  };

  const applyTimeToPlanner = useCallback((startTime: string) => {
    const updated = { ...preferences, startTime };
    confirmPlannerAndRequestGeneration(profile, updated);
    consumeGenerationRequest();
    saveTravelPreferences(updated);
    const draft = loadPlanDraft();
    if (draft) savePlanDraft({ ...draft, startTime });
  }, [preferences, profile, confirmPlannerAndRequestGeneration, consumeGenerationRequest]);

  const runRecommendation = useCallback(async (
    mode: "initial" | "reroll" = "initial",
    excludedAutoPlaceId?: string,
    override?: RouteRecommendationRequest,
    applyTime?: string,
  ) => {
    if (!profileConfirmed || !preferencesConfirmed) return;
    const requestRegionId = override?.trip.regionId ?? plannerRegion.id;
    if (historyRegionRef.current !== requestRegionId) {
      const history = loadRecommendationHistory(requestRegionId);
      recentSignaturesRef.current = history?.recentRouteSignatures ?? [];
      recentCandidateIdsRef.current = history?.recentlySelectedCandidateIds ?? [];
      historyContextKeyRef.current = history?.historyContextKey ?? null;
      historyRegionRef.current = requestRegionId;
    }
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    if (mode === "reroll") rerollVariantRef.current += 1;
    setLoading(true);
    setRevalidating(false);
    setManualConfirmation(null);
    setSaveMessage("");
    setSaved(false);
    if (excludedAutoPlaceId) { rememberExclusion(); persistExclusions([...new Set([...excludedRef.current, excludedAutoPlaceId])].slice(-30)); }
    setManualError("");
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    try {
      const history = {
        rerollVariant: rerollVariantRef.current,
        recentRouteSignatures: recentSignaturesRef.current,
        recentlySelectedCandidateIds: recentCandidateIdsRef.current,
        ...(historyContextKeyRef.current
          ? { historyContextKey: historyContextKeyRef.current }
          : {}),
        explicitlyExcludedPlaceIds: excludedRef.current,
      };
      const request = override
        ? { ...override, personalization: override.personalization ? { ...override.personalization, ...history } : undefined }
        : createRouteRecommendationRequest(profile, preferences, history, selectionMode === "hybrid" ? (() => {
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
        return {
          selectedPlaces: selection.places.map(({ id, regionId }) => ({ id, regionId })),
          autoFill: selection.autoFill,
          includeVerificationRequired: selection.includeVerificationRequired,
          selectedCategories: categories,
          acknowledgedVerificationRequiredPlaceIds:
            selection.acknowledgedVerificationRequiredPlaceIds,
        };
      })() : undefined, {
        includeVerificationRequired:
          loadPlanDraft()?.includeVerificationRequired ?? false,
      });
      lastRequestRef.current = request;
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
      // A renewed token asks only the requirements still needing a fresh answer.
      if (parsed.data.status === "confirmation_required") setAnswers({});
      if (parsed.data.status === "ready") {
        const returnedRoutes = parsed.data.routeOptions ?? [parsed.data.route, ...parsed.data.alternatives];
        const selected = returnedRoutes[0] ?? parsed.data.route;
        const contextChanged = Boolean(
          parsed.data.historyContextKey &&
          historyContextKeyRef.current &&
          parsed.data.historyContextKey !== historyContextKeyRef.current,
        );
        recentSignaturesRef.current = [
          ...(contextChanged ? [] : recentSignaturesRef.current),
          ...(selected.routeSignature ? [selected.routeSignature] : []),
        ].slice(-12);
        recentCandidateIdsRef.current = [
          ...recentCandidateIdsRef.current,
          ...selected.stops
            .filter(({ selectionOrigin }) => selectionOrigin !== "user_selected")
            .map(({ placeId }) => placeId),
        ].slice(-30);
        historyContextKeyRef.current = parsed.data.historyContextKey ?? null;
        if (!saveRecommendationHistory(requestRegionId, {
          recentRouteSignatures: recentSignaturesRef.current,
          recentlySelectedCandidateIds: recentCandidateIdsRef.current,
          ...(historyContextKeyRef.current ? { historyContextKey: historyContextKeyRef.current } : {}),
        })) setManualError("최근 추천 이력을 저장하지 못해 화면을 다시 열면 같은 장소가 추천될 수 있습니다.");
        setLastReady(parsed.data);
        setLastReadyRequest(request);
        if (applyTime && selected.schedule?.state !== "adjustment_proposal") {
          applyTimeToPlanner(applyTime);
        }
        setActiveRoute(selected);
        setEditableIds(selected.stops.map(({ placeId }) => placeId));
        setEditDirty(false);
        setSelectedPlaceId(selected.stops[0]?.placeId ?? null);
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
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (requestSequenceRef.current === requestSequence) setLoading(false);
    }
  }, [hybridSelection, preferences, preferencesConfirmed, profile, profileConfirmed, selectionMode, persistExclusions, rememberExclusion, applyTimeToPlanner, plannerRegion.id]);

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
    if (response?.status === "confirmation_required" || manualConfirmation) confirmationHeadingRef.current?.focus();
  }, [response, manualConfirmation]);

  const ready = lastReady;
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
  useLayoutEffect(() => {
    if (!ready || !displayedRoute || focusedReadyResponseRef.current === ready) return;
    focusedReadyResponseRef.current = ready;
    resultHeadingRef.current?.focus();
  }, [displayedRoute, ready]);
  const submittedConditions = [
    profile.name.trim()
      ? `${profile.name.trim()} · ${PET_SPECIES_LABEL[profile.species]} · ${PET_SIZE_LABEL[profile.size]}`
      : null,
    preferences.departure?.label
      ? `${preferences.departure.label} 출발`
      : null,
    preferences.tripDate && preferences.startTime
      ? `${preferences.tripDate} · ${preferences.startTime}`
      : null,
  ].filter((condition): condition is string => Boolean(condition));
  const routeLocations = useMemo<KakaoMapLocation[]>(() => {
    if (!displayedRoute || !ready) return [];
    return [
      {
        id: "route-departure",
        name: ready.requestSummary.departureLabel,
        address: "출발지",
        coordinates: lastReadyRequest ? { latitude: lastReadyRequest.departure.latitude, longitude: lastReadyRequest.departure.longitude } : undefined,
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
  }, [displayedRoute, lastReadyRequest, ready]);

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

  const showPlaceOnMap = (id: string) => {
    setSelectedPlaceId(id);
    setMapFocusKey(value => value + 1);
    mapRef.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const moveStop = (id: string, direction: -1 | 1) => {
    const index = editableIds.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= editableIds.length) return;
    const next = [...editableIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setEditableIds(next);
    if (selectionMode === "hybrid" && hybridSelection) {
      const selectedById = new Map(
        hybridSelection.places.map((place) => [place.id, place]),
      );
      const orderedSelected = next.flatMap((placeId) => {
        const place = selectedById.get(placeId);
        return place ? [place] : [];
      });
      const nextSelection = { ...hybridSelection, places: orderedSelected };
      setHybridSelection(nextSelection);
      if (!saveSelectedItinerary(nextSelection)) {
        setManualError("선택 장소 순서를 브라우저에 저장하지 못했습니다.");
      }
    }
    setEditDirty(true);
    if (!(selectionMode === "hybrid" && hybridSelection)) setManualError("");
  };

  const removeStop = (id: string) => {
    rememberExclusion();
    persistExclusions([...new Set([...excludedRef.current, id])].slice(-30));
    const removedStop = displayedRoute?.stops.find(({ placeId }) => placeId === id);
    let persistenceError = "";
    if (
      selectionMode === "hybrid" &&
      removedStop?.selectionOrigin === "user_selected" &&
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

  const replacePendingPlace = (placeId: string) => {
    const current = lastRequestRef.current;
    if (!current) return;
    rememberExclusion();
    const ids = [...new Set([...excludedRef.current, placeId])].slice(-30);
    persistExclusions(ids);
    if (hybridSelection?.places.some(place => place.id === placeId)) {
      const nextSelection = removeSelectedItineraryPlace(hybridSelection, placeId);
      setHybridSelection(nextSelection);
      if (!saveSelectedItinerary(nextSelection)) setManualError("선택 해제를 저장하지 못했습니다.");
    }
    const selected = (current.selectedPlaceIds ?? []).filter(id => id !== placeId);
    if (selectionMode === "hybrid" && selected.length === 0) {
      setManualError("남은 선택 장소가 없습니다. 장소 선택 화면에서 다른 곳을 담아 주세요.");
      return;
    }
    void runRecommendation("reroll", undefined, { ...current, conditionConfirmation: undefined,
      selectedPlaceIds: selected, selectedPlaceReferences: current.selectedPlaceReferences?.filter(ref => ref.placeId !== placeId),
      personalization: { ...current.personalization!, explicitlyExcludedPlaceIds: ids } });
  };

  const revalidate = async (conditionAnswers?: ConditionAnswer[], applyScheduleProposal = false) => {
    if (!ready || (!editDirty && !applyScheduleProposal && !manualConfirmation) || revalidating) return;
    const sequence = ++requestSequenceRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setRevalidating(true);
    setManualError("");
    try {
      const responseValue = await fetch("/api/itineraries/revalidate", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ editSessionId: manualConfirmation?.confirmationToken ?? ready.editSessionId, orderedPlaceIds: editableIds, conditionAnswers, ...(applyScheduleProposal ? { applyScheduleProposal: true } : {}) }),
        signal: controller.signal,
      });
      const parsed = manualRouteValidationResponseSchema.safeParse(await responseValue.json());
      if (controller.signal.aborted || sequence !== requestSequenceRef.current) return;
      if (!parsed.success) throw new Error("수정한 일정의 응답을 확인하지 못했습니다.");
      if (parsed.data.status !== "ready") {
        if (parsed.data.status === "confirmation_required" && parsed.data.routeOptions?.[0]) {
          setManualConfirmation(parsed.data);
          setAnswers({});
        }
        setManualError(parsed.data.userMessage);
        return;
      }
      setManualConfirmation(null);
      const route = parsed.data.route;
      const appliedTime = route.schedule?.requested.startTime;
      if (appliedTime && lastReadyRequest && appliedTime !== lastReadyRequest.trip.startTime && route.schedule?.state !== "adjustment_proposal") {
        applyTimeToPlanner(appliedTime);
        const updatedRequest = { ...lastReadyRequest, trip: { ...lastReadyRequest.trip, startTime: appliedTime } };
        setLastReadyRequest(updatedRequest);
        lastRequestRef.current = updatedRequest;
        setLastReady({ ...ready, editSessionId: parsed.data.editSessionId ?? ready.editSessionId, route, routeOptions: [route], alternatives: [], requestSummary: { ...ready.requestSummary, startTime: appliedTime } });
      } else if (parsed.data.editSessionId) setLastReady({ ...ready, editSessionId: parsed.data.editSessionId });
      setActiveRoute(parsed.data.route);
      setEditableIds(parsed.data.route.stops.map(({ placeId }) => placeId));
      setEditDirty(false);
      setSelectedPlaceId(parsed.data.route.stops[0]?.placeId ?? null);
    } catch {
      if (controller.signal.aborted || sequence !== requestSequenceRef.current) return;
      setManualError("경로를 다시 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
    } finally {
      if (sequence === requestSequenceRef.current) setRevalidating(false);
    }
  };

  const presentationState = getRecommendationPresentationState({
    inputConfirmed: profileConfirmed && preferencesConfirmed,
    loading,
    response,
    hasDisplayedRoute: Boolean(displayedRoute),
  });

  if (presentationState === "missing_input") {
    return <EmptyResult selectionMode={selectionMode} />;
  }
  if (presentationState === "generating" && !displayedRoute) {
    return <LoadingResult conditions={submittedConditions} onCancel={cancelRequest} />;
  }
  const confirmation = manualConfirmation ?? (response?.status === "confirmation_required" ? response : null);
  if (confirmation?.routeOptions?.[0]) {
    const pendingRoute = confirmation.routeOptions[0];
    return <section className="space-y-5" aria-labelledby="condition-confirmation-heading">
      <h1 id="condition-confirmation-heading" ref={confirmationHeadingRef} tabIndex={-1} className="text-2xl font-black">이 일정에 필요한 사실만 확인해 주세요</h1>
      <p>도로 경로를 계산했습니다. 아래 입장 조건의 확인이 끝나면 일정을 다시 검증합니다.</p>
      <ol className="space-y-2">{pendingRoute.stops.map((stop) => <li key={stop.placeId}>{stop.sequence}. {stop.title} · {koreaTime(stop.arrivalAt, stop.arrivalOffsetSeconds, pendingRoute.schedule)} · 예상 체류 {stop.dwellMinutes}분</li>)}</ol>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!confirmation.confirmationToken) return;
        const conditionAnswers = Object.entries(answers).map(([requirementId, answer]) => ({ requirementId, answer }));
        if (manualConfirmation) { void revalidate(conditionAnswers); return; }
        if (lastRequestRef.current) void runRecommendation("initial", undefined, { ...lastRequestRef.current, conditionConfirmation: { token: confirmation.confirmationToken, answers: conditionAnswers } });
      }}>
        {confirmation.confirmationRequirements?.map((item) => <fieldset key={item.placeId} className="my-4 rounded-lg border border-[var(--line)] p-4">
          <legend className="font-bold">{item.title}</legend>
          {item.questions?.map((question) => <div key={question.requirementId} className="my-4 space-y-2">
            <label htmlFor={question.requirementId} className="block font-semibold">{question.label}</label>
            <blockquote className="whitespace-pre-wrap text-sm text-[#52635a]" id={question.requirementId + "-source"}>원문: {question.sourceText}</blockquote>
            <select id={question.requirementId} aria-describedby={question.requirementId + "-source"} value={answers[question.requirementId] ?? ""} onChange={(event) => {
              const value = event.currentTarget.value;
              setAnswers(current => { const next = { ...current }; if (value) next[question.requirementId] = value as ConditionAnswer["answer"]; else delete next[question.requirementId]; return next; });
            }} className="min-h-11 max-w-full rounded border p-2">
              <option value="">아직 확인하지 않았어요</option>
              {question.answers.map(answer => <option key={answer} value={answer}>{answer === "confirmed" ? "이 조건을 충족함을 확인했어요" : answer === "not_applicable" ? "제 반려동물은 이 제한의 대상이 아니에요" : "충족할 수 없어요"}</option>)}
            </select>
          </div>)}
          <Button type="button" variant="brandSecondary" disabled={loading || revalidating} onClick={() => replacePendingPlace(item.placeId)}>이 장소 대신 다시 추천</Button>
        </fieldset>)}
        <Button type="submit" variant="brand" disabled={loading || revalidating}>답변한 조건 다시 확인</Button>
        {manualConfirmation ? <Button type="button" variant="brandSecondary" onClick={() => { cancelRequest(); setManualConfirmation(null); setManualError(""); }}>경로 편집으로 돌아가기</Button> : null}
        <Link href="/planner/pet" className="ml-4 underline">여행 입력으로 돌아가기</Link>
        <Link href={`/results?tab=catalog&region=${plannerRegion.id}&mode=select`} className="ml-4 underline">장소 다시 선택</Link>
      </form>
      {manualError ? <p role="alert">{manualError}</p> : null}
      <MapPanel regionId={plannerRegion.id} compact locations={pendingRoute.stops.map(stop => ({ id: stop.placeId, name: stop.title, address: stop.address ?? "", coordinates: stop.coordinates, order: stop.sequence }))}
        routeCoordinates={pendingRoute.geometry}
        title="확인 중인 제안 경로" />
      {loading || revalidating ? <p role="status">답변과 현재 근거를 다시 확인하고 있습니다.</p> : null}
    </section>;
  }
  if (
    !displayedRoute && presentationState === "failed" &&
    response &&
    response.status !== "ready"
  ) {
    return <div ref={errorRef} tabIndex={-1}><FailureResult response={response} onRetry={() => void runRecommendation()} selectionMode={selectionMode} regionId={plannerRegion.id} hasDistrict={Boolean(preferences.districtCode)} hasTimeWindow={Boolean(preferences.startTime || preferences.desiredDurationMinutes)} /></div>;
  }
  if (presentationState === "ready_to_generate" || !ready || !displayedRoute) {
    return <ProductState title="추천 일정을 만들어 볼까요?" description="확정한 여행 조건을 바탕으로 방문 순서와 이동 시간을 확인합니다."><Button type="button" variant="brand" onClick={() => void runRecommendation()}>추천 일정 만들기</Button></ProductState>;
  }

  const summary = displayedRoute.routeSummary;
  const exact = ready.optimality === "optimal_within_candidate_set_current_matrix";
  const availableRoutes = ready.routeOptions ?? [ready.route, ...ready.alternatives];
  const replacementSupported = ready.alternativeAvailability === "available";
  const hybridAutoFill = selectionMode === "hybrid" && hybridSelection?.autoFill === true;
  const hasAutoFilledStops = displayedRoute.stops.some(({ provenance }) => provenance === "auto_fill");
  const rerollUi = recommendationRerollUiState(ready);
  const reducedCopy = ready.resultState === "single_stop_suggestion"
    ? "한 곳을 중심으로 짧은 이동 경로를 계산했어요."
    : ready.resultState === "ready_with_reduced_stops"
      ? `요청한 ${displayedRoute.requestedTarget ?? "목표"}곳보다 적은 ${summary.stopCount}곳으로 이동 경로를 계산했어요.`
      : null;
  const saveItinerary = async () => {
    const snapshot = createSavedRouteRecommendation(ready, displayedRoute, new Date(), lastReadyRequest?.departure);
    if (!snapshot) {
      setSaveMessage("저장할 일정 정보를 확인해 주세요.");
      return;
    }
    setSaved(false);
    const result = await saveAccountItinerary(snapshot);
    setSaved(result.ok);
    setSaveMessage(result.ok ? "마이페이지에 일정을 저장했습니다." : result.message);
  };
  return (
    <div className="route-redesign space-y-6" aria-busy={loading || revalidating}>
      {loading ? <p role="status">새 일정을 확인하고 있습니다. 이전 경로를 계속 볼 수 있어요. <button type="button" className="underline" onClick={() => { controllerRef.current?.abort(); requestSequenceRef.current++; setLoading(false); setRevalidating(false); }}>요청 취소</button></p> : null}
      {response && response.status !== "ready" ? <section role="alert" className="rounded border border-[#dfccb3] bg-[#fff8ec] p-4"><p>{response.userMessage}</p><p>아래 경로는 마지막으로 성공한 입력 기준입니다.</p><Button type="button" onClick={() => void runRecommendation()}>현재 입력으로 다시 시도</Button><Link href="/planner/pet" className="ml-4 underline">입력 수정</Link></section> : null}
      {excludedIds.length ? <div className="text-sm">이번 여행에서 {excludedIds.length}곳 제외 <button type="button" className="ml-3 min-h-11 underline disabled:opacity-50" disabled={!canUndoExclusion} onClick={undoExclusion}>마지막 제외 실행 취소</button><button type="button" className="ml-3 min-h-11 underline" onClick={() => { rememberExclusion(); persistExclusions([]); }}>이번 여행 제외 초기화</button></div> : null}
      {displayedRoute.schedule?.operatingAvailability === "requires_confirmation" && !displayedRoute.schedule.requested.date && displayedRoute.schedule.state !== "adjustment_proposal" ? <p className="text-sm text-[#76542f]">운영시간 미상 장소가 있습니다. 영업을 확정한 결과가 아닙니다.</p> : null}
      <header className="route-result-header">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <p className="eyebrow">{editDirty ? "수정 중인 일정" : displayedRoute.kind === "manual" ? "직접 수정한 일정" : "WEEKENDOG 추천 일정"}</p>
            <h1 ref={resultHeadingRef} tabIndex={-1} className="mt-2 text-3xl font-black tracking-[-0.045em] [overflow-wrap:anywhere]">{ready.requestSummary.departureLabel}에서 시작하는 {summary.stopCount}곳 일정</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">{editDirty ? displayedRoute.planningPolicy === "full_public_catalog_v1" ? "방문 순서를 수정했습니다. 도로 이동시간을 다시 계산하면 초안으로 저장할 수 있습니다." : "방문 순서를 수정했습니다. 실제 거리와 운영시간을 다시 확인해야 확정됩니다." : displayedRoute.kind === "manual" ? "직접 정한 방문 순서의 이동 경로를 다시 확인한 결과입니다." : reducedCopy ?? (exact ? "현재 후보와 확인된 이동 정보 안에서 가장 적합한 일정을 찾았습니다." : "제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다.")}</p>
            {!editDirty && displayedRoute.kind !== "manual" && reducedCopy && !exact ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/results?tab=catalog&region=${plannerRegion.id}&mode=select`} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">
              장소 추가
            </Link>
            <Button type="button" variant="brandSecondary" disabled={editDirty || loading || revalidating} onClick={() => void saveItinerary()}><Save size={16} aria-hidden="true" /> 일정 저장</Button>
            {selectionMode === "automatic" || (hybridAutoFill && hasAutoFilledStops) ? (
              <Button type="button" variant="brandSecondary" disabled={rerollUi.kind === "exhausted"} onClick={() => void runRecommendation("reroll")}><RefreshCw size={16} aria-hidden="true" /> {rerollUi.buttonLabel}</Button>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-sm text-[#52635a]">계정에 최대 5개 일정을 저장할 수 있습니다. {displayedRoute.planningPolicy === "full_public_catalog_v1" ? "전체 장소 기반 경로는 일정 초안으로 보관됩니다." : "미정 일정과 미적용 제안은 초안으로 보관됩니다."}</p>
        {saved ? <Link href="/account" className="mt-3 inline-flex min-h-11 items-center font-bold underline">마이페이지에서 보기</Link> : null}
        <dl className="route-result-summary">
          <div><dt>일정</dt><dd>{ready.requestSummary.tripDate} · {editDirty ? "시간 재계산 필요" : `${koreaTime(summary.startAt, 0, displayedRoute.schedule)} ~ ${koreaTime(summary.endAt, summary.totalElapsedSeconds, displayedRoute.schedule)}`}</dd></div>
          <div><dt>여행 속도</dt><dd>{PACE_LABEL[ready.requestSummary.tripPace]} · 총 {summary.stopCount}곳</dd></div>
          <div><dt>이동</dt><dd>{editDirty ? "경로 재계산 필요" : `${formatDistance(summary.totalDistanceMeters)} · 약 ${formatDuration(summary.totalDrivingSeconds)}`}</dd></div>
          <div><dt>방문</dt><dd>{editDirty ? `총 ${summary.stopCount}곳` : `${formatDuration(summary.totalVisitSeconds)}${summary.totalWaitSeconds > 0 ? ` · 대기 ${formatDuration(summary.totalWaitSeconds)}` : ""}`}</dd></div>
        </dl>
      </header>

      {ready.selectionIssues && ready.selectionIssues.length > 0 ? (
        <section className="rounded-lg border border-[#eed8ae] bg-[#fff8ec] p-4" aria-labelledby="selection-issues-heading">
          <h2 id="selection-issues-heading" className="flex items-center gap-2 text-sm font-black text-[#76542f]"><AlertTriangle size={17} aria-hidden="true" /> 선택 장소 확인사항</h2>
          <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-[#76542f]">
            {ready.selectionIssues.map((issue) => <li key={`${issue.placeId}:${issue.code}`}>· {SELECTION_ISSUE_COPY[issue.code] ?? "선택한 장소에 추가 확인이 필요합니다."}</li>)}
          </ul>
        </section>
      ) : null}

      {ready.routeOptions || availableRoutes.length > 1 ? (
        <section className="route-result-alternatives" aria-labelledby="route-alternatives-heading">
          <h2 id="route-alternatives-heading" className="text-base font-black">어떤 일정이 좋으세요?</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="일정 대안">
            {availableRoutes.map((route) => {
              const noticeCount = route.stops.filter((stop) =>
                Boolean(recommendationOperatingWarning(stop))).length;
              const reduced = route.reductionStatus === "reduced" ||
                route.reductionStatus === "single_stop";
              return (
                <button
                  key={route.id}
                  type="button"
                  role="tab"
                  id={`route-tab-${route.id}`}
                  aria-controls={`route-panel-${route.id}`}
                  tabIndex={activeRoute?.id === route.id ? 0 : -1}
                  onKeyDown={(event) => {
                    const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>("[role=tab]"));
                    const index = tabs.indexOf(event.currentTarget);
                    const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : -1;
                    if (target >= 0) { event.preventDefault(); tabs[target]!.click(); tabs[target]!.focus(); }
                  }}
                  aria-selected={activeRoute?.id === route.id}
                  aria-label={`${route.label}: ${route.routeSummary.stopCount}곳, 이동 ${formatDuration(route.routeSummary.totalDrivingSeconds)}`}
                  onClick={() => {
                    setActiveRoute(route);
                    setEditableIds(route.stops.map(({ placeId }) => placeId));
                    setEditDirty(false);
                    setSelectedPlaceId(route.stops[0]?.placeId ?? null);
                    setManualError("");
                  }}
                  className={`grid min-h-11 min-w-[220px] gap-1 rounded-lg border px-4 py-3 text-left text-sm ${activeRoute?.id === route.id ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}
                >
                  <strong className="font-black">{route.label}</strong>
                  <span className="route-option-description">{ROUTE_STYLE_COPY[route.style ?? "balanced"]}</span>
                  <span className="route-option-meta text-xs font-bold">{route.routeSummary.stopCount}곳 · 이동 {formatDuration(route.routeSummary.totalDrivingSeconds)} · 대기 {formatDuration(route.routeSummary.totalWaitSeconds)}</span>
                  <span className="route-option-meta text-xs">종료 {koreaTime(route.estimatedFinishAt ?? route.routeSummary.endAt, route.routeSummary.totalElapsedSeconds, route.schedule)} · {routeCategorySummary(route) || "장소 유형 확인"}</span>
                  <span className="route-option-meta text-xs">자동 추가 {route.automaticPlaceCount ?? route.stops.filter(({ provenance }) => provenance === "auto_fill").length}곳 · 운영 안내 {noticeCount}곳</span>
                  {reduced ? <span className="text-xs font-bold text-[#76542f]">축소 결과 · 이동시간 안에 계산한 경로</span> : null}
                  <span className="route-option-meta text-xs leading-5">차이: {routeDifferenceSummary(route)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div role="tabpanel" id={`route-panel-${displayedRoute.id}`} aria-labelledby={`route-tab-${displayedRoute.id}`} className="route-result-columns">
        <section className="min-w-0" aria-labelledby="route-timeline-heading">
          <h2 id="route-timeline-heading" className="route-timeline-heading"><Route size={21} aria-hidden="true" />출발지부터 이어지는 실제 이동 순서</h2>
          <Timeline regionId={plannerRegion.id} route={displayedRoute} validated={!editDirty} selectedPlaceId={selectedPlaceId} onSelect={showPlaceOnMap} onMove={moveStop} onRemove={removeStop} onReplace={(id) => void runRecommendation("reroll", id)} replacementSupported={replacementSupported} />
          {editDirty ? <div className="route-result-edit-bar"><p className="mr-auto text-sm font-bold text-[#52665b]">순서 또는 방문지를 바꿨습니다. 실제 경로를 다시 확인해 주세요.</p><Button type="button" variant="brand" disabled={revalidating} onClick={() => void revalidate()}>{revalidating ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} 경로 다시 계산</Button><Button type="button" variant="brandSecondary" onClick={() => { setActiveRoute(ready.route); setEditableIds(ready.route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(ready.route.stops[0]?.placeId ?? null); setManualError(""); }}><RotateCcw size={16} aria-hidden="true" /> 원래 추천 복원</Button></div> : null}
          {manualError ? <p className="mt-3 rounded-xl border border-[#e5bdb7] bg-[#fff1ef] p-4 text-sm font-bold text-[#823f36]" role="alert">{manualError}</p> : null}
        </section>

        <aside ref={mapRef} className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="추천 일정 지도"><h2 className="route-map-title"><MapPinned size={20} aria-hidden="true" />이동 경로</h2>
          <MapPanel regionId={plannerRegion.id} compact locations={routeLocations} routeCoordinates={editDirty ? [] : displayedRoute.geometry} selectedLocationId={selectedPlaceId} selectionFocusKey={mapFocusKey} onLocationSelect={selectPlace} viewportKey={`route:${displayedRoute.id}:${editDirty ? "draft" : "validated"}`} title="추천 일정 이동 경로" locationLabel={`${summary.stopCount}곳 방문 일정`} emptyMessage={editDirty ? "수정한 순서를 재계산하면 이동 경로를 표시합니다." : "확인된 이동 경로가 없습니다."} />
          <p className="route-result-map-note"><MapPinned className="mr-1 inline" size={14} aria-hidden="true" /> {editDirty ? "번호는 수정한 방문 순서입니다. 경로 재계산 전에는 선을 표시하지 않습니다." : "번호는 방문 순서이며 선은 확인된 최종 이동 경로입니다."}</p>
          <section className="route-result-reliability" aria-labelledby="route-reliability-heading"><h2 id="route-reliability-heading" className="flex items-center gap-2 text-sm font-black"><ShieldCheck size={17} className="text-[var(--brand)]" aria-hidden="true" /> 정보 안내</h2><p className="mt-2 text-xs leading-6 text-[var(--muted)]">한국관광공사와 카카오의 등록 장소를 출처와 이용 조건과 함께 표시합니다. 이동 경로 계산은 시설 영업을 보장하지 않으므로 운영시간 안내를 확인해 주세요.</p></section>
          {displayedRoute.kind === "manual" && ready.route.kind !== "manual" ? <Button type="button" variant="brandSecondary" className="mt-4 w-full" onClick={() => { setActiveRoute(ready.route); setEditableIds(ready.route.stops.map(({ placeId }) => placeId)); setEditDirty(false); setSelectedPlaceId(ready.route.stops[0]?.placeId ?? null); }}><RotateCcw size={16} aria-hidden="true" /> 원래 추천 일정 복원</Button> : null}
        </aside>
      </div>
      <section className="route-result-save-cta" aria-labelledby="route-save-heading">
        <div>
          <h2 id="route-save-heading">이 일정으로 여행을 시작해볼까요?</h2>
          <p>{ready.requestSummary.tripDate} · {summary.stopCount}곳 · 이동 {formatDuration(summary.totalDrivingSeconds)}</p>
          {saveMessage ? <p className="mt-2 text-sm font-bold text-[var(--brand)]" role="status">{saveMessage}</p> : null}
        </div>
        <Button type="button" variant="brand" aria-label="하단 저장" disabled={editDirty || loading || revalidating} onClick={() => void saveItinerary()}><Save size={16} aria-hidden="true" /> 이 일정 저장하기</Button>
      </section>
    </div>
  );
}
