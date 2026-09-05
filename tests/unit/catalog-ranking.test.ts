import { describe, expect, it } from "vitest";
import { calculateCatalogRecommendationV1, rankCatalogPlaces } from "@/lib/map-places/catalog-ranking";
import type { PublicCatalogPlace } from "@/types/public-catalog-place";

function place(id: string, overrides: Partial<PublicCatalogPlace> = {}): PublicCatalogPlace {
  return {
    id: `kakao:${id}`,
    regionId: "busan",
    providerPlaceId: id,
    name: `장소 ${id}`,
    layer: "kakao",
    category: "cafe",
    districtCode: "500",
    districtName: "수영구",
    address: "부산광역시 수영구",
    coordinates: { latitude: 35.15, longitude: 129.12 },
    phone: null,
    imageUrl: null,
    placeUrl: `https://place.map.kakao.com/${id}`,
    publicLabel: "동반 여부 확인 필요",
    sourceLabel: "카카오 검색 후보",
    warning: "방문 전 확인",
    tourPlace: null,
    lastSeenAt: "2026-08-18T00:00:00.000Z",
    matchedQueryCount: 2,
    categoryQueryAgreementCount: 2,
    ...overrides,
  };
}

const context = {
  activeCategories: ["cafe"] as const,
  districtSelected: true,
  committedBoundsSelected: false,
  center: { latitude: 35.15, longitude: 129.12 },
  asOf: "2026-08-19T00:00:00.000Z",
};

describe("catalog-recommendation-v1", () => {
  it("is deterministic, bounded, and does not rank by provider or legacy access state", () => {
    const first = calculateCatalogRecommendationV1(place("1"), context);
    const second = calculateCatalogRecommendationV1(place("1"), context);
    const tourism = calculateCatalogRecommendationV1(place("1", {
      id: "tour:1",
      layer: "tourism",
      sourceLabel: "한국관광공사",
      publicLabel: "조건부 동반 가능",
    }), context);
    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(1_000);
    expect(Object.values(first.components).every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(first.components.petEvidenceConfidence).toBe(tourism.components.petEvidenceConfidence);
    expect(first.components.discoveryStrength).toBe(tourism.components.discoveryStrength);
    expect(first.score).toBe(tourism.score);
  });

  it("uses stable recommendation ties and does not fabricate popularity order", () => {
    const recommendation = rankCatalogPlaces([place("2"), place("1")], context, "recommendation");
    const popularity = rankCatalogPlaces([place("2"), place("1")], context, "popularity");
    expect(recommendation.map(({ place: item }) => item.providerPlaceId)).toEqual(["1", "2"]);
    expect(popularity.map(({ place: item }) => item.providerPlaceId)).toEqual(["1", "2"]);
    expect(popularity.every(({ popularity: value }) => value.status === "insufficient_data" && value.score === 0.5)).toBe(true);
  });

  it("places sufficient first-party popularity before insufficient rows", () => {
    const popularity = new Map([
      ["kakao:2", { score: 0.7, status: "sufficient_data" as const, version: "popularity-v1" as const }],
    ]);
    const ranked = rankCatalogPlaces([place("1"), place("2")], { ...context, popularity }, "popularity");
    expect(ranked[0]?.place.id).toBe("kakao:2");
  });
});
