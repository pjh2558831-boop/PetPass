"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarX2,
  Car,
  Clock3,
  ExternalLink,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";
import { MapPanel } from "@/components/map/map-panel";
import { PlaceImage } from "@/components/places/place-image";
import { LicenseInformationPanel } from "@/components/places/license-information-panel";
import {
  PetAccessAssessmentPanel,
  PetAccessDecisionSummary,
  PetAccessTechnicalDisclosure,
} from "@/components/places/pet-access-assessment-panel";
import {
  SourceTrustPanel,
  SourceTrustTechnicalDisclosure,
} from "@/components/places/source-trust-panel";
import { InformationReportDraftPanel } from "@/components/places/information-report-draft-panel";
import { Button } from "@/components/ui/button";
import { ProductState } from "@/components/ui/product-state";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import { deriveRegionLabel } from "@/lib/regions/label";
import { getRegionConfig } from "@/lib/regions/config";
import type { ApiError, ApiResult } from "@/types/api";
import type { TourPlaceDetailResponse } from "@/types/place";
import type { RegionId } from "@/types/region";

type DetailState = "loading" | "ready" | "error";

class PublicDetailLoadError extends Error {}

function publicDetailErrorMessage(code: ApiError["code"]): string {
  switch (code) {
    case "NOT_FOUND":
      return "해당 장소 정보를 찾지 못했습니다.";
    case "UPSTREAM_TIMEOUT":
      return "상세 정보 요청 시간이 초과되었습니다.";
    case "RATE_LIMITED":
      return "요청이 많아 장소 정보를 잠시 불러오지 못했습니다.";
    case "INVALID_REQUEST":
      return "장소 요청 정보를 확인하지 못했습니다.";
    default:
      return "장소 제공처 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export function LivePlaceDetail({
  contentId,
  contentTypeId,
  regionId,
}: {
  contentId: string;
  contentTypeId?: string;
  regionId: RegionId;
}) {
  const region = getRegionConfig(regionId);
  const [state, setState] = useState<DetailState>("loading");
  const [detail, setDetail] = useState<TourPlaceDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const query = new URLSearchParams({
        region: regionId,
        ...(contentTypeId ? { contentTypeId } : {}),
      });
      try {
        const response = await fetch(
          `/api/tour/places/${encodeURIComponent(contentId)}?${query}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const body = (await response.json()) as ApiResult<TourPlaceDetailResponse>;
        if (!response.ok || !body.ok) {
          throw new PublicDetailLoadError(
            !body.ok
              ? publicDetailErrorMessage(body.error.code)
              : "장소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          );
        }
        const requestedRegion = getRegionConfig(regionId);
        if (
          body.data.summary.legalRegionCode &&
          body.data.summary.legalRegionCode !== requestedRegion.providerCodes.korPetTourService2.legalDongRegionCode
        ) {
          throw new PublicDetailLoadError("선택한 지역에서 이 장소를 확인할 수 없습니다.");
        }
        setDetail(body.data);
        setError("");
        setState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof PublicDetailLoadError
            ? loadError.message
            : "장소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        setState("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [contentId, contentTypeId, regionId, retryCount]);

  if (state === "loading") {
    return (
      <div className="page-shell py-12 sm:py-16">
        <ProductState status="status" title="장소 정보를 불러오고 있어요." description="공식 장소 정보와 반려동물 동반 근거를 확인하는 중입니다." headingProps={{ id: "place-detail-loading-heading" }} />
      </div>
    );
  }

  if (state === "error" || !detail) {
    return (
      <div className="page-shell py-12 sm:py-16">
        <ProductState status="alert" title="장소 정보를 불러오지 못했어요." description={error || "잠시 후 다시 시도해 주세요."} headingProps={{ id: "place-detail-error-heading" }}>
          <Button
            type="button"
            onClick={() => {
              setState("loading");
              setRetryCount((value) => value + 1);
            }}
          >
            <RefreshCw size={15} aria-hidden="true" /> 다시 시도
          </Button>
        </ProductState>
      </div>
    );
  }

  const title = detail.summary.title ?? "이름 미확인";
  const detailImageUrl = detail.summary.imageUrl ?? detail.summary.thumbnailUrl;
  const address = [detail.summary.address, detail.summary.detailAddress]
    .filter(Boolean)
    .join(" ");
  const coordinates =
    detail.summary.latitude === null || detail.summary.longitude === null
      ? null
      : {
          latitude: detail.summary.latitude,
          longitude: detail.summary.longitude,
        };
  const unavailableSections = Object.values(detail.sections).filter(
    (section) => section.status !== "available",
  );
  const regionLabel = deriveRegionLabel({
    regionCode: detail.summary.legalRegionCode,
    districtCode: detail.summary.legalDistrictCode,
    roadAddress: detail.summary.address,
    lotNumberAddress: detail.summary.detailAddress,
  });
  const informationCards = [
    { icon: MapPin, label: "주소", value: address || "주소 정보 없음" },
    ...(region.mapCatalog.hideMissingPhoneOnDetail &&
      !detail.contactInformation && !detail.summary.phone ? [] : [{
      icon: Phone,
      label: "연락처",
      value:
        detail.contactInformation ??
        detail.summary.phone ??
        "연락처 정보 없음",
    }]),
    {
      icon: Clock3,
      label: "운영 정보",
      value: detail.operatingInformation ?? "운영 정보 미제공",
    },
    ...(detail.summary.category === "accommodation"
      ? [
          {
            icon: Clock3,
            label: "체크인",
            value: detail.checkInTime ?? "체크인 정보 미제공",
          },
          {
            icon: Clock3,
            label: "체크아웃",
            value: detail.checkOutTime ?? "체크아웃 정보 미제공",
          },
        ]
      : []),
    {
      icon: CalendarX2,
      label: "휴무 정보",
      value: detail.restDayInformation ?? "휴무 정보 미제공",
    },
    {
      icon: Car,
      label: "주차 정보",
      value: detail.parkingInformation ?? "주차 정보 미제공",
    },
    {
      icon: Phone,
      label: "예약 정보",
      value: detail.reservationInformation ?? "예약 정보 미제공",
    },
  ];

  return (
    <div className="page-shell py-8 sm:py-12">
      <Link
        href={`/results?tab=catalog&region=${regionId}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-[#52665b] hover:text-[#236148]"
      >
        <ArrowLeft size={17} aria-hidden="true" /> 장소 목록으로
      </Link>

      {unavailableSections.length > 0 ? (
        <div className="mt-5 rounded-[8px] border border-[#e8d2bd] bg-[#fff8f1] p-4 text-sm text-[#6a5547]" role="status">
          <p className="font-extrabold">일부 상세 정보를 불러오지 못했습니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {unavailableSections.map((section) => (
              <li key={section.message}>{section.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`place-detail-intro mt-5 ${detailImageUrl ? "grid gap-7 lg:grid-cols-[minmax(320px,.72fr)_minmax(0,1.28fr)] lg:items-start" : "max-w-4xl"}`}>
        {detailImageUrl ? <div>
          <PlaceImage
            imageUrl={detailImageUrl}
            title={title}
            priority
          />
        </div> : null}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-[#68776f]">
              {TOUR_CATEGORY_LABELS[detail.summary.category]}
            </span>
            <span className="rounded-full bg-[#edf8f2] px-2.5 py-1 text-xs font-extrabold text-[#236148]">
              한국관광공사 원문
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
            {title}
          </h1>
          <PetAccessDecisionSummary
            assessment={detail.petAccessAssessment}
            regionId={regionId}
          />

          <dl className="place-detail-facts mt-6 text-sm">
            {informationCards.map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <dt className="flex items-center gap-3 text-xs font-extrabold text-[#52635a]">
                  <Icon size={18} className="shrink-0 text-[#3d8b68]" aria-hidden="true" />
                  {label}
                </dt>
                <dd className="mt-1 whitespace-pre-line pl-[30px] font-semibold leading-6">{value}</dd>
              </div>
            ))}
          </dl>
          {detail.homepageUrl ? (
            <a
              href={detail.homepageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[#236148] underline decoration-[#9cc4b0] underline-offset-4"
            >
              제공 홈페이지 열기 <ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>

      <section className="place-detail-overview mt-10" aria-labelledby="place-overview-heading">
        <h2 id="place-overview-heading" className="text-xl font-black tracking-[-0.03em]">
          장소 소개
        </h2>
        <p className="mt-3 max-w-4xl whitespace-pre-line text-base leading-8 text-[#627169]">
          {detail.overview ?? "제공된 소개 정보가 없습니다."}
        </p>
      </section>

      <div className="place-detail-evidence-layer mt-10">
        <div className="place-detail-assessment">
          <PetAccessAssessmentPanel
            assessment={detail.petAccessAssessment}
          />
        </div>

        <div className="place-detail-source mt-10">
          <SourceTrustPanel sourceRecords={detail.sourceRecords} trust={detail.trust} />
        </div>

        <section
          className="place-detail-technical-layer mt-10"
          aria-labelledby="place-technical-heading"
        >
          <h2
            id="place-technical-heading"
            className="text-base font-black tracking-[-0.025em] text-[#344a40]"
          >
            기술 정보
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#617168]">
            평가 규칙과 계산 시각은 필요할 때 펼쳐 확인할 수 있습니다.
          </p>
          <div className="place-detail-technical-layer__disclosures mt-4">
            <PetAccessTechnicalDisclosure assessment={detail.petAccessAssessment} />
            <SourceTrustTechnicalDisclosure trust={detail.trust} />
          </div>
        </section>
      </div>

      <div className="place-detail-support mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
          <LicenseInformationPanel licensing={detail.licensing} />
          <InformationReportDraftPanel
            placeName={title}
            providerIds={detail.sourceRecords.flatMap(({ providerIds }) => providerIds)}
          />
      </div>

      {coordinates ? (
        <div className="mt-12">
          <MapPanel
            regionId={regionId}
            compact
            initialLevel={4}
            title={`${title} 위치`}
            locationLabel={regionLabel}
            locations={[
              {
                id: detail.summary.contentId,
                name: title,
                address,
                coordinates,
                markerKind: "tourism-official",
                sourceLabel: "한국관광공사 제공 장소",
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
