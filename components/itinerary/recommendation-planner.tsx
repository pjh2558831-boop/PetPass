"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  MapPinned,
  PawPrint,
  RefreshCw,
  Route,
  ShieldAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ConfirmedTripSummary } from "@/components/itinerary/confirmed-trip-summary";
import { RouteStopCard } from "@/components/itinerary/route-stop-card";
import { MapPanel } from "@/components/map/map-panel";
import { usePlannerState } from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import {
  createItineraryPresentation,
  formatKoreanDurationMinutes,
  GENERATED_PET_VERDICT_COPY,
} from "@/lib/itinerary/presentation";
import type { ItineraryGenerationRequest } from "@/lib/itinerary/request-schema";
import { itineraryGenerationResponseSchema } from "@/lib/itinerary/response-schema";
import {
  BUSAN_REGION,
  isBusanDistrictCode,
  type TourCatalogCategory,
} from "@/lib/tour-api/catalog";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import type { ApiResult } from "@/types/api";
import type { PetProfile, TravelPreferences } from "@/types/pet";
import type {
  GeneratedItinerary,
  ItineraryGenerationResponse,
} from "@/types/route-generation";

const DEFAULT_DEPARTURE = {
  label: "부산역",
  coordinates: { latitude: 35.1151, longitude: 129.0414 },
} as const;

const PREFERENCE_CATEGORY_MAP = {
  ATTRACTION: "attraction",
  RESTAURANT: "food",
  CAFE: "food",
  ACCOMMODATION: "accommodation",
  WALK: "leisure",
} as const satisfies Record<
  TravelPreferences["preferredCategories"][number],
  TourCatalogCategory
>;

function categoriesFromPreferences(
  preferences: TravelPreferences,
): TourCatalogCategory[] {
  const categories: TourCatalogCategory[] = preferences.preferredCategories.map(
    (category) => PREFERENCE_CATEGORY_MAP[category],
  );
  if (preferences.includeShopping) categories.push("shopping");
  return Array.from(new Set(categories));
}

function createGenerationRequest(
  profile: PetProfile,
  preferences: TravelPreferences,
  operation: "initial" | "reroll",
  recentRouteSignatures: string[],
): ItineraryGenerationRequest {
  const departure = preferences.departure ?? DEFAULT_DEPARTURE;
  const scope =
    preferences.regionCode === BUSAN_REGION.code &&
    isBusanDistrictCode(preferences.districtCode)
      ? { type: "district" as const, districtCode: preferences.districtCode }
      : { type: "busan" as const };
  const planning =
    preferences.planningMode === "duration"
      ? {
          desiredDurationMinutes: preferences.desiredDurationMinutes ?? 360,
        }
      : { desiredStopCount: preferences.desiredStopCount ?? 3 };

  return {
    scope,
    start: {
      label: departure.label,
      coordinates: departure.coordinates,
    },
    travelDate: preferences.tripDate,
    startTime: preferences.startTime,
    planning,
    petSize: profile.size,
    petEquipment: {
      hasCarrier: profile.hasCarrier,
      hasLeash: profile.hasLeash,
      hasMuzzle: profile.hasMuzzle,
    },
    indoorAccessPreference: preferences.indoorAccessPreference ?? "any",
    selectedCategories: categoriesFromPreferences(preferences),
    includeShopping: preferences.includeShopping ?? false,
    generationSeed:
      operation === "initial"
        ? "initial"
        : globalThis.crypto.randomUUID(),
    recentRouteSignatures:
      operation === "reroll" ? recentRouteSignatures : [],
  };
}

