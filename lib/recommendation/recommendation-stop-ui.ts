import type { RecommendedRouteStopV1 } from "@/types/recommendation";

type StopSelectionState = Pick<RecommendedRouteStopV1, "provenance" | "locked">;

export function getRecommendationStopEditCopy(
  stop: StopSelectionState,
  replacementSupported = false,
): { removeLabel: string; canReplace: boolean } {
  const selectedAndLocked = stop.provenance === "user_selected" && stop.locked === true;
  return {
    removeLabel: selectedAndLocked ? "선택 해제하고 제외" : "제외",
    canReplace: stop.provenance === "auto_fill" && replacementSupported,
  };
}
