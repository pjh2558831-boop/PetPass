import {
  Ban,
  CircleAlert,
  CircleCheckBig,
  CircleHelp,
} from "lucide-react";
import {
  TOUR_PET_ACCESS_SCOPE_LABELS,
  TOUR_PET_ACCESS_VERDICT_LABELS,
} from "@/lib/pet-access/tourism/constants";
import type {
  TourPetAccessAssessment,
  TourPetAccessAssertion,
  TourPetAccessEvaluationState,
} from "@/types/tour-pet-access";

const VERDICT_STYLES: Record<TourPetAccessAssessment["verdict"], string> = {
  allowed: "border-[#b9ddca] bg-[#edf8f2] text-[#236148]",
  conditional: "border-[#ead19f] bg-[#fff8e8] text-[#74551e]",
  not_allowed: "border-[#e5bdb7] bg-[#fff1ef] text-[#823f36]",
  unknown: "border-[#d4dcd7] bg-[#f3f5f3] text-[#52665b]",
};

const VERDICT_ICONS = {
  allowed: CircleCheckBig,
  conditional: CircleAlert,
  not_allowed: Ban,
  unknown: CircleHelp,
} as const;

const CONFIDENCE_LABELS: Record<TourPetAccessAssessment["confidence"], string> = {
  high: "근거 강도 높음",
  medium: "근거 강도 보통",
  low: "근거 확인 필요",
};

const STATE_LABELS: Record<TourPetAccessEvaluationState, string> = {
  complete: "평가 완료",
  partial: "일부 자료로 평가",
  insufficient_evidence: "판단 근거 부족",
  unavailable: "원문 자료 불러오기 실패",
  not_applicable: "평가 대상 아님",
};

const ASSERTION_LABELS: Record<TourPetAccessAssertion, string> = {
  allows: "동반 가능 근거",
  denies: "동반 제한 근거",
  limits: "동반 조건",
  inquiry_only: "시설 문의 필요",
  unknown: "판단에 사용하지 않은 원문",
};

function sourceDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{8,14}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value.slice(0, 10);
}

