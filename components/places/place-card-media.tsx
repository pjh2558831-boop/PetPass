"use client";

import Image from "next/image";
import { usePlacePhotoState } from "@/lib/places/use-place-photo-state";
import { BedDouble, Camera, Coffee, Cross, Landmark, Shapes, ShoppingBag, Store, Utensils } from "lucide-react";
import { PLACE_CATEGORY_LABELS, type PlaceCategory } from "@/lib/map-places/place-categories";
import type { PlaceCardImage } from "@/types/place-card-image";

const CATEGORY_ICONS = {
  attraction: Landmark,
  food: Utensils,
  cafe: Coffee,
  accommodation: BedDouble,
  other: Shapes,
  shopping: ShoppingBag,
  veterinary: Cross,
  pet_shop: Store,
} satisfies Record<PlaceCategory, typeof Landmark>;

function CategoryPlaceholder({ category, alt, failed = false }: { category: PlaceCategory; alt: string; failed?: boolean }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <div className={`catalog-card-placeholder is-${category}`} role="img" aria-label={alt.replace("사진 준비 중", "사진 없음")} data-image-kind="category_placeholder">
      <span className="catalog-card-placeholder__icon"><Icon size={25} aria-hidden="true" /></span>
      <strong>{PLACE_CATEGORY_LABELS[category]}</strong>
      <small>{failed ? "사진을 불러올 수 없어요" : "제공된 장소 사진 없음"}</small>
    </div>
  );
}

export function PlaceCardMedia({
  image,
  fallbackCategory,
  className = "",
  sizes = "132px",
}: {
  image: PlaceCardImage;
  fallbackCategory: PlaceCategory;
  className?: string;
  sizes?: string;
}) {
  const source = image.kind === "category_placeholder" ? null : image.src;
  const photo = usePlacePhotoState(source);
  if (image.kind === "category_placeholder" || photo.state === "failed") {
    return (
      <div className={`relative overflow-hidden bg-[#edf3ee] ${className}`} data-image-state={photo.state}>
        <CategoryPlaceholder category={image.kind === "category_placeholder" ? image.category : fallbackCategory} alt={image.kind === "category_placeholder" ? image.alt : "이미지를 불러오지 못해 카테고리 안내를 표시합니다."} failed={photo.state === "failed"} />
        {photo.state === "failed" ? <button className="photo-retry" type="button" onClick={photo.retry} onKeyDown={(event) => event.stopPropagation()}>사진 다시 시도</button> : null}
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-[#edf3ee] ${className}`} data-image-kind={image.kind} data-image-state={photo.state}>
      <Image
        key={image.src}
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        className="object-cover"
        onLoad={photo.onLoad}
        onError={photo.onError}
      />
      {image.kind === "static_map" ? (
        <span className="catalog-card-media__map-label"><Camera size={12} aria-hidden="true" />위치 미리보기</span>
      ) : null}
    </div>
  );
}
