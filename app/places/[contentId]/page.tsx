import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { AssessmentPanel } from "@/components/pet-access/assessment-panel";
import { StatusBadge } from "@/components/pet-access/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { MissingImage } from "@/components/ui/missing-image";
import { demoPlaces, getDemoPlace } from "@/fixtures/demo-data";
import { CATEGORY_LABELS } from "@/lib/shared/format";
import type { LicenseStatus } from "@/types/license";

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
    title: place?.name ?? "장소를 찾을 수 없음",
    description: place?.summary,
  };
}

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId } = await params;
  const place = getDemoPlace(contentId);
  if (!place) notFound();

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
        href="/results"
        className="inline-flex min-h-10 items-center gap-2 rounded-full text-sm font-bold text-[#52665b] hover:text-[#236148]"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        추천 결과로
      </Link>

      <div className="mt-5 grid gap-7 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <MissingImage label={place.name} />
          <div className="mt-6 flex flex-wrap items-center gap-2">
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
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl bg-[#fffdf8] p-4">
              <MapPin size={18} className="mt-0.5 shrink-0 text-[#3d8b68]" aria-hidden="true" />
              <div>
                <p className="text-xs font-extrabold text-[#748078]">주소</p>
                <p className="mt-1 font-semibold leading-6">{place.address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-[#fffdf8] p-4">
              <Phone size={18} className="mt-0.5 shrink-0 text-[#3d8b68]" aria-hidden="true" />
              <div>
                <p className="text-xs font-extrabold text-[#748078]">전화</p>
                <p className="mt-1 font-semibold">{place.phone ?? "정보 없음"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-[#fffdf8] p-4">
              <Clock3 size={18} className="mt-0.5 shrink-0 text-[#3d8b68]" aria-hidden="true" />
              <div>
                <p className="text-xs font-extrabold text-[#748078]">운영시간</p>
                <p className="mt-1 font-semibold leading-6">
                  {place.openingHours ?? "정보 미확인"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-[#fffdf8] p-4">
              <CalendarX2 size={18} className="mt-0.5 shrink-0 text-[#3d8b68]" aria-hidden="true" />
              <div>
                <p className="text-xs font-extrabold text-[#748078]">휴무일</p>
                <p className="mt-1 font-semibold">{place.closedDays ?? "정보 미확인"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <AssessmentPanel assessment={place.accessAssessment} />
          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-[#3d8b68]" aria-hidden="true" />
              <h2 className="font-black">영업 인허가 확인</h2>
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
          </div>
          <ButtonLink href="/itinerary" className="w-full">
            이 장소가 담긴 일정 보기
          </ButtonLink>
        </div>
      </div>

      <div className="mt-12 grid gap-7 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <Car size={19} className="text-[#3d8b68]" aria-hidden="true" />
            <h2 className="text-xl font-black tracking-[-0.03em]">위치와 이동</h2>
          </div>
          <div className="mt-4">
            <MapPanel
              compact
              title={`${place.name} 주변 데모 지도`}
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
                  href={`/places/${alternative.contentId}`}
                  className="surface-card block p-5 transition hover:border-[#9bb8a8]"
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
            <div className="surface-card mt-4 p-7 text-center">
              <p className="font-black">등록된 같은 유형의 대체 데모가 없어요.</p>
              <p className="mt-2 text-sm text-[#6a7971]">
                실제 연결 단계에서는 주변 좌표로 다시 검색합니다.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
