import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecommendationStopProvenance } from "@/components/itinerary/recommendation-stop-provenance";
import { SelectedItineraryTray } from "@/components/places/selected-itinerary-tray";
import { getRecommendationStopEditCopy } from "@/lib/recommendation/recommendation-stop-ui";
import { createSelectedItinerarySnapshot } from "@/lib/storage/selected-itinerary-storage";

describe("hybrid recommendation result UI", () => {
  it("keeps an unknown selected place locked and explains unsupported automatic fill", () => {
    const snapshot = {
      ...createSelectedItinerarySnapshot("seoul"),
      places: [{
        id: "tour:101",
        regionId: "seoul" as const,
        providerPlaceId: "101",
        name: "확인 필요한 장소",
        layer: "tourism" as const,
        category: "attraction" as const,
        sourceLabel: "한국관광공사" as const,
        publicLabel: "반려동물 동반 정보 확인 필요",
        petAccessVerdict: "unknown" as const,
        imageUrl: null,
      }],
    };
    const html = renderToStaticMarkup(createElement(SelectedItineraryTray, {
      snapshot,
      variant: "desktop",
      onRemove: vi.fn(),
      onMove: vi.fn(),
      onContinue: vi.fn(),
      onAutomaticStart: vi.fn(),
      onAutoFillChange: vi.fn(),
      automaticFillSupported: false,
      automaticRecommendationSupported: false,
      regionName: "서울",
    }));

    expect(html).toContain("동반 가능 여부 확인 필요");
    expect(html).toContain("사용자가 선택한 미확인 장소");
    expect(html).toContain("일정에 고정");
    expect(html).toContain("부족한 장소는 WEEKENDOG가 추천");
    expect(html).toContain("서울에서는 선택 장소 경로만 지원");
    expect(html).toContain("선택한 장소로 일정 만들기");
    expect(html).toContain("장소 없이 알아서 추천받기");
  });

  it("labels a locked selected place and preserves its verification warning", () => {
    const html = renderToStaticMarkup(createElement(RecommendationStopProvenance, {
      stop: {
        title: "광안 여행 후보",
        provenance: "user_selected",
        locked: true,
        verificationWarning: "방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
      },
    }));

    expect(html).toContain("내가 선택한 장소");
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

    expect(html).toContain("WEEKENDOG 추천");
    expect(html).toContain("자동 장소 바꾸기");
    expect(getRecommendationStopEditCopy({ provenance: "auto_fill", locked: false }, true)).toEqual({
      removeLabel: "제외",
      canReplace: true,
    });
  });
});
