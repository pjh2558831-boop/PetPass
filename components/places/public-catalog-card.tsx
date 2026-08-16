"use client";

import Link from "next/link";
import { ExternalLink, LocateFixed, MapPin } from "lucide-react";
import { PlaceImage } from "@/components/places/place-image";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

const CATEGORY_LABELS = {
  cafe: "카페", food: "음식점", accommodation: "숙박", attraction: "관광·문화",
  park_walk: "공원·산책", leisure: "레저", camping: "캠핑", other: "기타",
} as const;

export function PublicCatalogCard({
  place,
  selected,
  onSelect,
}: {
  place: PublicCatalogPlace;
  selected: boolean;
  onSelect: () => void;
}) {
  const isExternal = place.placeUrl?.startsWith("http") ?? false;
  return (
    <article
      id={`place-card-${place.id.replace(":", "-")}`}
      className={`catalog-result-card ${selected ? "is-selected" : ""}`}
    >
      <PlaceImage imageUrl={place.imageUrl} title={place.name} sizes="132px" className="catalog-result-card__image !min-h-0 !rounded-xl" />
      <div className="catalog-result-card__body">
        <div className="catalog-result-card__badges">
          <span>{place.sourceLabel}</span>
          <span>{place.publicLabel}</span>
        </div>
        <h3>{place.name}</h3>
        <p><MapPin size={13} aria-hidden="true" />{place.address}</p>
        <small>{CATEGORY_LABELS[place.category]}</small>
        {place.warning ? <p className="catalog-result-card__warning">{place.warning}</p> : null}
        <div className="catalog-result-card__actions">
          <button type="button" onClick={onSelect} aria-label={`${place.name} 지도에서 보기`}><LocateFixed size={14} aria-hidden="true" />지도</button>
          {place.placeUrl ? <Link aria-label={`${place.name} 원문 상세 보기`} href={place.placeUrl} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>상세 보기 <ExternalLink size={14} aria-hidden="true" /></Link> : null}
        </div>
      </div>
    </article>
  );
}
