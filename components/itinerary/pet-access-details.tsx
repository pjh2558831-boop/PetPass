import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  TOUR_PET_ACCESS_SCOPE_LABELS,
} from "@/lib/pet-access/tourism/constants";
import { GENERATED_PET_VERDICT_COPY, type StopPresentation } from "@/lib/itinerary/presentation";
import type { TourPetAccessAssertion, TourPetAccessEvaluationState } from "@/types/tour-pet-access";

const VERDICT_STYLES = {
  allowed: "border-[#b9ddca] bg-[#edf8f2] text-[#236148]",
  conditional: "border-[#ead19f] bg-[#fff8e8] text-[#74551e]",
  not_allowed: "border-[#e5bdb7] bg-[#fff1ef] text-[#823f36]",
  unknown: "border-[#d4dcd7] bg-[#f3f5f3] text-[#52665b]",
} as const;

const VERDICT_ICONS = {
  allowed: CheckCircle2,
  conditional: AlertTriangle,
  not_allowed: Ban,
  unknown: CircleHelp,
} as const;

const EVALUATION_LABELS: Record<TourPetAccessEvaluationState, string> = {
  complete: "근거 평가 완료",
  partial: "일부 자료로 평가",
  insufficient_evidence: "근거 확인 필요",
  unavailable: "원문 자료 확인 불가",
  not_applicable: "평가 대상 아님",
};

const CONFIDENCE_LABELS = {
  high: "근거 강도 높음",
  medium: "근거 강도 보통",
  low: "근거 추가 확인 필요",
} as const;

const ASSERTION_LABELS: Record<TourPetAccessAssertion, string> = {
  allows: "동반 가능 근거",
  denies: "동반 제한 근거",
  limits: "동반 조건",
  inquiry_only: "시설 문의 필요",
  unknown: "판정에 사용하지 않은 원문",
};

const EQUIPMENT_LABELS = {
  hasCarrier: "이동장",
  hasLeash: "목줄",
  hasMuzzle: "입마개",
} as const;

function sourceDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{8,14}$/u.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value.slice(0, 10);
}

function EvidenceLink({ href }: { href: string }) {
  const className =
    "inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--brand)] underline decoration-[#a9c6b7] underline-offset-4";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        원문 근거 상세 보기 <ExternalLink size={15} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      장소 정보 열기 <ExternalLink size={15} aria-hidden="true" />
    </a>
  );
}

