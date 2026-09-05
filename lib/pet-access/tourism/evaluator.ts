import {
  INTRO_PET_FIELD_BY_CONTENT_TYPE,
  INTRO_PET_FIELD_LABELS,
  PET_ACCESS_LIMITS,
  PET_ACCESS_RULESET_VERSION,
  PET_POLICY_FIELD_LABELS,
  PET_POLICY_FIELD_PRIORITY,
  VERIFIED_COMPANION_TYPE_CODES,
} from "@/lib/pet-access/tourism/constants";
import {
  extractPolicyClause,
  type ExtractedCondition,
} from "@/lib/pet-access/tourism/extractor";
import {
  normalizeProviderPolicyText,
  splitPolicyClauses,
} from "@/lib/pet-access/tourism/normalizers";
import { resolveTourPetAccessDecision } from "@/lib/pet-access/tourism/rules";
import { TOUR_CONTENT_TYPE_IDS, type TourPlaceDetail } from "@/types/place";
import type {
  TourContentTypeId,
  TourIntroPetPolicyEvidence,
  TourPetPolicyEvidence,
  TourPetPolicyFields,
} from "@/types/place";
import type {
  TourPetAccessAssessment,
  TourPetAccessCondition,
  TourPetAccessConfidence,
  TourPetAccessEvidence,
  TourPetAccessReasonCode,
  TourPetAccessSemanticAssessment,
  TourPetAccessSourceState,
  TourPetAccessVerificationItem,
} from "@/types/tour-pet-access";

export interface TrustedTourPetAccessInput {
  contentId: string;
  providerContentTypeId: string | null;
  retrievedAt: string;
  providerModifiedTime: string | null;
  primary: {
    status: "available" | "unavailable";
    evidence: TourPetPolicyEvidence | null;
  };
  fallback: {
    status: "available" | "unavailable";
    evidence: TourIntroPetPolicyEvidence | null;
  };
}

interface EvidenceBuildState {
  evidence: TourPetAccessEvidence[];
  conditions: TourPetAccessCondition[];
  warnings: string[];
  unknownStructuredCode: boolean;
  primaryRawFieldCount: number;
  fallbackRawFieldCount: number;
}

function isSupportedProviderContentType(
  value: string | null,
): value is TourContentTypeId {
  return TOUR_CONTENT_TYPE_IDS.includes(value as TourContentTypeId);
}

function conditionKey(condition: TourPetAccessCondition): string {
  return [
    condition.type,
    condition.scope,
    condition.subject ?? "unknown",
    condition.structuredValue?.value ?? "",
    condition.structuredValue?.unit ?? "",
    condition.structuredValue?.comparator ?? "",
  ].join(":");
}

function addCondition(
  state: EvidenceBuildState,
  extracted: ExtractedCondition,
  evidenceId: string,
  scope: TourPetAccessCondition["scope"],
): void {
  const candidate: TourPetAccessCondition = {
    ...extracted,
    scope,
    evidenceIds: [evidenceId],
  };
  const key = conditionKey(candidate);
  const existing = state.conditions.find((item) => conditionKey(item) === key);
  if (existing) {
    if (!existing.evidenceIds.includes(evidenceId)) existing.evidenceIds.push(evidenceId);
    existing.manualConfirmationRecommended ||= candidate.manualConfirmationRecommended;
    return;
  }
  if (state.conditions.length < PET_ACCESS_LIMITS.conditions) {
    state.conditions.push(candidate);
  }
}

function addTextFieldEvidence(
  state: EvidenceBuildState,
  input: {
    operation: "detailPetTour2" | "detailIntro2";
    field: string;
    fieldLabel: string;
    value: string;
    priority: 2 | 3 | 4;
    providerModifiedTime: string | null;
  },
): void {
  const normalized = normalizeProviderPolicyText(input.value);
  if (!normalized) return;
  if (normalized.truncated) {
    state.warnings.push(`${input.fieldLabel} 원문이 안전한 최대 길이로 제한되었습니다.`);
  }
  const clauses = splitPolicyClauses(normalized);
  clauses.forEach((clause, clauseIndex) => {
    if (state.evidence.length >= PET_ACCESS_LIMITS.evidence) return;
    const extracted = extractPolicyClause(clause);
    if (
      input.priority === 4 &&
      extracted.assertion !== "allows" &&
      extracted.assertion !== "denies"
    ) {
      return;
    }
    const id = `${input.operation}:${input.field}:${clauseIndex + 1}`;
    state.evidence.push({
      id,
      operation: input.operation,
      field: input.field,
      fieldLabel: input.fieldLabel,
      originalText: clause.originalText,
      assertion: extracted.assertion,
      scope: extracted.scope,
      priority: input.priority,
      providerModifiedTime: input.providerModifiedTime,
    });
    extracted.conditions.forEach((condition) =>
      addCondition(state, condition, id, extracted.scope),
    );
  });
}

