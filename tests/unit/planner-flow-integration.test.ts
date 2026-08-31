import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("unified planner product flow", () => {
  it("keeps region-aware transitions and contains no hidden Busan route fallback", () => {
    const productPath = [
      "components/layout/site-header.tsx",
      "components/layout/site-footer.tsx",
      "components/home/hero-planner-launcher.tsx",
      "components/places/results-explorer.tsx",
      "components/planner/unified-planner-form.tsx",
      "components/itinerary/recommendation-planner.tsx",
      "app/places/[contentId]/page.tsx",
    ].map(source).join("\n");

    expect(productPath).not.toContain("region=busan");
    expect(productPath).not.toContain('regionId="busan"');
    expect(productPath).toContain("routeCapabilities.selectedPlaceRouting");
    expect(productPath).toContain("routeCapabilities.automaticFill");
    expect(productPath).toContain("routeCapabilities.fullyAutomaticRecommendation");
  });

  it("shows the seven truthful stages and complete route-option comparison facts", () => {
    const planner = source("components/itinerary/recommendation-planner.tsx");
    for (const label of [
      "선택 장소 확인",
      "지역·카테고리 후보 확인",
      "반려견 동반 근거 확인",
      "영업시간 확인",
      "이동시간 계산",
      "경로 비교",
      "추천 완료",
    ]) {
      expect(planner).toContain(label);
    }
    for (const fact of [
      "routeSummary.stopCount",
      "totalDrivingSeconds",
      "totalWaitSeconds",
      "estimatedFinishAt",
      "routeCategorySummary",
      "automaticPlaceCount",
      "verificationCount",
      "reductionStatus",
      "routeDifferenceSummary",
    ]) {
      expect(planner).toContain(fact);
    }
  });

  it("keeps structural edits on the lightweight revalidation endpoint", () => {
    const planner = source("components/itinerary/recommendation-planner.tsx");
    expect(planner).toContain('fetch("/api/itineraries/revalidate"');
    expect(planner).toContain("orderedPlaceIds: editableIds");
    expect(planner).toContain("지도에서 장소 추가");
    expect(planner).toContain("rerollUi.buttonLabel");
    expect(planner).toContain("REROLL_RECOVERY_ACTIONS");
  });
});
