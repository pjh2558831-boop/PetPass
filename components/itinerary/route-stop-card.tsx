import Link from "next/link";
import {
  Clock3,
  MapPin,
  Route,
} from "lucide-react";
import { PetAccessDetails } from "@/components/itinerary/pet-access-details";
import { PlaceImage } from "@/components/places/place-image";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import type { StopPresentation } from "@/lib/itinerary/presentation";

function StopTitleLink({ presentation }: { presentation: StopPresentation }) {
  const { stop, detailHref } = presentation;
  const className =
    "block break-words text-lg font-black tracking-[-0.03em] text-[var(--foreground)] hover:text-[var(--brand)] [overflow-wrap:anywhere] sm:text-xl";
  if (!detailHref) return <h3 className={className}>{stop.title}</h3>;
  if (detailHref.startsWith("/")) {
    return (
      <h3>
        <Link href={detailHref} className={className}>{stop.title}</Link>
      </h3>
    );
  }
  return (
    <h3>
      <a href={detailHref} target="_blank" rel="noreferrer" className={className}>
        {stop.title}
      </a>
    </h3>
  );
}

export function RouteStopCard({
  presentation,
  previousLabel,
  selected = false,
  onSelect,
  showImage = false,
  expandedAccess = false,
  priorityImage = false,
  domId,
}: {
  presentation: StopPresentation;
  previousLabel: string;
  selected?: boolean;
  onSelect?: () => void;
  showImage?: boolean;
  expandedAccess?: boolean;
  priorityImage?: boolean;
  domId?: string;
}) {
  const { stop } = presentation;

  return (
    <li
      id={domId ?? `itinerary-stop-${stop.order}`}
      className={`relative rounded-[var(--radius-card)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5 ${
        selected
          ? "border-[var(--mint-500)] ring-2 ring-[rgba(61,139,104,.16)]"
          : "border-[var(--line)]"
      }`}
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-[#f4f7f4] px-3 py-2.5 text-xs font-bold text-[#52665b]">
        <Route size={15} className="shrink-0 text-[var(--brand)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words">
          {previousLabel} → {stop.title}
        </span>
        <span className="shrink-0 text-right">
          {formatRouteDistance(stop.distanceFromPreviousMeters)} · {formatRouteDuration(stop.durationFromPreviousSeconds)}
        </span>
      </div>

      <div className={showImage ? "grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]" : ""}>
        {showImage ? (
          <PlaceImage
            imageUrl={stop.imageUrl ?? null}
            title={stop.title}
            priority={priorityImage}
          />
        ) : null}
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-sm font-black text-white"
              aria-label={`${stop.order}번째 방문 장소`}
            >
              {stop.order}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-extrabold">
                <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[var(--brand)]">
                  {TOUR_CATEGORY_LABELS[stop.category]}
                </span>
                <span className="rounded-full border border-[#d7e0da] bg-white px-2.5 py-1 text-[#66766e]">
                  {stop.source === "TOUR_API" ? "한국관광공사 장소" : "카카오 탐색 후보"}
                </span>
                {stop.operatingHours.warning ? (
                  <span className="rounded-full bg-[#fff1e5] px-2.5 py-1 text-[#7b4b2f]">
                    {stop.operatingHours.warning}
                  </span>
                ) : null}
              </div>
              <StopTitleLink presentation={presentation} />
              <p className="mt-2 flex items-start gap-1.5 break-words text-xs leading-5 text-[var(--muted)]">
                <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {stop.address ?? "주소 정보가 제공되지 않았습니다."}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#456e5a]">
                <Clock3 size={14} aria-hidden="true" />
                {stop.plannedArrival}–{stop.plannedDeparture} · 체류 {stop.visitDurationMinutes}분
              </p>
            </div>
            {onSelect ? (
              <button
                type="button"
                onClick={onSelect}
                aria-pressed={selected}
                aria-label={`${stop.title} ${selected ? "지도에서 선택됨" : "지도에서 보기"}`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-[#c9d7ce] bg-white px-3 text-xs font-extrabold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
              >
                <MapPin size={15} aria-hidden="true" />
                <span className="hidden sm:inline">{selected ? "지도에서 선택됨" : "지도에서 보기"}</span>
                <span className="sm:hidden">지도</span>
              </button>
            ) : null}
          </div>

          {stop.recommendationReasons.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="이 장소를 포함한 근거">
              {stop.recommendationReasons.map((reason) => (
                <li key={reason} className="rounded-lg bg-[#f3f6f2] px-2.5 py-1 text-[11px] font-bold leading-5 text-[#5d6e65]">
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <PetAccessDetails presentation={presentation} expanded={expandedAccess} />
      </div>
    </li>
  );
}
