"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  Clock3,
  Landmark,
  MapPin,
  Route,
  ShoppingBag,
  Trees,
  Utensils,
} from "lucide-react";
import { DepartureSearch } from "@/components/planner/departure-search";
import { usePlannerState } from "@/components/planner/planner-state";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  BUSAN_DISTRICTS,
  BUSAN_REGION,
} from "@/lib/tour-api/catalog";
import type {
  PlaceCategory,
  PlannerIndoorAccessPreference,
  TravelPreferences,
  TripType,
} from "@/types/pet";

const categoryOptions: Array<{
  values: PlaceCategory[];
  label: string;
  icon: typeof Landmark;
}> = [
  { values: ["ATTRACTION"], label: "관광지", icon: Landmark },
  { values: ["RESTAURANT", "CAFE"], label: "식당·카페", icon: Utensils },
  { values: ["WALK"], label: "산책", icon: Trees },
  { values: ["ACCOMMODATION"], label: "숙소", icon: BedDouble },
];

const tripTypeOptions: Array<{
  value: TripType;
  label: string;
  note: string;
  disabled?: boolean;
}> = [
  { value: "DAY_TRIP", label: "당일치기", note: "하루 안에 마치는 일정" },
  {
    value: "OVERNIGHT",
    label: "1박 여행",
    note: "준비 중 · 현재는 당일 일정만 생성",
    disabled: true,
  },
];

const indoorOptions: Array<{
  value: PlannerIndoorAccessPreference;
  label: string;
  note: string;
}> = [
  { value: "any", label: "상관없음", note: "실내·야외 모두 검토" },
  { value: "preferred", label: "실내 선호", note: "실내 가능 장소를 우선" },
  { value: "required", label: "실내 필수", note: "실내 근거가 있는 장소만" },
];

const indoorLabels: Record<PlannerIndoorAccessPreference, string> = {
  any: "상관없음",
  preferred: "실내 선호",
  required: "실내 필수",
};

type FieldErrors = Partial<
  Record<"departure" | "tripDate" | "startTime" | "planning" | "categories", string>
