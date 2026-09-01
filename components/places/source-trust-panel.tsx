import {
  BadgeCheck,
  CircleAlert,
  Database,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
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
    <section className="place-detail-source-trust" aria-labelledby="source-trust-heading">
      <div className="place-detail-section-heading">
        <div>
          <h2
            id="source-trust-heading"
            className="text-xl font-black tracking-[-0.03em]"
          >
            출처와 정보 신뢰도
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#617168]">
            제공처와 보존된 원문 기록을 기준으로 정보 상태를 확인할 수 있습니다.
          </p>
        </div>
        <p className="text-xs font-extrabold text-[#607269]">
          보존 출처 {sourceRecords.length}개
        </p>
      </div>

      <div className="place-detail-trust-summary">
        <p className="flex items-center gap-2 text-base font-black text-[#285c45]">
          <ShieldCheck size={20} aria-hidden="true" />
          정보 신뢰도 {TRUST_LEVEL_LABELS[trust.level]}
        </p>
        <p className="text-sm font-bold text-[#526b5f]">판단 근거 {trust.evidenceCount}개</p>
        <p className="text-xs leading-5 text-[#607269]">
          이 등급은 정보 근거의 최신성과 일관성을 나타내며, 동반 가능 판정이나 확률이 아닙니다.
        </p>
      </div>

      {evidence.length > 0 ? (
        <div className="place-detail-evidence-group">
          <h3>평가에 반영된 근거</h3>
          <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm font-semibold text-[#344a40] sm:grid-cols-2">
            {evidence.map((component, index) => (
              <li
                key={component.code + ":" + (component.observedAt ?? index)}
                className="flex items-start gap-2"
              >
                <BadgeCheck
                  className="mt-0.5 shrink-0 text-[#3d8b68]"
                  size={16}
                  aria-hidden="true"
                />
                <span>
                  {component.label}
                  {dateLabel(component.observedAt) ? ": " + dateLabel(component.observedAt) : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-sm font-semibold text-[#66756d]">
          확인 가능한 반려동물 근거가 없어 낮은 신뢰도로 표시합니다.
        </p>
      )}

      <div className="place-detail-evidence-group">
        <h3 className="flex items-center gap-2">
          <Database size={16} aria-hidden="true" /> 보존된 출처
        </h3>
        <ul className="place-detail-preserved-sources">
          {sourceRecords.map((source) => {
            const layer = getPlaceSourceLayer(source.layer);
            return (
              <li key={source.recordId}>
                <div>
                  <p className="font-extrabold text-[#315b48]">{layer.label}</p>
                  <p className="mt-1 text-xs font-bold text-[#68776f]">{source.provider}</p>
                </div>
                <div className="min-w-0">
                  <p className="break-words text-xs leading-5 text-[#607269]">
                    제공자 ID {source.providerIds.map(({ id }) => id).join(", ")}
                    {source.evidenceSummary ? " · " + source.evidenceSummary : ""}
                  </p>
                  {source.sourceUrl ? (
                    <a
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-[#236148] underline decoration-[#9cc4b0] underline-offset-4"
                    >
                      원문 출처 열기 <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {trust.flags.includes("operational_status_conflict") || conflicts.length > 0 ? (
        <div className="place-detail-conflict mt-6" role="status">
          <p className="flex items-center gap-2 font-extrabold">
            <CircleAlert size={17} aria-hidden="true" /> 출처 충돌 확인 필요
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
            {trust.flags.includes("operational_status_conflict") ? (
              <li>
                인허가 운영 상태와 장소 정보가 충돌합니다. 이는 반려동물 출입 거절 판정이 아닙니다.
              </li>
            ) : null}
            {conflicts.map((conflict, index) => (
              <li key={conflict.code + ":" + index}>{conflict.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}

    </section>
  );
}

export function SourceTrustTechnicalDisclosure({
  trust,
}: {
  trust: PlaceTrustResult;
}) {
  return (
    <Disclosure label="신뢰도 산정 기술 정보" idPrefix="source-trust-technical">
      <div className="place-detail-technical-copy">
        <p>규칙 버전: {trust.ruleVersion}</p>
        <p>근거 신뢰 점수: {trust.score}점 (확률 아님)</p>
        <p>계산 시각: {trust.computedAt}</p>
        <ul className="mt-2 list-disc pl-5">
          {trust.components.map((component, index) => (
            <li key={component.code + ":" + index}>
              {component.label}: {component.points > 0 ? "+" : ""}
              {component.points}점
            </li>
          ))}
        </ul>
      </div>
    </Disclosure>
  );
}
