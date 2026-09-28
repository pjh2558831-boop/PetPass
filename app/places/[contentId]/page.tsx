import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarX2,
  Car,
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { LivePlaceDetail } from "@/components/places/live-place-detail";
import { AssessmentPanel } from "@/components/pet-access/assessment-panel";
import { StatusBadge } from "@/components/pet-access/status-badge";
import { DemoBadge } from "@/components/ui/demo-badge";
import { demoPlaces, getDemoPlace } from "@/fixtures/demo-data";
import { CATEGORY_LABELS } from "@/lib/shared/format";
import { REGION_CONFIGS, getRegionConfig } from "@/lib/regions/config";
import type { LicenseStatus } from "@/types/license";
import type { RegionId } from "@/types/region";

const licenseLabels: Record<LicenseStatus, string> = {
  VERIFIED_ACTIVE: "영업 상태 일치",
  NO_MATCH: "일치 항목 없음",
  NEEDS_CONFIRMATION: "추가 확인 필요",
  NOT_APPLICABLE: "확인 대상 아님",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ contentId: string }>;
}): Promise<Metadata> {
  const { contentId } = await params;
  const place = getDemoPlace(contentId);
  return {
    title: place?.name ?? "장소 상세",
    description: place?.summary ?? "한국관광공사 반려동물 동반 여행 장소 정보를 확인해 보세요.",
    alternates: { canonical: `/places/${encodeURIComponent(contentId)}` },
    robots: { index: false, follow: true },
  };
}

export default async function PlaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contentId: string }>;
  searchParams: Promise<{ contentTypeId?: string; region?: string }>;
}) {
  const { contentId } = await params;
  const { contentTypeId, region: requestedRegion } = await searchParams;
  const selectedRegion = getRegionConfig(requestedRegion);
  const regionId: RegionId = selectedRegion?.mapEnabled
    ? selectedRegion.id
    : REGION_CONFIGS[0].id;
  const place = regionId === "busan" ? getDemoPlace(contentId) : undefined;
  if (!place) {
    return (
      <LivePlaceDetail contentId={contentId} contentTypeId={contentTypeId} regionId={selectedRegion?.mapEnabled ? selectedRegion.id : undefined} />
    );
  }

  const alternatives = demoPlaces
    .filter(
      (candidate) =>
        candidate.contentId !== place.contentId &&
        candidate.category === place.category,
    )
    .slice(0, 2);

  return (
    <div className="page-shell py-8 sm:py-12">
      <Link
        href={`/results?tab=catalog&region=${regionId}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-[#52665b] hover:text-[#236148]"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        장소 목록으로
      </Link>

      <article className="demo-place-document mt-5">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-[#68776f]">
              {CATEGORY_LABELS[place.category]}
            </span>
            <StatusBadge status={place.accessAssessment.status} />
            <DemoBadge />
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            {place.name}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-8 text-[#627169]">
            {place.summary}
          </p>
          <dl className="place-detail-facts mt-6 text-sm">
            <div>
              <dt><MapPin size={18} className="shrink-0 text-[#3d8b68]" aria-hidden="true" />주소</dt><dd>{place.address}</dd>
            </div>
            {place.phone ? <div>
              <dt><Phone size={18} className="shrink-0 text-[#3d8b68]" aria-hidden="true" />전화</dt><dd>{place.phone}</dd>
            </div> : null}
            {place.openingHours ? <div>
              <dt><Clock3 size={18} className="shrink-0 text-[#3d8b68]" aria-hidden="true" />운영시간</dt><dd>{place.openingHours}</dd>
            </div> : null}
            {place.closedDays ? <div>
              <dt><CalendarX2 size={18} className="shrink-0 text-[#3d8b68]" aria-hidden="true" />휴무일</dt><dd>{place.closedDays}</dd>
            </div> : null}
          </dl>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
          <AssessmentPanel assessment={place.accessAssessment} />
          <section className="demo-license-document" aria-labelledby="demo-license-heading">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-[#3d8b68]" aria-hidden="true" />
              <h2 id="demo-license-heading" className="font-black">영업 인허가 확인</h2>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#eef3ef] px-2.5 py-1 text-xs font-extrabold text-[#53675c]">
                {licenseLabels[place.licenseVerification.status]}
              </span>
              <span className="text-xs text-[#748078]">
                {place.licenseVerification.sourceName}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#637169]">
              {place.licenseVerification.reason}
            </p>
          </section>
        </div>
      </article>

      <div className="mt-12 grid gap-7 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <Car size={19} className="text-[#3d8b68]" aria-hidden="true" />
            <h2 className="text-xl font-black tracking-[-0.03em]">위치와 이동</h2>
          </div>
          <div className="mt-4">
            <MapPanel
              regionId={regionId}
              compact
              initialLevel={4}
              title={`${place.name} 위치`}
              locations={[
                {
                  id: place.contentId,
                  name: place.name,
                  address: place.address,
                  coordinates: place.coordinates,
                  order: 1,
                },
              ]}
            />
          </div>
        </div>
        <section aria-labelledby="alternatives-heading">
          <div className="flex items-center gap-2">
            <ShieldCheck size={19} className="text-[#3d8b68]" aria-hidden="true" />
            <h2 id="alternatives-heading" className="text-xl font-black tracking-[-0.03em]">
              같은 유형의 대체 장소
            </h2>
          </div>
          {alternatives.length > 0 ? (
            <div className="mt-4 space-y-3">
              {alternatives.map((alternative) => (
                <Link
                  key={alternative.contentId}
                  href={`/places/${alternative.contentId}?region=${regionId}`}
                  className="block border-t border-[var(--line)] py-5 transition-colors hover:text-[var(--brand)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={alternative.accessAssessment.status} />
                    <DemoBadge compact />
                  </div>
                  <h3 className="mt-3 font-black">{alternative.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#66756d]">
                    {alternative.accessAssessment.reason}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 border-t border-[var(--line)] py-6">
              <p className="font-black">등록된 같은 유형의 대체 데모가 없어요.</p>
              <p className="mt-2 text-sm text-[#6a7971]">
                현재 표시할 수 있는 같은 유형의 장소가 없습니다.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
