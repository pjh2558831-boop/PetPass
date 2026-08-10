"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  PawPrint,
  RefreshCw,
  Route,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BUSAN_DISTRICTS,
  getBusanDistrictName,
  isBusanDistrictCode,
  TOUR_CATALOG_FILTERS,
  type BusanDistrictCode,
  type TourCatalogCategory,
} from "@/lib/tour-api/catalog";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import type { ApiResult } from "@/types/api";
import type { PetProfile, PetSize, TravelPreferences } from "@/types/pet";
import type {
  GeneratedItinerary,
  GeneratedItineraryStop,
  IndoorAccessPreference,
  ItineraryCandidateFunnel,
  ItineraryGenerationResponse,
  ItineraryGenerationLimits,
} from "@/types/route-generation";
import type { TourPetAccessScope } from "@/types/tour-pet-access";

const RECOMMENDATION_CATEGORIES = TOUR_CATALOG_FILTERS.filter(
  (filter): filter is (typeof TOUR_CATALOG_FILTERS)[number] & {
    value: TourCatalogCategory;
  } => filter.value !== "all" && filter.value !== "shopping",
);

const VERDICT_LABELS = {
  allowed: "반려동물 동반 가능",
  conditional: "조건부 동반 가능",
  unknown: "동반 여부 확인 필요",
} as const;

const SIZE_COMPATIBILITY_LABELS = {
  compatible: "선택 크기와 근거 일치",
  incompatible: "선택 크기와 맞지 않음",
  verification_required: "크기 조건 확인 필요",
  not_specified: "크기 제한 명시 없음",
} as const;

const SCOPE_LABELS: Record<TourPetAccessScope, string> = {
  whole_place: "전체 공간",
  indoor: "실내",
  outdoor: "야외",
  terrace: "테라스",
  guest_room: "객실",
  selected_room: "지정 객실",
  common_area: "공용 공간",
  restaurant: "식당",
  cafe: "카페",
  lobby: "로비",
  designated_area: "지정 구역",
  transport: "이동 수단",
  unknown: "범위 확인 필요",
};

type PlanningMode = "stop_count" | "duration";

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
} as const satisfies Record<TravelPreferences["preferredCategories"][number], TourCatalogCategory>;

function categoriesFromPreferences(
  preferredCategories: TravelPreferences["preferredCategories"],
): TourCatalogCategory[] {
  return Array.from(
    new Set(
      preferredCategories.map(
        (category) => PREFERENCE_CATEGORY_MAP[category],
      ),
    ),
  );
}

function isGenerationResponse(value: unknown): value is ItineraryGenerationResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ItineraryGenerationResponse>;
  return (
    typeof candidate.state === "string" &&
    Array.isArray(candidate.itineraries) &&
    Array.isArray(candidate.notices) &&
    Boolean(candidate.request) &&
    Boolean(candidate.candidateFunnel)
  );
}

