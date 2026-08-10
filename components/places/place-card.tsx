"use client";

import Link from "next/link";
import { ArrowRight, LocateFixed, MapPin } from "lucide-react";
import { PlaceImage } from "@/components/places/place-image";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import type { TourPlaceSummary } from "@/types/place";

export function PlaceCard({
  place,
  order,
  priority = false,
  selected = false,
  onSelect,
}: {
  place: TourPlaceSummary;
  order?: number;
  priority?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const title = place.title ?? "이름 미확인";
  const address = [place.address, place.detailAddress].filter(Boolean).join(" ");
  const detailQuery = place.contentTypeId
    ? `?contentTypeId=${place.contentTypeId}`
    : "";

  return (
    <article
      id={`place-card-${place.contentId}`}
      className={`surface-card overflow-hidden p-3 transition ${
        selected ? "border-[#3d8b68] ring-2 ring-[#3d8b68]/20" : ""
      }`}
    >
      <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
        <div className="relative">
          <PlaceImage
            imageUrl={place.thumbnailUrl ?? place.imageUrl}
            title={title}
            priority={priority}
          />
          {order ? (
            <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-[#236148] text-xs font-black text-white shadow">
              {order}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col p-1 sm:py-2 sm:pr-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-[#66776e]">
              {TOUR_CATEGORY_LABELS[place.category]}
            </span>
            <span className="rounded-full bg-[#edf8f2] px-2.5 py-1 text-[11px] font-extrabold text-[#236148]">
              관광공사 공식 데이터
            </span>
          </div>
          <h3 className="mt-3 text-lg font-black tracking-[-0.03em]">{title}</h3>
          <div className="mt-3 space-y-1.5 text-xs font-semibold text-[#65746c]">
            <p className="flex items-start gap-2">
              <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {address || "주소 정보 없음"}
            </p>
            <p>운영시간과 반려동물 동반 원문은 상세 화면에서 확인합니다.</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold text-[#6e7e75]">
              동반 가능 여부는 아직 판정하지 않습니다.
            </p>
            <span className="ml-auto flex items-center gap-2">
              {onSelect ? (
                <button
                  type="button"
                  onClick={onSelect}
                  className="inline-flex items-center gap-1 text-xs font-extrabold text-[#52665b] hover:text-[#236148]"
                  aria-label={`${title} 지도에서 보기`}
                >
                  <LocateFixed size={14} aria-hidden="true" />
                  지도
                </button>
              ) : null}
              <Link
                href={`/places/${place.contentId}${detailQuery}`}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-[#236148]"
                aria-label={`${title} 원문 상세 보기`}
              >
                원문 상세
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
