import { describe, expect, it } from "vitest";
import {
  explorerBoundsAreEquivalent,
  getExplorerCollections,
} from "@/lib/map-places/explorer-collections";
import { PUBLIC_CATALOG_LAYERS } from "@/lib/map-places/catalog-url";
import type { PublicCatalogLayer, PublicCatalogPlace } from "@/types/public-catalog-place";

function place(index: number, layer: PublicCatalogLayer = "tourism"): PublicCatalogPlace {
  return {
    id: `${layer}:${index}`,
    regionId: "busan",
    providerPlaceId: String(index),
    name: `장소 ${String(index).padStart(2, "0")}`,
    layer,
    category: layer === "veterinary" || layer === "pet_shop" ? "other" : "attraction",
    districtCode: index % 2 === 0 ? "500" : "350",
    districtName: index % 2 === 0 ? "수영구" : "해운대구",
    address: "부산광역시",
    coordinates: { latitude: 35.1 + index * 0.001, longitude: 129.1 + index * 0.001 },
    phone: null,
    imageUrl: null,
    placeUrl: null,
    publicLabel: layer === "kakao" ? "동반 여부 확인 필요" : "동반 정보 확인 필요",
    sourceLabel: layer === "tourism" ? "한국관광공사" : layer === "kakao" ? "카카오 검색 후보" : layer === "veterinary" ? "동물병원" : "펫샵·용품점",
    warning: null,
    tourPlace: null,
  };
}

describe("full explorer collections", () => {
  const common = {
    regionId: "busan" as const,
    categories: ["attraction", "food", "cafe", "accommodation", "shopping", "veterinary", "pet_shop"] as const,
    rankingAsOf: "2026-08-19T00:00:00.000Z",
    sort: "recommendation" as const,
  };
  it("keeps all filtered places on the map while cards page by 12", () => {
    const places = Array.from({ length: 25 }, (_, index) => place(index + 1));
    const first = getExplorerCollections({ places, district: "all", layers: [...PUBLIC_CATALOG_LAYERS], activeBounds: null, page: 1, ...common, categories: [...common.categories] });
    const second = getExplorerCollections({ places, district: "all", layers: [...PUBLIC_CATALOG_LAYERS], activeBounds: null, page: 2, ...common, categories: [...common.categories] });

    expect(first.filteredPlaces).toHaveLength(25);
    expect(first.mapPlaces).toHaveLength(25);
    expect(first.pagedPlaces).toHaveLength(12);
    expect(second.mapPlaces).toEqual(first.mapPlaces);
    expect(second.pagedPlaces).toHaveLength(12);
  });

  it("deduplicates IDs, rejects invalid coordinates, and applies explicit scope filters", () => {
    const duplicate = place(1);
    const invalid = { ...place(90), id: "invalid", coordinates: { latitude: 95, longitude: 129 } };
    const places = [duplicate, { ...duplicate, name: "중복" }, place(2, "kakao"), place(3, "veterinary"), invalid];
    const result = getExplorerCollections({
      places,
      regionId: "busan",
      district: "all",
      categories: [...common.categories],
      layers: ["tourism", "kakao"],
      activeBounds: { west: 129.09, south: 35.09, east: 129.103, north: 35.103 },
      page: 1,
      sort: "recommendation",
      rankingAsOf: common.rankingAsOf,
    });

    expect(result.filteredPlaces.map(({ id }) => id)).toEqual(["tourism:1", "kakao:2"]);
    expect(result.mapPlaces).toEqual(result.filteredPlaces);
  });

  it("never mixes identical district codes across regions", () => {
    const busan = { ...place(110), districtCode: "110", districtName: "중구" };
    const jeju = {
      ...place(110),
      id: "tour:jeju-110",
      regionId: "jeju" as const,
      districtCode: "110",
      districtName: "제주시",
      address: "제주특별자치도 제주시",
      coordinates: { latitude: 33.5, longitude: 126.53 },
    };
    const result = getExplorerCollections({
      places: [busan, jeju],
      regionId: "jeju",
      district: "110",
      categories: [...common.categories],
      layers: [...PUBLIC_CATALOG_LAYERS],
      activeBounds: null,
      page: 1,
      sort: "recommendation",
      rankingAsOf: common.rankingAsOf,
    });

    expect(result.filteredPlaces).toEqual([jeju]);
  });

  it("treats immaterial viewport drift as the same committed search scope", () => {
    const committed = { west: 129, south: 35.1, east: 129.2, north: 35.3 };
    expect(explorerBoundsAreEquivalent(committed, {
      west: 129.0001,
      south: 35.1001,
      east: 129.2001,
      north: 35.3001,
    })).toBe(true);
    expect(explorerBoundsAreEquivalent(committed, {
      west: 129.01,
      south: 35.1,
      east: 129.2,
      north: 35.3,
    })).toBe(false);
  });
});