function generationStateCopy(state: ItineraryGenerationResponse["state"]): {
  title: string;
  description: string;
  tone: string;
} {
  if (state === "ready") {
    return {
      title: "확인된 조건으로 실제 경로를 만들었어요.",
      description: "반환된 경로만 순서대로 비교할 수 있습니다. 전략을 바꿔도 새 요청은 보내지 않습니다.",
      tone: "border-[#cce2d5] bg-[#edf8f2] text-[#285c45]",
    };
  }
  if (state === "partial") {
    return {
      title: "일부 제공자 응답이 불완전한 상태예요.",
      description: "표시된 장소와 경로는 사용할 수 있지만, 누락된 후보가 있을 수 있습니다.",
      tone: "border-[#ead7b8] bg-[#fff8ec] text-[#76542f]",
    };
  }
  if (state === "provider_unavailable") {
    return {
      title: "현재 경로 제공자 정보를 모두 확인하지 못했어요.",
      description: "제공자 장애를 동반 불가로 해석하지 않았습니다. 같은 조건으로 다시 시도할 수 있습니다.",
      tone: "border-[#edcaca] bg-[#fdf0f0] text-[#853e3e]",
    };
  }
  return {
    title: "조건을 충족하는 실제 장소가 충분하지 않아요.",
    description: "근거가 부족하거나 지원되지 않는 장소를 임의로 채우지 않았습니다.",
    tone: "border-[#d8ddd9] bg-[#f5f6f4] text-[#56655d]",
  };
}

function ResultsEmptyState() {
  return (
    <section className="surface-panel mx-auto max-w-3xl p-7 text-center sm:p-10" aria-labelledby="results-empty-heading">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
        <Route size={22} aria-hidden="true" />
      </span>
      <p className="eyebrow mt-4">추천 준비가 필요해요</p>
      <h1 id="results-empty-heading" className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
        확정된 여행 조건이 없습니다.
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--muted)]">
        새로고침하거나 이 주소로 바로 들어오면 이전 결과를 복원하지 않습니다. 반려동물과 출발지를 다시 확인해 실제 경로를 만들어 주세요.
      </p>
      <Link
        href="/planner/pet"
        className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-sm font-extrabold text-white shadow-[var(--shadow-button)] hover:bg-[var(--brand-deep)]"
      >
        여행 정보 입력하기
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </section>
  );
}

function ResultsLoadingState({ reroll }: { reroll: boolean }) {
  if (reroll) {
    return (
      <section
        className="rounded-[var(--radius-card)] border border-[#cce2d5] bg-[#f4faf6] p-4"
        aria-live="polite"
        aria-busy="true"
        aria-label="다른 경로 계산 중"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle className="animate-spin text-[var(--brand)]" size={20} aria-hidden="true" />
          <div>
            <h2 className="text-sm font-black">현재 결과를 유지한 채 다른 조합을 계산하고 있어요.</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">완료되기 전까지 아래 경로를 계속 확인할 수 있습니다.</p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section
      className="surface-panel overflow-hidden p-5 sm:p-6"
      aria-live="polite"
      aria-busy="true"
      aria-label="추천 경로 계산 중"
    >
      <div className="flex items-center gap-3">
        <LoaderCircle className="animate-spin text-[var(--brand)]" size={22} aria-hidden="true" />
        <div>
          <h2 className="font-black">조건에 맞는 실제 경로를 계산하고 있어요.</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">관광공사 동반 근거를 확인한 뒤 Kakao 실제 이동 경로를 계산합니다.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-2xl bg-[#eef2ee]" />
        ))}
      </div>
    </section>
  );
}

