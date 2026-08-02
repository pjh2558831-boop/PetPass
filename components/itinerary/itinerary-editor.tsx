"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { StatusBadge } from "@/components/pet-access/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { demoItinerary } from "@/fixtures/demo-data";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import { useDrivingRoute } from "@/lib/kakao/use-driving-route";
import { loadDraftItinerary, saveDraftItinerary } from "@/lib/storage/itinerary-storage";
import type { Itinerary } from "@/types/itinerary";

export function ItineraryEditor() {
  const [itinerary, setItinerary] = useState<Itinerary>(demoItinerary);
  const [message, setMessage] = useState("데모 일정이 준비됐어요.");
  const mapLocations = useMemo(
    () =>
      itinerary.stops.map((stop, index) => ({
        id: stop.place.contentId,
        name: stop.place.name,
        address: stop.place.address,
        coordinates: stop.place.coordinates,
        order: index + 1,
      })),
    [itinerary.stops],
  );
  const {
    route: drivingRoute,
    loading: routeLoading,
    error: routeError,
  } = useDrivingRoute(mapLocations);

  useEffect(() => {
    const saved = loadDraftItinerary();
    if (saved) {
      // Hydrate validated client-only storage after the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItinerary(saved);
      setMessage("이 브라우저에 저장된 최근 일정을 불러왔어요.");
    }
  }, []);

  const commit = (next: Itinerary, messageText: string) => {
    const updated = { ...next, updatedAt: new Date().toISOString() };
    setItinerary(updated);
    setMessage(
      saveDraftItinerary(updated)
        ? messageText
        : "변경 내용은 보이지만 브라우저에 저장하지 못했어요.",
    );
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= itinerary.stops.length) return;
    const stops = [...itinerary.stops];
    const timeA = {
      arrival: stops[index].plannedArrival,
      departure: stops[index].plannedDeparture,
    };
    const timeB = {
      arrival: stops[target].plannedArrival,
      departure: stops[target].plannedDeparture,
    };
    [stops[index], stops[target]] = [stops[target], stops[index]];
    stops[index] = {
      ...stops[index],
      plannedArrival: timeA.arrival,
      plannedDeparture: timeA.departure,
    };
    stops[target] = {
      ...stops[target],
      plannedArrival: timeB.arrival,
      plannedDeparture: timeB.departure,
    };
    commit({ ...itinerary, stops }, "방문 순서를 바꾸고 저장했어요.");
  };

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,.9fr)_minmax(440px,1.1fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <MapPanel
          title="편집 중인 부산 데모 일정"
          locations={mapLocations}
          routeCoordinates={drivingRoute?.coordinates ?? []}
        />
        <div className="surface-card mt-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-black">한눈에 보는 준비</h2>
            <DemoBadge compact />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {itinerary.requiredItems.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#edf8f2] px-3 py-1.5 text-xs font-extrabold text-[#236148]"
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-[#e0e6e2] pt-4">
            <div>
              <dt className="text-xs font-bold text-[#718078]">예상 이동 거리</dt>
              <dd className="mt-1 text-lg font-black">
                {drivingRoute
                  ? formatRouteDistance(drivingRoute.totalDistanceMeters)
                  : `${itinerary.totalDistanceKm}km`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-[#718078]">차량 이동</dt>
              <dd className="mt-1 text-lg font-black">
                {drivingRoute
                  ? formatRouteDuration(drivingRoute.totalDurationSeconds)
                  : `약 ${itinerary.totalDriveMinutes}분`}
              </dd>
            </div>
          </dl>
          {routeLoading ? (
            <p className="mt-3 text-xs font-bold text-[#64746c]" role="status">
              변경된 방문 순서로 실시간 경로를 계산하고 있어요.
            </p>
          ) : null}
          {routeError ? (
            <p className="mt-3 text-xs font-bold text-[#8d5d38]" role="status">
              실시간 경로를 불러오지 못해 저장된 예상값을 표시합니다.
            </p>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="itinerary-heading">
        <div className="mb-5">
          <p className="eyebrow">내 브라우저에 저장되는 초안</p>
          <h1 id="itinerary-heading" className="mt-2 text-3xl font-black tracking-[-0.04em]">
            {itinerary.title}
          </h1>
          <p className="mt-2 text-sm text-[#64746c]" aria-live="polite">
            {message}
          </p>
        </div>

        {itinerary.stops.length > 0 ? (
          <ol className="space-y-4">
            {itinerary.stops.map((stop, index) => (
              <li key={stop.id} className="surface-card relative p-4 sm:p-5">
                <div className="flex gap-4">
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className="grid size-10 place-items-center rounded-full bg-[#236148] text-sm font-black text-white">
                      {index + 1}
                    </span>
                    {index < itinerary.stops.length - 1 ? (
                      <span className="mt-2 h-full min-h-20 w-px border-l-2 border-dashed border-[#b9c9c0]" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-extrabold text-[#5f7167]">
                          <Clock3 size={14} aria-hidden="true" />
                          {stop.plannedArrival}–{stop.plannedDeparture}
                        </p>
                        <Link
                          href={`/places/${stop.place.contentId}`}
                          className="mt-1 block text-lg font-black tracking-[-0.03em] hover:text-[#236148]"
                        >
                          {stop.place.name}
                        </Link>
                      </div>
                      <StatusBadge status={stop.accessAssessment.status} />
                    </div>
                    <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-[#6c7a73]">
                      <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {stop.place.address}
                    </p>
                    {stop.driveMinutesFromPrevious ? (
                      <p className="mt-2 text-xs font-bold text-[#3d755d]">
                        이전 장소에서 {stop.distanceFromPreviousKm}km · 차량 약{" "}
                        {stop.driveMinutesFromPrevious}분
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-[#e5e9e6] pt-3">
                      <button
                        type="button"
                        onClick={() => moveStop(index, -1)}
                        disabled={index === 0}
                        className="grid size-9 place-items-center rounded-full text-[#52665b] hover:bg-[#edf6f0] disabled:opacity-30"
                        aria-label={`${stop.place.name} 한 칸 위로`}
                      >
                        <ArrowUp size={17} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStop(index, 1)}
                        disabled={index === itinerary.stops.length - 1}
                        className="grid size-9 place-items-center rounded-full text-[#52665b] hover:bg-[#edf6f0] disabled:opacity-30"
                        aria-label={`${stop.place.name} 한 칸 아래로`}
                      >
                        <ArrowDown size={17} aria-hidden="true" />
                      </button>
                      {stop.alternatives[0] ? (
                        <button
                          type="button"
                          onClick={() => {
                            const alternative = stop.alternatives[0];
                            const stops = itinerary.stops.map((item) =>
                              item.id === stop.id
                                ? {
                                    ...item,
                                    place: alternative.place,
                                    accessAssessment:
                                      alternative.place.accessAssessment,
                                    alternatives: [
                                      {
                                        place: stop.place,
                                        distanceKm: alternative.distanceKm,
                                        reason: "이전 장소로 되돌릴 수 있어요.",
                                      },
                                    ],
                                  }
                                : item,
                            );
                            commit(
                              { ...itinerary, stops },
                              `${stop.place.name}을(를) ${alternative.place.name}(으)로 교체했어요.`,
                            );
                          }}
                          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold text-[#236148] hover:bg-[#edf6f0]"
                        >
                          <RefreshCw size={15} aria-hidden="true" />
                          대체 장소로 교체
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          commit(
                            {
                              ...itinerary,
                              stops: itinerary.stops.filter(
                                (item) => item.id !== stop.id,
                              ),
                            },
                            `${stop.place.name}을(를) 일정에서 뺐어요.`,
                          )
                        }
                        className="grid size-9 place-items-center rounded-full text-[#9a4b4b] hover:bg-[#fceeee]"
                        aria-label={`${stop.place.name} 삭제`}
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="surface-card p-10 text-center">
            <p className="font-black">일정에 남은 장소가 없어요.</p>
            <p className="mt-2 text-sm text-[#6a7971]">
              추천 결과로 돌아가 새 경로를 담아보세요.
            </p>
            <ButtonLink href="/results" className="mt-5">
              추천 결과 보기
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  );
}
