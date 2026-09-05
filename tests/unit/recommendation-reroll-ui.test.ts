import { describe, expect, it } from "vitest";
import {
  REROLL_RECOVERY_ACTIONS,
  recommendationRerollUiState,
} from "@/lib/recommendation/recommendation-reroll-ui";

const BASE = {
  eligibleUniqueCandidateCount: 8,
  requestedStopCount: 3,
  unseenEligibleCandidateCount: 5,
  maximumFeasibleNovelReplacements: 3,
  diversityCapacity: "sufficient" as const,
  limitingReasonCodes: [],
};

describe("recommendation reroll UI state", () => {
  it("promises new places only when enough unseen replacements are feasible", () => {
    expect(recommendationRerollUiState({ diversity: BASE })).toMatchObject({
      kind: "new_places",
      buttonLabel: "새로운 장소로 다시 추천",
      showRecoveryActions: false,
    });
  });

  it("labels a limited replacement as another combination", () => {
    expect(recommendationRerollUiState({
      diversity: {
        ...BASE,
        unseenEligibleCandidateCount: 1,
        maximumFeasibleNovelReplacements: 1,
        diversityCapacity: "limited",
      },
    })).toMatchObject({
      kind: "different_combination",
      buttonLabel: "다른 조합 보기",
      showRecoveryActions: true,
    });
  });

  it.each(["limited", "exhausted"] as const)("allows unqueried reserves to be explored without promising new road-feasible places for %s capacity", diversityCapacity => {
    expect(recommendationRerollUiState({ diversity: { ...BASE, scoredUniqueCandidateCount: 538, unseenEligibleCandidateCount: 0, maximumFeasibleNovelReplacements: 0, unqueriedCandidateCount: 534, diversityCapacity } })).toMatchObject({
      kind: "different_combination", buttonLabel: "다른 조합 보기", showRecoveryActions: false,
    });
  });

  it("reports exhausted capacity and keeps all explicit recovery actions", () => {
    expect(recommendationRerollUiState({
      diversity: {
        ...BASE,
        unseenEligibleCandidateCount: 0,
        maximumFeasibleNovelReplacements: 0,
        diversityCapacity: "exhausted",
      },
    })).toMatchObject({
      kind: "exhausted",
      buttonLabel: "현재 조건에서 새로운 장소가 부족해요",
      showRecoveryActions: true,
    });
    expect(REROLL_RECOVERY_ACTIONS).toEqual([
      "시간 범위 넓히기",
      "장소 유형 바꾸기",
      "같은 지역 안에서 구·군 범위 넓히기",
      "지도에서 장소 직접 선택하기",
    ]);
  });
});