>;

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function TripPreferencesForm() {
  const router = useRouter();
  const submittingRef = useRef(false);
  const {
    profile,
    preferences,
    setPreferences,
    confirmPreferencesAndRequestGeneration,
  } = usePlannerState();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof TravelPreferences>(
    key: K,
    value: TravelPreferences[K],
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const clearError = (field: keyof FieldErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleCategory = (categories: PlaceCategory[]) => {
    setPreferences((current) => {
      const selected = categories.some((category) =>
        current.preferredCategories.includes(category),
      );
      const remaining = current.preferredCategories.filter(
        (category) => !categories.includes(category),
      );
      return {
        ...current,
        preferredCategories: selected ? remaining : [...remaining, ...categories],
      };
    });
    clearError("categories");
  };

  const planningMode = preferences.planningMode ?? "stop_count";
  const desiredStopCount = preferences.desiredStopCount ?? 3;
  const desiredDurationMinutes = preferences.desiredDurationMinutes ?? 360;
  const indoorPreference = preferences.indoorAccessPreference ?? "any";
  const includeShopping = preferences.includeShopping ?? false;
  const districtName =
    preferences.districtName ??
    BUSAN_DISTRICTS.find(({ code }) => code === preferences.districtCode)?.name;
  const destinationLabel = districtName ? `부산 · ${districtName}` : "부산 전체";
  const tripTypeLabel =
    tripTypeOptions.find(({ value }) => value === preferences.tripType)?.label ?? "당일치기";
  const scheduleLabel =
    planningMode === "duration"
      ? `${desiredDurationMinutes / 60}시간 일정`
      : `${desiredStopCount}곳 방문`;
  const selectedCategoryLabels = categoryOptions
    .filter(({ values }) =>
      values.some((category) => preferences.preferredCategories.includes(category)),
    )
    .map(({ label }) => label);

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <form
        className="surface-panel p-5 sm:p-7 lg:p-8"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (submittingRef.current) return;

          const nextErrors: FieldErrors = {};
          if (!preferences.departure) {
            nextErrors.departure = "검색 결과에서 실제 출발지 주소를 선택해 주세요.";
          }
          if (!isValidIsoDate(preferences.tripDate)) {
            nextErrors.tripDate = "여행 날짜를 선택해 주세요.";
          }
          if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(preferences.startTime)) {
            nextErrors.startTime = "시작 시간을 선택해 주세요.";
          }
          if (planningMode === "duration") {
            if (desiredDurationMinutes < 120 || desiredDurationMinutes > 600) {
              nextErrors.planning = "전체 일정 시간은 2시간에서 10시간 사이여야 합니다.";
            } else {
              const [hours, minutes] = preferences.startTime.split(":").map(Number);
              if (
                Number.isFinite(hours) &&
                Number.isFinite(minutes) &&
                hours * 60 + minutes + desiredDurationMinutes > 24 * 60
              ) {
                nextErrors.planning = "선택한 일정이 자정을 넘지 않도록 조정해 주세요.";
              }
            }
          } else if (desiredStopCount < 1 || desiredStopCount > 5) {
            nextErrors.planning = "방문 장소 수는 1곳에서 5곳 사이여야 합니다.";
          }
          if (preferences.preferredCategories.length === 0) {
            nextErrors.categories = "방문하고 싶은 장소 유형을 하나 이상 선택해 주세요.";
          }

          if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            const firstField = [
              ["departure", "departure-search"],
              ["tripDate", "trip-date"],
              ["startTime", "start-time"],
              [
                "planning",
                planningMode === "duration" ? "planning-duration" : "planning-stop-count",
              ],
              ["categories", "category-ATTRACTION"],
            ].find(([field]) => nextErrors[field as keyof FieldErrors]);
            if (firstField) {
              window.requestAnimationFrame(() =>
                document.getElementById(firstField[1])?.focus(),
              );
            }
            return;
          }

          submittingRef.current = true;
          setSubmitting(true);
          setErrors({});
          confirmPreferencesAndRequestGeneration();
          router.push("/results?tab=recommendations");
        }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] pb-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <Route size={21} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-black">여행 조건</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              선택한 조건으로 실제 이동 경로를 준비해요.
            </p>
          </div>
        </div>

        <section className="mt-7" aria-labelledby="departure-section-heading">
          <div className="mb-4 flex items-center gap-2 text-[var(--brand)]">
            <MapPin size={19} aria-hidden="true" />
            <h3 id="departure-section-heading" className="text-base font-black">
              출발지
            </h3>
          </div>
          <DepartureSearch
            value={preferences.departure}
            invalid={Boolean(errors.departure)}
            errorId={errors.departure ? "departure-error" : undefined}
            onChange={(departure) => {
              update("departure", departure);
              clearError("departure");
            }}
          />
          {errors.departure ? (
            <p id="departure-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">
              {errors.departure}
            </p>
          ) : null}
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-7" aria-labelledby="destination-heading">
          <div className="mb-4 flex items-center gap-2 text-[var(--brand)]">
            <Landmark size={19} aria-hidden="true" />
            <h3 id="destination-heading" className="text-base font-black">
              여행 지역
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="region" className="mb-2 block text-sm font-extrabold">
                여행 지역
              </label>
              <select
                id="region"
                value={BUSAN_REGION.code}
                disabled
                className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[#f4f7f4] px-4 font-semibold text-[#52645b] disabled:opacity-100"
              >
                <option value={BUSAN_REGION.code}>{BUSAN_REGION.name}</option>
              </select>
            </div>
            <div>
              <label htmlFor="district" className="mb-2 block text-sm font-extrabold">
                세부 지역
              </label>
              <select
                id="district"
                value={preferences.districtCode ?? "all"}
                onChange={(event) => {
                  const district = BUSAN_DISTRICTS.find(
                    ({ code }) => code === event.target.value,
                  );
                  setPreferences((current) => ({
                    ...current,
                    regionCode: BUSAN_REGION.code,
                    regionName: BUSAN_REGION.name,
                    districtCode: district?.code,
                    districtName: district?.name,
                  }));
                }}
                className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 font-semibold"
              >
                <option value="all">부산 전체</option>
                {BUSAN_DISTRICTS.map((district) => (
                  <option key={district.code} value={district.code}>
                    {district.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="mt-8 border-t border-[var(--line)] pt-7" aria-labelledby="schedule-heading">
          <div className="mb-4 flex items-center gap-2 text-[var(--brand)]">
            <CalendarDays size={19} aria-hidden="true" />
            <h3 id="schedule-heading" className="text-base font-black">
              여행 일정
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="trip-date" className="mb-2 block text-sm font-extrabold">
                여행 날짜
              </label>
              <input
                id="trip-date"
                type="date"
                value={preferences.tripDate}
                aria-invalid={Boolean(errors.tripDate)}
                aria-describedby={errors.tripDate ? "trip-date-error" : undefined}
                onChange={(event) => {
                  update("tripDate", event.target.value);
                  clearError("tripDate");
                }}
                className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 font-semibold"
              />
              {errors.tripDate ? (
                <p id="trip-date-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">
                  {errors.tripDate}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="start-time" className="mb-2 block text-sm font-extrabold">
                시작 시간
              </label>
              <input
                id="start-time"
                type="time"
                value={preferences.startTime}
                aria-invalid={Boolean(errors.startTime)}
                aria-describedby={errors.startTime ? "start-time-error" : undefined}
                onChange={(event) => {
                  update("startTime", event.target.value);
                  clearError("startTime");
                  clearError("planning");
                }}
                className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 font-semibold"
              />
              {errors.startTime ? (
                <p id="start-time-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">
                  {errors.startTime}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <fieldset className="mt-8 border-t border-[var(--line)] pt-7">
          <legend className="text-sm font-extrabold">여행 형태</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {tripTypeOptions.map((option) => {
              const selected = preferences.tripType === option.value;
              return (
                <label
                  key={option.value}
                  className={`relative rounded-[var(--radius-card)] border p-4 transition-colors focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${
                    option.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  } ${
                    selected
                      ? "border-[var(--mint-500)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="tripType"
                    value={option.value}
                    checked={selected}
                    disabled={option.disabled}
                    onChange={() => update("tripType", option.value)}
                    className="sr-only"
                  />
                  {selected ? (
                    <Check className="absolute right-4 top-4 text-[var(--brand)]" size={17} aria-hidden="true" />
                  ) : null}
                  <span className="block text-sm font-extrabold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                    {option.note}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset
          className="mt-8 border-t border-[var(--line)] pt-7"
          aria-describedby={errors.planning ? "planning-error" : undefined}
        >
          <legend className="text-sm font-extrabold">일정 길이</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div
              className={`rounded-[var(--radius-card)] border p-4 ${
                planningMode === "stop_count"
                  ? "border-[var(--mint-500)] bg-[var(--brand-soft)]"
                  : "border-[var(--line)] bg-white"
              }`}
            >
              <label className="flex min-h-6 items-center gap-2 text-sm font-extrabold">
                <input
                  id="planning-mode-stop-count"
                  type="radio"
                  name="planning-mode"
                  value="stop_count"
                  checked={planningMode === "stop_count"}
                  onChange={() => {
                    update("planningMode", "stop_count");
                    clearError("planning");
                  }}
                  className="size-4 accent-[var(--brand)]"
                />
                방문 장소 수
              </label>
              <label htmlFor="planning-stop-count" className="sr-only">
                방문 장소 수 선택
              </label>
              <select
                id="planning-stop-count"
                aria-label="방문 장소 수"
                value={desiredStopCount}
                disabled={planningMode !== "stop_count"}
                onChange={(event) => {
                  update("desiredStopCount", Number(event.target.value));
                  clearError("planning");
                }}
                className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}곳
                  </option>
                ))}
              </select>
            </div>
            <div
              className={`rounded-[var(--radius-card)] border p-4 ${
                planningMode === "duration"
                  ? "border-[var(--mint-500)] bg-[var(--brand-soft)]"
                  : "border-[var(--line)] bg-white"
              }`}
            >
              <label className="flex min-h-6 items-center gap-2 text-sm font-extrabold">
                <input
                  id="planning-mode-duration"
                  type="radio"
                  name="planning-mode"
                  value="duration"
                  checked={planningMode === "duration"}
                  onChange={() => {
                    update("planningMode", "duration");
                    clearError("planning");
                  }}
                  className="size-4 accent-[var(--brand)]"
                />
                전체 일정 시간
              </label>
              <label htmlFor="planning-duration" className="sr-only">
                전체 일정 시간 선택
              </label>
              <select
                id="planning-duration"
                aria-label="전체 일정 시간"
                value={desiredDurationMinutes}
                disabled={planningMode !== "duration"}
                onChange={(event) => {
                  update("desiredDurationMinutes", Number(event.target.value));
                  clearError("planning");
                }}
                className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {[120, 180, 240, 300, 360, 480, 600].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes / 60}시간
                  </option>
                ))}
              </select>
            </div>
          </div>
          {errors.planning ? (
            <p id="planning-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">
              {errors.planning}
            </p>
          ) : null}
        </fieldset>

        <fieldset
          className="mt-8 border-t border-[var(--line)] pt-7"
          aria-describedby={errors.categories ? "categories-error" : undefined}
        >
          <legend className="text-sm font-extrabold">방문하고 싶은 장소</legend>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">여러 유형을 함께 선택할 수 있어요.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {categoryOptions.map(({ values, label, icon: Icon }) => {
              const selected = values.some((category) =>
                preferences.preferredCategories.includes(category),
              );
              const inputId = `category-${values[0]}`;
              return (
                <label
                  key={values.join("-")}
                  className={`relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border p-3 text-sm font-extrabold transition-colors focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${
                    selected
                      ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]"
                      : "border-[var(--line)] bg-white text-[#607168]"
                  }`}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    aria-invalid={Boolean(errors.categories)}
                    onChange={() => toggleCategory(values)}
                  />
                  {selected ? (
                    <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[var(--brand)] text-white">
                      <Check size={12} aria-hidden="true" />
                    </span>
                  ) : null}
                  <Icon size={22} aria-hidden="true" />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          {errors.categories ? (
            <p id="categories-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">
              {errors.categories}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="mt-8 border-t border-[var(--line)] pt-7">
          <legend className="text-sm font-extrabold">실내 이용 선호</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {indoorOptions.map((option) => {
              const selected = indoorPreference === option.value;
              const disabled = !profile.acceptsOutdoorOnly && option.value !== "required";
              return (
                <label
                  key={option.value}
                  className={`rounded-[var(--radius-card)] border p-4 transition-colors ${
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  } ${
                    selected
                      ? "border-[var(--mint-500)] bg-[var(--brand-soft)]"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-extrabold">
                    <input
                      type="radio"
                      name="indoor-preference"
                      value={option.value}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => update("indoorAccessPreference", option.value)}
                      className="size-4 accent-[var(--brand)]"
                    />
                    {option.label}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">
                    {option.note}
                  </span>
                </label>
              );
            })}
          </div>
          {!profile.acceptsOutdoorOnly ? (
            <p className="mt-3 text-xs font-semibold leading-5 text-[var(--muted)]">
              반려동물 단계에서 실내 이용 필요를 선택해 실내 필수로 유지됩니다.
            </p>
          ) : null}
        </fieldset>

        <label
          className={`mt-8 flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors ${
            includeShopping
              ? "border-[#d5a36f] bg-[var(--orange-soft)]"
              : "border-[var(--line)] bg-white"
          }`}
        >
          <input
            type="checkbox"
            checked={includeShopping}
            onChange={(event) => update("includeShopping", event.target.checked)}
            className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
          />
          <ShoppingBag className="mt-0.5 shrink-0 text-[#b65d2d]" size={20} aria-hidden="true" />
          <span>
            <span className="block text-sm font-extrabold">관광형 쇼핑 후보도 포함해요</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
              켜도 임의의 소매점은 포함하지 않습니다. 관광에 적합한 시장·지역 특산품·공예·문화·체험형 후보만 검토해요.
            </span>
          </span>
        </label>

        <div className="mt-8 rounded-[var(--radius-card)] border border-[#e6d1bb] bg-[var(--orange-soft)] p-4 text-xs font-semibold leading-6 text-[#6a5547]">
          추천 단계에서는 한국관광공사 동반 근거를 확인한 실제 장소만 사용하며, 제공자 실패를 데모 데이터로 대체하지 않습니다.
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ButtonLink href="/planner/pet" variant="brandSecondary" className="w-full sm:w-auto">
            <ArrowLeft size={17} aria-hidden="true" /> 이전
          </ButtonLink>
          <Button
            type="submit"
            variant="brand"
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            {submitting ? "추천 경로 만드는 중" : "추천 경로 만들기"}
            <ArrowRight size={17} aria-hidden="true" />
          </Button>
        </div>
      </form>

      <aside
        className="surface-panel bg-[var(--surface-sage)] p-5 sm:p-6 lg:sticky lg:top-24"
        aria-labelledby="trip-summary-heading"
      >
        <p className="eyebrow">현재 선택</p>
        <h2 id="trip-summary-heading" className="mt-2 text-xl font-black">
          여행 조건 요약
        </h2>
        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="text-xs font-bold text-[var(--muted)]">출발지</dt>
            <dd className="mt-1 break-words font-extrabold">
              {preferences.departure?.label ?? "주소를 선택해 주세요"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-[var(--muted)]">목적지</dt>
            <dd className="mt-1 font-extrabold">{destinationLabel}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-bold text-[var(--muted)]">날짜</dt>
              <dd className="mt-1 font-extrabold">{preferences.tripDate || "미선택"}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-[var(--muted)]">시작</dt>
              <dd className="mt-1 font-extrabold">{preferences.startTime || "미선택"}</dd>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-bold text-[var(--muted)]">여행 형태</dt>
              <dd className="mt-1 font-extrabold">{tripTypeLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-[var(--muted)]">일정 길이</dt>
              <dd className="mt-1 font-extrabold">{scheduleLabel}</dd>
            </div>
          </div>
          <div>
            <dt className="text-xs font-bold text-[var(--muted)]">선호 장소</dt>
            <dd className="mt-1 font-extrabold">
              {selectedCategoryLabels.length > 0
                ? selectedCategoryLabels.join(" · ")
                : "선택 없음"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-[var(--muted)]">추가 조건</dt>
            <dd className="mt-1 font-extrabold">
              {indoorLabels[indoorPreference]} · 쇼핑 {includeShopping ? "포함" : "제외"}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex items-start gap-2 rounded-[var(--radius-control)] border border-white/80 bg-white/70 p-4 text-xs font-semibold leading-5 text-[var(--muted)]">
          <Clock3 className="mt-0.5 shrink-0 text-[var(--brand)]" size={16} aria-hidden="true" />
          선택값은 추천 요청이 시작될 때 한 번 검증되며, 오류가 있어도 다른 입력은 유지됩니다.
        </div>
      </aside>
    </div>
  );
}
