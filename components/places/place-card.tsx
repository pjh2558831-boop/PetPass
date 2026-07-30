import Link from "next/link";
import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/pet-access/status-badge";
import { DemoBadge } from "@/components/ui/demo-badge";
import { MissingImage } from "@/components/ui/missing-image";
import { CATEGORY_LABELS } from "@/lib/shared/format";
import type { PetPlace } from "@/types/place";

export function PlaceCard({
  place,
  order,
}: {
  place: PetPlace;
  order?: number;
}) {
  return (
    <article className="surface-card overflow-hidden p-3">
      <div className="grid gap-4 sm:grid-cols-[170px_1fr]">
        <div className="relative">
          <MissingImage label={place.name} />
          {order ? (
            <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-[#236148] text-xs font-black text-white shadow">
              {order}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col p-1 sm:py-2 sm:pr-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-[#66776e]">
              {CATEGORY_LABELS[place.category]}
            </span>
            <StatusBadge status={place.accessAssessment.status} />
            {place.source.isDemo ? <DemoBadge compact /> : null}
          </div>
          <h3 className="mt-3 text-lg font-black tracking-[-0.03em]">{place.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#617068]">
            {place.summary}
          </p>
          <div className="mt-3 space-y-1.5 text-xs font-semibold text-[#65746c]">
            <p className="flex items-start gap-2">
              <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {place.address}
            </p>
            <p className="flex items-start gap-2">
              <Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {place.openingHours ?? "운영시간 미확인"}
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-[#6e7e75]">
              {place.accessAssessment.reason}
            </p>
            <Link
              href={`/places/${place.contentId}`}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-[#236148]"
              aria-label={`${place.name} 상세 보기`}
            >
              근거 보기
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
