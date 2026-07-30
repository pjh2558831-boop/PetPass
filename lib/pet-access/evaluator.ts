import type { PetAccessAssessment, PetPolicy } from "@/types/access";
import type { PetProfile } from "@/types/pet";

const ITEM_AVAILABILITY: Record<string, keyof PetProfile> = {
  이동장: "hasCarrier",
  목줄: "hasLeash",
  입마개: "hasMuzzle",
};

function contactAction(profile: PetProfile, phone?: string) {
  const sizeLabel = {
    SMALL: "소형",
    MEDIUM: "중형",
    LARGE: "대형",
  }[profile.size];

  return {
    label: "방문 전 전화 확인",
    href: phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined,
    suggestedQuestion: `${sizeLabel} 반려동물 한 마리와 방문 예정입니다. 현재 안내된 동반 구역과 준비 조건으로 이용 가능한가요?`,
  };
}

export function evaluatePetAccess(
  profile: PetProfile,
  policy: PetPolicy,
  metadata: { sourceName: string; retrievedAt: string; phone?: string },
): PetAccessAssessment {
  const base = {
    matchedUserConditions: [] as string[],
    requiredItems: [...policy.requiredItems],
    restrictions: [...policy.restrictions],
    originalSourceText: policy.originalText,
    sourceName: metadata.sourceName,
    retrievedAt: metadata.retrievedAt,
  };

  if (!policy.originalText || policy.isAmbiguous) {
    return {
      ...base,
      status: "NEEDS_CONFIRMATION",
      reason: "핵심 동반 규정이 없거나 모호해 방문 전 확인이 필요해요.",
      contactAction: contactAction(profile, metadata.phone),
    };
  }

  if (
    policy.allowedSpecies.length > 0 &&
    !policy.allowedSpecies.includes(profile.species)
  ) {
    return {
      ...base,
      status: "NOT_MATCHED",
      reason: "원문에 명시된 동반 가능 동물과 현재 반려동물이 일치하지 않아요.",
    };
  }

  base.matchedUserConditions.push("동반 가능 동물 조건 일치");

  if (policy.allowedSizes.length > 0 && !policy.allowedSizes.includes(profile.size)) {
    return {
      ...base,
      status: "NOT_MATCHED",
      reason: "원문에 명시된 크기 제한과 현재 반려동물 크기가 맞지 않아요.",
    };
  }

  if (policy.allowedSizes.length > 0) {
    base.matchedUserConditions.push("크기 조건 일치");
  }

  if (
    policy.allowedAreas.some((area) => area.includes("야외")) &&
    !profile.acceptsOutdoorOnly
  ) {
    return {
      ...base,
      status: "NOT_MATCHED",
      reason: "야외 공간만 이용 가능하지만 실내 이용을 원하고 있어요.",
    };
  }

  const missingItems = policy.requiredItems.filter((item) => {
    const field = ITEM_AVAILABILITY[item];
    return field ? profile[field] !== true : false;
  });

  if (missingItems.length > 0) {
    return {
      ...base,
      status: "NOT_MATCHED",
      reason: `필수 준비물(${missingItems.join(", ")})이 현재 준비되지 않았어요.`,
    };
  }

  if (policy.requiredItems.length > 0 || policy.restrictions.length > 0) {
    base.matchedUserConditions.push(
      ...policy.requiredItems.map((item) => `${item} 준비 완료`),
    );
    return {
      ...base,
      status: "CONDITIONAL",
      reason: "원문에 표시된 준비물과 이용 구역 조건을 지키면 이용할 수 있어요.",
    };
  }

  return {
    ...base,
    status: "AVAILABLE",
    reason: "현재 입력한 조건과 명시된 동반 규정이 일치해요.",
  };
}
