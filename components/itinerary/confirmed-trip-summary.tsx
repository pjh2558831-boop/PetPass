import Link from "next/link";
import {
  PencilLine,
} from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/shared/format";
import type { PetProfile, TravelPreferences } from "@/types/pet";

const SPECIES_LABELS = {
  DOG: "강아지",
  CAT: "고양이",
  OTHER: "기타 반려동물",
} as const;

const SIZE_LABELS = {
  SMALL: "소형",
  MEDIUM: "중형",
  LARGE: "대형",
} as const;

const INDOOR_LABELS = {
  any: "실내·야외 상관없음",
  indoor_preferred: "실내 장소 우선",
  outdoor_preferred: "야외 장소 우선",
} as const;

function equipmentSummary(profile: PetProfile): string {
  return [
    `이동장 ${profile.hasCarrier ? "있음" : "없음"}`,
    `목줄 ${profile.hasLeash ? "있음" : "없음"}`,
    `입마개 ${profile.hasMuzzle ? "있음" : "없음"}`,
  ].join(" · ");
}

function scheduleSummary(preferences: TravelPreferences): string {
  if (preferences.planningMode === "duration") {
    const minutes = preferences.desiredDurationMinutes;
    return minutes ? `전체 ${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}` : "일정 시간 기준";
  }
  return preferences.desiredStopCount
    ? `방문 ${preferences.desiredStopCount}곳`
    : "방문 장소 수 기준";
}

export function ConfirmedTripSummary({
  profile,
  preferences,
  showEditAction = true,
}: {
  profile: PetProfile;
  preferences: TravelPreferences;
  showEditAction?: boolean;
}) {
  const categories = preferences.preferredCategories.map(
    (category) => CATEGORY_LABELS[category],
  );
  const environmentPreference = preferences.environmentPreference ?? "any";
  const destination = preferences.districtName ?? preferences.regionName;

  return (
    <section
      className="confirmed-trip-summary"
      aria-labelledby="confirmed-trip-summary-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="confirmed-trip-summary-heading"
            className="text-lg font-black tracking-[-0.025em]"
          >
            확정한 여행 조건
          </h2>
        </div>
        {showEditAction ? (
          <Link
            href="/planner/pet"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[#c9d7ce] bg-white px-4 text-sm font-extrabold text-[#23483a] transition-colors hover:border-[#82aa95] hover:bg-[var(--brand-soft)]"
          >
            <PencilLine size={16} aria-hidden="true" />
            여행 정보 수정
          </Link>
        ) : null}
      </div>

      <dl className="confirmed-trip-summary__list">
        <div>
          <dt>반려동물</dt>
          <dd className="mt-2 text-sm font-black">
            {profile.name} · {SPECIES_LABELS[profile.species]} · {SIZE_LABELS[profile.size]}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {equipmentSummary(profile)}
          </dd>
        </div>
        <div>
          <dt>출발·여행 범위</dt>
          <dd className="mt-2 text-sm font-black">
            {preferences.departure?.label ?? "부산역"} → {destination}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {profile.acceptsOutdoorOnly
              ? "야외 활동 익숙함"
              : "공간 제약 없음"}
          </dd>
        </div>
        <div>
          <dt>날짜·시작</dt>
          <dd className="mt-2 text-sm font-black">{preferences.tripDate}</dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {preferences.startTime} 출발 · {scheduleSummary(preferences)}
          </dd>
        </div>
        <div>
          <dt>장소 조건</dt>
          <dd className="mt-2 text-sm font-black">
            {categories.length > 0 ? categories.join(" · ") : "선택 카테고리 없음"}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {preferences.includeShopping ? "관광형 쇼핑 포함" : "쇼핑 제외"} · {INDOOR_LABELS[environmentPreference]}
          </dd>
        </div>
      </dl>
    </section>
  );
}