function addStructuredCodeEvidence(
  state: EvidenceBuildState,
  value: string,
  providerModifiedTime: string | null,
): void {
  const normalized = normalizeProviderPolicyText(value);
  if (!normalized || state.evidence.length >= PET_ACCESS_LIMITS.evidence) return;
  const mapped =
    VERIFIED_COMPANION_TYPE_CODES[
      normalized.normalizedText as keyof typeof VERIFIED_COMPANION_TYPE_CODES
    ];
  state.evidence.push({
    id: "detailPetTour2:acmpyTypeCd:1",
    operation: "detailPetTour2",
    field: "acmpyTypeCd",
    fieldLabel: PET_POLICY_FIELD_LABELS.acmpyTypeCd,
    originalText: normalized.originalText.slice(
      0,
      PET_ACCESS_LIMITS.evidenceWordingCharacters,
    ),
    assertion: mapped?.assertion ?? "unknown",
    scope: mapped?.scope ?? "unknown",
    priority: 1,
    providerModifiedTime,
  });
  if (!mapped) state.unknownStructuredCode = true;
}

function collectPrimaryEvidence(
  state: EvidenceBuildState,
  evidence: TourPetPolicyEvidence | null,
): void {
  if (!evidence) return;
  const fields = evidence.fields;
  for (const [field, value] of Object.entries(fields) as Array<
    [keyof TourPetPolicyFields, string | null]
  >) {
    if (!value?.trim()) continue;
    state.primaryRawFieldCount += 1;
    if (field === "acmpyTypeCd") {
      addStructuredCodeEvidence(
        state,
        value,
        evidence.sourceEvidence.providerModifiedTime ?? null,
      );
      continue;
    }
    addTextFieldEvidence(state, {
      operation: "detailPetTour2",
      field,
      fieldLabel: PET_POLICY_FIELD_LABELS[field],
      value,
      priority: PET_POLICY_FIELD_PRIORITY[field] as 2 | 4,
      providerModifiedTime: evidence.sourceEvidence.providerModifiedTime ?? null,
    });
  }
}

function collectFallbackEvidence(
  state: EvidenceBuildState,
  providerContentTypeId: TourContentTypeId,
  evidence: TourIntroPetPolicyEvidence | null,
): void {
  if (!evidence?.value.trim()) return;
  if (INTRO_PET_FIELD_BY_CONTENT_TYPE[providerContentTypeId] !== evidence.field) return;
  state.fallbackRawFieldCount += 1;
  addTextFieldEvidence(state, {
    operation: "detailIntro2",
    field: evidence.field,
    fieldLabel: INTRO_PET_FIELD_LABELS[evidence.field],
    value: evidence.value,
    priority: 3,
    providerModifiedTime: evidence.sourceEvidence.providerModifiedTime ?? null,
  });
}

function sourceStates(
  input: TrustedTourPetAccessInput,
): TourPetAccessSourceState[] {
  const primaryHasRecognizedValue = Object.values(
    input.primary.evidence?.fields ?? {},
  ).some((value) => Boolean(value?.trim()));
  const fallbackHasRecognizedValue = Boolean(
    input.fallback.evidence?.value.trim(),
  );

  return [
    {
      operation: "detailPetTour2",
      status:
        input.primary.status === "unavailable"
          ? "unavailable"
          : primaryHasRecognizedValue
            ? "available"
            : "empty",
      retrievedAt:
        input.primary.evidence?.sourceEvidence.retrievedAt ?? input.retrievedAt,
      providerModifiedTime:
        input.primary.evidence?.sourceEvidence.providerModifiedTime ?? null,
    },
    {
      operation: "detailIntro2",
      status:
        input.fallback.status === "unavailable"
          ? "unavailable"
          : fallbackHasRecognizedValue
            ? "available"
            : "empty",
      retrievedAt:
        input.fallback.evidence?.sourceEvidence.retrievedAt ?? input.retrievedAt,
      providerModifiedTime:
        input.fallback.evidence?.sourceEvidence.providerModifiedTime ?? null,
    },
  ];
}

