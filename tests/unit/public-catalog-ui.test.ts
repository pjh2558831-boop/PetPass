import { describe, expect, it } from "vitest";
import {
  parsePublicCatalogUrlState,
  PUBLIC_CATALOG_LAYERS,
  serializeResultsUrl,
} from "@/lib/map-places/catalog-url";
import {
  markerToCatalogCard,
  normalizeKakaoCatalogPlace,
  normalizeTourCatalogPlace,
} from "@/types/public-catalog-place";
import type { PublicMapPlaceDTO } from "@/types/public-map-place";
import type { TourPlaceSummary } from "@/types/place";

describe("public catalog URL state", () => {
  it("restores allowlisted filters", () => {
    expect(parsePublicCatalogUrlState({
      region: "busan",
      district: "500",
      categories: "cafe,shopping",
      layers: "tourism,kakao,veterinary,pet_shop",
      page: "3",
    })).toEqual({
      region: "busan",
      district: "500",
      categories: ["cafe", "shopping"],
      layers: [...PUBLIC_CATALOG_LAYERS],
      page: 3,
      sort: "recommendation",
    });
  });

  it("fails invalid values to safe defaults", () => {
    expect(parsePublicCatalogUrlState({ district: "seoul", categories: "invalid", layers: "tourism,raw", page: "-1" }))
      .toEqual({ region: "seoul", district: "all", categories: ["attraction", "food", "cafe", "accommodation", "other"], layers: [...PUBLIC_CATALOG_LAYERS], page: 1, sort: "recommendation" });
  });

  it("resolves district 110 within the selected region", () => {
    expect(parsePublicCatalogUrlState({ region: "busan", district: "110" }))
      .toMatchObject({ region: "busan", district: "110" });
    expect(parsePublicCatalogUrlState({ region: "jeju", district: "110" }))
      .toMatchObject({ region: "jeju", district: "110" });
    expect(parsePublicCatalogUrlState({ region: "jeju", district: "500", page: "3" }))
      .toMatchObject({ region: "jeju", district: "all", page: 3 });
    expect(parsePublicCatalogUrlState({ region: "seoul", district: "110" }))
      .toMatchObject({ region: "seoul", district: "110" });
    expect(parsePublicCatalogUrlState({ region: "seoul", district: "130" }))
      .toMatchObject({ region: "seoul", district: "all" });
  });

  it("rejects an explicit unknown or unavailable region instead of defaulting to Busan", () => {
    expect(parsePublicCatalogUrlState({ region: "seoul-preview" })).toBeNull();
    expect(parsePublicCatalogUrlState({ region: ["seoul", "busan"] })).toBeNull();
    expect(parsePublicCatalogUrlState({ regionId: "seoul" })).toBeNull();
    expect(parsePublicCatalogUrlState({ selectedRegion: "seoul" })).toBeNull();
    expect(parsePublicCatalogUrlState({})).toMatchObject({ region: "seoul" });
  });

  it("keeps deferred Seoul shopping out of the local default selection", () => {
    expect(parsePublicCatalogUrlState({ region: "seoul" })?.categories).toEqual([
      "attraction",
      "food",
      "cafe",
      "accommodation",
      "other",
    ]);
  });

  it("restores an explicit all-layers-off state", () => {
    expect(parsePublicCatalogUrlState({ layers: "none" })?.layers).toEqual([]);
  });

  it("serializes a canonical shareable results URL that round-trips", () => {
    const state = {
      region: "jeju" as const,
      district: "110",
      categories: ["attraction", "cafe"] as const,
      layers: ["tourism"] as const,
      page: 3,
      sort: "popularity" as const,
    };
    const url = serializeResultsUrl("catalog", state);

    expect(url).toBe("/results?tab=catalog&region=jeju&district=110&categories=attraction%2Ccafe&layers=tourism&sort=popularity&page=3");
    expect(parsePublicCatalogUrlState(Object.fromEntries(new URL(url, "http://localhost").searchParams)))
      .toEqual(state);
  });
});

