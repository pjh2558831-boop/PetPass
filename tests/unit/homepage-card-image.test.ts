import { describe, expect, it } from "vitest";
import { resolveHomepageCardImage } from "@/lib/homepage/homepage-card-image";
import type { HomepagePlaceCard } from "@/types/homepage-places";

const base: HomepagePlaceCard = {
  id: "kakao:123",
  layer: "kakao_candidate",
  name: "광안 후보",
  category: "cafe",
  categoryLabel: "카페",
  district: "수영구",
  address: "부산광역시 수영구",
  phone: null,
  sourceLabel: "카카오맵",
  statusLabel: "동반 여부 확인 필요",
  warning: null,
  isAllowed: false,
  href: "https://place.map.kakao.com/123",
  external: true,
  imageUrl: null,
};

describe("homepage place card image hierarchy", () => {
  it("keeps an official provider photo ahead of a location preview", () => {
    expect(resolveHomepageCardImage({
      ...base,
      id: "tour:3426656",
      imageUrl: "https://tong.visitkorea.or.kr/example.jpg",
    }, { regionId: "busan", staticMapEnabled: true })).toMatchObject({
      kind: "provider_photo",
      src: "https://tong.visitkorea.or.kr/example.jpg",
    });
  });

  it("uses a labelled location preview when a known homepage place has no photo", () => {
    expect(resolveHomepageCardImage(base, {
      regionId: "busan",
      staticMapEnabled: true,
    })).toEqual({
      kind: "static_map",
      src: "/api/places/kakao%3A123/location-thumbnail?region=busan",
      alt: "장소 위치 미리보기",
    });
    expect(resolveHomepageCardImage({
      ...base,
      id: "tour:3426656",
    }, { regionId: "busan", staticMapEnabled: true })).toEqual({
      kind: "static_map",
      src: "/api/places/tour%3A3426656/location-thumbnail?region=busan",
      alt: "장소 위치 미리보기",
    });
  });

  it("uses the truthful category fallback when previews are disabled", () => {
    expect(resolveHomepageCardImage(base, {
      regionId: "busan",
      staticMapEnabled: false,
    })).toMatchObject({ kind: "category_placeholder", category: "cafe" });
  });
});
