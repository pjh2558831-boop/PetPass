import {
  Ban,
  CircleAlert,
  CircleCheckBig,
  CircleHelp,
} from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { TOUR_PET_ACCESS_SCOPE_LABELS } from "@/lib/pet-access/tourism/constants";
import { tourPetAccessVerdictLabel } from "@/lib/pet-access/tourism/verdict-label";
import type {
  TourPetAccessAssessment,
  TourPetAccessAssertion,
  TourPetAccessEvaluationState,
} from "@/types/tour-pet-access";
import type { RegionId } from "@/types/region";

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
    ? value.slice(0, 4) + "-" + value.slice(4, 6) + "-" + value.slice(6, 8)
    : value.slice(0, 10);
}

export function PetAccessDecisionSummary({
  assessment,
  regionId,
}: {
  assessment: TourPetAccessAssessment;
  regionId: RegionId;
}) {
  const VerdictIcon = VERDICT_ICONS[assessment.verdict];
  const visibleConditions = assessment.conditions.slice(0, 3);
  const remainingConditionCount = assessment.conditions.length - visibleConditions.length;

  return (
    <section
      className="place-detail-decision mt-5"
      aria-labelledby="pet-access-decision-heading"
    >
      <h2
        id="pet-access-decision-heading"
        className="text-base font-black tracking-[-0.025em] text-[#263c32]"
      >
        반려동물 동반 안내
      </h2>
      <div
        className={"place-detail-decision__summary mt-3 border p-4 " + VERDICT_STYLES[assessment.verdict]}
      >
        <p className="flex items-center gap-2 text-base font-black">
          <VerdictIcon
            aria-hidden="true"
            className="shrink-0"
            data-verdict-icon={assessment.verdict}
            size={20}
            strokeWidth={2.5}
          />
          {tourPetAccessVerdictLabel(assessment.verdict, regionId)}
        </p>
        <p className="mt-2 text-sm font-semibold leading-6">{assessment.summary}</p>
        <p className="mt-2 text-xs font-extrabold">
          {CONFIDENCE_LABELS[assessment.confidence]} · {STATE_LABELS[assessment.evaluationState]}
        </p>
      </div>

      {visibleConditions.length > 0 ? (
        <div className="place-detail-decision__conditions mt-3">
          <p className="text-xs font-extrabold text-[#68776f]">먼저 확인할 조건</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-[#315b48]">
            {visibleConditions.map((condition) => (
              <li key={condition.type + ":" + condition.evidenceIds.join(":")}>
                조건: {condition.label}
              </li>
            ))}
            {remainingConditionCount > 0 ? <li>외 {remainingConditionCount}개 조건</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function PetAccessAssessmentPanel({
  assessment,
}: {
  assessment: TourPetAccessAssessment;
}) {
  return (
    <section
      className="place-detail-pet-evidence"
      aria-labelledby="pet-access-evidence-heading"
    >
      <div className="place-detail-section-heading">
        <div>
          <h2
            id="pet-access-evidence-heading"
            className="text-xl font-black tracking-[-0.03em]"
          >
            동반 근거와 확인 사항
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#617168]">
            한국관광공사가 제공한 원문과 방문 전 확인할 조건을 함께 보여드립니다.
          </p>
        </div>
        <p className="text-xs font-extrabold text-[#607269]">
          원문 근거 {assessment.evidence.length}개
        </p>
      </div>

      {assessment.warnings.length > 0 ? (
        <div className="place-detail-callout mt-5" role="status">
          <p className="font-extrabold">자료 상태 안내</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {assessment.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      {assessment.conditions.length > 0 ? (
        <div className="place-detail-evidence-group">
          <h3>동반 조건</h3>
          <dl className="place-detail-definition-grid">
            {assessment.conditions.map((condition) => (
              <div key={condition.type + ":" + condition.evidenceIds.join(":")}>
                <dt>{condition.label}</dt>
                <dd>적용 범위: {TOUR_PET_ACCESS_SCOPE_LABELS[condition.scope]}</dd>
                <dd className="whitespace-pre-line">{condition.sourceText}</dd>
                {condition.manualConfirmationRecommended ? (
                  <dd className="place-detail-definition-grid__notice">
                    방문 전 세부 조건 확인 권장
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {assessment.permittedScopes.length > 0 || assessment.restrictedScopes.length > 0 ? (
        <div className="place-detail-scope-grid">
          {assessment.permittedScopes.length > 0 ? (
            <div data-tone="positive">
              <h3>동반 가능 범위</h3>
              <ul>
                {assessment.permittedScopes.map((scope) => (
                  <li key={scope}>{TOUR_PET_ACCESS_SCOPE_LABELS[scope]}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {assessment.restrictedScopes.length > 0 ? (
            <div data-tone="negative">
              <h3>동반 제한 범위</h3>
              <ul>
                {assessment.restrictedScopes.map((scope) => (
                  <li key={scope}>{TOUR_PET_ACCESS_SCOPE_LABELS[scope]}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {assessment.conflicts.length > 0 ? (
        <div className="place-detail-conflict mt-6" role="alert">
          <p className="font-extrabold">상충하는 원문 안내</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {assessment.conflicts.map((conflict) => (
              <li key={conflict.id}>{conflict.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.verificationItems.length > 0 ? (
        <div className="place-detail-evidence-group">
          <h3>방문 전 확인할 내용</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-[#52665b]">
            {assessment.verificationItems.map((item) => (
              <li key={item.code}>{item.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="place-detail-evidence-group">
        <h3>한국관광공사 제공 근거</h3>
        {assessment.evidence.length > 0 ? (
          <dl className="place-detail-source-rows">
            {assessment.evidence.map((evidence) => (
              <div key={evidence.id}>
                <dt>
                  {evidence.fieldLabel} · {ASSERTION_LABELS[evidence.assertion]}
                </dt>
                <dd className="whitespace-pre-line">{evidence.originalText}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm font-semibold leading-6 text-[#68776f]">
            판단에 사용할 수 있는 명시적인 반려동물 동반 원문이 없습니다.
          </p>
        )}
      </div>

      <p className="place-detail-policy-note mt-6">
        한국관광공사 제공 정보를 바탕으로 한 안내이며, 시설 운영 정책은 변경될 수 있으니 방문 전 해당 시설에 확인해 주세요.
      </p>
    </section>
  );
}

export function PetAccessTechnicalDisclosure({
  assessment,
}: {
  assessment: TourPetAccessAssessment;
}) {
  return (
    <Disclosure label="동반 평가 기술 정보" idPrefix="pet-access-technical">
      <div className="place-detail-technical-copy">
        <p>제공처: Korea Tourism Organization</p>
        {assessment.sources.map((source) => (
          <p key={source.operation}>
            {source.operation}: {source.status}
            {sourceDate(source.retrievedAt)
              ? " · 조회 " + sourceDate(source.retrievedAt)
              : ""}
            {sourceDate(source.providerModifiedTime)
              ? " · 제공처 수정 " + sourceDate(source.providerModifiedTime)
              : ""}
          </p>
        ))}
        <p className="mt-2">규칙 버전: {assessment.rulesetVersion}</p>
        <p>평가 시각: {assessment.evaluatedAt}</p>
        <p>
          {CONFIDENCE_LABELS[assessment.confidence]} · {STATE_LABELS[assessment.evaluationState]}
        </p>
      </div>
    </Disclosure>
  );
}
