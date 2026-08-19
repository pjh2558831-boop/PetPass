"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Backpack,
  BedDouble,
  CalendarDays,
  Cat,
  Check,
  Clock3,
  Coffee,
  Dog,
  House,
  Info,
  Landmark,
  MapPin,
  PawPrint,
  RotateCcw,
  Route,
  ShieldCheck,
  ShoppingBag,
  Trees,
  Utensils,
} from "lucide-react";
import { DepartureMapPicker } from "@/components/planner/departure-map-picker";
import { DepartureSearch } from "@/components/planner/departure-search";
import {
  DEFAULT_PLANNER_PREFERENCES,
  DEFAULT_PLANNER_PROFILE,
  usePlannerState,
} from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import {
  getTripPacePlanning,
  TRIP_PACE_OPTIONS,
} from "@/lib/itinerary/trip-pace";
import { BUSAN_DISTRICTS, BUSAN_REGION } from "@/lib/tour-api/catalog";
import type {
  PetProfile,
  PetSize,
  PetSpecies,
  PlaceCategory,
  TravelPreferences,
  TripType,
} from "@/types/pet";

const speciesOptions: Array<{
  value: PetSpecies;
  label: string;
  icon: typeof Dog;
}> = [
  { value: "DOG", label: "강아지", icon: Dog },
  { value: "CAT", label: "고양이", icon: Cat },
  { value: "OTHER", label: "기타", icon: PawPrint },
];

const sizeOptions: Array<{ value: PetSize; label: string; note: string }> = [
  { value: "SMALL", label: "소형", note: "약 10kg 미만" },
  { value: "MEDIUM", label: "중형", note: "약 10–25kg" },
  { value: "LARGE", label: "대형", note: "약 25kg 이상" },
];

const equipmentOptions = [
  { key: "hasCarrier" as const, label: "이동장", icon: Backpack },
  { key: "hasLeash" as const, label: "목줄", icon: ShieldCheck },
  { key: "hasMuzzle" as const, label: "입마개", icon: Dog },
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
    note: "숙소를 마지막 방문지로 배치하는 일정",
  },
];

const categoryOptions: Array<{
  value: PlaceCategory;
  label: string;
  icon: typeof Landmark;
}> = [
  { value: "ATTRACTION", label: "관광지", icon: Landmark },
  { value: "RESTAURANT", label: "음식점", icon: Utensils },
  { value: "CAFE", label: "카페", icon: Coffee },
  { value: "WALK", label: "산책·공원", icon: Trees },
  { value: "ACCOMMODATION", label: "숙소", icon: BedDouble },
];

type FieldErrors = Partial<
  Record<
    | "name"
    | "species"
    | "size"
    | "departure"
    | "tripDate"
    | "startTime"
    | "planning"
    | "categories",
    string
  >
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

