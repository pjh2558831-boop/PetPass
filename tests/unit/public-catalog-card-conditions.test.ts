import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicCatalogCard } from "@/components/places/public-catalog-card";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

function place(overrides: Partial<PublicCatalogPlace> = {}): PublicCatalogPlace {
  return {
    id: "kakao:condition-1",
    regionId: "busan",
    providerPlaceId: "condition-1",
    name: "광안 카페",
    layer: "kakao",
    category: "cafe",
    districtCode: "500",
    districtName: "수영구",
    address: "부산광역시 수영구 광안해변로 1",
    coordinates: { latitude: 35.1456, longitude: 129.1131 },
    phone: null,
    imageUrl: null,
    placeUrl: "https://place.map.kakao.com/condition-1",
    petAccessVerdict: "unknown",
    publicLabel: "동반 여부 확인 필요",
    sourceLabel: "카카오 검색 후보",
    warning: "카카오 검색 후보입니다. 방문 전 반려동물 동반 가능 여부를 확인해 주세요.",
    tourPlace: null,
    ...overrides,
  };
}

function render(card: PublicCatalogPlace): string {
  return renderToStaticMarkup(createElement(PublicCatalogCard, {
    place: card,
    selected: false,
    onSelect: vi.fn(),
    staticMapEnabled: false,
  }));
}

describe("public catalog card pet conditions", () => {
  it("shows real restrictions as information without an ambiguous access state", () => {
    const condition = "테라스만 가능 · 10kg 이하 · 이동가방 필수";
    const html = render(place({
      petAccessVerdict: "conditional",
      petConditions: condition,
      verificationRequired: true,
      publicLabel: "동반 조건 확인 필요",
    }));

    expect(html).toContain("동반 조건 확인 필요");
    expect(html).toContain("반려견 동반 조건");
    expect(html).toContain(condition);
    expect(html).not.toContain("조건부 동반");
    expect(html).not.toContain("동반 여부 미확인");
    expect(html).toContain("동반 가능 여부를 확인");
    expect(html).not.toContain("최신 동반 조건을 확인");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
  });

  it("keeps legacy source text visible without disabling selection", () => {
    const html = renderToStaticMarkup(createElement(PublicCatalogCard, {
      place: place({ petAccessVerdict: "not_allowed", publicLabel: "반려동물 입장 금지", warning: "휴업 안내 있음", petConditions: "반려동물 입장 금지" }),
      selected: false, onSelect: vi.fn(), staticMapEnabled: false,
      itinerarySelection: { selected: false, onToggle: vi.fn() },
    }));
    expect(html).toContain("반려동물 동반 가능");
    expect(html).toContain("휴업 안내 있음");
    expect(html).toContain("반려동물 입장 금지");
    expect(html).not.toContain("동반 여부 미확인");
    expect(html).not.toContain("disabled=");
  });

  it("shows a registered Kakao place without a verification claim", () => {
    const html = render(place());
    expect(html).toContain("반려동물 동반 가능");
    expect(html).not.toContain("동반 여부 미확인");
    expect(html).not.toContain("동반 가능 여부를 확인");
  });

  it.each([null, "", "   "])("renders no condition UI for %j", (condition) => {
    const html = render(place({ petConditions: condition }));

    expect(html).not.toContain("동반 조건 있음");
    expect(html).not.toContain("반려견 동반 조건");
    expect(html).not.toContain("최신 동반 조건을 확인");
  });
});
