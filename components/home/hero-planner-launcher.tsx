"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
      className="hero-planner-launcher"
      aria-label="여행 만들기 빠른 시작"
      onSubmit={(event) => {
        event.preventDefault();
        openPlanner();
      }}
    >
      <span className="hero-planner-label">여행 지역</span>
      <div className="hero-planner-fields">
        <label className="hero-planner-select-label">
          <span className="sr-only">부산 여행 지역</span>
          <select
            value={selectedRegion}
            onChange={(event) =>
              setSelectedRegion(event.target.value as RegionChoice)
            }
            className="hero-planner-select"
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
          className="hero-planner-submit"
        >
          여행 만들기
        </button>
      </div>
    </form>
  );
}
