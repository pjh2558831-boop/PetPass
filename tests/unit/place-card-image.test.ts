import { describe, expect, it } from "vitest";
import { resolvePlaceCardImage } from "@/lib/map-places/place-card-image";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

const base: PublicCatalogPlace = {
  id: "kakao:123",
  regionId: "busan",
  providerPlaceId: "123",
  name: "광안 후보",
  layer: "kakao",
  category: "cafe",
  districtCode: "500",
  districtName: "수영구",
  address: "부산광역시 수영구",
  coordinates: { latitude: 35.15, longitude: 129.12 },
  phone: null,
  imageUrl: null,
  placeUrl: "https://place.map.kakao.com/123",
  publicLabel: "동반 여부 확인 필요",
  sourceLabel: "카카오 검색 후보",
  warning: null,
  tourPlace: null,
};

describe("place card image hierarchy", () => {
  it("uses a Tourism provider photo first", () => {
    expect(resolvePlaceCardImage({ ...base, layer: "tourism", imageUrl: "https://example.com/tour.jpg" }, { staticMapEnabled: true }))
      .toMatchObject({ kind: "provider_photo", src: "https://example.com/tour.jpg" });
  });

  it("uses only explicitly approved uploads before a location preview", () => {
    expect(resolvePlaceCardImage({ ...base, approvedImageUrl: "https://example.com/approved.jpg" }, { staticMapEnabled: true }))
      .toMatchObject({ kind: "approved_upload" });
  });

  it("labels enabled previews as maps and otherwise uses a category placeholder", () => {
    expect(resolvePlaceCardImage(base, { staticMapEnabled: true })).toEqual({
      kind: "static_map",
      src: "/api/places/kakao%3A123/location-thumbnail?region=busan",
      alt: "장소 위치 미리보기",
    });
    expect(resolvePlaceCardImage(base, { staticMapEnabled: false })).toMatchObject({
      kind: "category_placeholder",
      category: "cafe",
    });
  });
});
