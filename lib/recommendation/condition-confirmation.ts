import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { editSessionSigningKey } from "./edit-session";
import { recommendationHistoryContextKeyV2 as hash } from "./v2/novelty-history";
import type { CanonicalPetConditionEligibility, CanonicalPetConditionItem } from "@/types/pet-condition-eligibility";
import type { ConditionAnswer, ConditionQuestion, RouteRecommendationRequest } from "@/types/recommendation";

export interface ConfirmationPayload {
  context: string;
  expiresAt: number;
  route: string[];
  questions: string[];
  confirmed: string[];
}

export function confirmedRequirementsForRoute(
  payload: ConfirmationPayload | null,
  route: string[],
  confirmed: ReadonlySet<string>,
): string[] {
  return payload?.route.length === route.length &&
    payload.route.every((placeId, index) => placeId === route[index])
    ? [...confirmed]
    : [];
}

function context(request: RouteRecommendationRequest): string {
  return hash({ pet: request.pet, trip: request.trip, departure: request.departure,
    selected: request.selectedPlaceIds ?? [], autoFill: request.autoFill ?? true,
    exclusions: request.personalization?.explicitlyExcludedPlaceIds ?? [],
    petCount: request.personalization?.petCount ?? 1 });
}

export function conditionQuestions(placeId: string, analysis: CanonicalPetConditionEligibility): ConditionQuestion[] {
  const items = analysis.confirmationRequiredConditions.length ? analysis.confirmationRequiredConditions
    : analysis.state === "insufficient_evidence" ? [{ code: "operator_confirmation_required", sourceType: "verification_item",
      label: "업체에 이 반려동물의 입장 가능 여부를 직접 확인했나요?", sourceText: analysis.warnings.map(({ sourceText }) => sourceText).filter(Boolean).join("\n") || "확인 가능한 동반 정책 원문 없음",
      scope: "unknown", evidenceIds: [] } satisfies CanonicalPetConditionItem] : [];
  return items.map((item) => ({
    requirementId: hash({ placeId, item, policy: analysis.version, sources: analysis.evidenceSources.map(({ operation, status, providerModifiedTime }) => ({ operation, status, providerModifiedTime })) }),
    placeId, label: item.label, sourceText: item.sourceText,
    answers: item.subject === "dangerous_dog" && /불가|금지/.test(item.sourceText)
      ? ["not_applicable", "cannot_meet"]
      : item.subject === "dangerous_dog" ? ["confirmed", "not_applicable", "cannot_meet"] : ["confirmed", "cannot_meet"],
  }));
}

export function createConditionConfirmation(request: RouteRecommendationRequest, route: string[], questions: ConditionQuestion[], now: number, secret?: string, confirmed: string[] = []): string {
  const encoded = Buffer.from(JSON.stringify({ context: context(request), expiresAt: now + 20 * 60_000,
    route, questions: questions.map(({ requirementId }) => requirementId), confirmed } satisfies ConfirmationPayload)).toString("base64url");
  const signature = createHmac("sha256", editSessionSigningKey(secret)).update(`conditions-v2.${encoded}`).digest("base64url");
  return `conditions-v2.${encoded}.${signature}`;
}

export function readConditionConfirmation(request: RouteRecommendationRequest, now: number, secret?: string): ConfirmationPayload | null {
  const token = request.conditionConfirmation?.token;
  if (!token || token.length > 24_000) return null;
  const [version, encoded, signature, extra] = token.split(".");
  if (version !== "conditions-v2" || !encoded || !signature || extra) return null;
  const expected = createHmac("sha256", editSessionSigningKey(secret)).update(`${version}.${encoded}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString()) as ConfirmationPayload;
    return value.context === context(request) && value.expiresAt > now && Array.isArray(value.route) && Array.isArray(value.questions) ? value : null;
  } catch { return null; }
}

export function applyConditionAnswers(placeId: string, analysis: CanonicalPetConditionEligibility, payload: ConfirmationPayload | null, answers: ConditionAnswer[]): { analysis: CanonicalPetConditionEligibility; acknowledged: boolean } {
  if (!payload || analysis.state === "ineligible") return { analysis, acknowledged: false };
  const questions = conditionQuestions(placeId, analysis);
  const accepted = new Set<string>(payload.confirmed ?? []);
  for (const question of questions) {
    const answer = answers.find(({ requirementId }) => requirementId === question.requirementId)?.answer;
    if (!answer || !payload.questions.includes(question.requirementId) || !question.answers.includes(answer)) continue;
    if (answer === "cannot_meet") return { analysis: { ...analysis, state: "ineligible", reasonCodes: [...analysis.reasonCodes, "pet_profile_conflict"] }, acknowledged: false };
    accepted.add(question.requirementId);
  }
  const remaining = analysis.confirmationRequiredConditions.filter((_, index) => !accepted.has(questions[index]!.requirementId));
  const acknowledged = questions.length > 0 && questions.every(({ requirementId }) => accepted.has(requirementId));
  // A user's facility check never upgrades missing provider evidence into verified evidence.
  if (analysis.state === "insufficient_evidence") return { analysis, acknowledged };
  return { analysis: { ...analysis, state: remaining.length ? "eligible_with_confirmation" : "eligible",
    satisfiedConditions: [...analysis.satisfiedConditions, ...analysis.confirmationRequiredConditions.filter((item) => !remaining.includes(item))],
    confirmationRequiredConditions: remaining, unsupportedConditions: analysis.unsupportedConditions.filter((item) => remaining.includes(item)),
    warnings: analysis.warnings.filter(({ sourceText }) => !analysis.confirmationRequiredConditions.some((item) => !remaining.includes(item) && item.sourceText === sourceText)),
    reasonCodes: remaining.length ? analysis.reasonCodes : analysis.reasonCodes.filter((code) => code !== "manual_confirmation_required" && code !== "unsupported_mandatory_condition"),
  }, acknowledged };
}
