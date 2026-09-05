import { MapPanel } from "@/components/map/map-panel";
import { formatScheduleTime as koreaTime } from "@/lib/recommendation/schedule/schedule-display";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarDays, Clock3, MapPinned } from "lucide-react";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import { recommendationWarningCopy, recommendationPetAccessCopy, recommendationOperatingWarning } from "@/lib/recommendation/recommendation-copy";
import type { SavedRouteRecommendationSnapshotV1 } from "@/lib/storage/recommendation-storage";
import type { Itinerary } from "@/types/itinerary";


function PlannerLink() {
  return (
    <Link
      href="/planner/pet"
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-5 text-sm font-extrabold text-white hover:bg-[var(--brand-deep)]"
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
  const elapsedSeconds = snapshot.route.routeSummary.totalElapsedSeconds ?? snapshot.route.routeSummary.totalDrivingSeconds + snapshot.route.routeSummary.totalVisitSeconds + snapshot.route.routeSummary.totalWaitSeconds;

  return (
    <div className="space-y-6" data-itinerary-source="saved-recommendation">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="eyebrow">저장된 일정</p>
          <h1 tabIndex={-1} data-itinerary-restored-heading="true" className="mt-2 break-words text-3xl font-black tracking-[-0.045em] [overflow-wrap:anywhere] sm:text-4xl lg:text-[42px]">
            {snapshot.route.label}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={16} aria-hidden="true" />
              {snapshot.requestSummary.tripDate ?? "날짜 미정 초안"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={16} aria-hidden="true" />
              {snapshot.requestSummary.startTime ?? "출발 시간 미정"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPinned size={16} aria-hidden="true" />
              {snapshot.requestSummary.departureLabel}
            </span>
          </p>
        </div>
        <PlannerLink />
      </header>

      <p className="text-sm">{snapshot.route.planningPolicy === "full_public_catalog_v1" ? "전체 장소 기반 경로 초안 · 이동 경로 계산 완료 · 시설 이용 가능 여부는 별도 확인해 주세요." : snapshot.saveState === "draft" ? "초안으로 저장됨 · 날짜 또는 제안 시각의 적용이 필요합니다." : snapshot.saveState === "legacy_summary" ? "이전 형식의 요약입니다. 원문·지도 정보는 저장되어 있지 않습니다." : "일정 한 개를 저장한 스냅샷입니다."} <Link href="/planner/pet" className="underline">입력 확인하고 편집하기</Link></p>
      {snapshot.route.geometry && snapshot.route.stops.every(stop => stop.coordinates) ? <MapPanel regionId={snapshot.route.stops.find(stop => stop.regionId)?.regionId ?? "busan"} compact title="저장된 이동 경로" locations={[...(snapshot.departure ? [{ id: "route-departure", name: snapshot.requestSummary.departureLabel, address: "출발지", coordinates: snapshot.departure }] : []), ...snapshot.route.stops.map(stop => ({ id: stop.placeId, name: stop.title, address: stop.address ?? "", coordinates: stop.coordinates, order: stop.sequence }))]} routeCoordinates={snapshot.route.geometry} /> : null}
      <section className="saved-route-summary" aria-labelledby="saved-route-summary-heading">
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
        <dl className="saved-route-facts mt-5">
          <div><dt>총 이동 거리</dt><dd>{formatRouteDistance(snapshot.route.routeSummary.totalDistanceMeters)}</dd></div>
          <div><dt>차량 이동</dt><dd>{formatRouteDuration(snapshot.route.routeSummary.totalDrivingSeconds)}</dd></div>
          <div><dt>방문 장소</dt><dd>{snapshot.route.routeSummary.stopCount}곳</dd></div>
          <div><dt>전체 일정</dt><dd>{formatRouteDuration(elapsedSeconds)}</dd></div>
        </dl>
        <p className="mt-4 border-l-2 border-[#d3b783] pl-3 text-xs font-bold leading-5 text-[#76542f]">
          저장 당시 확인된 경로 정보입니다. 현재 운영 상태나 실시간 교통을 새로 확인한 결과가 아니므로 방문 전에 다시 확인해 주세요.
        </p>
      </section>

      {warnings.length > 0 ? (
        <section className="rounded-lg border border-[#dfccb3] bg-[#fff8ec] p-4" aria-labelledby="saved-route-warnings-heading">
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
            <li key={stop.placeId} className="saved-route-stop flex min-w-0 items-start gap-4 py-4 sm:py-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-sm font-black text-white">
                {stop.sequence}
              </span>
              <div className="min-w-0">
                <h3 className="break-words text-lg font-black [overflow-wrap:anywhere]">{stop.title}</h3>
                <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                  {koreaTime(stop.arrivalAt, stop.arrivalOffsetSeconds, snapshot.route.schedule)} 도착 · {koreaTime(stop.departureAt, stop.departureOffsetSeconds, snapshot.route.schedule)} 출발
                </p>
                <p className="mt-1 text-xs font-semibold text-[#52635a]">{stop.sourceLabel ?? "저장된 방문 장소"}{stop.retrievedAt ? ` · 조회 ${new Date(stop.retrievedAt).toLocaleDateString("ko-KR")}` : ""}</p>
                {stop.petAssessment !== undefined ? <p className="mt-1 text-sm font-semibold">{recommendationPetAccessCopy(stop)}</p> : null}
                {recommendationOperatingWarning(stop) ? <p className="mt-1 text-sm font-bold text-[#76542f]">{recommendationOperatingWarning(stop)}</p> : null}
                {stop.mandatoryConditions?.length ? <ul className="mt-1 text-sm">{stop.mandatoryConditions.map((item) => <li key={`${item.type}:${item.label}`}>{item.label}</li>)}</ul> : null}
                {stop.evidence?.length ? <details className="mt-2 text-sm"><summary>저장된 조건 원문</summary>{stop.evidence.map((item, index) => <blockquote className="my-2 whitespace-pre-wrap" key={index}>{item.originalText}</blockquote>)}</details> : null}
                {stop.catalogEvidence?.length ? <details className="mt-2 text-sm"><summary>저장된 카탈로그 출처</summary>{stop.catalogEvidence.map((item) => <p className="my-2 whitespace-pre-wrap" key={`${item.provider}:${item.providerPlaceId}`}>{item.provider === "kto" ? "한국관광공사" : "카카오맵"} · {item.publicLabel}{item.retrievedAt ? ` · 조회 ${new Date(item.retrievedAt).toLocaleDateString("ko-KR")}` : ""}{item.originalText ? ` · ${item.originalText}` : " · 동반 안내 원문 없음"}</p>)}</details> : null}
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
          <h1 tabIndex={-1} data-itinerary-restored-heading="true" className="mt-2 break-words text-3xl font-black tracking-[-0.045em] [overflow-wrap:anywhere] sm:text-4xl">
            {itinerary.title}
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[var(--muted)]">
            저장된 요약을 표시합니다. 운영 정보와 이동 상태는 새로 조회하지 않았습니다.
          </p>
        </div>
        <PlannerLink />
      </header>
      <section className="saved-route-summary" aria-labelledby="legacy-route-heading">
        <h2 id="legacy-route-heading" className="text-lg font-black">저장된 방문 순서</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--muted)]">{itinerary.totalDistanceKm.toFixed(1)}km · 약 {itinerary.totalDriveMinutes}분 · {itinerary.stops.length}곳</p>
        <ol className="mt-5" aria-label="이전 형식 저장 일정 방문 순서">
          {itinerary.stops.map((stop, index) => (
            <li key={stop.id} className="saved-route-stop py-4">
              <p className="text-xs font-black text-[var(--brand)]">{index + 1} · {stop.plannedArrival}–{stop.plannedDeparture}</p>
              <h3 className="mt-1 break-words text-lg font-black [overflow-wrap:anywhere]">{stop.place.name}</h3>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{stop.place.source.sourceName}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
