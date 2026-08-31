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

  it("shows compact request-backed loading and complete route-option comparison facts", () => {
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
      expect(planner).not.toContain(`"${label}",`);
    }
    expect(planner).toContain("맞춤 일정을 만들고 있습니다");
    expect(planner).toContain("반려견 동반 근거와 실제 이동 경로를 확인하고 있어요.");
    expect(planner).toContain("recommendation-loading-stop");
    expect(planner).not.toContain("LOADING_STAGES");
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
