import {
  PLACE_TRUST_RULES,
  PLACE_TRUST_RULE_VERSION,
} from "@/lib/trust/rules";
import type {
  PlaceTrustComponent,
  PlaceTrustResult,
  PlaceTrustSignalInput,
} from "@/types/place-source";

const DAY_MS = 24 * 60 * 60 * 1_000;

function ageInDays(value: string, now: string): number {
  const timestamp = Date.parse(value);
  const current = Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return Infinity;
  return Math.max(0, Math.floor((current - timestamp) / DAY_MS));
}

function levelFor(score: number): PlaceTrustResult["level"] {
  if (score >= PLACE_TRUST_RULES.levels.high) return "high";
  if (score >= PLACE_TRUST_RULES.levels.medium) return "medium";
  return "low";
}

export function computePlaceTrust(
  input: PlaceTrustSignalInput,
): PlaceTrustResult {
  const components: PlaceTrustComponent[] = [];
  const flags = new Set<PlaceTrustResult["flags"][number]>();

  if (input.hasAnySource) {
    components.push({
      code: "source_baseline",
      label: "식별 가능한 출처 기록",
      points: PLACE_TRUST_RULES.sourceBaseline,
      kind: "context",
    });
  }

  if (input.tourism) {
    components.push(
      input.tourism.hasPetSpecificEvidence
        ? {
            code: "tourism_pet_evidence",
            label: "한국관광공사 반려동물 원문",
            points: PLACE_TRUST_RULES.tourismPetEvidence,
            kind: "evidence",
            observedAt: input.tourism.retrievedAt,
          }
        : {
            code: "tourism_without_pet_evidence",
            label: "한국관광공사 장소 원문(반려동물 근거 미확인)",
            points: PLACE_TRUST_RULES.tourismWithoutPetEvidence,
            kind: "context",
            observedAt: input.tourism.retrievedAt,
          },
    );
    if (
      ageInDays(input.tourism.retrievedAt, input.computedAt) >
      PLACE_TRUST_RULES.currentAgeDays.tourism
    ) {
      components.push({
        code: "stale_verification",
        label: "관광공사 조회 시점이 오래됨",
        points: PLACE_TRUST_RULES.staleVerificationPenalty,
        kind: "penalty",
        observedAt: input.tourism.retrievedAt,
      });
    }
  }

  const confirmations = [
    {
      value: input.businessConfirmation,
      code: "business_confirmation" as const,
      label: "업체 확인",
      points: PLACE_TRUST_RULES.businessConfirmation,
      maxAge: PLACE_TRUST_RULES.currentAgeDays.business,
    },
    {
      value: input.administratorConfirmation,
      code: "administrator_confirmation" as const,
      label: "관리자 확인",
      points: PLACE_TRUST_RULES.administratorConfirmation,
      maxAge: PLACE_TRUST_RULES.currentAgeDays.administrator,
    },
  ];
  for (const confirmation of confirmations) {
    if (!confirmation.value) continue;
    components.push({
      code: confirmation.code,
      label: confirmation.label,
      points: confirmation.points,
      kind: "evidence",
      observedAt: confirmation.value.verifiedAt,
    });
    if (
      ageInDays(confirmation.value.verifiedAt, input.computedAt) >
      confirmation.maxAge
    ) {
      components.push({
        code: "stale_verification",
        label: `${confirmation.label} 날짜가 오래됨`,
        points: PLACE_TRUST_RULES.staleVerificationPenalty,
        kind: "penalty",
        observedAt: confirmation.value.verifiedAt,
      });
    }
  }

  for (const report of (input.consistentUserReports ?? []).slice(
    0,
    PLACE_TRUST_RULES.maxUserReports,
  )) {
    components.push({
      code: "consistent_user_report",
      label: "최근의 일관된 이용자 제보",
      points: PLACE_TRUST_RULES.consistentUserReport,
      kind: "evidence",
      observedAt: report.observedAt,
    });
    if (
      ageInDays(report.observedAt, input.computedAt) >
      PLACE_TRUST_RULES.currentAgeDays.userReport
    ) {
      components.push({
        code: "stale_verification",
        label: "이용자 제보 관찰일이 오래됨",
        points: PLACE_TRUST_RULES.staleVerificationPenalty,
        kind: "penalty",
        observedAt: report.observedAt,
      });
    }
  }

  if (input.kakaoDiscoveryOnly) {
    components.push({
      code: "kakao_discovery_baseline",
      label: "카카오 장소 검색 메타데이터",
      points: PLACE_TRUST_RULES.kakaoDiscoveryBaseline,
      kind: "context",
    });
    flags.add("verification_required");
  }

  const sourceConflictCount = Math.min(
    input.sourceConflictCount ?? 0,
    PLACE_TRUST_RULES.maxConflictPenaltyCount,
  );
  if (sourceConflictCount > 0) {
    components.push({
      code: "source_conflict",
      label: `상충하는 출처 ${sourceConflictCount}건`,
      points: PLACE_TRUST_RULES.sourceConflictPenalty * sourceConflictCount,
      kind: "penalty",
    });
    flags.add("conflicting_sources");
  }

  if (input.licensingOperatingState === "closed") {
    components.push({
      code: "closed_license_flag",
      label: "인허가 영업 종료 상태와 장소 정보가 충돌함",
      points: PLACE_TRUST_RULES.closedLicensePenalty,
      kind: "flag",
    });
    flags.add("operational_status_conflict");
  }

  const hasEvidence = components.some(({ kind }) => kind === "evidence");
  if (!hasEvidence) {
    components.push({
      code: "missing_evidence",
      label: "확인 가능한 반려동물 근거 없음",
      points: PLACE_TRUST_RULES.missingEvidencePenalty,
      kind: "penalty",
    });
    flags.add("missing_evidence");
  }

  let score = components.reduce((sum, component) => sum + component.points, 0);
  score = Math.max(0, Math.min(100, score));
  if (input.kakaoDiscoveryOnly) {
    score = Math.min(score, PLACE_TRUST_RULES.kakaoOnlyMaximum);
  }

  return {
    ruleVersion: PLACE_TRUST_RULE_VERSION,
    score,
    level: levelFor(score),
    evidenceCount: components.filter(({ kind }) => kind === "evidence").length,
    computedAt: input.computedAt,
    components,
    flags: [...flags],
  };
}