describe("public catalog normalization", () => {
  const tourPlace = {
    contentId: "tour-1", contentTypeId: "38", providerContentTypeId: "38", category: "shopping",
    title: "반려동물 상점", address: "부산광역시 수영구", detailAddress: null,
    longitude: 129.1, latitude: 35.1, phone: null, thumbnailUrl: null, imageUrl: null,
    copyrightType: null, createdTime: null, modifiedTime: null, legalRegionCode: "26", legalDistrictCode: "500",
    classificationCodes: { primary: null, secondary: null, tertiary: null, largeCategory: null, middleCategory: null, smallCategory: null },
    providerVisibility: { status: "exposed", providerField: "showflag", providerValue: "1", checkedAt: "2026-08-15T00:00:00Z", reasonCodes: [] },
    source: { provider: "Korea Tourism Organization", operation: "areaBasedList2", retrievedAt: "2026-08-15T00:00:00Z" },
  } satisfies TourPlaceSummary;

  it("normalizes registered Tourism shopping with the common access label", () => {
    expect(normalizeTourCatalogPlace(tourPlace)).toMatchObject({
      id: "tour:tour-1", layer: "tourism", category: "shopping",
      publicLabel: "반려동물 동반 가능", warning: null,
    });
  });

  it("preserves an explicit missing source URL for list-only shopping cards", () => {
    const card = markerToCatalogCard({
      id: "tour:shopping-1",
      regionId: "seoul",
      providerPlaceId: "shopping-1",
      name: "확인 필요 쇼핑 장소",
      layer: "tourism",
      category: "shopping",
      districtCode: "110",
      districtName: "종로구",
      address: "서울특별시 종로구",
      coordinates: { latitude: 37.57, longitude: 126.98 },
      placeUrl: null,
      publicLabel: "반려동물 동반 정보 확인 필요",
      sourceLabel: "한국관광공사",
    });

    expect(card.placeUrl).toBeNull();
  });

  it("keeps unreviewed Kakao candidates visibly unverified", () => {
    const kakao = {
      id: "kakao:1", providerPlaceId: "1", name: "후보", kind: "pet_travel_candidate", category: "cafe",
      district: { code: "500", name: "수영구" }, address: "부산광역시 수영구", coordinates: { latitude: 35.1, longitude: 129.1 },
      phone: null, placeUrl: "https://place.map.kakao.com/1", source: "kakao_search_candidate",
      reviewStatus: "unreviewed", publicLabel: "동반 여부 확인 필요",
    } satisfies PublicMapPlaceDTO;
    const result = normalizeKakaoCatalogPlace(kakao);
    expect(result.warning).toContain("방문 전");
    expect(result.publicLabel).toBe("동반 여부 확인 필요");
    expect(result.verificationRequired).toBe(true);
  });

  it("labels veterinary and pet-shop records as facilities without access or 24-hour claims", () => {
    const base = {
      id: "kakao:2", providerPlaceId: "2", name: "지역 동물 시설", category: null,
      district: { code: "500", name: "수영구" }, address: "부산광역시 수영구", coordinates: { latitude: 35.1, longitude: 129.1 },
      phone: null, placeUrl: "https://place.map.kakao.com/2", source: "kakao_search_candidate",
      reviewStatus: "unreviewed", publicLabel: "provider label",
    } as const;
    const veterinary = normalizeKakaoCatalogPlace({ ...base, kind: "veterinary" });
    const shop = normalizeKakaoCatalogPlace({ ...base, id: "kakao:3", providerPlaceId: "3", kind: "pet_shop" });

    expect(veterinary).toMatchObject({ sourceLabel: "동물병원", publicLabel: "반려동물 편의시설", warning: null });
    expect(shop).toMatchObject({ sourceLabel: "펫샵·용품점", publicLabel: "반려동물 편의시설", warning: null });
    expect(JSON.stringify([veterinary, shop])).not.toContain("24시간");
    expect(JSON.stringify([veterinary, shop])).not.toContain("동반 가능");
  });
});