export function PetAccessAssessmentPanel({
  assessment,
}: {
  assessment: TourPetAccessAssessment;
}) {
  const VerdictIcon = VERDICT_ICONS[assessment.verdict];

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="pet-access-heading">
      <p className="eyebrow">PET ACCESS ASSESSMENT</p>
      <h2 id="pet-access-heading" className="mt-2 text-xl font-black tracking-[-0.03em]">
        반려동물 동반 안내
      </h2>

      <div className={`mt-4 rounded-2xl border p-4 ${VERDICT_STYLES[assessment.verdict]}`}>
        <p className="flex items-center gap-2 text-base font-black">
          <VerdictIcon
            aria-hidden="true"
            className="shrink-0"
            data-verdict-icon={assessment.verdict}
            size={20}
            strokeWidth={2.5}
          />
          {TOUR_PET_ACCESS_VERDICT_LABELS[assessment.verdict]}
        </p>
        <p className="mt-2 text-sm font-semibold leading-6">{assessment.summary}</p>
        <p className="mt-2 text-xs font-extrabold">
          {CONFIDENCE_LABELS[assessment.confidence]} · {STATE_LABELS[assessment.evaluationState]}
        </p>
      </div>

      {assessment.warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#e8d2bd] bg-[#fff8f1] p-4 text-sm leading-6 text-[#6a5547]" role="status">
          <p className="font-extrabold">자료 상태 안내</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {assessment.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      {assessment.conditions.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-black text-[#344a40]">동반 조건</h3>
          <ul className="mt-3 space-y-3">
            {assessment.conditions.map((condition) => (
              <li key={`${condition.type}:${condition.evidenceIds.join(":")}`} className="rounded-2xl border border-[#dce6df] bg-white p-4">
                <p className="text-sm font-extrabold text-[#315b48]">{condition.label}</p>
                <p className="mt-1 text-xs font-bold text-[#607269]">
                  적용 범위: {TOUR_PET_ACCESS_SCOPE_LABELS[condition.scope]}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#52665b]">
                  {condition.sourceText}
                </p>
                {condition.manualConfirmationRecommended ? (
                  <p className="mt-2 text-xs font-bold text-[#765138]">방문 전 세부 조건 확인 권장</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.permittedScopes.length > 0 || assessment.restrictedScopes.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {assessment.permittedScopes.length > 0 ? (
            <div className="rounded-2xl bg-[#edf8f2] p-4">
              <h3 className="text-sm font-black text-[#236148]">동반 가능 범위</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-[#315b48]">
                {assessment.permittedScopes.map((scope) => <li key={scope}>{TOUR_PET_ACCESS_SCOPE_LABELS[scope]}</li>)}
              </ul>
            </div>
          ) : null}
          {assessment.restrictedScopes.length > 0 ? (
            <div className="rounded-2xl bg-[#fff1ef] p-4">
              <h3 className="text-sm font-black text-[#823f36]">동반 제한 범위</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-[#704b45]">
                {assessment.restrictedScopes.map((scope) => <li key={scope}>{TOUR_PET_ACCESS_SCOPE_LABELS[scope]}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {assessment.conflicts.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[#e5bdb7] bg-[#fff1ef] p-4 text-sm leading-6 text-[#704b45]" role="alert">
          <p className="font-extrabold">상충하는 원문 안내</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {assessment.conflicts.map((conflict) => <li key={conflict.id}>{conflict.summary}</li>)}
          </ul>
        </div>
      ) : null}

      {assessment.verificationItems.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-black text-[#344a40]">방문 전 확인할 내용</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[#52665b]">
            {assessment.verificationItems.map((item) => <li key={item.code}>{item.label}</li>)}
          </ul>
        </div>
      ) : null}

      {assessment.evidence.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-black text-[#344a40]">한국관광공사 제공 근거</h3>
          <dl className="mt-3 space-y-3">
            {assessment.evidence.map((evidence) => (
              <div key={evidence.id} className="rounded-2xl border border-[#dce6df] bg-white p-4">
                <dt className="text-xs font-extrabold text-[#607269]">
                  {evidence.fieldLabel} · {ASSERTION_LABELS[evidence.assertion]}
                </dt>
                <dd className="mt-2 whitespace-pre-line text-sm leading-6 text-[#344a40]">
                  {evidence.originalText}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-[#f3f5f3] p-4 text-sm font-semibold leading-6 text-[#68776f]">
          판단에 사용할 수 있는 명시적인 반려동물 동반 원문이 없습니다.
        </p>
      )}

      <div className="mt-5 border-t border-[#dce6df] pt-4 text-xs leading-6 text-[#6b7972]">
        <p>제공처: Korea Tourism Organization</p>
        {assessment.sources.map((source) => (
          <p key={source.operation}>
            {source.operation}: {source.status}
            {sourceDate(source.retrievedAt)
              ? ` · 조회 ${sourceDate(source.retrievedAt)}`
              : ""}
            {sourceDate(source.providerModifiedTime) ? ` · 제공처 수정 ${sourceDate(source.providerModifiedTime)}` : ""}
          </p>
        ))}
        <details className="mt-2">
          <summary className="cursor-pointer font-bold">평가 정보</summary>
          <p className="mt-1">규칙 버전: {assessment.rulesetVersion}</p>
          <p>평가 시각: {assessment.evaluatedAt}</p>
        </details>
      </div>

      <p className="mt-5 rounded-2xl bg-[#fff8f1] p-4 text-sm font-semibold leading-6 text-[#6a5547]">
        한국관광공사 제공 정보를 바탕으로 한 안내이며, 시설 운영 정책은 변경될 수 있으니 방문 전 해당 시설에 확인해 주세요.
      </p>
    </section>
  );
}