export function UnifiedPlannerForm() {
  const router = useRouter();
  const submittingRef = useRef(false);
  const {
    profile,
    preferences,
    profileConfirmed,
    setProfile,
    setPreferences,
    confirmPlannerAndRequestGeneration,
  } = usePlannerState();
  const [species, setSpecies] = useState<PetSpecies | null>(
    profileConfirmed ? profile.species : null,
  );
  const [size, setSize] = useState<PetSize | null>(
    profileConfirmed ? profile.size : null,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);

  const updateProfile = <K extends keyof PetProfile>(
    key: K,
    value: PetProfile[K],
  ) => setProfile((current) => ({ ...current, [key]: value }));

  const updatePreferences = <K extends keyof TravelPreferences>(
    key: K,
    value: TravelPreferences[K],
  ) => setPreferences((current) => ({ ...current, [key]: value }));

  const clearError = (field: keyof FieldErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleCategory = (category: PlaceCategory) => {
    setPreferences((current) => ({
      ...current,
      preferredCategories: current.preferredCategories.includes(category)
        ? current.preferredCategories.filter((value) => value !== category)
        : [...current.preferredCategories, category],
    }));
    clearError("categories");
  };

  const planningMode = preferences.planningMode ?? "stop_count";
  const desiredStopCount = preferences.desiredStopCount ?? 3;
  const desiredDurationMinutes = preferences.desiredDurationMinutes ?? 360;
  const includeShopping = preferences.includeShopping ?? false;

  const resetForm = () => {
    submittingRef.current = false;
    setSubmitting(false);
    setErrors({});
    setSpecies(null);
    setSize(null);
    setProfile({ ...DEFAULT_PLANNER_PROFILE });
    setPreferences({ ...DEFAULT_PLANNER_PREFERENCES });
    setSearchVersion((value) => value + 1);
    window.requestAnimationFrame(() =>
      document.getElementById("pet-name")?.focus(),
    );
  };

  return (
    <form
      className="mt-8 space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (submittingRef.current) return;

        const nextErrors: FieldErrors = {};
        const trimmedName = profile.name.trim();
        if (!trimmedName || trimmedName.length > 30) {
          nextErrors.name = "반려동물 이름을 1자 이상 30자 이하로 입력해 주세요.";
        }
        if (!species) nextErrors.species = "반려동물 종류를 선택해 주세요.";
        if (!size) nextErrors.size = "반려동물 크기를 선택해 주세요.";
        if (!preferences.departure) {
          nextErrors.departure = "검색 결과나 지도에서 실제 출발지를 선택해 주세요.";
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
          } else if (/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(preferences.startTime)) {
            const [hours, minutes] = preferences.startTime.split(":").map(Number);
            if (hours * 60 + minutes + desiredDurationMinutes > 24 * 60) {
              nextErrors.planning = "선택한 일정이 자정을 넘지 않도록 조정해 주세요.";
            }
          }
        } else if (desiredStopCount < 1 || desiredStopCount > 5) {
          nextErrors.planning = "방문 장소 수는 1곳에서 5곳 사이여야 합니다.";
        }
        if (preferences.preferredCategories.length === 0 && !includeShopping) {
          nextErrors.categories = "방문하고 싶은 장소 유형을 하나 이상 선택해 주세요.";
        } else if (
          preferences.tripType === "OVERNIGHT" &&
          !preferences.preferredCategories.includes("ACCOMMODATION")
        ) {
          nextErrors.categories = "1박 여행은 숙소 유형을 함께 선택해 주세요.";
        }

        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
          const firstField = [
            ["name", "pet-name"],
            ["species", "pet-species-DOG"],
            ["size", "pet-size-SMALL"],
            ["departure", "departure-search"],
            ["tripDate", "trip-date"],
            ["startTime", "start-time"],
            ["planning", planningMode === "duration" ? "planning-duration" : "planning-stop-count"],
            ["categories", "category-ATTRACTION"],
          ].find(([field]) => nextErrors[field as keyof FieldErrors]);
          if (firstField) {
            window.requestAnimationFrame(() =>
              document.getElementById(firstField[1])?.focus(),
            );
          }
          return;
        }

        const confirmedProfile: PetProfile = {
          ...profile,
          name: trimmedName,
          species: species!,
          size: size!,
        };
        submittingRef.current = true;
        setSubmitting(true);
        setErrors({});
        confirmPlannerAndRequestGeneration(confirmedProfile, preferences);
        router.push("/results?tab=recommendations&region=busan");
      }}
    >
      <section className="surface-panel p-5 sm:p-7 lg:p-8" aria-labelledby="pet-section-heading">
        <div className="flex items-center gap-3 border-b border-[var(--line)] pb-5 text-[var(--brand)]">
          <PawPrint size={22} aria-hidden="true" />
          <h2 id="pet-section-heading" className="text-lg font-black">
            1&nbsp; 반려동물 정보
          </h2>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(14rem,0.9fr)_minmax(20rem,1.25fr)_minmax(18rem,1fr)]">
          <div>
            <label htmlFor="pet-name" className="mb-2 block text-sm font-extrabold">
              반려동물 이름
            </label>
            <input
              id="pet-name"
              value={profile.name}
              maxLength={30}
              placeholder="예: 보리"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "pet-name-error" : undefined}
              onChange={(event) => {
                updateProfile("name", event.target.value);
                clearError("name");
              }}
              className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 font-semibold shadow-sm placeholder:text-[#9aa49f]"
            />
            {errors.name ? <p id="pet-name-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.name}</p> : null}
          </div>

          <fieldset aria-describedby={errors.species ? "pet-species-error" : undefined}>
            <legend className="mb-2 text-sm font-extrabold">반려동물 종류</legend>
            <div className="grid grid-cols-3 gap-2">
              {speciesOptions.map((option) => {
                const selected = species === option.value;
                const Icon = option.icon;
                return (
                  <label key={option.value} className={`relative flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-extrabold transition focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${selected ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}>
                    <input id={`pet-species-${option.value}`} type="radio" name="species" value={option.value} checked={selected} onChange={() => { setSpecies(option.value); clearError("species"); }} className="sr-only" />
                    <Icon size={18} aria-hidden="true" />
                    {option.label}
                  </label>
                );
              })}
            </div>
            {errors.species ? <p id="pet-species-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.species}</p> : null}
          </fieldset>

          <fieldset aria-describedby={errors.size ? "pet-size-error" : undefined}>
            <legend className="mb-2 text-sm font-extrabold">크기</legend>
            <div className="grid grid-cols-3 gap-2">
              {sizeOptions.map((option) => {
                const selected = size === option.value;
                return (
                  <label key={option.value} className={`relative flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-control)] border px-2 py-2 text-center transition focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${selected ? "border-[var(--mint-500)] bg-[var(--brand-soft)]" : "border-[var(--line)] bg-white"}`}>
                    <input id={`pet-size-${option.value}`} type="radio" name="size" value={option.value} checked={selected} onChange={() => { setSize(option.value); clearError("size"); }} className="sr-only" />
                    <span className="text-sm font-extrabold">{option.label}</span>
                    <span className="mt-0.5 text-[11px] text-[var(--muted)]">{option.note}</span>
                  </label>
                );
              })}
            </div>
            {errors.size ? <p id="pet-size-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.size}</p> : null}
          </fieldset>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <fieldset>
            <legend className="mb-2 text-sm font-extrabold">준비 가능한 물품 <span className="font-semibold text-[var(--muted)]">(선택)</span></legend>
            <div className="grid grid-cols-3 gap-3">
              {equipmentOptions.map(({ key, label, icon: Icon }) => {
                const selected = profile[key];
                return (
                  <label key={key} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-extrabold transition ${selected ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}>
                    <input type="checkbox" checked={selected} onChange={(event) => updateProfile(key, event.target.checked)} className="sr-only" />
                    {selected ? <Check size={16} aria-hidden="true" /> : <Icon size={18} aria-hidden="true" />}
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <p className="mb-2 text-sm font-extrabold">야외 전용 장소 포함 여부</p>
            <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 text-sm font-extrabold transition ${profile.acceptsOutdoorOnly ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}>
              <input type="checkbox" checked={profile.acceptsOutdoorOnly} onChange={(event) => updateProfile("acceptsOutdoorOnly", event.target.checked)} className="size-4 accent-[var(--brand)]" />
              <House size={18} aria-hidden="true" />
              야외 전용 장소도 포함해요
            </label>
          </div>
        </div>
      </section>

      <section className="surface-panel p-5 sm:p-7 lg:p-8" aria-labelledby="trip-section-heading">
        <div className="flex items-center gap-3 border-b border-[var(--line)] pb-5 text-[var(--brand)]">
          <MapPin size={22} aria-hidden="true" />
          <h2 id="trip-section-heading" className="text-lg font-black">
            2&nbsp; 여행 조건
          </h2>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:items-start">
          <div>
            <DepartureSearch key={searchVersion} value={preferences.departure} invalid={Boolean(errors.departure)} errorId={errors.departure ? "departure-error" : undefined} onChange={(departure) => { updatePreferences("departure", departure); clearError("departure"); }} />
            {errors.departure ? <p id="departure-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.departure}</p> : null}
          </div>
          <DepartureMapPicker value={preferences.departure} onChange={(departure) => { updatePreferences("departure", departure); clearError("departure"); setSearchVersion((value) => value + 1); }} />
        </div>

        <div className="mt-7 grid gap-4 border-t border-[var(--line)] pt-7 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="region" className="mb-2 block text-sm font-extrabold">여행 지역</label>
            <select id="region" value={BUSAN_REGION.code} disabled className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[#f4f7f4] px-4 font-semibold text-[#52645b] disabled:opacity-100"><option value={BUSAN_REGION.code}>{BUSAN_REGION.name}</option></select>
          </div>
          <div>
            <label htmlFor="district" className="mb-2 block text-sm font-extrabold">세부 지역</label>
            <select id="district" value={preferences.districtCode ?? "all"} onChange={(event) => { const district = BUSAN_DISTRICTS.find(({ code }) => code === event.target.value); setPreferences((current) => ({ ...current, regionCode: BUSAN_REGION.code, regionName: BUSAN_REGION.name, districtCode: district?.code, districtName: district?.name })); }} className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 font-semibold">
              <option value="all">부산 전체</option>
              {BUSAN_DISTRICTS.map((district) => <option key={district.code} value={district.code}>{district.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="trip-date" className="mb-2 block text-sm font-extrabold">여행 날짜</label>
            <div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" size={17} aria-hidden="true" /><input id="trip-date" type="date" value={preferences.tripDate} aria-invalid={Boolean(errors.tripDate)} aria-describedby={errors.tripDate ? "trip-date-error" : undefined} onChange={(event) => { updatePreferences("tripDate", event.target.value); clearError("tripDate"); }} className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white pl-10 pr-3 font-semibold" /></div>
            {errors.tripDate ? <p id="trip-date-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.tripDate}</p> : null}
          </div>
          <div>
            <label htmlFor="start-time" className="mb-2 block text-sm font-extrabold">시작 시간</label>
            <div className="relative"><Clock3 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" size={17} aria-hidden="true" /><input id="start-time" type="time" value={preferences.startTime} aria-invalid={Boolean(errors.startTime)} aria-describedby={errors.startTime ? "start-time-error" : undefined} onChange={(event) => { updatePreferences("startTime", event.target.value); clearError("startTime"); clearError("planning"); }} className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-white pl-10 pr-3 font-semibold" /></div>
            {errors.startTime ? <p id="start-time-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.startTime}</p> : null}
          </div>
        </div>

        <fieldset className="mt-7 border-t border-[var(--line)] pt-7">
          <legend className="text-sm font-extrabold">여행 형태</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {tripTypeOptions.map((option) => { const selected = preferences.tripType === option.value; return <label key={option.value} className={`relative rounded-[var(--radius-card)] border p-4 transition focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${option.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${selected ? "border-[var(--mint-500)] bg-[var(--brand-soft)]" : "border-[var(--line)] bg-white"}`}><input type="radio" name="tripType" value={option.value} checked={selected} disabled={option.disabled} onChange={() => updatePreferences("tripType", option.value)} className="sr-only" /><span className="block text-sm font-extrabold">{option.label}</span><span className="mt-1 block text-xs text-[var(--muted)]">{option.note}</span></label>; })}
          </div>
          <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-white px-4 text-sm font-extrabold text-[#607168]">
            <input
              type="checkbox"
              checked={preferences.roundTrip ?? false}
              onChange={(event) => updatePreferences("roundTrip", event.target.checked)}
              className="size-4 accent-[var(--brand)]"
            />
            마지막 장소 방문 후 출발지로 돌아오기
          </label>
        </fieldset>

        <fieldset className="mt-7 border-t border-[var(--line)] pt-7" aria-describedby={errors.planning ? "planning-error" : undefined}>
          <legend className="text-sm font-extrabold">일정 페이스</legend>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            원하는 여행 리듬을 고르면 추천 엔진의 방문 장소 수로 변환합니다.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {TRIP_PACE_OPTIONS.map((option) => {
              const selected = preferences.tripPace === option.id;
              return (
                <label
                  key={option.id}
                  className={`min-h-28 cursor-pointer rounded-[var(--radius-card)] border p-4 transition focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#3d8b6859] ${selected ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}
                >
                  <input
                    type="radio"
                    name="tripPace"
                    value={option.id}
                    checked={selected}
                    onChange={() => {
                      const planning = getTripPacePlanning(option.id);
                      setPreferences((current) => ({
                        ...current,
                        tripPace: option.id,
                        planningMode: "stop_count",
                        desiredStopCount: planning.desiredStopCount,
                      }));
                      clearError("planning");
                    }}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 text-sm font-black">
                    <span aria-hidden="true">{option.icon}</span>
                    {option.label}
                  </span>
                  <span className="mt-2 block text-sm font-extrabold">{option.rangeLabel}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#68776f]">{option.description}</span>
                </label>
              );
            })}
          </div>
          {errors.planning ? <p id="planning-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.planning}</p> : null}
        </fieldset>

        <fieldset className="mt-7 border-t border-[var(--line)] pt-7" aria-describedby={errors.categories ? "categories-error" : undefined}>
          <legend className="text-sm font-extrabold">방문하고 싶은 장소 <span className="font-semibold text-[var(--muted)]">(복수 선택)</span></legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {categoryOptions.map((option) => { const selected = preferences.preferredCategories.includes(option.value); const Icon = option.icon; return <label key={option.value} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-extrabold transition ${selected ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}><input id={`category-${option.value}`} type="checkbox" checked={selected} onChange={() => toggleCategory(option.value)} className="sr-only" /><Icon size={17} aria-hidden="true" />{option.label}</label>; })}
            <label className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-extrabold transition ${includeShopping ? "border-[var(--mint-500)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--line)] bg-white text-[#607168]"}`}><input type="checkbox" checked={includeShopping} onChange={(event) => { updatePreferences("includeShopping", event.target.checked); clearError("categories"); }} className="sr-only" /><ShoppingBag size={17} aria-hidden="true" />쇼핑</label>
          </div>
          {errors.categories ? <p id="categories-error" className="mt-2 text-sm font-bold text-[#a44537]" role="alert">{errors.categories}</p> : null}
        </fieldset>
      </section>

      <aside className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[#aac2b4] bg-[#f4faf6] p-4 text-sm leading-6 text-[#355646]" aria-label="추천 데이터 안내">
        <Info className="mt-0.5 shrink-0 text-[var(--brand)]" size={20} aria-hidden="true" />
        <p className="font-semibold">추천 단계에서는 한국관광공사 동반 근거를 확인한 실제 장소만 사용하며, 제공자 실패를 데모 데이터로 대체하지 않습니다.</p>
      </aside>

      <div className="surface-panel flex flex-col-reverse gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <button type="button" onClick={resetForm} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-extrabold text-[#52645b] hover:bg-[var(--brand-soft)]"><RotateCcw size={18} aria-hidden="true" />초기화</button>
        <Button type="submit" variant="brand" className="w-full sm:w-auto" disabled={submitting}>
          <Route size={18} aria-hidden="true" />
          {submitting ? "추천 준비 중" : "여행 추천 받기"}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