function PetAccessContent({ presentation }: { presentation: StopPresentation }) {
  const { stop, equipmentRequirements, confirmation, detailHref } = presentation;
  const access = stop.petAccess;
  const evidence = access.evidence ?? [];
  const conflicts = access.conflicts ?? [];
  const sources = access.sources ?? [];

  return (
    <div className="space-y-4 text-sm leading-6 text-[#52665b]">
      {access.summary ? <p className="font-semibold text-[#344a40]">{access.summary}</p> : null}

      {equipmentRequirements.length > 0 ? (
        <div>
          <h4 className="text-xs font-black text-[#344a40]">장비 조건</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {equipmentRequirements.map(({ condition, equipmentKey, status }) => (
              <li
                key={`${condition.type}:${condition.scope}:${condition.label}`}
                className="pet-access-equipment"
                data-status={status}
              >
                {EQUIPMENT_LABELS[equipmentKey]} · {status === "available" ? "준비됨" : status === "missing" ? "준비되지 않음" : "보유 여부 확인 필요"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {access.conditions.length > 0 ? (
        <div>
          <h4 className="text-xs font-black text-[#344a40]">동반 조건</h4>
          <ul className="mt-2 space-y-2">
            {access.conditions.map((condition) => (
              <li
                key={`${condition.type}:${condition.scope}:${condition.label}`}
                className="pet-access-condition"
              >
                <p className="font-extrabold text-[#315b48]">{condition.label}</p>
                <p className="mt-1 text-xs font-bold text-[#607269]">
                  적용 범위: {TOUR_PET_ACCESS_SCOPE_LABELS[condition.scope]}
                </p>
                <p className="mt-1 whitespace-pre-line">{condition.sourceText}</p>
                {condition.manualConfirmationRecommended ? (
                  <p className="mt-1 text-xs font-bold text-[#765138]">방문 전 세부 조건 확인 권장</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {access.permittedScopes.length > 0 || access.restrictedScopes.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {access.permittedScopes.length > 0 ? (
            <div className="pet-access-scope" data-verdict="allowed">
              <h4 className="text-xs font-black text-[#236148]">동반 가능 범위</h4>
              <p className="mt-1 text-xs font-semibold">
                {access.permittedScopes.map((scope) => TOUR_PET_ACCESS_SCOPE_LABELS[scope]).join(" · ")}
              </p>
            </div>
          ) : null}
          {access.restrictedScopes.length > 0 ? (
            <div className="pet-access-scope" data-verdict="not_allowed">
              <h4 className="text-xs font-black text-[#823f36]">동반 제한 범위</h4>
              <p className="mt-1 text-xs font-semibold">
                {access.restrictedScopes.map((scope) => TOUR_PET_ACCESS_SCOPE_LABELS[scope]).join(" · ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="rounded-xl border border-[#e5bdb7] bg-[#fff1ef] p-3 text-[#704b45]" role="alert">
          <p className="font-extrabold">상충하는 원문 안내</p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((conflict) => <li key={conflict.id}>{conflict.summary}</li>)}
          </ul>
        </div>
      ) : null}

      {confirmation.hasConfirmationRequirements ? (
        <div className="rounded-xl border border-[#ead7b8] bg-[#fff8ec] p-3 text-[#76542f]">
          <p className="font-extrabold">방문 전 확인할 내용</p>
          <ul className="mt-1 list-disc pl-5">
            {confirmation.callAheadRequired ? <li>시설에 직접 반려동물 동반 가능 여부를 확인해 주세요.</li> : null}
            {confirmation.sizeVerificationRequired ? <li>현재 반려동물 크기가 허용 범위인지 확인해 주세요.</li> : null}
            {confirmation.operatingHoursWarning ? <li>{confirmation.operatingHoursWarning}</li> : null}
            {confirmation.manualConditions.map((condition) => (
              <li key={`${condition.type}:${condition.scope}:${condition.label}`}>
                {condition.label}의 최신 적용 여부를 확인해 주세요.
              </li>
            ))}
            {confirmation.verificationItems.map((item) => <li key={item.code}>{item.label}</li>)}
            {confirmation.assessmentWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <div>
          <h4 className="text-xs font-black text-[#344a40]">한국관광공사 제공 근거</h4>
          <dl className="mt-2 space-y-2">
            {evidence.map((item) => (
              <div key={item.id} className="pet-access-evidence">
                <dt className="text-xs font-extrabold text-[#607269]">
                  {item.fieldLabel} · {ASSERTION_LABELS[item.assertion]}
                </dt>
                <dd className="mt-1 whitespace-pre-line text-[#344a40]">{item.originalText}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {sources.length > 0 ? (
        <div className="border-t border-[#dce6df] pt-3 text-xs text-[#6b7972]">
          <p className="font-bold">제공처: Korea Tourism Organization</p>
          {sources.map((source) => (
            <p key={source.operation}>
              {source.operation}: {source.status}
              {sourceDate(source.retrievedAt) ? ` · 조회 ${sourceDate(source.retrievedAt)}` : ""}
              {sourceDate(source.providerModifiedTime) ? ` · 제공처 수정 ${sourceDate(source.providerModifiedTime)}` : ""}
            </p>
          ))}
        </div>
      ) : null}

      {detailHref ? <EvidenceLink href={detailHref} /> : null}
    </div>
  );
}

export function PetAccessDetails({
  presentation,
  expanded = false,
}: {
  presentation: StopPresentation;
  expanded?: boolean;
}) {
  const { stop } = presentation;
  const copy = GENERATED_PET_VERDICT_COPY[stop.petAccess.verdict];
  const VerdictIcon = VERDICT_ICONS[stop.petAccess.verdict];

  return (
    <section aria-label={`${stop.title} 반려동물 동반 안내`}>
      <div className={`pet-access-verdict ${VERDICT_STYLES[stop.petAccess.verdict]}`} data-verdict={stop.petAccess.verdict}>
        <p className="flex items-center gap-2 font-black">
          <VerdictIcon size={17} aria-hidden="true" />
          {copy.label}
        </p>
        <p className="mt-1 text-xs font-semibold leading-5">{copy.description}</p>
        <p className="mt-1 text-[11px] font-bold">
          {EVALUATION_LABELS[stop.petAccess.evaluationState]}
          {stop.petAccess.confidence ? ` · ${CONFIDENCE_LABELS[stop.petAccess.confidence]}` : ""}
        </p>
      </div>

      {expanded ? (
        <div className="mt-3">
          <PetAccessContent presentation={presentation} />
        </div>
      ) : (
        <details className="pet-access-details-disclosure">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 py-1 text-xs font-extrabold text-[#315b48]">
            <ShieldCheck size={15} aria-hidden="true" />
            동반 조건·근거·확인 항목 보기
          </summary>
          <div className="pb-2 pt-2">
            <PetAccessContent presentation={presentation} />
          </div>
        </details>
      )}
    </section>
  );
}
