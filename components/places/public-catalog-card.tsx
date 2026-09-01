"use client";

import Link from "next/link";
import { Check, ExternalLink, LocateFixed, MapPin, Plus } from "lucide-react";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import { Disclosure } from "@/components/ui/disclosure";
import { mapCatalogPlaceToCategory, PLACE_CATEGORY_LABELS } from "@/lib/map-places/place-categories";
import { resolvePlaceCardImage } from "@/lib/map-places/place-card-image";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

export function PublicCatalogCard({
  place,
  selected,
  onSelect,
  staticMapEnabled,
  itinerarySelection,
}: {
  place: PublicCatalogPlace;
  selected: boolean;
  onSelect: () => void;
  staticMapEnabled: boolean;
  itinerarySelection?: {
    selected: boolean;
    disabledReason?: string;
    onToggle: () => void;
  };
}) {
  const isExternal = place.placeUrl?.startsWith("http") ?? false;
  const category = mapCatalogPlaceToCategory(place);
  const image = resolvePlaceCardImage(place, { staticMapEnabled });
  const hasImage = image.kind !== "category_placeholder";
  const sourceLabel = place.layer === "kakao" ? "카카오맵" : place.sourceLabel;
  const showPublicLabel = place.layer !== "kakao" &&
    place.petAccessVerdict !== "unknown" &&
    place.publicLabel.length > 0;
  const petConditions = place.petConditions?.trim() || null;
  return (
    <article
      id={`place-card-${place.id.replace(":", "-")}`}
      className={`catalog-result-card ${hasImage ? "catalog-result-card--with-image" : "catalog-result-card--text-only"} ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      {hasImage ? <PlaceCardMedia image={image} fallbackCategory={category} className="catalog-result-card__image" /> : null}
      <div className="catalog-result-card__body">
        <div className="catalog-result-card__badges">
          <span className="catalog-result-card__label">{sourceLabel}</span>
          {showPublicLabel ? <span className="catalog-result-card__label">{place.publicLabel}</span> : null}
          {petConditions ? <span className="catalog-result-card__label">동반 조건 있음</span> : null}
        </div>
        <h3>{place.name}</h3>
        {place.warning && place.layer !== "kakao" ? (
          <p className="catalog-result-card__warning">{place.warning}</p>
        ) : null}
        <p><MapPin size={13} aria-hidden="true" />{place.address}</p>
        {petConditions ? (
          <>
            <p className="catalog-result-card__condition-summary">{petConditions}</p>
            <Disclosure
              label="반려견 동반 조건"
              idPrefix={`pet-condition-${place.id.replace(":", "-")}`}
              className="catalog-result-card__condition-disclosure"
            >
              <p className="catalog-result-card__condition-full">{petConditions}</p>
              {place.verificationRequired ? (
                <p className="catalog-result-card__condition-notice">
                  방문 전 업체에 최신 동반 조건을 확인해 주세요.
                </p>
              ) : null}
            </Disclosure>
          </>
        ) : null}
        <small>{PLACE_CATEGORY_LABELS[category]}</small>
        {itinerarySelection?.disabledReason ? <small className="catalog-result-card__disabled-reason">{itinerarySelection.disabledReason}</small> : null}
        <div className="catalog-result-card__actions">
          {itinerarySelection ? (
            <button
              type="button"
              className="catalog-result-card__itinerary"
              aria-pressed={itinerarySelection.selected}
              disabled={Boolean(itinerarySelection.disabledReason)}
              onClick={itinerarySelection.onToggle}
            >
              {itinerarySelection.selected
                ? <Check size={15} aria-hidden="true" />
                : <Plus size={15} aria-hidden="true" />}
              {itinerarySelection.selected ? "일정에 담음" : "일정에 담기"}
            </button>
          ) : null}
          <button type="button" onClick={onSelect} aria-label={`${place.name} 지도에서 보기`}><LocateFixed size={14} aria-hidden="true" />지도</button>
          {place.placeUrl ? <Link aria-label={`${place.name} 원문 상세 보기`} href={place.placeUrl} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>상세 보기 <ExternalLink size={14} aria-hidden="true" /></Link> : null}
        </div>
      </div>
    </article>
  );
}