function confidenceFor(
  verdict: TourPetAccessSemanticAssessment["verdict"],
  evaluationState: TourPetAccessSemanticAssessment["evaluationState"],
  evidence: TourPetAccessEvidence[],
  conflicts: TourPetAccessSemanticAssessment["conflicts"],
): TourPetAccessConfidence {
  if (verdict === "unknown" || conflicts.length > 0) return "low";
  if (evaluationState === "partial") return "medium";
  const decisivePrimary = evidence.filter(
    (item) =>
      item.operation === "detailPetTour2" &&
      (item.assertion === "allows" || item.assertion === "denies"),
  );
  if (decisivePrimary.some((item) => item.priority === 1) || decisivePrimary.length > 1) {
    return "high";
  }
  return "medium";
}

function summaryFor(
  verdict: TourPetAccessSemanticAssessment["verdict"],
  reasons: TourPetAccessReasonCode[],
): string {
  if (verdict === "allowed") {
    return "한국관광공사 제공 정보에 제한 없는 반려동물 동반이 명시되어 있습니다.";
  }
  if (verdict === "conditional") {
    return "한국관광공사 제공 정보에 반려동물 동반 조건 또는 이용 범위 제한이 명시되어 있습니다.";
  }
  if (verdict === "not_allowed") {
    return "한국관광공사 제공 정보에서 일반 반려동물의 동반이 불가한 것으로 안내됩니다.";
  }
  if (reasons.includes("unsupported_record")) {
    return "지원 대상인 현재 관광 콘텐츠 유형인지 확인할 수 없습니다.";
  }
  if (reasons.includes("primary_source_unavailable")) {
    return "반려동물 정책 원문을 불러오지 못해 동반 여부를 판단할 수 없습니다.";
  }
  if (reasons.includes("same_scope_conflict")) {
    return "같은 이용 범위에 대한 동반 가능과 불가 안내가 함께 있어 확인이 필요합니다.";
  }
  if (reasons.includes("inquiry_only")) {
    return "제공 정보가 시설 문의를 요구하며 동반 가능 여부를 명시하지 않았습니다.";
  }
  if (reasons.includes("unknown_structured_code")) {
    return "확인되지 않은 제공기관 동반 유형 값으로 인해 판단할 수 없습니다.";
  }
  return "명시적인 반려동물 동반 가능 또는 불가 근거를 찾지 못했습니다.";
}

function buildVerificationItems(
  reasons: TourPetAccessReasonCode[],
  evidence: TourPetAccessEvidence[],
  conflicts: TourPetAccessSemanticAssessment["conflicts"],
): TourPetAccessVerificationItem[] {
  const items: TourPetAccessVerificationItem[] = [];
  if (conflicts.length > 0) {
    items.push({
      code: "confirm_conflicting_policy",
      label: "상충하는 동반 안내 중 현재 적용되는 정책을 시설에 확인해 주세요.",
      evidenceIds: conflicts.flatMap((conflict) => conflict.evidenceIds),
    });
  }
  if (reasons.includes("unknown_structured_code")) {
    items.push({
      code: "confirm_unknown_provider_code",
      label: "제공기관 동반 유형 값의 현재 의미를 시설에 확인해 주세요.",
      evidenceIds: evidence
        .filter((item) => item.field === "acmpyTypeCd")
        .map((item) => item.id),
    });
  }
  if (reasons.includes("primary_source_unavailable")) {
    items.push({
      code: "confirm_missing_source",
      label: "반려동물 정책 원문을 불러오지 못했으므로 방문 전에 시설에 확인해 주세요.",
      evidenceIds: [],
    });
  }
  if (
    items.length === 0 &&
    (reasons.includes("inquiry_only") || reasons.includes("no_meaningful_evidence"))
  ) {
    items.push({
      code: "confirm_current_policy",
      label: "방문 전에 현재 반려동물 동반 정책을 시설에 확인해 주세요.",
      evidenceIds: evidence.map((item) => item.id),
    });
  }
  return items.slice(0, PET_ACCESS_LIMITS.verificationItems);
}

export function createTrustedTourPetAccessInput(
  detail: TourPlaceDetail,
): TrustedTourPetAccessInput {
  return {
    contentId: detail.summary.contentId,
    providerContentTypeId: detail.summary.providerContentTypeId,
    retrievedAt: detail.source.retrievedAt,
    providerModifiedTime: detail.providerModifiedTime,
    primary: {
      status:
        detail.sections.petPolicy.status === "unavailable"
          ? "unavailable"
          : "available",
      evidence: detail.petPolicyEvidence,
    },
    fallback: {
      status:
        detail.sections.intro.status === "unavailable" ? "unavailable" : "available",
      evidence: detail.introPetPolicyEvidence,
    },
  };
}