function StrategyCard({
  itinerary,
  selected,
  index,
  onSelect,
  onKeyDown,
  tabRef,
}: {
  itinerary: GeneratedItinerary;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  tabRef: (node: HTMLButtonElement | null) => void;
}) {
  const presentation = createItineraryPresentation(itinerary, {
    hasCarrier: null,
    hasLeash: null,
    hasMuzzle: null,
  });
  const elapsed = formatKoreanDurationMinutes(
    presentation.metrics.estimatedElapsedDurationMinutes,
  );

  return (
    <button
      ref={tabRef}
      id={`strategy-tab-${index}`}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls="selected-strategy-panel"
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`min-h-44 rounded-[var(--radius-card)] border p-4 text-left shadow-[var(--shadow-card)] transition-colors sm:p-5 ${
        selected
          ? "border-[var(--mint-500)] bg-[#f3faf6] ring-2 ring-[rgba(61,139,104,.14)]"
          : "border-[var(--line)] bg-white hover:border-[#9bb9a9]"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs font-black text-[var(--brand)]">경로 {index + 1}</span>
        {selected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand)] px-2.5 py-1 text-[11px] font-black text-white">
            <CheckCircle2 size={13} aria-hidden="true" /> 선택됨
          </span>
        ) : (
          <span className="text-[11px] font-bold text-[var(--muted)]">선택해서 비교</span>
        )}
      </span>
      <span className="mt-3 block text-lg font-black tracking-[-0.03em]">{itinerary.title}</span>
      <span className="mt-2 line-clamp-2 block text-xs leading-5 text-[var(--muted)]">{itinerary.explanation}</span>
      <span className="mt-4 grid grid-cols-3 gap-2 text-center">
        <span className="rounded-xl bg-white/80 px-2 py-2">
          <span className="block text-[10px] font-bold text-[var(--muted)]">장소</span>
          <span className="mt-0.5 block text-xs font-black">{presentation.metrics.stopCount}곳</span>
        </span>
        <span className="rounded-xl bg-white/80 px-2 py-2">
          <span className="block text-[10px] font-bold text-[var(--muted)]">이동</span>
          <span className="mt-0.5 block text-xs font-black">{formatRouteDistance(presentation.metrics.totalDistanceMeters)}</span>
        </span>
        <span className="rounded-xl bg-white/80 px-2 py-2">
          <span className="block text-[10px] font-bold text-[var(--muted)]">전체</span>
          <span className="mt-0.5 block text-xs font-black">{elapsed ?? "미제공"}</span>
        </span>
      </span>
      <span className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-extrabold">
        {Object.entries(presentation.verdictCounts).map(([verdict, count]) =>
          count > 0 ? (
            <span key={verdict} className="rounded-full border border-[#d7e0da] bg-white px-2 py-1 text-[#52665b]">
              {GENERATED_PET_VERDICT_COPY[verdict as keyof typeof GENERATED_PET_VERDICT_COPY].label} {count}
            </span>
          ) : null,
        )}
      </span>
    </button>
  );
}

export function RecommendationPlanner({
  autoGenerate = false,
  onAutoGenerateStart,
}: {
  autoGenerate?: boolean;
  onAutoGenerateStart?: () => void;
}) {
  const router = useRouter();
  const {
    profile,
    preferences,
    profileConfirmed,
    preferencesConfirmed,
    generationState,
    selectedItinerary,
    beginGeneration,
    resolveGeneration,
    rejectGeneration,
    selectItinerary,
  } = usePlannerState();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    () => selectedItinerary?.stops[0]?.stableIdentity ?? null,
  );
  const submittingRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<number | null>(null);
  const autoGenerateStartedRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const strategyTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const runGeneration = useCallback(
    async (operation: "initial" | "reroll") => {
      if (
        submittingRef.current ||
        !profileConfirmed ||
        !preferencesConfirmed
      ) {
        return;
      }

      submittingRef.current = true;
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      const requestId = beginGeneration(operation);
      activeRequestIdRef.current = requestId;
      const payload = createGenerationRequest(
        profile,
        preferences,
        operation,
        generationState.recentRouteSignatures,
      );

      try {
        const response = await fetch("/api/itineraries/generate", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const body = (await response.json()) as ApiResult<unknown>;
        if (!response.ok || !body.ok) {
          throw new Error(
            !body.ok
              ? body.error.message
              : "추천 경로를 계산하지 못했습니다.",
          );
        }
        const parsedGeneration = itineraryGenerationResponseSchema.safeParse(
          body.data,
        );
        if (!parsedGeneration.success) {
          throw new Error("추천 응답 형식을 확인하지 못했습니다.");
        }
        if (controller.signal.aborted) return;
        resolveGeneration(requestId, parsedGeneration.data);
        setSelectedLocationId(
          parsedGeneration.data.itineraries[0]?.stops[0]?.stableIdentity ?? null,
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        rejectGeneration(
          requestId,
          error instanceof Error
            ? error.message
            : "추천 경로를 계산하지 못했습니다.",
        );
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
          activeRequestIdRef.current = null;
          submittingRef.current = false;
        }
      }
    },
    [
      beginGeneration,
      generationState.recentRouteSignatures,
      preferences,
      preferencesConfirmed,
      profile,
      profileConfirmed,
      rejectGeneration,
      resolveGeneration,
    ],
  );

  useEffect(
    () => () => {
      const requestId = activeRequestIdRef.current;
      requestControllerRef.current?.abort();
      if (requestId !== null) {
        rejectGeneration(requestId, "경로 계산이 중단되었습니다. 다시 시도해 주세요.");
      }
    },
    [rejectGeneration],
  );

  useEffect(() => {
    if (!autoGenerate || autoGenerateStartedRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (autoGenerateStartedRef.current) return;
      autoGenerateStartedRef.current = true;
      onAutoGenerateStart?.();
      void runGeneration("initial");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoGenerate, onAutoGenerateStart, runGeneration]);

  useEffect(() => {
    if (generationState.phase === "error") errorRef.current?.focus();
  }, [generationState.error, generationState.phase]);

  const chooseMapLocation = useCallback((locationId: string | null) => {
    setSelectedLocationId(locationId);
    if (!locationId) return;
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document.getElementById(`route-stop-${locationId}`)?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
  }, []);

  const generation = generationState.response;
  const selectedPresentation = useMemo(
    () =>
      selectedItinerary && generation
        ? createItineraryPresentation(
            selectedItinerary,
            generation.request.petEquipment,
          )
        : null,
    [generation, selectedItinerary],
  );
  const routeLocations = useMemo<KakaoMapLocation[]>(
    () =>
      selectedItinerary?.stops.map((stop) => ({
        id: stop.stableIdentity,
        name: stop.title,
        address: stop.address ?? "주소 정보 없음",
        coordinates: stop.coordinates,
        order: stop.order,
        markerKind: "itinerary",
        sourceLabel:
          stop.source === "TOUR_API"
            ? "한국관광공사 동반 근거 장소"
            : "카카오 탐색 후보 · 직접 확인 필요",
        interactive: true,
        clusterable: false,
      })) ?? [],
    [selectedItinerary],
  );

  if (!profileConfirmed || !preferencesConfirmed) {
    return <ResultsEmptyState />;
  }

  const loading = generationState.phase === "loading";
  const rerolling = loading && generationState.operation === "reroll";
  const copy = generation ? generationStateCopy(generation.state) : null;

  const chooseStrategy = (itinerary: GeneratedItinerary, focusIndex?: number) => {
    selectItinerary(itinerary.id);
    setSelectedLocationId(itinerary.stops[0]?.stableIdentity ?? null);
    if (typeof focusIndex === "number") {
      window.requestAnimationFrame(() => strategyTabRefs.current[focusIndex]?.focus());
    }
  };

  const handleStrategyKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!generation || generation.itineraries.length === 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % generation.itineraries.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + generation.itineraries.length) % generation.itineraries.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = generation.itineraries.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const itinerary = generation.itineraries[nextIndex];
    if (itinerary) chooseStrategy(itinerary, nextIndex);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="eyebrow">추천 결과</p>
          <h1 className="balance mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl lg:text-[42px]">
            {profile.name}와 함께할 부산 당일 경로를 비교해 보세요.
          </h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)] sm:text-base">
            반환된 실제 전략과 장소만 보여드립니다. 선택을 바꾸면 지도와 순서만 바뀌며 경로를 다시 생성하지 않습니다.
          </p>
        </div>
        {generation ? (
          <Button
            type="button"
            variant="brandSecondary"
            disabled={loading}
            onClick={() => void runGeneration("reroll")}
          >
            {rerolling ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
            {rerolling ? "다른 경로 계산 중" : "다른 조합 다시 보기"}
          </Button>
        ) : null}
      </header>

      <ConfirmedTripSummary profile={profile} preferences={preferences} />

      {generationState.phase === "error" && generationState.error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-[var(--radius-card)] border border-[#edcaca] bg-[#fdf0f0] p-4 text-[#853e3e] outline-none"
        >
          <p className="flex items-center gap-2 font-black"><AlertTriangle size={18} aria-hidden="true" /> 경로를 계산하지 못했습니다.</p>
          <p className="mt-1 text-sm leading-6">{generationState.error}</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => void runGeneration(generation ? "reroll" : "initial")}
          >
            <RefreshCw size={16} aria-hidden="true" /> 같은 조건으로 다시 시도
          </Button>
        </div>
      ) : null}

      {loading && !rerolling ? <ResultsLoadingState reroll={false} /> : null}
      {!generation && !loading && generationState.phase !== "error" ? (
        <section className="surface-panel p-6 text-center sm:p-8">
          <PawPrint className="mx-auto text-[var(--brand)]" size={25} aria-hidden="true" />
          <h2 className="mt-3 text-xl font-black">확정한 조건으로 경로를 만들 준비가 됐어요.</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">요청할 때만 실제 장소와 이동 경로를 계산합니다.</p>
          <Button type="button" variant="brand" className="mt-5" onClick={() => void runGeneration("initial")}>
            <Route size={17} aria-hidden="true" /> 추천 경로 만들기
          </Button>
        </section>
      ) : null}

      {generation && copy ? (
        <>
          <div className={`rounded-[var(--radius-card)] border p-4 ${copy.tone}`} aria-live="polite">
            <p className="font-black">{copy.title}</p>
            <p className="mt-1 text-xs leading-5">{copy.description}</p>
            {generation.notices.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                {generation.notices.map((notice) => <li key={notice}>{notice}</li>)}
              </ul>
            ) : null}
          </div>

          {rerolling ? <ResultsLoadingState reroll /> : null}

          {generation.itineraries.length > 0 ? (
            <section aria-labelledby="strategy-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="eyebrow">경로 전략 비교</p>
                  <h2 id="strategy-heading" className="mt-1 text-2xl font-black tracking-[-0.035em]">반환된 {generation.itineraries.length}개 경로</h2>
                </div>
                <p className="text-xs font-bold text-[var(--muted)]">방향키로도 전략을 바꿀 수 있어요.</p>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3" role="tablist" aria-label="추천 경로 전략">
                {generation.itineraries.map((itinerary, index) => (
                  <StrategyCard
                    key={itinerary.id}
                    itinerary={itinerary}
                    index={index}
                    selected={itinerary.id === generationState.selectedItineraryId}
                    onSelect={() => chooseStrategy(itinerary)}
                    onKeyDown={(event) => handleStrategyKeyDown(event, index)}
                    tabRef={(node) => { strategyTabRefs.current[index] = node; }}
                  />
                ))}
              </div>
            </section>
          ) : (
            <section className="surface-panel p-7 text-center" aria-labelledby="no-routes-heading">
              <ShieldAlert className="mx-auto text-[#76542f]" size={26} aria-hidden="true" />
              <h2 id="no-routes-heading" className="mt-3 text-xl font-black">표시할 수 있는 실제 경로가 없습니다.</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">조건을 넓혀 다시 생성하거나, 여행 조건 단계에서 지역·카테고리·일정 길이를 수정해 주세요.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link href="/planner/pet" className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[#c9d7ce] bg-white px-4 text-sm font-extrabold text-[var(--brand)]">여행 정보 수정</Link>
                <Button type="button" onClick={() => void runGeneration("reroll")}><RefreshCw size={16} aria-hidden="true" /> 같은 조건으로 다시 시도</Button>
              </div>
            </section>
          )}

          {selectedItinerary && selectedPresentation ? (
            <section
              id="selected-strategy-panel"
              role="tabpanel"
              aria-labelledby={`strategy-tab-${generation.itineraries.findIndex((item) => item.id === selectedItinerary.id)}`}
              className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)]"
            >
              <div className="min-w-0">
                <div className="surface-card p-4 sm:p-5">
                  <p className="eyebrow">선택한 경로</p>
                  <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.04em] [overflow-wrap:anywhere]">{selectedItinerary.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{selectedItinerary.explanation}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl bg-[#f3f6f2] p-3"><dt className="text-[11px] font-bold text-[var(--muted)]">방문 장소</dt><dd className="mt-1 font-black">{selectedPresentation.metrics.stopCount}곳</dd></div>
                    <div className="rounded-xl bg-[#f3f6f2] p-3"><dt className="text-[11px] font-bold text-[var(--muted)]">총 이동 거리</dt><dd className="mt-1 font-black">{formatRouteDistance(selectedPresentation.metrics.totalDistanceMeters)}</dd></div>
                    <div className="rounded-xl bg-[#f3f6f2] p-3"><dt className="text-[11px] font-bold text-[var(--muted)]">차량 이동</dt><dd className="mt-1 font-black">{formatRouteDuration(selectedPresentation.metrics.totalDurationSeconds)}</dd></div>
                    <div className="rounded-xl bg-[#f3f6f2] p-3"><dt className="text-[11px] font-bold text-[var(--muted)]">전체 일정</dt><dd className="mt-1 font-black">{formatKoreanDurationMinutes(selectedPresentation.metrics.estimatedElapsedDurationMinutes) ?? "미제공"}</dd></div>
                  </dl>
                </div>

                <ol className="mt-4 space-y-4" aria-label={`${selectedItinerary.title} 방문 순서`}>
                  {selectedPresentation.stops.map((stopPresentation, index) => (
                    <RouteStopCard
                      key={stopPresentation.stop.stableIdentity}
                      domId={`route-stop-${stopPresentation.stop.stableIdentity}`}
                      presentation={stopPresentation}
                      previousLabel={index === 0 ? generation.request.start.label ?? "출발지" : selectedItinerary.stops[index - 1]?.title ?? "이전 장소"}
                      selected={selectedLocationId === stopPresentation.stop.stableIdentity}
                      onSelect={() => chooseMapLocation(stopPresentation.stop.stableIdentity)}
                    />
                  ))}
                </ol>
              </div>

              <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="선택 경로 지도와 결정">
                <MapPanel
                  locations={routeLocations}
                  routeCoordinates={selectedPresentation.geometry}
                  selectedLocationId={selectedLocationId}
                  onLocationSelect={chooseMapLocation}
                  viewportKey={`recommendation:${selectedItinerary.id}`}
                  title={`${selectedItinerary.title} 경로 지도`}
                  locationLabel={`${selectedItinerary.title} · ${selectedItinerary.stops.length}곳`}
                  emptyMessage="유효한 좌표가 없어 지도를 표시할 수 없습니다. 아래 텍스트 순서를 이용해 주세요."
                />
                <p className="mt-3 rounded-xl bg-[#f4f7f4] p-3 text-xs font-semibold leading-5 text-[var(--muted)]">
                  {selectedPresentation.geometry.length >= 2
                    ? "Kakao 길찾기가 반환한 실제 geometry와 방문 순서 마커를 표시합니다."
                    : "정확한 경로 geometry가 제공되지 않아 장소 위치만 표시합니다. 마커 사이를 임의의 직선으로 연결하지 않습니다."}
                </p>
                {selectedPresentation.blockedByPetAccess ? (
                  <p className="mt-3 rounded-xl border border-[#e5bdb7] bg-[#fff1ef] p-3 text-sm font-bold leading-6 text-[#823f36]" role="alert">
                    동반 불가 판정이 포함되어 이 경로를 일정으로 선택할 수 없습니다. 다른 전략을 확인해 주세요.
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="brand"
                  className="mt-3 w-full"
                  disabled={loading || selectedPresentation.blockedByPetAccess}
                  onClick={() => router.push("/itinerary")}
                >
                  <MapPinned size={17} aria-hidden="true" /> 이 경로로 상세 일정 보기 <ArrowRight size={17} aria-hidden="true" />
                </Button>
                <p className="mt-2 text-center text-[11px] leading-5 text-[var(--muted)]">현재 선택한 정확한 경로를 다시 생성하지 않고 전달합니다.</p>
              </aside>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
