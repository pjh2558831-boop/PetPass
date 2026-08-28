"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, MapPin, Search } from "lucide-react";
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
      className="hero-planner-launcher border border-[var(--line)] bg-white shadow-[var(--shadow-card)]"
      aria-label="여행 만들기 시작 방법"
      onSubmit={(event) => {
        event.preventDefault();
        openPlanner();
      }}
    >
      <div className="hero-planner-heading">
        <MapPin size={18} aria-hidden="true" />
        <span>어떻게 일정을 만들까요?</span>
      </div>

      <Link
        href="/results?tab=catalog&region=busan&mode=select"
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand)] px-6 text-sm font-extrabold text-white shadow-[var(--shadow-button)] transition-colors hover:bg-[var(--brand-deep)]"
      >
        장소 고르고 일정 만들기
        <ArrowRight size={17} aria-hidden="true" />
      </Link>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
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
          WEEKENDOG에게 추천받기
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="빠른 지역 선택">
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
    </form>
  );
}
