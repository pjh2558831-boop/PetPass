"use client";

import { useState } from "react";
import { ClipboardCheck, FileWarning } from "lucide-react";
import { placeInformationReportSchema } from "@/lib/place-reports/schema";
import type { PlaceInformationReportType } from "@/types/place-report";
import type { ProviderPlaceId } from "@/types/place-source";

const REPORT_TYPE_LABELS: Record<PlaceInformationReportType, string> = {
  pet_policy_changed: "반려동물 정책 변경",
  business_closed: "폐업 또는 운영 중단",
  location_incorrect: "주소·지도 위치 오류",
  contact_incorrect: "연락처 오류",
  other: "기타 정보 오류",
};

export function InformationReportDraftPanel({
  placeName,
  providerIds,
}: {
  placeName: string;
  providerIds: ProviderPlaceId[];
}) {
  const [reportType, setReportType] =
    useState<PlaceInformationReportType>("pet_policy_changed");
  const [observedAt, setObservedAt] = useState("");
  const [details, setDetails] = useState("");
  const [draftText, setDraftText] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const createDraft = () => {
    if (!observedAt) return;
    const createdAt = new Date().toISOString();
    const report = placeInformationReportSchema.parse({
      reportId: `draft-${providerIds[0]?.id ?? "unknown"}-${Date.now()}`,
      placeName,
      providerIds,
      reportType,
      details,
      observedAt: new Date(`${observedAt}T12:00:00+09:00`).toISOString(),
      createdAt,
      status: "draft",
    });
    setDraftText(
      [
        "[WEEKENDOG 정보 제보 초안]",
        `장소: ${report.placeName}`,
        `제공자 ID: ${report.providerIds.map(({ provider, id }) => `${provider} ${id}`).join(" / ")}`,
        `제보 유형: ${REPORT_TYPE_LABELS[report.reportType]}`,
        `관찰일: ${observedAt}`,
        `내용: ${report.details}`,
        "검토 상태: 접수 전 초안",
        "주의: 이 제보만으로 반려동물 동반 판정을 변경하지 않습니다.",
      ].join("\n"),
    );
    setCopyState("idle");
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <details className="place-detail-support-document p-5 sm:p-6">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-black text-[#344a40]">
        <FileWarning size={18} aria-hidden="true" /> 정보 오류 제보문 만들기
      </summary>
      <p className="mt-3 rounded-lg bg-[#fff8f1] p-3 text-xs font-semibold leading-5 text-[#6a5547]">
        아래 기능은 검토용 제보문만 만듭니다. 전송하거나 접수 완료로 표시하지 않으므로 복사한 뒤 운영진의 안내된 채널로 전달해 주세요.
      </p>
      <div className="mt-4 grid gap-3">
        <label className="text-xs font-extrabold text-[#52665b]">
          제보 유형
          <select
            value={reportType}
            onChange={(event) => setReportType(event.target.value as PlaceInformationReportType)}
            className="mt-1 min-h-11 w-full rounded-lg border border-[#cfd9d3] bg-white px-3 text-sm"
          >
            {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-extrabold text-[#52665b]">
          직접 확인한 날짜
          <input
            type="date"
            value={observedAt}
            onChange={(event) => setObservedAt(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-[#cfd9d3] bg-white px-3 text-sm"
          />
        </label>
        <label className="text-xs font-extrabold text-[#52665b]">
          확인한 내용 (20자 이상)
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={4}
            maxLength={2_000}
            className="mt-1 w-full rounded-lg border border-[#cfd9d3] bg-white p-3 text-sm leading-6"
          />
        </label>
        <button
          type="button"
          disabled={!observedAt || details.trim().length < 20}
          onClick={createDraft}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#236148] px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          검토용 제보문 만들기
        </button>
      </div>

      {draftText ? (
        <div className="mt-4">
          <textarea
            readOnly
            value={draftText}
            rows={9}
            aria-label="생성된 검토용 제보문"
            className="w-full rounded-lg border border-[#cfd9d3] bg-[#f7f8f7] p-3 text-xs leading-5"
          />
          <button
            type="button"
            onClick={copyDraft}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-extrabold text-[#236148]"
          >
            <ClipboardCheck size={15} aria-hidden="true" /> 제보문 복사
          </button>
          <p className="text-xs font-semibold text-[#68776f]" role="status">
            {copyState === "copied"
              ? "클립보드에 복사했습니다."
              : copyState === "failed"
                ? "자동 복사에 실패했습니다. 위 내용을 직접 선택해 복사해 주세요."
                : "복사 후 운영진의 승인된 검토 채널에 전달해 주세요."}
          </p>
        </div>
      ) : null}
    </details>
  );
}
