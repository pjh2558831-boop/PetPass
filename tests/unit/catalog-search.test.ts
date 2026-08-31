import { describe, expect, it } from "vitest";
import {
  filterCatalogPlacesByQuery,
  normalizeCatalogSearchQuery,
} from "@/lib/map-places/catalog-search";
import type { PublicCatalogMarker } from "@/types/public-catalog-place";

const basePlace: PublicCatalogMarker = {
  id: "tour:1001",
  providerPlaceId: "1001",
  regionId: "busan",
  layer: "tourism",
  category: "attraction",
  districtCode: "500",
  districtName: "수영구",
  name: "광안리해변 테마거리",
  address: "부산광역시 수영구 광안해변로",
  coordinates: { latitude: 35.153, longitude: 129.118 },
  sourceLabel: "한국관광공사",
  publicLabel: "동반 정보 확인 필요",
  petAccessVerdict: "unknown",
};

describe("catalog local search", () => {
  it("normalizes compatibility characters, case, and repeated whitespace", () => {
    expect(normalizeCatalogSearchQuery("  ＧＷＡＮＧＡＮ  리  ")).toBe("gwangan 리");
  });

  it("matches name, address, district, category, and source without changing order", () => {
    const places: PublicCatalogMarker[] = [
      basePlace,
      {
        ...basePlace,
        id: "kakao:2002",
        providerPlaceId: "2002",
        layer: "kakao",
        category: "cafe",
        districtCode: "710",
        districtName: "기장군",
        name: "해안 반려견 카페",
        address: "부산광역시 기장군 기장해안로",
        sourceLabel: "카카오 검색 후보",
      },
    ];

    expect(filterCatalogPlacesByQuery(places, "광안리").map(({ id }) => id)).toEqual(["tour:1001"]);
    expect(filterCatalogPlacesByQuery(places, "기장군").map(({ id }) => id)).toEqual(["kakao:2002"]);
    expect(filterCatalogPlacesByQuery(places, "카페").map(({ id }) => id)).toEqual(["kakao:2002"]);
    expect(filterCatalogPlacesByQuery(places, "한국관광공사").map(({ id }) => id)).toEqual(["tour:1001"]);
    expect(filterCatalogPlacesByQuery(places, "")).toEqual(places);
  });
});
