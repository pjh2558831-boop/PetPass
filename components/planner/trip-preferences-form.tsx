"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Coffee, Landmark, Utensils } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  loadTravelPreferences,
  saveTravelPreferences,
} from "@/lib/storage/profile-storage";
import type { PlaceCategory, TravelPreferences } from "@/types/pet";

const defaultPreferences: TravelPreferences = {
  regionCode: "26",
  regionName: "부산",
  districtCode: "16",
  districtName: "해운대구",
  tripDate: "2026-08-15",
  tripType: "DAY_TRIP",
  startTime: "10:00",
  preferredCategories: ["ATTRACTION", "RESTAURANT", "CAFE"],
};

const categories = [
  { value: "ATTRACTION" as const, label: "관광지", icon: Landmark },
  { value: "RESTAURANT" as const, label: "식당", icon: Utensils },
  { value: "CAFE" as const, label: "카페", icon: Coffee },
  { value: "ACCOMMODATION" as const, label: "숙소", icon: BedDouble },
];

export function TripPreferencesForm() {
  const router = useRouter();
  const [preferences, setPreferences] =
    useState<TravelPreferences>(defaultPreferences);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = loadTravelPreferences();
    // Hydrate validated client-only storage after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setPreferences(saved);
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
        router.push("/results");
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
              const isBusan = event.target.value === "26";
              setPreferences((current) => ({
                ...current,
                regionCode: event.target.value,
                regionName: isBusan ? "부산" : "제주",
                districtCode: isBusan ? "16" : undefined,
                districtName: isBusan ? "해운대구" : undefined,
              }));
            }}
            className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-white px-4 font-semibold"
          >
            <option value="26">부산</option>
            <option value="39" disabled>
              제주 · 다음 단계에서 지원
            </option>
          </select>
        </div>
        <div>
          <label htmlFor="district" className="mb-2 block text-sm font-extrabold">
            세부 지역
          </label>
          <select
            id="district"
            value={preferences.districtCode}
            disabled
            className="min-h-12 w-full rounded-2xl border border-[#cfd9d3] bg-[#f1f3f1] px-4 font-semibold text-[#617068]"
          >
            <option value="16">해운대구</option>
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
        이 단계에서는 부산 소형견·이동장 보유 시나리오를 로컬 데모 데이터로
        보여줘요. 실제 관광 API 실패를 데모 데이터로 조용히 대체하지 않습니다.
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
        <Button type="submit">추천 경로 보기</Button>
      </div>
    </form>
  );
}
