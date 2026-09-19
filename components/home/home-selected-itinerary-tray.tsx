"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { requestMapPlaceCardDetails } from "@/lib/map-places/card-details-client";
import { ChevronDown, ChevronUp, LockKeyhole, Plus, Route, Trash2 } from "lucide-react";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import type { SelectedItineraryMoveDirection } from "@/components/places/use-selected-itinerary-selection";
import {
  mapCatalogPlaceToCategory,
  PLACE_CATEGORY_LABELS,
} from "@/lib/map-places/place-categories";
import {
  selectedItineraryVerdictLabel,
  type SelectedItineraryPlace,
  type SelectedItinerarySnapshot,
} from "@/lib/storage/selected-itinerary-storage";
import type { PlaceCardImage } from "@/types/place-card-image";

const HOME_VISIBLE_SELECTION_LIMIT = 3;

function selectedPlaceImage(place: SelectedItineraryPlace): PlaceCardImage {
  const category = mapCatalogPlaceToCategory(place);
  return place.imageUrl
    ? { kind: "provider_photo", src: place.imageUrl, alt: `${place.name} 제공 이미지` }
    : { kind: "category_placeholder", category, alt: `${place.name} 장소 사진 준비 중` };
}

export function HomeSelectedItineraryTray({
  snapshot,
  message = "",
  catalogHref,
  onRemove,
  onMove,
  onContinue,
  onClear,
}: {
  snapshot: SelectedItinerarySnapshot;
  message?: string;
  catalogHref?: string;
  onRemove: (placeId: string) => void;
  onMove: (placeId: string, direction: SelectedItineraryMoveDirection) => void;
  onContinue: () => void;
  onClear?: () => void;
}) {
  const visiblePlaces = snapshot.places.slice(0, HOME_VISIBLE_SELECTION_LIMIT);
  const overflowCount = snapshot.places.length - visiblePlaces.length;
  const photoKey = JSON.stringify(visiblePlaces.filter(place => !place.imageUrl)
    .map(place => [place.id, place.category === "shopping" ? "shopping" : "core"]));
  const region = snapshot.regionId;
  const [photos, setPhotos] = useState<{ key: string; region: string; urls: Map<string, string | null> }>();
  useEffect(() => {
    const entries = JSON.parse(photoKey) as Array<[string, "core" | "shopping"]>;
    if (!entries.length) return;
    const controller = new AbortController();
    void Promise.all((["core", "shopping"] as const).map(async dataset => {
      const ids = entries.filter(entry => entry[1] === dataset).map(entry => entry[0]);
      return ids.length ? (await requestMapPlaceCardDetails(region, dataset, ids, controller.signal)).items : [];
    })).then(pages => {
      if (!controller.signal.aborted) setPhotos({ key: photoKey, region,
        urls: new Map(pages.flat().map(item => [item.id, item.imageUrl])) });
    }).catch(() => { /* Keep the existing placeholder when provider photos are unavailable. */ });
    return () => controller.abort();
  }, [photoKey, region]);
  const selectionCatalogHref = catalogHref ??
    `/results?tab=catalog&region=${snapshot.regionId}&mode=select`;

  return (
    <section className="home-selected-itinerary" aria-labelledby="home-selected-itinerary-title">
      <header className="home-selected-itinerary__header">
        <div>
          <h2 id="home-selected-itinerary-title">선택한 장소 {snapshot.places.length}곳</h2>
          <p>일정에 추가한 장소들이에요.</p>
        </div>
        <span>홈에서는 최대 {HOME_VISIBLE_SELECTION_LIMIT}곳 추가</span>
      </header>

      {visiblePlaces.length > 0 ? (
        <ol className="home-selected-itinerary__list" aria-label="선택한 장소 순서">
          {visiblePlaces.map((place, index) => {
            const category = mapCatalogPlaceToCategory(place);
            return (
              <li key={place.id} className="home-selected-itinerary__item">
                <span className="home-selected-itinerary__order" aria-hidden="true">{index + 1}</span>
                <PlaceCardMedia
                  image={selectedPlaceImage({ ...place, imageUrl: place.imageUrl ?? (photos?.key === photoKey && photos.region === region ? photos.urls.get(place.id) ?? null : null) })}
                  fallbackCategory={category}
                  className="home-selected-itinerary__image"
                  sizes="72px"
                />
                <div className="home-selected-itinerary__copy">
                  <strong>{place.name}</strong>
                  <span>{PLACE_CATEGORY_LABELS[category]} · {place.sourceLabel}</span>
                  <span><LockKeyhole size={12} aria-hidden="true" /> 일정에 고정 · {selectedItineraryVerdictLabel(place.petAccessVerdict)}</span>
                </div>
                <div className="home-selected-itinerary__controls">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMove(place.id, "forward")}
                    aria-label={`${place.name} 앞으로 이동`}
                  >
                    <ChevronUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === snapshot.places.length - 1}
                    onClick={() => onMove(place.id, "backward")}
                    aria-label={`${place.name} 뒤로 이동`}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(place.id)}
                    aria-label={`${place.name} 선택에서 제거`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="home-selected-itinerary__empty">
          장소 목록의 선택 버튼으로 방문할 곳을 담아보세요.
        </p>
      )}

      {overflowCount > 0 ? (
        <p className="home-selected-itinerary__overflow">
          {overflowCount}곳은 <Link href={selectionCatalogHref}>장소 선택 화면에서 확인</Link>
        </p>
      ) : null}

      <Link className="home-selected-itinerary__add" href={selectionCatalogHref}><Plus size={20} aria-hidden="true" /> 장소 더 추가하기</Link>
      {onClear && <button type="button" className="home-selected-itinerary__clear" onClick={onClear} disabled={!snapshot.places.length}><Trash2 size={18} aria-hidden="true" /> 전체 지우기</button>}
      <button
        type="button"
        className="home-selected-itinerary__continue"
        disabled={snapshot.places.length === 0}
        onClick={onContinue}
      >
        <Route size={17} aria-hidden="true" />
        선택한 장소로 일정 만들기
      </button>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{message}</p>
    </section>
  );
}