export function evaluateTourPetAccess(
  input: TrustedTourPetAccessInput,
): TourPetAccessSemanticAssessment {
  const state: EvidenceBuildState = {
    evidence: [],
    conditions: [],
    warnings: [],
    unknownStructuredCode: false,
    primaryRawFieldCount: 0,
    fallbackRawFieldCount: 0,
  };

  if (!isSupportedProviderContentType(input.providerContentTypeId)) {
    const reasons: TourPetAccessReasonCode[] = ["unsupported_record"];
    return {
      rulesetVersion: PET_ACCESS_RULESET_VERSION,
      verdict: "unknown",
      evaluationState: "not_applicable",
      confidence: "low",
      reasonCodes: reasons,
      summary: summaryFor("unknown", reasons),
      permittedScopes: [],
      restrictedScopes: [],
      conditions: [],
      evidence: [],
      conflicts: [],
      verificationItems: [],
      providerModifiedTime: input.providerModifiedTime,
      sources: sourceStates(input),
      warnings: ["지원되지 않거나 제공기관 유형을 확인할 수 없는 관광 기록입니다."],
    };
  }

  collectPrimaryEvidence(state, input.primary.evidence);
  collectFallbackEvidence(state, input.providerContentTypeId, input.fallback.evidence);
  const decision = resolveTourPetAccessDecision(state.evidence, state.conditions);
  const reasons: TourPetAccessReasonCode[] = [...decision.reasonCodes];
  const hasInquiry = state.evidence.some((item) => item.assertion === "inquiry_only");
  const usableFallback = state.evidence.some(
    (item) => item.operation === "detailIntro2" && item.assertion !== "unknown",
  );
  const decisivePrimaryEvidence = state.evidence.some(
    (item) =>
      item.operation === "detailPetTour2" &&
      (item.assertion === "allows" || item.assertion === "denies"),
  );

  let evaluationState: TourPetAccessSemanticAssessment["evaluationState"];
  if (input.primary.status === "unavailable") {
    reasons.push("primary_source_unavailable");
    if (usableFallback) {
      evaluationState = "partial";
      reasons.push("secondary_fallback_used");
      state.warnings.push(
        "detailPetTour2 원문을 불러오지 못해 detailIntro2의 반려동물 전용 항목으로 부분 평가했습니다.",
      );
    } else {
      evaluationState = "unavailable";
      state.warnings.push("detailPetTour2 원문을 불러오지 못했습니다.");
    }
  } else {
    evaluationState = decisivePrimaryEvidence
      ? "complete"
      : "insufficient_evidence";
  }

  if (state.unknownStructuredCode) reasons.push("unknown_structured_code");
  if (hasInquiry && decision.verdict === "unknown") reasons.push("inquiry_only");
  if (decision.verdict === "unknown" && reasons.length === 0) {
    reasons.push("no_meaningful_evidence");
  } else if (
    decision.verdict === "unknown" &&
    !reasons.some((reason) =>
      [
        "same_scope_conflict",
        "inquiry_only",
        "primary_source_unavailable",
        "unknown_structured_code",
      ].includes(reason),
    )
  ) {
    reasons.push("no_meaningful_evidence");
  }

  const uniqueReasons = [...new Set(reasons)];
  const verdict =
    evaluationState === "unavailable" && !usableFallback
      ? "unknown"
      : decision.verdict;
  const conflicts = decision.conflicts;
  return {
    rulesetVersion: PET_ACCESS_RULESET_VERSION,
    verdict,
    evaluationState,
    confidence: confidenceFor(verdict, evaluationState, state.evidence, conflicts),
    reasonCodes: uniqueReasons,
    summary: summaryFor(verdict, uniqueReasons),
    permittedScopes: decision.permittedScopes,
    restrictedScopes: decision.restrictedScopes,
    conditions: state.conditions.slice(0, PET_ACCESS_LIMITS.conditions),
    evidence: state.evidence.slice(0, PET_ACCESS_LIMITS.evidence),
    conflicts,
    verificationItems: buildVerificationItems(
      uniqueReasons,
      state.evidence,
      conflicts,
    ),
    providerModifiedTime: input.providerModifiedTime,
    sources: sourceStates(input),
    warnings: [...new Set(state.warnings)],
  };
}

export function attachTourPetAccessEvaluationTime(
  assessment: TourPetAccessSemanticAssessment,
  evaluatedAt: string,
): TourPetAccessAssessment {
  return { ...assessment, evaluatedAt };
}
