import type { DiversityCapacityResultV2 } from "@/lib/recommendation/v2/diversity-capacity";

export const REROLL_RECOVERY_ACTIONS = [
  "시간 범위 넓히기",
  "장소 유형 바꾸기",
  "같은 지역 안에서 구·군 범위 넓히기",
  "지도에서 장소 직접 선택하기",
] as const;

export interface RecommendationRerollUiState {
  kind: "new_places" | "different_combination" | "exhausted";
  buttonLabel: "새로운 장소로 다시 추천" | "다른 조합 보기" | "현재 조건에서 새로운 장소가 부족해요";
  showRecoveryActions: boolean;
}

export function recommendationRerollUiState(input: {
  diversity?: DiversityCapacityResultV2;
  diversityCapacity?: DiversityCapacityResultV2["diversityCapacity"];
  meaningfullyDifferent?: boolean;
}): RecommendationRerollUiState {
  const capacity = input.diversityCapacity ?? input.diversity?.diversityCapacity;
  const novelReplacements = input.diversity?.maximumFeasibleNovelReplacements ?? 0;
  if (!capacity && !input.diversity) {
    return {
      kind: "different_combination",
      buttonLabel: "다른 조합 보기",
      showRecoveryActions: false,
    };
  }
  if ((input.diversity?.unqueriedCandidateCount ?? 0) > 0 &&
    (capacity === "exhausted" || novelReplacements === 0) &&
    !input.diversity?.limitingReasonCodes.includes("all_stops_are_mandatory")) {
    return {
      kind: "different_combination",
      buttonLabel: "다른 조합 보기",
      showRecoveryActions: false,
    };
  }
  if (capacity === "exhausted" || novelReplacements === 0) {
    return {
      kind: "exhausted",
      buttonLabel: "현재 조건에서 새로운 장소가 부족해요",
      showRecoveryActions: true,
    };
  }
  if (capacity === "limited" || novelReplacements < 2 || input.meaningfullyDifferent === false) {
    return {
      kind: "different_combination",
      buttonLabel: "다른 조합 보기",
      showRecoveryActions: true,
    };
  }
  return {
    kind: "new_places",
    buttonLabel: "새로운 장소로 다시 추천",
    showRecoveryActions: false,
  };
}
