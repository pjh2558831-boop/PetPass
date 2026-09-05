"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPinned,
  PencilLine,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmedTripSummary } from "@/components/itinerary/confirmed-trip-summary";
import { RouteStopCard } from "@/components/itinerary/route-stop-card";
import {
  LegacyItineraryView,
  SavedRecommendationView,
} from "@/components/itinerary/saved-itinerary-view";
import { MapPanel } from "@/components/map/map-panel";
import { usePlannerState } from "@/components/planner/planner-state";
import { Button } from "@/components/ui/button";
import { ProductState } from "@/components/ui/product-state";
import {
  createItineraryPresentation,
  formatKoreanDurationMinutes,
  GENERATED_PET_VERDICT_COPY,
} from "@/lib/itinerary/presentation";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import type { KakaoMapLocation } from "@/lib/kakao/maps";
import {
  REGION_CONFIGS,
  getRegionConfigByService2LegalDongCode,
} from "@/lib/regions/config";
import {
  loadStoredItineraryRestoration,
  selectItineraryRestoration,
  type ItineraryRestoration,
} from "@/lib/storage/itinerary-restoration";

function ItineraryEmptyState() {
  return (
    <ProductState
      title="아직 저장된 일정이 없습니다."
      description="여행 조건을 입력해 맞춤 일정을 만든 뒤 이 브라우저에 저장하면 여기에서 다시 볼 수 있어요."
      headingProps={{
        id: "itinerary-empty-heading",
        tabIndex: -1,
      }}
    >
      <Link
        href="/planner/pet"
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-5 text-sm font-extrabold text-white hover:bg-[var(--brand-deep)]"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        여행 정보 입력하기
      </Link>
    </ProductState>
  );
}

function ItineraryRestoreLoadingState() {
  return (
    <ProductState
      status="status"
      title="저장된 일정을 확인하고 있어요."
      description="이 브라우저에 저장된 최근 일정을 불러오는 중입니다."
      headingProps={{ id: "itinerary-restore-loading-heading" }}
    />
  );
}

