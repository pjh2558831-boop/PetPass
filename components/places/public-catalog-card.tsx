"use client";

import Link from "next/link";
import { ExternalLink, LocateFixed, MapPin, Phone } from "lucide-react";
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
      className={`surface-card catalog-result-card p-5 transition ${selected ? "border-[#3d8b68] ring-2 ring-[#3d8b68]/20" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
        <span className="rounded-full bg-[#edf8f2] px-2.5 py-1 text-[#236148]">{place.sourceLabel}</span>
        <span className="text-[#66776e]">{CATEGORY_LABELS[place.category]}</span>
        <span className="rounded-full bg-[#fff6cc] px-2.5 py-1 text-[#6b5200]">{place.publicLabel}</span>
      </div>
      <h3 className="mt-3 text-lg font-black tracking-[-0.03em]">{place.name}</h3>
      <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-[#65746c]">
        <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{place.address}
      </p>
      {place.warning ? <p className="mt-3 rounded-xl bg-[#fff8e5] p-3 text-xs font-bold leading-5 text-[#76542f]">{place.warning}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSelect} className="inline-flex min-h-10 items-center gap-1 text-xs font-extrabold text-[#52665b]" aria-label={`${place.name} 지도에서 보기`}>
          <LocateFixed size={14} aria-hidden="true" /> 지도
        </button>
        {place.phone ? <a href={`tel:${place.phone}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-extrabold text-[#52665b]"><Phone size={14} aria-hidden="true" /> 전화</a> : null}
        {place.placeUrl ? (
          <Link aria-label={`${place.name} 원문 상세 보기`} href={place.placeUrl} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined} className="ml-auto inline-flex min-h-10 items-center gap-1 text-sm font-extrabold text-[#236148]">
            상세 보기 <ExternalLink size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
