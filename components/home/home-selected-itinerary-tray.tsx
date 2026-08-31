"use client";

import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronUp, LockKeyhole, Route, Trash2 } from "lucide-react";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import type { SelectedItineraryMoveDirection } from "@/components/places/use-selected-itinerary-selection";
import {
  mapCatalogPlaceToCategory,
  PLACE_CATEGORY_LABELS,
} from "@/lib/map-places/place-categories";
import {
  selectedItineraryNeedsWarning,
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
}: {
  snapshot: SelectedItinerarySnapshot;
  message?: string;
  catalogHref?: string;
  onRemove: (placeId: string) => void;
  onMove: (placeId: string, direction: SelectedItineraryMoveDirection) => void;
  onContinue: () => void;
}) {
  const visiblePlaces = snapshot.places.slice(0, HOME_VISIBLE_SELECTION_LIMIT);
  const overflowCount = snapshot.places.length - visiblePlaces.length;
  const selectionCatalogHref = catalogHref ??
    `/results?tab=catalog&region=${snapshot.regionId}&mode=select`;

  return (
    <section className="home-selected-itinerary" aria-labelledby="home-selected-itinerary-title">
      <header className="home-selected-itinerary__header">
        <div>
          <p>맞춤 일정</p>
          <h2 id="home-selected-itinerary-title">선택한 장소 {snapshot.places.length}곳</h2>
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
                  image={selectedPlaceImage(place)}
                  fallbackCategory={category}
                  className="home-selected-itinerary__image"
                  sizes="72px"
                />
                <div className="home-selected-itinerary__copy">
                  <strong>{place.name}</strong>
                  <span>{PLACE_CATEGORY_LABELS[category]} · {place.sourceLabel}</span>
                  <span><LockKeyhole size={12} aria-hidden="true" /> 일정에 고정 · {selectedItineraryVerdictLabel(place.petAccessVerdict)}</span>
                  {selectedItineraryNeedsWarning(place) ? (
                    <small><AlertTriangle size={12} aria-hidden="true" /> 동반 가능 여부 확인 필요</small>
                  ) : null}
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