function CandidateFunnel({
  funnel,
  limits,
}: {
  funnel: ItineraryCandidateFunnel;
  limits: ItineraryGenerationLimits;
}) {
  const baseEligible =
    funnel.basePetAccess.allowed + funnel.basePetAccess.conditional;
  const sizeReview =
    funnel.petSizeCompatibility.incompatible +
    funnel.petSizeCompatibility.verificationRequired;
  const stages = [
    ["전체 일치 카탈로그", funnel.matchingCatalogCandidates],
    ["기본 필터 통과", funnel.afterBasicFilters],
    ["역할별 예비 후보", `${funnel.preliminaryRankedCandidates}/${limits.maxCatalogCandidates}`],
    ["상세 근거 확인", `${funnel.detailedAssessmentCandidates}/${limits.maxDetailCalls}`],
    ["허용·조건부 판정", baseEligible],
    ["크기 부적합·확인 필요", sizeReview],
    ["일정 가능 후보", funnel.itineraryEligibleCandidates],
    ["반환 경로", funnel.returnedRoutes],
  ] as const;

  return (
    <section className="mt-3 rounded-xl bg-white/70 p-3" aria-label="추천 후보 단계">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-white p-2">
            <dt className="text-[11px] font-bold text-[#6b786f]">{label}</dt>
            <dd className="mt-1 text-sm font-black">{value}곳</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-5">
        기본 판정: 허용 {funnel.basePetAccess.allowed} · 조건부 {funnel.basePetAccess.conditional} · 불가 {funnel.basePetAccess.notAllowed} · 근거 부족 {funnel.basePetAccess.unknown} · 평가 제외 {funnel.basePetAccess.notApplicable}
      </p>
      <p className="text-[11px] leading-5">
        크기 근거: 일치 {funnel.petSizeCompatibility.compatible} · 명시 없음 {funnel.petSizeCompatibility.notSpecified} · 부적합 {funnel.petSizeCompatibility.incompatible} · 확인 필요 {funnel.petSizeCompatibility.verificationRequired}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-[#64746c]">
        여행 적합성과 역할·카테고리·거리·정보 완성도를 함께 검토해 최대 {limits.maxCatalogCandidates}곳을 예비 후보로 두고, 역할이 겹치지 않도록 최대 {limits.maxDetailCalls}곳의 상세 근거를 확인합니다.
      </p>
    </section>
  );
}

function stateCopy(state: ItineraryGenerationResponse["state"]): {
  tone: string;
  title: string;
  description: string;
} {
  if (state === "ready") {
    return {
      tone: "border-[#cce2d5] bg-[#edf8f2] text-[#285c45]",
      title: "실제 장소와 이동 경로로 코스를 만들었어요.",
      description: "조건을 충족한 장소만 사용했으며 빈 자리를 가짜 장소로 채우지 않았습니다.",
    };
  }
  if (state === "partial") {
    return {
      tone: "border-[#ead7b8] bg-[#fff8ec] text-[#76542f]",
      title: "일부 제공자 응답이 불완전한 상태로 코스를 만들었어요.",
      description: "표시된 코스는 사용할 수 있지만, 누락된 후보가 있을 수 있습니다.",
    };
  }
  if (state === "provider_unavailable") {
    return {
      tone: "border-[#edcaca] bg-[#fdf0f0] text-[#853e3e]",
      title: "현재 제공자 정보를 불러올 수 없습니다.",
      description: "거절로 해석하지 않았습니다. 잠시 후 같은 조건으로 다시 시도해 주세요.",
    };
  }
  return {
    tone: "border-[#d8ddd9] bg-[#f5f6f4] text-[#56655d]",
    title: "조건을 충족하는 실제 장소가 충분하지 않습니다.",
    description: "지원되지 않거나 동반 근거가 부족한 장소를 임의로 코스에 넣지 않았습니다.",
  };
}

function stopVerdictClass(stop: GeneratedItineraryStop): string {
  if (stop.petAccess.verdict === "allowed") {
    return "bg-[#edf8f2] text-[#236148]";
  }
  return stop.petAccess.verdict === "unknown"
    ? "bg-[#f1f2f4] text-[#5f6670]"
    : "bg-[#fff2df] text-[#7a542f]";
}

function ItineraryStopCard({
  stop,
  selected,
  onSelect,
}: {
  stop: GeneratedItineraryStop;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      id={`route-stop-${stop.contentId}`}
      className={`rounded-2xl border p-4 ${
        selected
          ? "border-[#3d8b68] bg-[#f6fbf8] ring-2 ring-[#3d8b68]/15"
          : "border-[#dde4df] bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#236148] text-xs font-black text-white"
          aria-label={`${stop.title} 지도에서 보기`}
        >
          {stop.order}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-[#607168]">
              {TOUR_CATEGORY_LABELS[stop.category]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${stopVerdictClass(stop)}`}
            >
              {VERDICT_LABELS[stop.petAccess.verdict]}
            </span>
            <span className="rounded-full border border-[#cad8d0] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#45665a]">
              {SIZE_COMPATIBILITY_LABELS[stop.petAccess.sizeCompatibility.state]}
            </span>
            {stop.operatingHours.warning ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1e5] px-2.5 py-1 text-[11px] font-extrabold text-[#7b4b2f]">
                <AlertTriangle size={12} aria-hidden="true" />
                {stop.operatingHours.warning}
              </span>
            ) : null}
          </div>
          {stop.source === "TOUR_API" ? (
            <Link
              href={`/places/${stop.contentId}?contentTypeId=${stop.contentTypeId}`}
              className="mt-2 block text-base font-black tracking-[-0.025em] hover:text-[#236148]"
            >
              {stop.title}
            </Link>
          ) : stop.placeUrl ? (
            <a
              href={stop.placeUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-base font-black tracking-[-0.025em] hover:text-[#236148]"
            >
              {stop.title}
            </a>
          ) : (
            <p className="mt-2 text-base font-black tracking-[-0.025em]">
              {stop.title}
            </p>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[#66766e]">
            <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            {stop.address || "주소 정보 없음"}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#456e5a]">
            <Clock3 size={13} aria-hidden="true" />
            {stop.plannedArrival}–{stop.plannedDeparture} · 체류 {stop.visitDurationMinutes}분
          </p>
          {stop.order > 1 ? (
            <p className="mt-1 text-xs font-semibold text-[#66766e]">
              이전 장소에서 {formatRouteDistance(stop.distanceFromPreviousMeters)} · {formatRouteDuration(stop.durationFromPreviousSeconds)}
            </p>
          ) : null}
          {stop.callAheadRequired ? (
            <p className="mt-2 rounded-xl bg-[#fff8ec] px-3 py-2 text-xs font-bold leading-5 text-[#76542f]">
              자동 추천 대상이 아닌 탐색 후보입니다. 방문 전에 반려동물 동반 가능 여부를 전화로 확인해 주세요.
              {stop.phone ? ` 연락처: ${stop.phone}` : ""}
            </p>
          ) : null}
          {stop.petAccess.conditions.length > 0 ||
          stop.petAccess.permittedScopes.length > 0 ||
          stop.petAccess.restrictedScopes.length > 0 ? (
            <details className="mt-3 rounded-xl bg-[#f3f7f4] px-3 py-2 text-xs">
              <summary
                className="min-h-8 cursor-pointer py-1 font-extrabold text-[#315b48]"
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }

                  event.preventDefault();
                  const details = event.currentTarget.parentElement;
                  if (details instanceof HTMLDetailsElement) {
                    details.open = !details.open;
                  }
                }}
              >
                동반 조건과 이용 범위 확인
              </summary>
              <div className="space-y-2 pb-2 pt-1 leading-5 text-[#56675e]">
                {stop.petAccess.permittedScopes.length > 0 ? (
                  <p>
                    <strong>가능 범위:</strong>{" "}
                    {stop.petAccess.permittedScopes.map((scope) => SCOPE_LABELS[scope]).join(" · ")}
                  </p>
                ) : null}
                {stop.petAccess.restrictedScopes.length > 0 ? (
                  <p>
                    <strong>제한 범위:</strong>{" "}
                    {stop.petAccess.restrictedScopes.map((scope) => SCOPE_LABELS[scope]).join(" · ")}
                  </p>
                ) : null}
                {stop.petAccess.conditions.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4">
                    {stop.petAccess.conditions.map((condition) => (
                      <li key={`${condition.type}:${condition.scope}:${condition.label}`}>
                        <strong>{condition.label}</strong>
                        {condition.sourceText !== condition.label ? ` — ${condition.sourceText}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function RecommendationPlanner({
  districtCode,
  onDistrictChange,
  profile,
  preferences,
  autoGenerate = false,
  onAutoGenerateStart,
  selectedLocationId,
  onLocationSelect,
  onItinerarySelect,
}: {
  districtCode: BusanDistrictCode | "all";
  onDistrictChange: (district: BusanDistrictCode | "all") => void;
  profile: PetProfile;
  preferences: TravelPreferences;
  autoGenerate?: boolean;
  onAutoGenerateStart?: () => void;
  selectedLocationId: string | null;
  onLocationSelect: (contentId: string) => void;
  onItinerarySelect: (itinerary: GeneratedItinerary | null) => void;
}) {
  const initialDeparture = preferences.departure ?? DEFAULT_DEPARTURE;
  const departureLocked = Boolean(preferences.departure);
  const [startLabel, setStartLabel] = useState(initialDeparture.label);
  const [latitude, setLatitude] = useState(
    String(initialDeparture.coordinates.latitude),
  );
  const [longitude, setLongitude] = useState(
    String(initialDeparture.coordinates.longitude),
  );
  const [travelDate, setTravelDate] = useState(preferences.tripDate);
  const [startTime, setStartTime] = useState(preferences.startTime);
  const [planningMode, setPlanningMode] = useState<PlanningMode>(
    preferences.planningMode ?? "stop_count",
  );
  const [stopCount, setStopCount] = useState(preferences.desiredStopCount ?? 3);
  const [durationMinutes, setDurationMinutes] = useState(
    preferences.desiredDurationMinutes ?? 360,
  );
  const [petSize, setPetSize] = useState<PetSize>(profile.size);
  const [indoorPreference, setIndoorPreference] =
    useState<IndoorAccessPreference>(preferences.indoorAccessPreference ?? "any");
  const [selectedCategories, setSelectedCategories] = useState<TourCatalogCategory[]>(
    () => categoriesFromPreferences(preferences.preferredCategories),
  );
  const [includeShopping, setIncludeShopping] = useState(
    preferences.includeShopping ?? false,
  );
  const [generation, setGeneration] =
    useState<ItineraryGenerationResponse | null>(null);
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const autoGenerateStartedRef = useRef(false);
  const submittingRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const recentRouteSignaturesRef = useRef<string[]>([]);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!selectedLocationId) return;
    document
      .getElementById(`route-stop-${selectedLocationId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedLocationId]);

  useEffect(() => {
    if (!autoGenerate || autoGenerateStartedRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (autoGenerateStartedRef.current) return;
      autoGenerateStartedRef.current = true;
      onAutoGenerateStart?.();
      formRef.current?.requestSubmit();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoGenerate, onAutoGenerateStart]);

  const invalidateGeneratedRoute = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    submittingRef.current = false;
    setSubmitting(false);
    setGeneration(null);
    setSelectedItineraryId(null);
    setRequestError("");
    recentRouteSignaturesRef.current = [];
    onItinerarySelect(null);
  };

  const toggleCategory = (category: TourCatalogCategory) => {
    invalidateGeneratedRoute();
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const selectItinerary = (itinerary: GeneratedItinerary) => {
    setSelectedItineraryId(itinerary.id);
    onItinerarySelect(itinerary);
    onLocationSelect(itinerary.stops[0]?.contentId ?? "");
  };

  const validate = (): string | null => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (!startLabel.trim()) return "출발지 이름을 입력해 주세요.";
    if (!Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90) {
      return "출발지 위도는 -90에서 90 사이로 입력해 주세요.";
    }
    if (
      !Number.isFinite(parsedLongitude) ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      return "출발지 경도는 -180에서 180 사이로 입력해 주세요.";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(travelDate)) {
      return "여행 날짜를 선택해 주세요.";
    }
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(startTime)) {
      return "출발 시간을 선택해 주세요.";
    }
    if (planningMode === "duration" && (durationMinutes < 120 || durationMinutes > 600)) {
      return "일정 시간은 120분에서 600분 사이로 선택해 주세요.";
    }
    if (planningMode === "stop_count" && (stopCount < 1 || stopCount > 5)) {
      return "방문 장소 수는 1곳에서 5곳 사이로 선택해 주세요.";
    }
    if (planningMode === "duration") {
      const [hours, minutes] = startTime.split(":").map(Number);
      if (hours * 60 + minutes + durationMinutes > 24 * 60) {
        return "선택한 일정 시간이 자정을 넘지 않도록 조정해 주세요.";
      }
    }
    if (selectedCategories.length === 0 && !includeShopping) {
      return "방문하고 싶은 장소 유형을 하나 이상 선택해 주세요.";
    }
    return null;
  };

  const submit = async (reroll = false) => {
    if (submittingRef.current) return;
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setValidationError("");
    setRequestError("");
    setGeneration(null);
    setSelectedItineraryId(null);
    onItinerarySelect(null);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const recentRouteSignatures = reroll
      ? [...recentRouteSignaturesRef.current]
      : [];
    if (!reroll) recentRouteSignaturesRef.current = [];
    const generationSeed = reroll
      ? globalThis.crypto.randomUUID()
      : "initial";

    try {
      const categories = includeShopping
        ? [...selectedCategories, "shopping" as const]
        : selectedCategories;
      const response = await fetch("/api/itineraries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          scope:
            districtCode === "all"
              ? { type: "busan" }
              : { type: "district", districtCode },
          start: {
            coordinates: {
              latitude: Number(latitude),
              longitude: Number(longitude),
            },
            label: startLabel.trim(),
          },
          travelDate,
          startTime,
          planning:
            planningMode === "duration"
              ? { desiredDurationMinutes: durationMinutes }
              : { desiredStopCount: stopCount },
          petSize,
          petEquipment: {
            hasCarrier: profile.hasCarrier,
            hasLeash: profile.hasLeash,
            hasMuzzle: profile.hasMuzzle,
          },
          indoorAccessPreference: indoorPreference,
          selectedCategories: categories,
          includeShopping,
          generationSeed,
          recentRouteSignatures,
        }),
      });
      const body = (await response.json()) as ApiResult<unknown>;
      if (!response.ok || !body.ok) {
        throw new Error(
          !body.ok
            ? body.error.message
            : "추천 코스 응답을 불러오지 못했습니다.",
        );
      }
      if (!isGenerationResponse(body.data)) {
        throw new Error("추천 코스 응답 형식을 확인할 수 없습니다.");
      }
      setGeneration(body.data);
      recentRouteSignaturesRef.current = [
        ...new Set([
          ...recentRouteSignaturesRef.current,
          ...body.data.itineraries.map(({ signature }) => signature),
        ]),
      ].slice(-12);
      const first = body.data.itineraries[0];
      if (first) selectItinerary(first);
    } catch (errorValue) {
      if (controller.signal.aborted) return;
      setRequestError(
        errorValue instanceof Error
          ? errorValue.message
          : "추천 코스를 만들지 못했습니다.",
      );
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  const selectedItinerary = generation?.itineraries.find(
    (itinerary) => itinerary.id === selectedItineraryId,
  );
  const generationCopy = generation ? stateCopy(generation.state) : null;
  const districtName =
    districtCode === "all"
      ? "부산 전체"
      : getBusanDistrictName(districtCode) ?? "부산 전체";

  return (
    <section aria-labelledby="recommendation-heading" className="min-w-0 space-y-5">
      <div>
        <p className="eyebrow">결정론적 일정 생성</p>
        <h2 id="recommendation-heading" className="mt-1 text-2xl font-black tracking-[-0.04em]">
          추천 코스 조건
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#66766e]">
          입력 조건과 제공자 근거를 같은 규칙으로 계산합니다. AI가 임의로 장소나 제한을 만들지 않습니다.
        </p>
      </div>

      <form
        ref={formRef}
        className="surface-card space-y-6 p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
        noValidate
      >
        <fieldset>
          <legend className="text-sm font-extrabold">출발지</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="route-start-label" className="mb-1.5 block text-xs font-bold text-[#5f7067]">
                출발지 이름
              </label>
              <input
                id="route-start-label"
                value={startLabel}
                maxLength={80}
                readOnly={departureLocked}
                aria-readonly={departureLocked || undefined}
                onChange={(event) => {
                  if (departureLocked) return;
                  invalidateGeneratedRoute();
                  setStartLabel(event.target.value);
                }}
                className={`min-h-11 w-full rounded-xl border border-[#cfd9d3] px-3 font-semibold ${
                  departureLocked
                    ? "bg-[#f4f7f4] text-[#52645b]"
                    : "bg-white"
                }`}
              />
            </div>
            <div>
              <label htmlFor="route-start-latitude" className="mb-1.5 block text-xs font-bold text-[#5f7067]">
                위도
              </label>
              <input
                id="route-start-latitude"
                inputMode="decimal"
                value={latitude}
                readOnly={departureLocked}
                aria-readonly={departureLocked || undefined}
                onChange={(event) => {
                  if (departureLocked) return;
                  invalidateGeneratedRoute();
                  setLatitude(event.target.value);
                }}
                className={`min-h-11 w-full rounded-xl border border-[#cfd9d3] px-3 font-semibold ${
                  departureLocked
                    ? "bg-[#f4f7f4] text-[#52645b]"
                    : "bg-white"
                }`}
              />
            </div>
            <div>
              <label htmlFor="route-start-longitude" className="mb-1.5 block text-xs font-bold text-[#5f7067]">
                경도
              </label>
              <input
                id="route-start-longitude"
                inputMode="decimal"
                value={longitude}
                readOnly={departureLocked}
                aria-readonly={departureLocked || undefined}
                onChange={(event) => {
                  if (departureLocked) return;
                  invalidateGeneratedRoute();
                  setLongitude(event.target.value);
                }}
                className={`min-h-11 w-full rounded-xl border border-[#cfd9d3] px-3 font-semibold ${
                  departureLocked
                    ? "bg-[#f4f7f4] text-[#52645b]"
                    : "bg-white"
                }`}
              />
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#66766e]">
            {departureLocked
              ? "여행 조건에서 검증한 주소를 사용합니다. 주소를 바꾸려면 여행 조건 단계로 돌아가 주세요."
              : "기존 직접 진입 흐름은 부산역을 기본 출발지로 유지하며, 이름과 좌표를 직접 조정할 수 있습니다."}
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="route-district" className="mb-1.5 block text-sm font-extrabold">
              여행 범위
            </label>
            <select
              id="route-district"
              value={districtCode}
              onChange={(event) => {
                const value = event.target.value;
                invalidateGeneratedRoute();
                onDistrictChange(isBusanDistrictCode(value) ? value : "all");
              }}
              className="min-h-11 w-full rounded-xl border border-[#cfd9d3] bg-white px-3 font-semibold"
            >
              <option value="all">부산 전체</option>
              {BUSAN_DISTRICTS.map((district) => (
                <option key={district.code} value={district.code}>
                  {district.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="route-pet-size" className="mb-1.5 block text-sm font-extrabold">
              반려동물 크기
            </label>
            <select
              id="route-pet-size"
              value={petSize}
              onChange={(event) => {
                invalidateGeneratedRoute();
                setPetSize(event.target.value as PetSize);
              }}
              className="min-h-11 w-full rounded-xl border border-[#cfd9d3] bg-white px-3 font-semibold"
            >
              <option value="SMALL">소형</option>
              <option value="MEDIUM">중형</option>
              <option value="LARGE">대형</option>
            </select>
          </div>
          <div>
            <label htmlFor="route-date" className="mb-1.5 block text-sm font-extrabold">
              여행 날짜
            </label>
            <input
              id="route-date"
              type="date"
              value={travelDate}
              onChange={(event) => {
                invalidateGeneratedRoute();
                setTravelDate(event.target.value);
              }}
              className="min-h-11 w-full rounded-xl border border-[#cfd9d3] bg-white px-3 font-semibold"
            />
          </div>
          <div>
            <label htmlFor="route-time" className="mb-1.5 block text-sm font-extrabold">
              시작 시간
            </label>
            <input
              id="route-time"
              type="time"
              value={startTime}
              onChange={(event) => {
                invalidateGeneratedRoute();
                setStartTime(event.target.value);
              }}
              className="min-h-11 w-full rounded-xl border border-[#cfd9d3] bg-white px-3 font-semibold"
            />
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-extrabold">일정 길이</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={`rounded-2xl border p-3 ${planningMode === "stop_count" ? "border-[#3d8b68] bg-[#edf8f2]" : "border-[#d6ded9] bg-white"}`}>
              <span className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="radio"
                  name="planning-mode"
                  value="stop_count"
                  checked={planningMode === "stop_count"}
                  onChange={() => {
                    invalidateGeneratedRoute();
                    setPlanningMode("stop_count");
                  }}
                  className="accent-[#236148]"
                />
                방문 장소 수
              </span>
              <select
                aria-label="방문 장소 수"
                value={stopCount}
                disabled={planningMode !== "stop_count"}
                onChange={(event) => {
                  invalidateGeneratedRoute();
                  setStopCount(Number(event.target.value));
                }}
                className="mt-2 min-h-10 w-full rounded-xl border border-[#cfd9d3] bg-white px-3 text-sm font-semibold disabled:opacity-50"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>{count}곳</option>
                ))}
              </select>
            </label>
            <label className={`rounded-2xl border p-3 ${planningMode === "duration" ? "border-[#3d8b68] bg-[#edf8f2]" : "border-[#d6ded9] bg-white"}`}>
              <span className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="radio"
                  name="planning-mode"
                  value="duration"
                  checked={planningMode === "duration"}
                  onChange={() => {
                    invalidateGeneratedRoute();
                    setPlanningMode("duration");
                  }}
                  className="accent-[#236148]"
                />
                전체 일정 시간
              </span>
              <select
                aria-label="전체 일정 시간"
                value={durationMinutes}
                disabled={planningMode !== "duration"}
                onChange={(event) => {
                  invalidateGeneratedRoute();
                  setDurationMinutes(Number(event.target.value));
                }}
                className="mt-2 min-h-10 w-full rounded-xl border border-[#cfd9d3] bg-white px-3 text-sm font-semibold disabled:opacity-50"
              >
                {[120, 180, 240, 300, 360, 480, 600].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes / 60}시간</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor="route-indoor-preference" className="mb-1.5 block text-sm font-extrabold">
            실내 이용 선호
          </label>
          <select
            id="route-indoor-preference"
            value={indoorPreference}
            onChange={(event) => {
              invalidateGeneratedRoute();
              setIndoorPreference(event.target.value as IndoorAccessPreference);
            }}
            className="min-h-11 w-full rounded-xl border border-[#cfd9d3] bg-white px-3 font-semibold"
          >
            <option value="any">상관없음</option>
            <option value="preferred">실내 가능 장소 우선</option>
            <option value="required">실내 동반 가능한 장소만</option>
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-extrabold">선호 카테고리</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RECOMMENDATION_CATEGORIES.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${
                  selectedCategories.includes(option.value)
                    ? "border-[#3d8b68] bg-[#edf8f2] text-[#236148]"
                    : "border-[#d6ded9] bg-white text-[#607168]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(option.value)}
                  onChange={() => toggleCategory(option.value)}
                  className="size-4 accent-[#236148]"
                />
                {option.label}
              </label>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e4d1b8] bg-[#fff9ef] p-4">
            <input
              type="checkbox"
              checked={includeShopping}
              onChange={(event) => {
                invalidateGeneratedRoute();
                setIncludeShopping(event.target.checked);
              }}
              className="mt-0.5 size-4 accent-[#236148]"
            />
            <span>
              <span className="block text-sm font-extrabold">쇼핑 장소도 후보에 포함</span>
              <span className="mt-1 block text-xs leading-5 text-[#72624d]">
                기본값은 꺼짐입니다. 켜면 한국관광공사 유형 38을 명시적으로 요청합니다.
              </span>
            </span>
          </label>
        </fieldset>

        {validationError ? (
          <p className="rounded-xl bg-[#fceeee] p-3 text-sm font-semibold text-[#8d3838]" role="alert">
            {validationError}
          </p>
        ) : null}
        {requestError ? (
          <p className="rounded-xl bg-[#fceeee] p-3 text-sm font-semibold text-[#8d3838]" role="alert">
            {requestError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e6e2] pt-5">
          <p className="text-xs font-bold text-[#66766e]">
            {districtName} · 최대 3개 실제 경로
          </p>
          <div className="flex flex-wrap gap-2">
            {generation?.itineraries.length ? (
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => void submit(true)}
              >
                <RefreshCw size={16} aria-hidden="true" />
                다른 코스 다시 추천
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting} aria-describedby={submitting ? "route-progress" : undefined}>
              {submitting ? (
                <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
              ) : (
                <Route size={16} aria-hidden="true" />
              )}
              {submitting ? "후보와 이동 경로 계산 중" : "추천 코스 만들기"}
            </Button>
          </div>
        </div>
        {submitting ? (
          <p id="route-progress" className="text-right text-xs font-bold text-[#53665c]" role="status">
            관광공사 동반 근거를 확인한 뒤 카카오 실제 이동 경로를 계산합니다.
          </p>
        ) : null}
      </form>

      {generation && generationCopy ? (
        <div className="space-y-4" aria-live="polite">
          <div className={`rounded-2xl border p-4 ${generationCopy.tone}`}>
            <p className="font-extrabold">{generationCopy.title}</p>
            <p className="mt-1 text-xs leading-5">{generationCopy.description}</p>
            <p className="mt-2 text-xs font-bold">
              전체 일치 후보 {generation.providerCandidatesConsidered}곳 · 상세 확인 {generation.shortlistedCandidates}곳 · 일정 가능 {generation.eligibleCandidates}곳
            </p>
            <CandidateFunnel
              funnel={generation.candidateFunnel}
              limits={generation.limits}
            />
          </div>

          {generation.notices.length > 0 ? (
            <div className="rounded-2xl border border-[#dde4df] bg-white p-4">
              <h3 className="text-sm font-extrabold">결과 안내</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#64746c]">
                {generation.notices.map((notice) => <li key={notice}>{notice}</li>)}
              </ul>
            </div>
          ) : null}

          {generation.itineraries.slice(0, 3).map((itinerary) => {
            const selected = itinerary.id === selectedItineraryId;
            return (
              <article
                key={itinerary.id}
                className={`surface-card overflow-hidden p-4 sm:p-5 ${
                  selected ? "border-[#3d8b68] ring-2 ring-[#3d8b68]/15" : ""
                }`}
                aria-labelledby={`itinerary-${itinerary.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">실제 경로 {itinerary.stops.length}곳</p>
                    <h3 id={`itinerary-${itinerary.id}`} className="mt-1 text-xl font-black tracking-[-0.035em]">
                      {itinerary.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#64746c]">{itinerary.explanation}</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectItinerary(itinerary)}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-extrabold ${
                      selected
                        ? "bg-[#236148] text-white"
                        : "border border-[#cbd8d0] bg-white text-[#315b48]"
                    }`}
                  >
                    {selected ? <CheckCircle2 size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
                    {selected ? "지도에 표시 중" : "이 경로 지도에서 보기"}
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#f2f6f3] p-3 text-center">
                  <div>
                    <dt className="text-[11px] font-bold text-[#718078]">총 거리</dt>
                    <dd className="mt-1 text-sm font-black">{formatRouteDistance(itinerary.totalDistanceMeters)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold text-[#718078]">차량 이동</dt>
                    <dd className="mt-1 text-sm font-black">{formatRouteDuration(itinerary.totalDurationSeconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold text-[#718078]">전체 일정</dt>
                    <dd className="mt-1 text-sm font-black">약 {itinerary.estimatedElapsedDurationMinutes}분</dd>
                  </div>
                </dl>
                <ol className="mt-4 space-y-3">
                  {itinerary.stops.map((stop) => (
                    <ItineraryStopCard
                      key={stop.contentId}
                      stop={stop}
                      selected={selected && selectedLocationId === stop.contentId}
                      onSelect={() => {
                        if (!selected) selectItinerary(itinerary);
                        onLocationSelect(stop.contentId);
                      }}
                    />
                  ))}
                </ol>
              </article>
            );
          })}

          {selectedItinerary && selectedLocationId ? (
            <div className="rounded-2xl border border-[#cce2d5] bg-[#edf8f2] p-4" aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[#285c45]">
                <PawPrint size={15} aria-hidden="true" />
                지도에서 선택한 장소
              </p>
              <p className="mt-1 text-sm font-bold">
                {selectedItinerary.stops.find((stop) => stop.contentId === selectedLocationId)?.title ?? "경로 장소"}
              </p>
            </div>
          ) : null}

          <p className="rounded-2xl border border-[#d8e1dc] bg-white p-4 text-xs leading-5 text-[#627169]">
            반려동물 동반 판정은 한국관광공사 원문 근거를 사용합니다. 행정 인허가 정보는 이 판정에 섞지 않으며, 각 장소의 <strong>원문 상세</strong> 화면에서 별도 섹션으로 확인할 수 있습니다.
          </p>
        </div>
      ) : null}
    </section>
  );
}
