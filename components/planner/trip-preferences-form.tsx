"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Coffee, Landmark, Utensils } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  BUSAN_DISTRICTS,
  BUSAN_REGION,
  isBusanDistrictCode,
} from "@/lib/tour-api/catalog";
import { getItineraryEnabledRegionConfigs } from "@/lib/regions/config";
import { TRIP_PACE_OPTIONS } from "@/lib/itinerary/trip-pace";
import {
  loadTravelPreferences,
  saveTravelPreferences,
} from "@/lib/storage/profile-storage";
import type { PlaceCategory, TravelPreferences } from "@/types/pet";

const defaultPreferences: TravelPreferences = {
  regionCode: BUSAN_REGION.code,
  regionName: BUSAN_REGION.name,
  tripDate: "2026-08-15",
  tripType: "DAY_TRIP",
  tripPace: "balanced",
  startTime: "10:00",
  preferredCategories: ["ATTRACTION", "RESTAURANT", "CAFE"],
};

const categories = [
  { value: "ATTRACTION" as const, label: "관광지", icon: Landmark },
  { value: "RESTAURANT" as const, label: "식당", icon: Utensils },
  { value: "CAFE" as const, label: "카페", icon: Coffee },
  { value: "ACCOMMODATION" as const, label: "숙소", icon: BedDouble },
];

const ENABLED_REGIONS = getItineraryEnabledRegionConfigs();

export function TripPreferencesForm() {
  const router = useRouter();
  const [preferences, setPreferences] =
    useState<TravelPreferences>(defaultPreferences);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = loadTravelPreferences();
    // Hydrate validated client-only storage after the server render.
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreferences({
        ...saved,
        regionCode: BUSAN_REGION.code,
        regionName: BUSAN_REGION.name,
        districtCode:
          saved.regionCode === BUSAN_REGION.code &&
          isBusanDistrictCode(saved.districtCode)
            ? saved.districtCode
            : undefined,
        districtName:
          saved.regionCode === BUSAN_REGION.code &&
          isBusanDistrictCode(saved.districtCode)
            ? saved.districtName
            : undefined,
      });
    }
  }, []);

  const toggleCategory = (category: PlaceCategory) => {
    setPreferences((current) => {
      const exists = current.preferredCategories.includes(category);
      return {
        ...current,
        preferredCategories: exists
          ? current.preferredCategories.filter((item) => item !== category)
          : [...current.preferredCategories, category],
      };
    });
  };

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (preferences.preferredCategories.length === 0) {
          setError("방문하고 싶은 장소 유형을 하나 이상 선택해 주세요.");
          return;
        }
        if (!saveTravelPreferences(preferences)) {
          setError("여행 조건을 이 브라우저에 저장하지 못했어요.");
          return;
        }
        router.push("/results?tab=recommendations&region=busan");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="region" className="mb-2 block text-sm font-extrabold">
            여행 지역
          </label>
          <select
            id="region"
            value={preferences.regionCode}
            onChange={(event) => {
              const region = ENABLED_REGIONS.find(
                ({ providerCodes }) =>
                  providerCodes.korPetTourService2.legalDongRegionCode === event.target.value,
              );
              if (!region) return;
              setPreferences((current) => ({
                ...current,
                regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
                regionName: region.displayName,
                districtCode: undefined,
                districtName: undefined,
              }));
            }}
            className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white px-4 font-semibold"
          >
            {ENABLED_REGIONS.map((region) => (
              <option key={region.id} value={region.providerCodes.korPetTourService2.legalDongRegionCode}>
                {region.displayName}
              </option>
            ))}
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
                districtCode: district?.code,
                districtName: district?.name,
              }));
            }}
            className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white px-4 font-semibold"
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
          <label htmlFor="trip-date" className="mb-2 block text-sm font-extrabold">
            여행 날짜
          </label>
          <input
            id="trip-date"
            type="date"
            value={preferences.tripDate}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                tripDate: event.target.value,
              }))
            }
            className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white px-4 font-semibold"
            required
          />
        </div>
        <div>
          <label htmlFor="start-time" className="mb-2 block text-sm font-extrabold">
            시작 시간
          </label>
          <input
            id="start-time"
            type="time"
            value={preferences.startTime}
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                startTime: event.target.value,
              }))
            }
            className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white px-4 font-semibold"
            required
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-extrabold">여행 형태</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { value: "DAY_TRIP" as const, label: "당일치기", note: "관광지 → 식당 → 카페" },
            { value: "OVERNIGHT" as const, label: "1박 여행", note: "숙소를 포함한 일정" },
          ].map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-2xl border p-4 ${
                preferences.tripType === option.value
                  ? "border-[#3d8b68] bg-[#edf8f2]"
                  : "border-[#d6ded9] bg-white"
              }`}
            >
              <input
                type="radio"
                name="tripType"
                value={option.value}
                checked={preferences.tripType === option.value}
                onChange={() =>
                  setPreferences((current) => ({
                    ...current,
                    tripType: option.value,
                  }))
                }
                className="sr-only"
              />
              <span className="block text-sm font-extrabold">{option.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#748078]">
                {option.note}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-extrabold">일정 페이스</legend>
        <p className="mt-1 text-xs leading-5 text-[#748078]">
          원하는 여행 리듬을 고르면 추천 일정의 방문 장소 수에 반영해요.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {TRIP_PACE_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`min-h-28 cursor-pointer rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-[#3d8b68]/35 ${
                preferences.tripPace === option.id
                  ? "border-[#3d8b68] bg-[#edf8f2] text-[#236148]"
                  : "border-[#d6ded9] bg-white text-[#53665c] hover:border-[#9db9aa]"
              }`}
            >
              <input
                type="radio"
                name="tripPace"
                value={option.id}
                checked={preferences.tripPace === option.id}
                onChange={() =>
                  setPreferences((current) => ({
                    ...current,
                    tripPace: option.id,
                  }))
                }
                className="sr-only"
              />
              <span className="flex items-center gap-2 text-sm font-black">
                <span aria-hidden="true">{option.icon}</span>
                {option.label}
              </span>
              <span className="mt-2 block text-sm font-extrabold">{option.rangeLabel}</span>
              <span className="mt-1 block text-xs leading-5 text-[#68776f]">
                {option.description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-extrabold">방문하고 싶은 장소</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categories.map(({ value, label, icon: Icon }) => {
            const selected = preferences.preferredCategories.includes(value);
            return (
              <label
                key={value}
                className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-sm font-bold ${
                  selected
                    ? "border-[#3d8b68] bg-[#edf8f2] text-[#236148]"
                    : "border-[#d6ded9] bg-white text-[#607168]"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => toggleCategory(value)}
                />
                <Icon size={21} aria-hidden="true" />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-2xl border border-[#e6d1bb] bg-[#fff8f1] p-4 text-sm leading-6 text-[#6a5547]">
        저장한 지역·날짜·장소 유형은 추천 코스의 기본값이 됩니다. 추천 단계에서는
        한국관광공사 동반 근거를 확인한 실제 장소만 사용하며, 제공자 실패를 데모
        데이터로 대체하지 않습니다.
      </div>

      {error ? (
        <p className="rounded-xl bg-[#fceeee] p-3 text-sm font-semibold text-[#8d3838]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <ButtonLink href="/planner/pet" variant="ghost">
          이전
        </ButtonLink>
        <Button type="submit">조건에 맞는 장소 추천</Button>
      </div>
    </form>
  );
}
