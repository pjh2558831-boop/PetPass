import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPinned,
  Route,
} from "lucide-react";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import { recommendationWarningCopy } from "@/lib/recommendation/recommendation-copy";
import type { SavedRouteRecommendationSnapshotV1 } from "@/lib/storage/recommendation-storage";
import type { Itinerary } from "@/types/itinerary";

function koreaTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function PlannerLink() {
  return (
    <Link
      href="/planner/pet"
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-sm font-extrabold text-white shadow-[var(--shadow-button)] hover:bg-[var(--brand-deep)]"
    >
      <ArrowLeft size={17} aria-hidden="true" />
      새 여행 만들기
    </Link>
  );
}

export function SavedRecommendationView({
  snapshot,
}: {
  snapshot: SavedRouteRecommendationSnapshotV1;
}) {
  const warnings = snapshot.warningCodes.flatMap((code) => {
    const copy = recommendationWarningCopy(code);
    return copy ? [copy] : [];
  });
  const elapsedSeconds = Math.max(
    0,
    (Date.parse(snapshot.route.routeSummary.endAt) -
      Date.parse(snapshot.route.routeSummary.startAt)) /
      1_000,
  );

  return (
    <div className="space-y-6" data-itinerary-source="saved-recommendation">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="eyebrow">저장된 일정</p>
          <h1 className="mt-2 break-words text-3xl font-black tracking-[-0.045em] [overflow-wrap:anywhere] sm:text-4xl lg:text-[42px]">
            {snapshot.route.label}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={16} aria-hidden="true" />
              {snapshot.requestSummary.tripDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={16} aria-hidden="true" />
              {snapshot.requestSummary.startTime} 출발
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPinned size={16} aria-hidden="true" />
              {snapshot.requestSummary.departureLabel}
            </span>
          </p>
        </div>
        <PlannerLink />
      </header>

      <section className="surface-card p-5 sm:p-6" aria-labelledby="saved-route-summary-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">저장 당시 경로 요약</p>
            <h2 id="saved-route-summary-heading" className="mt-1 text-2xl font-black tracking-[-0.035em]">
              {snapshot.route.routeSummary.stopCount}곳 방문 일정
            </h2>
          </div>
          <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-xs font-black text-[var(--brand)]">
            {snapshot.manuallyModified ? "직접 수정 후 저장" : "WEEKENDOG 추천 저장"}
          </span>
        </div>
        <dl className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-[#f3f6f2] p-3">
            <dt className="text-[11px] font-bold text-[var(--muted)]">총 이동 거리</dt>
            <dd className="mt-1 font-black">{formatRouteDistance(snapshot.route.routeSummary.totalDistanceMeters)}</dd>
          </div>
          <div className="rounded-xl bg-[#f3f6f2] p-3">
            <dt className="text-[11px] font-bold text-[var(--muted)]">차량 이동</dt>
            <dd className="mt-1 font-black">{formatRouteDuration(snapshot.route.routeSummary.totalDrivingSeconds)}</dd>
          </div>
          <div className="rounded-xl bg-[#f3f6f2] p-3">
            <dt className="text-[11px] font-bold text-[var(--muted)]">방문 장소</dt>
            <dd className="mt-1 font-black">{snapshot.route.routeSummary.stopCount}곳</dd>
          </div>
          <div className="rounded-xl bg-[#f3f6f2] p-3">
            <dt className="text-[11px] font-bold text-[var(--muted)]">전체 일정</dt>
            <dd className="mt-1 font-black">{formatRouteDuration(elapsedSeconds)}</dd>
          </div>
        </dl>
        <p className="mt-4 rounded-xl bg-[#fff8ec] p-3 text-xs font-bold leading-5 text-[#76542f]">
          저장 당시 확인된 경로 정보입니다. 현재 운영 상태나 실시간 교통을 새로 확인한 결과가 아니므로 방문 전에 다시 확인해 주세요.
        </p>
      </section>

      {warnings.length > 0 ? (
        <section className="rounded-[var(--radius-card)] border border-[#dfccb3] bg-[#fff8ec] p-4" aria-labelledby="saved-route-warnings-heading">
          <h2 id="saved-route-warnings-heading" className="flex items-center gap-2 font-black text-[#76542f]">
            <AlertTriangle size={18} aria-hidden="true" /> 저장 당시 확인사항
          </h2>
          <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-[#76542f]">
            {[...new Set(warnings)].map((warning) => <li key={warning}>· {warning}</li>)}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="saved-route-stops-heading">
        <p className="eyebrow">저장된 방문 순서</p>
        <h2 id="saved-route-stops-heading" className="mt-1 text-2xl font-black tracking-[-0.035em]">
          장소별 도착·출발 시각
        </h2>
        <ol className="mt-4 space-y-3" aria-label="저장된 일정 방문 순서">
          {snapshot.route.stops.map((stop) => (
            <li key={stop.placeId} className="surface-card flex min-w-0 items-start gap-4 p-4 sm:p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-sm font-black text-white">
                {stop.sequence}
              </span>
              <div className="min-w-0">
                <h3 className="break-words text-lg font-black [overflow-wrap:anywhere]">{stop.title}</h3>
                <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                  {koreaTime(stop.arrivalAt)} 도착 · {koreaTime(stop.departureAt)} 출발
                </p>
                <p className="mt-1 text-xs font-semibold text-[#607168]">한국관광공사 기반 추천에 저장된 장소</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function LegacyItineraryView({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="space-y-6" data-itinerary-source="legacy-itinerary">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="eyebrow">이전 형식으로 저장된 일정</p>
          <h1 className="mt-2 break-words text-3xl font-black tracking-[-0.045em] [overflow-wrap:anywhere] sm:text-4xl">
            {itinerary.title}
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[var(--muted)]">
            저장된 요약을 표시합니다. 운영 정보와 이동 상태는 새로 조회하지 않았습니다.
          </p>
        </div>
        <PlannerLink />
      </header>
      <section className="surface-card p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
            <Route size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold text-[var(--muted)]">저장된 이동 요약</p>
            <p className="font-black">{itinerary.totalDistanceKm.toFixed(1)}km · 약 {itinerary.totalDriveMinutes}분 · {itinerary.stops.length}곳</p>
          </div>
        </div>
        <ol className="mt-5 space-y-3" aria-label="이전 형식 저장 일정 방문 순서">
          {itinerary.stops.map((stop, index) => (
            <li key={stop.id} className="rounded-xl border border-[var(--line)] p-4">
              <p className="text-xs font-black text-[var(--brand)]">{index + 1} · {stop.plannedArrival}–{stop.plannedDeparture}</p>
              <h2 className="mt-1 text-lg font-black">{stop.place.name}</h2>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{stop.place.source.sourceName}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
