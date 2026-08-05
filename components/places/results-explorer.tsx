"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Filter, RefreshCw, Route } from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { KakaoPlaceSearch } from "@/components/places/kakao-place-search";
import { PlaceCard } from "@/components/places/place-card";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { demoItinerary, demoPlaces, demoProfile } from "@/fixtures/demo-data";
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/kakao/directions-client";
import { useDrivingRoute } from "@/lib/kakao/use-driving-route";
import { evaluatePetAccess } from "@/lib/pet-access/evaluator";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import {
  loadPetProfile,
  loadTravelPreferences,
} from "@/lib/storage/profile-storage";
import { saveDraftItinerary } from "@/lib/storage/itinerary-storage";
import type { ApiResult } from "@/types/api";
import type { KakaoPlaceSearchResult } from "@/types/kakao";
import type { PetProfile, TravelPreferences } from "@/types/pet";
import type {
  TourPlaceCategory,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";

const filterOptions: Array<TourPlaceCategory | "all"> = [
  "all",
  "attraction",
  "culture",
  "leisure",
  "food",
  "accommodation",
  "shopping",
  "festival",
  "transportation",
];

type ListState = "loading" | "ready" | "empty" | "error";

export function ResultsExplorer() {
  const router = useRouter();
  const [profile, setProfile] = useState<PetProfile>(demoProfile);
  const [preferences, setPreferences] = useState<TravelPreferences>(
    demoItinerary.preferences,
  );
  const [places, setPlaces] = useState<TourPlaceSummary[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listError, setListError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [category, setCategory] = useState<TourPlaceCategory | "all">("all");
  const [error, setError] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedSearchResult, setSelectedSearchResult] =
    useState<KakaoPlaceSearchResult | null>(null);

  useEffect(() => {
    const savedProfile = loadPetProfile();
    const savedPreferences = loadTravelPreferences();
    // Hydrate validated client-only storage after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedProfile) setProfile(savedProfile);
    if (savedPreferences) setPreferences(savedPreferences);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(
          "/api/tour/places?regionCode=26&page=1&pageSize=20",
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const body = (await response.json()) as ApiResult<TourPlaceList>;
        if (!response.ok || !body.ok) {
          const timeout = !body.ok && body.error.code === "UPSTREAM_TIMEOUT";
          throw new Error(
            timeout
              ? "관광 API 응답 시간이 초과되었습니다."
              : !body.ok
                ? body.error.message
                : "관광지 목록을 불러오지 못했습니다.",
          );
        }
        setPlaces(body.data.places);
        setListState(body.data.places.length > 0 ? "ready" : "empty");
        setListError("");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setListState("error");
        setListError(
          loadError instanceof Error
            ? loadError.message
            : "관광지 목록을 불러오지 못했습니다.",
        );
      }
    };
    void load();
    return () => controller.abort();
  }, [retryCount]);

  const assessedDemoPlaces = useMemo(
    () =>
      demoPlaces.map((place) => ({
        ...place,
        accessAssessment: evaluatePetAccess(profile, place.petPolicy, {
          sourceName: place.source.sourceName,
          retrievedAt: place.source.retrievedAt,
          phone: place.phone,
        }),
      })),
    [profile],
  );

  const filteredPlaces = useMemo(
    () =>
      places.filter(
        (place) => category === "all" || place.category === category,
      ),
    [category, places],
  );

  const routeLocations = useMemo(
    () =>
      demoItinerary.stops.map((stop, index) => ({
        id: stop.place.contentId,
        name: stop.place.name,
        address: stop.place.address,
        coordinates: stop.place.coordinates,
        order: index + 1,
      })),
    [],
  );
  const {
    route: drivingRoute,
    loading: routeLoading,
    error: routeError,
  } = useDrivingRoute(routeLocations);

  const sizeLabel = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" }[
    profile.size
  ];

  const mapLocations = useMemo(() => {
    const locations = filteredPlaces.map((place, index) => ({
      id: place.contentId,
      name: place.title ?? "이름 미확인",
      address: [place.address, place.detailAddress].filter(Boolean).join(" "),
      coordinates:
        place.latitude === null || place.longitude === null
          ? null
          : { latitude: place.latitude, longitude: place.longitude },
      order: index + 1,
    }));
    if (selectedSearchResult) {
      locations.push({
        id: `kakao-local:${selectedSearchResult.id}`,
        name: selectedSearchResult.name,
        address: selectedSearchResult.roadAddress ?? selectedSearchResult.address,
        coordinates: selectedSearchResult.coordinates,
        order: locations.length + 1,
      });
    }
    return locations;
  }, [filteredPlaces, selectedSearchResult]);

  useEffect(() => {
    if (!selectedLocationId || selectedLocationId.startsWith("kakao-local:")) return;
    document
      .getElementById(`place-card-${selectedLocationId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedLocationId]);

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#edf8f2] px-3 py-1.5 text-xs font-extrabold text-[#236148]">
              장소 목록 · 한국관광공사 실시간 데이터
            </span>
            <DemoBadge />
            <span className="text-xs font-bold text-[#6b7972]">
              일정 생성 기능은 기존 데모 시나리오
            </span>
          </div>
          <p className="mt-3 text-sm font-extrabold text-[#2a4036]">
            {profile.name} · {sizeLabel} 반려동물 · {profile.hasCarrier ? "이동장 있음" : "이동장 없음"}
          </p>
          <p className="mt-1 text-xs text-[#718078]">
            부산 전체 · {preferences.tripDate} · {preferences.startTime} 출발
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            const currentPlaces = new Map(
              assessedDemoPlaces.map((place) => [place.contentId, place]),
            );
            const stops = demoItinerary.stops
              .map((stop) => {
                const place = currentPlaces.get(stop.place.contentId);
                if (!place || place.accessAssessment.status === "NOT_MATCHED") {
                  return null;
                }
                return {
                  ...stop,
                  place,
                  accessAssessment: place.accessAssessment,
                  alternatives: stop.alternatives.map((alternative) => ({
                    ...alternative,
                    place:
                      currentPlaces.get(alternative.place.contentId) ??
                      alternative.place,
                  })),
                };
              })
              .filter((stop) => stop !== null);
            const saved = saveDraftItinerary({
              ...demoItinerary,
              title: `${profile.name}와 부산 바다 하루`,
              preferences,
              stops,
              updatedAt: new Date().toISOString(),
            });
            if (!saved) {
              setError("일정을 브라우저에 저장하지 못했습니다.");
              return;
            }
            router.push("/itinerary");
          }}
        >
          <Route size={17} aria-hidden="true" />
          데모 경로로 일정 만들기
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl bg-[#fceeee] p-4 text-sm font-bold text-[#8d3838]">
          {error}
        </p>
      ) : null}

      <KakaoPlaceSearch
        selectedId={selectedLocationId}
        onSelect={(result) => {
          const id = `kakao-local:${result.id}`;
          setSelectedSearchResult(result);
          setSelectedLocationId(id);
        }}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,.92fr)]">
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <MapPanel
            locations={mapLocations}
            routeCoordinates={drivingRoute?.coordinates ?? []}
            selectedLocationId={selectedLocationId}
            onLocationSelect={setSelectedLocationId}
          />
          <div className="mt-3 flex items-center justify-between px-1 text-xs font-semibold text-[#6c7b73]">
            <span>
              {drivingRoute
                ? `데모 일정 이동 ${formatRouteDistance(drivingRoute.totalDistanceMeters)}`
                : "데모 일정 이동거리 계산 중"}
            </span>
            <span>
              {drivingRoute
                ? `차량 약 ${formatRouteDuration(drivingRoute.totalDurationSeconds)}`
                : routeLoading
                  ? "실시간 경로 계산 중"
                  : "경로 정보 없음"}
            </span>
          </div>
          {routeError ? (
            <p role="status" className="mt-2 px-1 text-xs font-bold text-[#8d5d38]">
              실시간 경로를 불러오지 못했습니다. 장소 목록은 계속 이용할 수 있습니다.
            </p>
          ) : null}
        </div>

        <section className="min-w-0" aria-labelledby="places-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">부산 실시간 관광 데이터</p>
              <h2 id="places-heading" className="mt-1 text-2xl font-black tracking-[-0.04em]">
                장소 {filteredPlaces.length}곳
              </h2>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-[#6c7b73]">
              <Filter size={14} aria-hidden="true" />
              동반 가능 여부 미판정
            </span>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="장소 유형 필터">
            {filterOptions.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={category === option}
                onClick={() => setCategory(option)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-extrabold ${
                  category === option
                    ? "border-[#236148] bg-[#236148] text-white"
                    : "border-[#d2dbd6] bg-white text-[#596c62]"
                }`}
              >
                {option === "all" ? "전체" : TOUR_CATEGORY_LABELS[option]}
              </button>
            ))}
          </div>

          {listState === "loading" ? (
            <div className="surface-card p-8 text-center" role="status">
              <p className="font-extrabold">한국관광공사 장소를 불러오는 중입니다.</p>
            </div>
          ) : null}
          {listState === "error" ? (
            <div className="surface-card p-8 text-center" role="alert">
              <p className="font-extrabold">{listError}</p>
              <button
                type="button"
                onClick={() => {
                  setListState("loading");
                  setRetryCount((value) => value + 1);
                }}
                className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#236148]"
              >
                <RefreshCw size={15} aria-hidden="true" /> 다시 시도
              </button>
            </div>
          ) : null}
          {listState === "empty" ? (
            <div className="surface-card p-8 text-center">
              <p className="font-extrabold">현재 조건으로 제공된 장소가 없습니다.</p>
            </div>
          ) : null}
          {listState === "ready" ? (
            <div className="space-y-4">
              {filteredPlaces.map((place, index) => (
                <PlaceCard
                  key={place.contentId}
                  place={place}
                  order={index + 1}
                  selected={selectedLocationId === place.contentId}
                  onSelect={() => setSelectedLocationId(place.contentId)}
                />
              ))}
            </div>
          ) : null}

          {listState === "ready" && filteredPlaces.length === 0 ? (
            <div className="surface-card p-8 text-center">
              <p className="font-extrabold">이 유형의 장소가 없습니다.</p>
              <button
                type="button"
                onClick={() => setCategory("all")}
                className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#236148]"
              >
                전체 장소 보기 <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