export function ItineraryEditor() {
  const router = useRouter();
  const {
    profile,
    preferences,
    profileConfirmed,
    preferencesConfirmed,
    generationState,
    selectedItinerary,
  } = usePlannerState();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restorationAttemptedRef = useRef(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    () => selectedItinerary?.stops[0]?.stableIdentity ?? null,
  );
  const generation = generationState.response;
  const presentation = useMemo(
    () =>
      selectedItinerary && generation
        ? createItineraryPresentation(
            selectedItinerary,
            generation.request.petEquipment,
          )
        : null,
    [generation, selectedItinerary],
  );
  const hasCurrentItinerary = Boolean(
    profileConfirmed &&
      preferencesConfirmed &&
      generation &&
      selectedItinerary &&
      presentation,
  );
  const [storedRestoration, setStoredRestoration] =
    useState<ItineraryRestoration | null>(null);
  const routeLocations = useMemo<KakaoMapLocation[]>(
    () =>
      selectedItinerary?.stops.map((stop) => ({
        id: stop.stableIdentity,
        name: stop.title,
        address: stop.address ?? "주소 정보 없음",
        coordinates: stop.coordinates,
        order: stop.order,
        markerKind: "itinerary",
        sourceLabel:
          stop.source === "TOUR_API"
            ? "한국관광공사 동반 근거 장소"
            : "카카오 등록 장소",
        interactive: true,
        clusterable: false,
      })) ?? [],
    [selectedItinerary],
  );

  useEffect(() => {
    if (selectedItinerary) headingRef.current?.focus();
  }, [selectedItinerary]);

  useEffect(() => {
    if (hasCurrentItinerary || restorationAttemptedRef.current) return;
    restorationAttemptedRef.current = true;
    setStoredRestoration(loadStoredItineraryRestoration());
  }, [hasCurrentItinerary]);

  const chooseMapLocation = useCallback((locationId: string | null) => {
    setSelectedLocationId(locationId);
    if (!locationId) return;
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document.getElementById(`itinerary-stop-${locationId}`)?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
  }, []);

  const restoration = selectItineraryRestoration(
    hasCurrentItinerary ? selectedItinerary : null,
    storedRestoration?.source === "saved_recommendation"
      ? storedRestoration.snapshot
      : null,
    storedRestoration?.source === "legacy_itinerary"
      ? storedRestoration.itinerary
      : null,
  );

  useEffect(() => {
    if (restoration.source === "in_memory") return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>("[data-itinerary-restored-heading], #itinerary-empty-heading")
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [restoration.source, storedRestoration?.source]);

  if (restoration.source === "saved_recommendation") {
    return <SavedRecommendationView snapshot={restoration.snapshot} />;
  }
  if (restoration.source === "legacy_itinerary") {
    return <LegacyItineraryView itinerary={restoration.itinerary} />;
  }
  if (restoration.source === "empty") {
    return storedRestoration ? <ItineraryEmptyState /> : <ItineraryRestoreLoadingState />;
  }
  if (!generation || !presentation) {
    return <ItineraryEmptyState />;
  }

  const currentItinerary = restoration.itinerary;
  const routeDate = generation.request.travelDate;
  const routeStart = generation.request.startTime;
  const routeRegion = getRegionConfigByService2LegalDongCode(
    preferences.regionCode,
  ) ?? REGION_CONFIGS[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="eyebrow">선택한 상세 일정</p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="balance mt-2 break-words text-3xl font-black tracking-[-0.045em] [overflow-wrap:anywhere] sm:text-4xl lg:text-[42px]"
          >
            {profile.name}와 함께하는 {currentItinerary.title}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={16} aria-hidden="true" /> {routeDate}</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={16} aria-hidden="true" /> {routeStart} 출발</span>
            <span className="inline-flex items-center gap-1.5"><MapPinned size={16} aria-hidden="true" /> {generation.request.start.label ?? "출발지"}</span>
          </p>
        </div>
        <Button type="button" variant="brandSecondary" onClick={() => router.push(`/results?tab=recommendations&region=${routeRegion.id}`)}>
          <ArrowLeft size={17} aria-hidden="true" /> 경로 비교로 돌아가기
        </Button>
      </header>

      <ConfirmedTripSummary profile={profile} preferences={preferences} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(330px,.88fr)]">
        <section className="min-w-0" aria-labelledby="itinerary-timeline-heading">
          <div className="mb-4">
            <p className="eyebrow">당일 방문 순서</p>
            <h2 id="itinerary-timeline-heading" className="mt-1 text-2xl font-black tracking-[-0.035em]">
              출발지부터 이어지는 실제 이동 구간
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              도착·출발 시각과 각 이동 구간은 반환된 일정 순서를 그대로 표시합니다.
            </p>
          </div>
          <ol className="space-y-5" aria-label={`${currentItinerary.title} 상세 방문 순서`}>
            {presentation.stops.map((stopPresentation, index) => (
              <RouteStopCard
                key={stopPresentation.stop.stableIdentity}
                domId={`itinerary-stop-${stopPresentation.stop.stableIdentity}`}
                presentation={stopPresentation}
                previousLabel={
                  index === 0
                    ? generation.request.start.label ?? "출발지"
                    : currentItinerary.stops[index - 1]?.title ?? "이전 장소"
                }
                selected={selectedLocationId === stopPresentation.stop.stableIdentity}
                onSelect={() => chooseMapLocation(stopPresentation.stop.stableIdentity)}
                showImage
                expandedAccess
                priorityImage={index === 0}
              />
            ))}
          </ol>
        </section>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="일정 요약과 지도">
          <section className="itinerary-summary-document" aria-labelledby="route-summary-heading">
            <p className="eyebrow">경로 요약</p>
            <h2 id="route-summary-heading" className="mt-1 break-words text-xl font-black tracking-[-0.03em] [overflow-wrap:anywhere]">
              {currentItinerary.title}
            </h2>
            <dl className="itinerary-summary-document__facts mt-4">
              <div><dt>총 이동 거리</dt><dd>{formatRouteDistance(presentation.metrics.totalDistanceMeters)}</dd></div>
              <div><dt>차량 이동</dt><dd>{formatRouteDuration(presentation.metrics.totalDurationSeconds)}</dd></div>
              <div><dt>방문 장소</dt><dd>{presentation.metrics.stopCount}곳</dd></div>
              <div><dt>전체 일정</dt><dd>{formatKoreanDurationMinutes(presentation.metrics.estimatedElapsedDurationMinutes) ?? "미제공"}</dd></div>
            </dl>
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <h3 className="text-xs font-black text-[#344a40]">동반 판정 분포</h3>
              <ul className="mt-2 space-y-1.5 text-xs font-bold text-[#52665b]">
                {Object.entries(presentation.verdictCounts).map(([verdict, count]) =>
                  count > 0 ? (
                    <li key={verdict} className="flex items-center justify-between gap-3">
                      <span>{GENERATED_PET_VERDICT_COPY[verdict as keyof typeof GENERATED_PET_VERDICT_COPY].label}</span>
                      <span>{count}곳</span>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          </section>

          <div className="mt-4">
            <MapPanel
              regionId={routeRegion.id}
              compact
              locations={routeLocations}
              routeCoordinates={presentation.geometry}
              selectedLocationId={selectedLocationId}
              onLocationSelect={chooseMapLocation}
              viewportKey={`itinerary:${currentItinerary.id}`}
              title={`${currentItinerary.title} 상세 일정 지도`}
              locationLabel={`${currentItinerary.stops.length}곳 방문 순서`}
              emptyMessage="유효한 장소 좌표가 없습니다. 왼쪽의 텍스트 일정을 이용해 주세요."
            />
          </div>
          <p className="mt-3 border-l-2 border-[#b8c9bf] pl-3 text-xs font-semibold leading-5 text-[var(--muted)]">
            {presentation.geometry.length >= 2
              ? "확인된 이동 경로를 선으로 표시합니다. 번호는 방문 순서와 같습니다."
              : "확인된 이동 경로가 없으면 장소 위치만 표시합니다."}
          </p>

          <div className="mt-4 grid gap-2">
            <Button type="button" variant="brand" className="w-full" onClick={() => router.push(`/results?tab=recommendations&region=${routeRegion.id}`)}>
              <ArrowLeft size={17} aria-hidden="true" /> 경로 비교로 돌아가기
            </Button>
            <Link
              href="/planner/pet"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#c9d7ce] bg-white px-5 text-sm font-extrabold text-[#23483a] hover:bg-[var(--brand-soft)]"
            >
              <PencilLine size={17} aria-hidden="true" /> 여행 정보 수정
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
