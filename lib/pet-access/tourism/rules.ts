import { PET_ACCESS_LIMITS } from "@/lib/pet-access/tourism/constants";
import type {
  TourPetAccessCondition,
  TourPetAccessConflict,
  TourPetAccessEvidence,
  TourPetAccessReasonCode,
  TourPetAccessScope,
  TourPetAccessVerdict,
} from "@/types/tour-pet-access";

export interface TourPetAccessDecision {
  verdict: TourPetAccessVerdict;
  reasonCodes: TourPetAccessReasonCode[];
  permittedScopes: TourPetAccessScope[];
  restrictedScopes: TourPetAccessScope[];
  conflicts: TourPetAccessConflict[];
}

function uniqueScopes(evidence: TourPetAccessEvidence[]): TourPetAccessScope[] {
  return [...new Set(evidence.map((item) => item.scope))];
}

function buildConflicts(evidence: TourPetAccessEvidence[]): TourPetAccessConflict[] {
  const conflicts: TourPetAccessConflict[] = [];
  const scopes = uniqueScopes(
    evidence.filter(
      (item) => item.assertion === "allows" || item.assertion === "denies",
    ),
  );
  for (const scope of scopes) {
    const matching = evidence.filter(
      (item) =>
        item.scope === scope &&
        (item.assertion === "allows" || item.assertion === "denies"),
    );
    if (
      matching.some((item) => item.assertion === "allows") &&
      matching.some((item) => item.assertion === "denies")
    ) {
      conflicts.push({
        id: `scope-conflict:${scope}`,
        scope,
        evidenceIds: matching.map((item) => item.id),
        summary: "같은 이용 범위에 대해 동반 가능과 불가 안내가 함께 제공되었습니다.",
      });
    }
  }
  return conflicts.slice(0, PET_ACCESS_LIMITS.conflicts);
}

export function resolveTourPetAccessDecision(
  evidence: TourPetAccessEvidence[],
  conditions: TourPetAccessCondition[],
): TourPetAccessDecision {
  const allowances = evidence.filter((item) => item.assertion === "allows");
  const denials = evidence.filter((item) => item.assertion === "denies");
  const permittedScopes = uniqueScopes(allowances);
  const restrictedScopes = uniqueScopes(denials);
  const conflicts = buildConflicts(evidence);
  const conflictScopes = new Set(conflicts.map((conflict) => conflict.scope));
  const reasons: TourPetAccessReasonCode[] = [];

  if (conflicts.length > 0) {
    reasons.push("same_scope_conflict");
    const narrowerAllowedScope = permittedScopes.some(
      (scope) => scope !== "whole_place" && !conflictScopes.has(scope),
    );
    if (!narrowerAllowedScope) {
      return {
        verdict: "unknown",
        reasonCodes: reasons,
        permittedScopes,
        restrictedScopes,
        conflicts,
      };
    }
  }

  const hasWholePlaceDenial = restrictedScopes.includes("whole_place");
  if (hasWholePlaceDenial && permittedScopes.length === 0) {
    reasons.push("explicit_denial");
    return {
      verdict: "not_allowed",
      reasonCodes: reasons,
      permittedScopes,
      restrictedScopes,
      conflicts,
    };
  }

  if (allowances.length > 0) {
    reasons.push("explicit_allowance");
    const materialConditions = conditions.filter(
      (condition) => condition.type !== "assistance_animal_exception",
    );
    const limitedScope = permittedScopes.some((scope) => scope !== "whole_place");
    if (limitedScope || restrictedScopes.length > 0 || conflicts.length > 0) {
      reasons.push("limited_scope");
    }
    if (materialConditions.length > 0) reasons.push("material_condition");
    return {
      verdict:
        limitedScope ||
        restrictedScopes.length > 0 ||
        materialConditions.length > 0 ||
        conflicts.length > 0
          ? "conditional"
          : "allowed",
      reasonCodes: reasons,
      permittedScopes,
      restrictedScopes,
      conflicts,
    };
  }

  return {
    verdict: "unknown",
    reasonCodes: reasons,
    permittedScopes,
    restrictedScopes,
    conflicts,
  };
}
