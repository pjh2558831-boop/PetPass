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
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import type { ApiResult } from "@/types/api";
import type {
  TourPetPolicyFields,
  TourPlaceDetail,
} from "@/types/place";

const evidenceLabels: Record<keyof TourPetPolicyFields, string> = {
  acmpyTypeCd: "동반 유형 코드",
  acmpyPsblCpam: "동반 가능 동물",
  acmpyNeedMtr: "동반 필요 사항",
  etcAcmpyInfo: "기타 동반 정보",
  relaAcdntRiskMtr: "관련 사고 위험 사항",
  relaPosesFclty: "관련 보유 시설",
  relaFrnshPrdlst: "관련 비치 물품",
  relaPurcPrdlst: "관련 구매 물품",
  relaRntlPrdlst: "관련 대여 물품",
};

type DetailState = "loading" | "ready" | "error";

export function LivePlaceDetail({
  contentId,
  contentTypeId,
}: {
  contentId: string;
  contentTypeId?: string;
}) {
  const [state, setState] = useState<DetailState>("loading");
  const [detail, setDetail] = useState<TourPlaceDetail | null>(null);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const query = contentTypeId
        ? `?contentTypeId=${encodeURIComponent(contentTypeId)}`
        : "";
      try {
        const response = await fetch(
          `/api/tour/places/${encodeURIComponent(contentId)}${query}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const body = (await response.json()) as ApiResult<TourPlaceDetail>;
        if (!response.ok || !body.ok) {
          const timeout = !body.ok && body.error.code === "UPSTREAM_TIMEOUT";
          throw new Error(
            timeout
              ? "상세 정보 요청 시간이 초과되었습니다."
              : !body.ok
                ? body.error.message
                : "상세 정보를 불러오지 못했습니다.",
          );
        }
        setDetail(body.data);
        setError("");
        setState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "상세 정보를 불러오지 못했습니다.",
        );
        setState("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [contentId, contentTypeId, retryCount]);

  if (state === "loading") {
    return (
      <div className="page-shell py-12">
        <p className="surface-card p-8 text-center font-extrabold" role="status">
          한국관광공사 상세 정보를 불러오는 중입니다.
        </p>
      </div>
    );
  }

  if (state === "error" || !detail) {
    return (
      <div className="page-shell py-12">
        <div className="surface-card p-8 text-center" role="alert">
          <p className="font-extrabold">{error || "상세 정보를 불러오지 못했습니다."}</p>
          <button
            type="button"
            onClick={() => {
              setState("loading");
              setRetryCount((value) => value + 1);
            }}
            className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#236148]"
          >
            <RefreshCw size={15} aria-hidden="true" /> 다시 시도
          </button>
        </div>
      </div>
    );
  }

  const title = detail.summary.title ?? "이름 미확인";
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
    (section) => section.status === "unavailable",
  );

  return (
    <div className="page-shell py-8 sm:py-12">
      <Link
        href="/results"
        className="inline-flex min-h-10 items-center gap-2 rounded-full text-sm font-bold text-[#52665b] hover:text-[#236148]"
      >
        <ArrowLeft size={17} aria-hidden="true" /> 추천 결과로
      </Link>

      {unavailableSections.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[#e8d2bd] bg-[#fff8f1] p-4 text-sm text-[#6a5547]" role="status">
          <p className="font-extrabold">일부 상세 정보를 불러오지 못했습니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {unavailableSections.map((section) => (
              <li key={section.message}>{section.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-7 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <PlaceImage
            imageUrl={detail.summary.imageUrl ?? detail.summary.thumbnailUrl}
            title={title}
            priority
          />
          <div className="mt-6 flex flex-wrap items-center gap-2">
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
          <p className="mt-3 max-w-2xl whitespace-pre-line text-base leading-8 text-[#627169]">
            {detail.overview ?? "제공된 소개 정보가 없습니다."}
          </p>
          {detail.homepageUrl ? (
            <a
              href={detail.homepageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-[#236148]"
            >
              제공 홈페이지 열기 <ExternalLink size={14} aria-hidden="true" />
            </a>
          ) : null}

          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            {[
              { icon: MapPin, label: "주소", value: address || "주소 정보 없음" },
              { icon: Phone, label: "연락처", value: detail.contactInformation ?? detail.summary.phone ?? "연락처 정보 없음" },
              { icon: Clock3, label: "운영 정보", value: detail.operatingInformation ?? "운영 정보 미제공" },
              { icon: CalendarX2, label: "휴무 정보", value: detail.restDayInformation ?? "휴무 정보 미제공" },
              { icon: Car, label: "주차 정보", value: detail.parkingInformation ?? "주차 정보 미제공" },
              { icon: Phone, label: "예약 정보", value: detail.reservationInformation ?? "예약 정보 미제공" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 rounded-2xl bg-[#fffdf8] p-4">
                <Icon size={18} className="mt-0.5 shrink-0 text-[#3d8b68]" aria-hidden="true" />
                <div>
                  <p className="text-xs font-extrabold text-[#748078]">{label}</p>
                  <p className="mt-1 whitespace-pre-line font-semibold leading-6">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="pet-source-heading">
          <p className="eyebrow">SOURCE EVIDENCE</p>
          <h2 id="pet-source-heading" className="mt-2 text-xl font-black tracking-[-0.03em]">
            반려동물 동반 정보 원문
          </h2>
          <p className="mt-3 rounded-2xl bg-[#fff8f1] p-4 text-sm font-semibold leading-6 text-[#6a5547]">
            이 단계에서는 원문만 제공합니다. 동반 가능·조건부·불일치 판정은 하지 않습니다.
          </p>
          {detail.petPolicyEvidence ? (
            <dl className="mt-5 space-y-3">
              {Object.entries(detail.petPolicyEvidence.fields).map(([key, value]) => (
                <div key={key} className="rounded-2xl border border-[#dce6df] bg-white p-4">
                  <dt className="text-xs font-extrabold text-[#607269]">
                    {evidenceLabels[key as keyof TourPetPolicyFields]}
                  </dt>
                  <dd className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344a40]">
                    {value || "제공 정보 없음"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-5 rounded-2xl bg-[#f3f5f3] p-4 text-sm font-semibold text-[#68776f]">
              반려동물 동반 원문 섹션을 사용할 수 없습니다.
            </p>
          )}
          <div className="mt-5 border-t border-[#dce6df] pt-4 text-xs leading-6 text-[#6b7972]">
            <p>제공처: Korea Tourism Organization</p>
            <p>작업: detailPetTour2</p>
            <p>콘텐츠 ID: {contentId}</p>
            <p>조회 시각: {detail.source.retrievedAt}</p>
            {detail.providerModifiedTime ? (
              <p>제공처 수정 시각: {detail.providerModifiedTime}</p>
            ) : null}
          </div>
        </section>
      </div>

      {coordinates ? (
        <div className="mt-12">
          <MapPanel
            compact
            title={`${title} 위치`}
            locations={[
              {
                id: detail.summary.contentId,
                name: title,
                address,
                coordinates,
                order: 1,
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
