import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecommendationStopProvenance } from "@/components/itinerary/recommendation-stop-provenance";
import { getRecommendationStopEditCopy } from "@/lib/recommendation/recommendation-stop-ui";

describe("hybrid recommendation result UI", () => {
  it("labels a locked selected place and preserves its verification warning", () => {
    const html = renderToStaticMarkup(createElement(RecommendationStopProvenance, {
      stop: {
        title: "광안 여행 후보",
        provenance: "user_selected",
        locked: true,
        verificationWarning: "방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
      },
    }));

    expect(html).toContain("직접 고른 장소");
    expect(html).toContain("일정에 고정");
    expect(html).toContain("방문 전 반려동물 동반 가능 여부를 확인해 주세요.");
    expect(html).not.toContain("자동 장소 바꾸기");
    expect(getRecommendationStopEditCopy({ provenance: "user_selected", locked: true })).toEqual({
      removeLabel: "선택 해제하고 제외",
      canReplace: false,
    });
  });

  it("labels an auto-filled place and exposes replacement only when supported", () => {
    const html = renderToStaticMarkup(createElement(RecommendationStopProvenance, {
      stop: {
        title: "해운대 공식 공원",
        provenance: "auto_fill",
        locked: false,
        verificationWarning: null,
      },
      replacementSupported: true,
      onReplace: vi.fn(),
    }));

    expect(html).toContain("추천으로 추가");
    expect(html).toContain("자동 장소 바꾸기");
    expect(getRecommendationStopEditCopy({ provenance: "auto_fill", locked: false }, true)).toEqual({
      removeLabel: "제외",
      canReplace: true,
    });
  });
});
