"use client";

import Image from "next/image";
import { useState } from "react";
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

function CategoryPlaceholder({ category, alt }: { category: PlaceCategory; alt: string }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <div className={`catalog-card-placeholder is-${category}`} role="img" aria-label={alt} data-image-kind="category_placeholder">
      <span className="catalog-card-placeholder__icon"><Icon size={25} aria-hidden="true" /></span>
      <strong>{PLACE_CATEGORY_LABELS[category]}</strong>
      <small>장소 사진 준비 중</small>
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
  const [failedSource, setFailedSource] = useFailedSource(image);
  if (image.kind === "category_placeholder" || failedSource) {
    return <div className={className}><CategoryPlaceholder category={image.kind === "category_placeholder" ? image.category : fallbackCategory} alt={image.kind === "category_placeholder" ? image.alt : "이미지를 불러오지 못해 카테고리 안내를 표시합니다."} /></div>;
  }
  return (
    <div className={`relative overflow-hidden bg-[#edf3ee] ${className}`} data-image-kind={image.kind}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        className="object-cover"
        onError={() => setFailedSource(image.src)}
      />
      {image.kind === "static_map" ? (
        <span className="catalog-card-media__map-label"><Camera size={12} aria-hidden="true" />위치 미리보기</span>
      ) : null}
    </div>
  );
}

function useFailedSource(image: PlaceCardImage): [boolean, (source: string) => void] {
  const source = image.kind === "category_placeholder" ? null : image.src;
  const [failed, setFailed] = useState<string | null>(null);
  return [Boolean(source && failed === source), setFailed];
}
