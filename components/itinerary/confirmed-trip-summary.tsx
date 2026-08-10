import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  PawPrint,
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
  any: "실내 이용 상관없음",
  preferred: "실내 가능 장소 우선",
  required: "실내 동반 가능 장소만",
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
  const indoorPreference = preferences.indoorAccessPreference ?? "any";
  const destination = preferences.districtName ?? preferences.regionName;

  return (
    <section
      className="surface-card p-4 sm:p-5"
      aria-labelledby="confirmed-trip-summary-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">확정한 여행 조건</p>
          <h2
            id="confirmed-trip-summary-heading"
            className="mt-1 text-lg font-black tracking-[-0.025em]"
          >
            이 조건으로 계산한 추천이에요
          </h2>
        </div>
        {showEditAction ? (
          <Link
            href="/planner/trip"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[#c9d7ce] bg-white px-4 text-sm font-extrabold text-[#23483a] transition-colors hover:border-[#82aa95] hover:bg-[var(--brand-soft)]"
          >
            <PencilLine size={16} aria-hidden="true" />
            여행 조건 수정
          </Link>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-[var(--surface-muted)] p-3.5">
          <dt className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <PawPrint size={15} aria-hidden="true" /> 반려동물
          </dt>
          <dd className="mt-2 text-sm font-black">
            {profile.name} · {SPECIES_LABELS[profile.species]} · {SIZE_LABELS[profile.size]}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {equipmentSummary(profile)}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] p-3.5">
          <dt className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <MapPin size={15} aria-hidden="true" /> 출발·여행 범위
          </dt>
          <dd className="mt-2 text-sm font-black">
            {preferences.departure?.label ?? "부산역"} → {destination}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {profile.acceptsOutdoorOnly
              ? "야외 전용 장소 포함 가능"
              : "실내 이용 필요"}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] p-3.5">
          <dt className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
            <CalendarDays size={15} aria-hidden="true" /> 날짜·시작
          </dt>
          <dd className="mt-2 text-sm font-black">{preferences.tripDate}</dd>
          <dd className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-[var(--muted)]">
            <Clock3 size={13} aria-hidden="true" /> {preferences.startTime} 출발 · {scheduleSummary(preferences)}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] p-3.5">
          <dt className="text-xs font-bold text-[var(--muted)]">장소 조건</dt>
          <dd className="mt-2 text-sm font-black">
            {categories.length > 0 ? categories.join(" · ") : "선택 카테고리 없음"}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {preferences.includeShopping ? "관광형 쇼핑 포함" : "쇼핑 제외"} · {INDOOR_LABELS[indoorPreference]}
          </dd>
        </div>
      </dl>
    </section>
  );
}
