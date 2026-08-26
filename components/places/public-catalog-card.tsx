"use client";

import Link from "next/link";
import { ExternalLink, LocateFixed, MapPin } from "lucide-react";
import { PlaceCardMedia } from "@/components/places/place-card-media";
import { mapCatalogPlaceToCategory, PLACE_CATEGORY_LABELS } from "@/lib/map-places/place-categories";
import { resolvePlaceCardImage } from "@/lib/map-places/place-card-image";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

export function PublicCatalogCard({
  place,
  selected,
  onSelect,
  staticMapEnabled,
}: {
  place: PublicCatalogPlace;
  selected: boolean;
  onSelect: () => void;
  staticMapEnabled: boolean;
}) {
  const isExternal = place.placeUrl?.startsWith("http") ?? false;
  const category = mapCatalogPlaceToCategory(place);
  const image = resolvePlaceCardImage(place, { staticMapEnabled });
  const sourceLabel = place.layer === "kakao" ? "카카오맵" : place.sourceLabel;
  const showPublicLabel = place.layer !== "kakao" && place.publicLabel.length > 0;
  return (
    <article
      id={`place-card-${place.id.replace(":", "-")}`}
      className={`catalog-result-card ${selected ? "is-selected" : ""}`}
    >
      <PlaceCardMedia image={image} fallbackCategory={category} className="catalog-result-card__image rounded-xl" />
      <div className="catalog-result-card__body">
        <div className="catalog-result-card__badges">
          <span>{sourceLabel}</span>
          {showPublicLabel ? <span>{place.publicLabel}</span> : null}
        </div>
        <h3>{place.name}</h3>
        <p><MapPin size={13} aria-hidden="true" />{place.address}</p>
        <small>{PLACE_CATEGORY_LABELS[category]}</small>
        {place.warning && place.layer !== "kakao" ? (
          <p className="catalog-result-card__warning">{place.warning}</p>
        ) : null}
        <div className="catalog-result-card__actions">
          <button type="button" onClick={onSelect} aria-label={`${place.name} 지도에서 보기`}><LocateFixed size={14} aria-hidden="true" />지도</button>
          {place.placeUrl ? <Link aria-label={`${place.name} 원문 상세 보기`} href={place.placeUrl} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>상세 보기 <ExternalLink size={14} aria-hidden="true" /></Link> : null}
        </div>
      </div>
    </article>
  );
}
