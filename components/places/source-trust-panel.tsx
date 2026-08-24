import { BadgeCheck, CircleAlert, Database, ShieldCheck } from "lucide-react";
import { getPlaceSourceLayer } from "@/lib/places/source-layers";
import type { PlaceSourceRecord, PlaceTrustResult } from "@/types/place-source";

const TRUST_LEVEL_LABELS: Record<PlaceTrustResult["level"], string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

function dateLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function SourceTrustPanel({
  sourceRecords,
  trust,
}: {
  sourceRecords: PlaceSourceRecord[];
  trust: PlaceTrustResult;
}) {
  const evidence = trust.components.filter(({ kind }) => kind === "evidence");
  const conflicts = sourceRecords.flatMap(({ conflicts }) => conflicts);

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="source-trust-heading">
      <p className="eyebrow">SOURCE &amp; TRUST</p>
      <h2 id="source-trust-heading" className="mt-2 text-xl font-black tracking-[-0.03em]">
        출처와 정보 신뢰도
      </h2>

      <div className="mt-4 rounded-2xl border border-[#cfe0d6] bg-[#edf8f2] p-4 text-[#285c45]">
        <p className="flex items-center gap-2 text-base font-black">
          <ShieldCheck size={20} aria-hidden="true" />
          정보 신뢰도: {TRUST_LEVEL_LABELS[trust.level]}
        </p>
        <p className="mt-1 text-sm font-bold">근거 {trust.evidenceCount}개</p>
        <p className="mt-2 text-xs leading-5 text-[#526b5f]">
          이 등급은 정보 근거의 최신성과 일관성을 나타내며, 동반 가능 판정이나 확률이 아닙니다.
        </p>
      </div>

      {evidence.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm font-semibold text-[#344a40]">
          {evidence.map((component, index) => (
            <li key={`${component.code}:${component.observedAt ?? index}`} className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 shrink-0 text-[#3d8b68]" size={16} aria-hidden="true" />
              <span>
                {component.label}
                {dateLabel(component.observedAt) ? `: ${dateLabel(component.observedAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-[#f3f5f3] p-3 text-sm font-semibold text-[#66756d]">
          확인 가능한 반려동물 근거가 없어 낮은 신뢰도로 표시합니다.
        </p>
      )}

      <div className="mt-5">
        <h3 className="flex items-center gap-2 text-sm font-black text-[#344a40]">
          <Database size={16} aria-hidden="true" /> 보존된 출처
        </h3>
        <ul className="mt-3 space-y-2">
          {sourceRecords.map((source) => {
            const layer = getPlaceSourceLayer(source.layer);
            return (
              <li key={source.recordId} className="rounded-2xl border border-[#dce6df] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#edf8f2] px-2.5 py-1 text-xs font-extrabold text-[#236148]">
                    {layer.label}
                  </span>
                  <span className="text-xs font-bold text-[#68776f]">{source.provider}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#607269]">
                  제공자 ID {source.providerIds.map(({ id }) => id).join(", ")}
                  {source.evidenceSummary ? ` · ${source.evidenceSummary}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {trust.flags.includes("operational_status_conflict") || conflicts.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#e8d2bd] bg-[#fff8f1] p-4 text-sm text-[#6a5547]" role="status">
          <p className="flex items-center gap-2 font-extrabold">
            <CircleAlert size={17} aria-hidden="true" /> 출처 충돌 확인 필요
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
            {trust.flags.includes("operational_status_conflict") ? (
              <li>인허가 운영 상태와 장소 정보가 충돌합니다. 이는 반려동물 출입 거절 판정이 아닙니다.</li>
            ) : null}
            {conflicts.map((conflict, index) => (
              <li key={`${conflict.code}:${index}`}>{conflict.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="mt-5 border-t border-[#dce6df] pt-4 text-xs leading-6 text-[#6b7972]">
        <summary className="cursor-pointer font-bold">신뢰 규칙 구성요소 보기</summary>
        <p className="mt-2">규칙 버전: {trust.ruleVersion}</p>
        <p>근거 신뢰 점수: {trust.score}점 (확률 아님)</p>
        <p>계산 시각: {trust.computedAt}</p>
        <ul className="mt-2 list-disc pl-5">
          {trust.components.map((component, index) => (
            <li key={`${component.code}:${index}`}>
              {component.label}: {component.points > 0 ? "+" : ""}{component.points}점
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
