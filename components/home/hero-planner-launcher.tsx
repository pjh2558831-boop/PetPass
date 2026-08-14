"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  PawPrint,
  Search,
} from "lucide-react";
import { usePlannerState } from "@/components/planner/planner-state";
import {
  BUSAN_DISTRICTS,
  BUSAN_REGION,
  type BusanDistrictCode,
} from "@/lib/tour-api/catalog";

const SUPPORTED_DISTRICT_CODES = ["350", "500", "710", "230"] as const satisfies
  readonly BusanDistrictCode[];

type RegionChoice = "all" | (typeof SUPPORTED_DISTRICT_CODES)[number];

const QUICK_CHOICE_LABELS: Record<RegionChoice, string> = {
  all: "부산 전체",
  "350": "해운대구",
  "500": "수영구 · 광안리",
  "710": "기장군",
  "230": "부산진구 · 서면",
};

const QUICK_CHOICES = ["all", "350", "500", "710", "230"] as const satisfies
  readonly RegionChoice[];

const SUPPORTED_DISTRICTS = SUPPORTED_DISTRICT_CODES.map((code) => {
  const district = BUSAN_DISTRICTS.find((candidate) => candidate.code === code);
  if (!district) {
    throw new Error(`Supported homepage district is missing from config: ${code}`);
  }
  return district;
});

const SUPPORTED_DISTRICT_CODE_SET = new Set<string>(SUPPORTED_DISTRICT_CODES);

function initialRegionChoice(districtCode: string | undefined): RegionChoice {
  return districtCode && SUPPORTED_DISTRICT_CODE_SET.has(districtCode)
    ? (districtCode as RegionChoice)
    : "all";
}

export function HeroPlannerLauncher() {
  const router = useRouter();
  const { preferences, setPreferences } = usePlannerState();
  const [selectedRegion, setSelectedRegion] = useState<RegionChoice>(() =>
    initialRegionChoice(preferences.districtCode),
  );

  const openPlanner = () => {
    const district =
      selectedRegion === "all"
        ? undefined
        : SUPPORTED_DISTRICTS.find(({ code }) => code === selectedRegion);

    setPreferences((current) => ({
      ...current,
      regionCode: BUSAN_REGION.code,
      regionName: BUSAN_REGION.name,
      districtCode: district?.code,
      districtName: district?.name,
    }));
    router.push("/planner/pet");
  };

  return (
    <form
      className="hero-planner-launcher rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-5"
      aria-label="여행 만들기 빠른 시작"
      onSubmit={(event) => {
        event.preventDefault();
        openPlanner();
      }}
    >
      <ol
        className="grid grid-cols-3 items-start gap-2 border-b border-[var(--line)] pb-3"
        aria-label="여행 정보 입력 순서"
      >
        <li className="flex min-w-0 items-start gap-1.5 text-[11px] font-extrabold leading-4 text-[var(--brand)] sm:items-center sm:text-xs">
          <MapPin className="shrink-0" size={15} aria-hidden="true" />
          <span>어디로 떠날까요?</span>
        </li>
        <li className="flex min-w-0 items-start gap-1.5 text-[11px] font-bold leading-4 text-[var(--muted)] sm:items-center sm:text-xs">
          <CalendarDays className="shrink-0" size={15} aria-hidden="true" />
          <span>언제 갈까요?</span>
        </li>
        <li className="flex min-w-0 items-start gap-1.5 text-[11px] font-bold leading-4 text-[var(--muted)] sm:items-center sm:text-xs">
          <PawPrint className="shrink-0" size={15} aria-hidden="true" />
          <span>누구와 함께?</span>
        </li>
      </ol>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">부산 여행 지역</span>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            size={17}
            aria-hidden="true"
          />
          <select
            value={selectedRegion}
            onChange={(event) =>
              setSelectedRegion(event.target.value as RegionChoice)
            }
            className="min-h-12 w-full appearance-none rounded-[var(--radius-control)] border border-[var(--line)] bg-white py-2 pl-11 pr-9 text-sm font-bold text-[var(--foreground)]"
          >
            <option value="all">부산 전체</option>
            {SUPPORTED_DISTRICTS.map((district) => (
              <option key={district.code} value={district.code}>
                {QUICK_CHOICE_LABELS[district.code as RegionChoice]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand)] px-6 text-sm font-extrabold text-white shadow-[var(--shadow-button)] transition-colors hover:bg-[var(--brand-deep)]"
        >
          여행 만들기
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="빠른 지역 선택">
        <span className="mr-1 text-[11px] font-extrabold text-[var(--muted)]">
          빠른 지역 선택
        </span>
        {QUICK_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={selectedRegion === choice}
            onClick={() => setSelectedRegion(choice)}
            className={`min-h-9 rounded-full border px-3 text-[11px] font-extrabold transition-colors ${
              selectedRegion === choice
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-[var(--line)] bg-[var(--surface-muted)] text-[var(--muted)] hover:border-[var(--brand-border)]"
            }`}
          >
            {QUICK_CHOICE_LABELS[choice]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
        날짜와 반려동물 정보는 다음 화면에서 이어서 입력합니다.
      </p>
    </form>
  );
}
