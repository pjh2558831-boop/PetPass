"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Filter, Route } from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceCard } from "@/components/places/place-card";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { demoItinerary, demoPlaces, demoProfile } from "@/fixtures/demo-data";
import { evaluatePetAccess } from "@/lib/pet-access/evaluator";
import { CATEGORY_LABELS } from "@/lib/shared/format";
import {
  loadPetProfile,
  loadTravelPreferences,
} from "@/lib/storage/profile-storage";
import { saveDraftItinerary } from "@/lib/storage/itinerary-storage";
import type { PetProfile, PlaceCategory, TravelPreferences } from "@/types/pet";

const filterOptions: Array<PlaceCategory | "ALL"> = [
  "ALL",
  "ATTRACTION",
  "RESTAURANT",
  "CAFE",
  "ACCOMMODATION",
];

export function ResultsExplorer() {
  const router = useRouter();
  const [profile, setProfile] = useState<PetProfile>(demoProfile);
  const [preferences, setPreferences] = useState<TravelPreferences>(
    demoItinerary.preferences,
  );
  const [category, setCategory] = useState<PlaceCategory | "ALL">("ALL");
  const [error, setError] = useState("");

  useEffect(() => {
    const savedProfile = loadPetProfile();
    const savedPreferences = loadTravelPreferences();
    // Hydrate validated client-only storage after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedProfile) setProfile(savedProfile);
    if (savedPreferences) setPreferences(savedPreferences);
  }, []);

  const assessedPlaces = useMemo(
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
      assessedPlaces
        .filter((place) => place.accessAssessment.status !== "NOT_MATCHED")
        .filter((place) => category === "ALL" || place.category === category),
    [assessedPlaces, category],
  );

  const sizeLabel = {
    SMALL: "소형",
    MEDIUM: "중형",
    LARGE: "대형",
  }[profile.size];

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DemoBadge />
            <span className="text-xs font-bold text-[#6b7972]">
              외부 API 호출 없음
            </span>
          </div>
          <p className="mt-3 text-sm font-extrabold text-[#2a4036]">
            {profile.name} · {sizeLabel} 반려동물 ·{" "}
            {profile.hasCarrier ? "이동장 있음" : "이동장 없음"}
          </p>
          <p className="mt-1 text-xs text-[#718078]">
            {preferences.regionName} {preferences.districtName ?? ""} ·{" "}
            {preferences.tripDate} · {preferences.startTime} 출발
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            const currentPlaces = new Map(
              assessedPlaces.map((place) => [place.contentId, place]),
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
                  alternatives: stop.alternatives.map((alternative) => {
                    const alternativePlace =
                      currentPlaces.get(alternative.place.contentId) ??
                      alternative.place;
                    return { ...alternative, place: alternativePlace };
                  }),
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
              setError("일정을 브라우저에 저장하지 못했어요.");
              return;
            }
            router.push("/itinerary");
          }}
        >
          <Route size={17} aria-hidden="true" />
          이 경로로 일정 만들기
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl bg-[#fceeee] p-4 text-sm font-bold text-[#8d3838]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,.92fr)]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <MapPanel />
          <div className="mt-3 flex items-center justify-between px-1 text-xs font-semibold text-[#6c7b73]">
            <span>예상 이동 4.8km</span>
            <span>차량 약 28분</span>
          </div>
        </div>

        <section aria-labelledby="places-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">조건을 대조한 장소</p>
              <h2 id="places-heading" className="mt-1 text-2xl font-black tracking-[-0.04em]">
                추천 장소 {filteredPlaces.length}곳
              </h2>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-[#6c7b73]">
              <Filter size={14} aria-hidden="true" />
              조건 불일치 제외
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
                {option === "ALL" ? "전체" : CATEGORY_LABELS[option]}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredPlaces.map((place, index) => (
              <PlaceCard key={place.contentId} place={place} order={index + 1} />
            ))}
          </div>

          {filteredPlaces.length === 0 ? (
            <div className="surface-card p-8 text-center">
              <p className="font-extrabold">이 유형의 데모 장소가 없어요.</p>
              <button
                type="button"
                onClick={() => setCategory("ALL")}
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
