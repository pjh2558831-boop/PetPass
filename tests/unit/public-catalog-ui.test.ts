import { describe, expect, it } from "vitest";
import { parsePublicCatalogUrlState, PUBLIC_CATALOG_LAYERS } from "@/lib/map-places/catalog-url";
import { normalizeKakaoCatalogPlace, normalizeTourCatalogPlace } from "@/types/public-catalog-place";
import type { PublicMapPlaceDTO } from "@/types/public-map-place";
import type { TourPlaceSummary } from "@/types/place";

describe("public catalog URL state", () => {
  it("restores allowlisted filters", () => {
    expect(parsePublicCatalogUrlState({
      district: "500",
      category: "cafe",
      layers: "tourism,kakao,veterinary,pet_shop",
      page: "3",
    })).toEqual({
      district: "500",
      category: "cafe",
      layers: [...PUBLIC_CATALOG_LAYERS],
      page: 3,
    });
  });

  it("fails invalid values to safe defaults", () => {
    expect(parsePublicCatalogUrlState({ district: "seoul", category: "shopping", layers: "tourism,raw", page: "-1" }))
      .toEqual({ district: "all", category: "all", layers: [...PUBLIC_CATALOG_LAYERS], page: 1 });
  });

  it("restores an explicit all-layers-off state", () => {
    expect(parsePublicCatalogUrlState({ layers: "none" }).layers).toEqual([]);
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

  it("normalizes shopping and unknown Tourism content to other without claiming access", () => {
    expect(normalizeTourCatalogPlace(tourPlace)).toMatchObject({
      id: "tour:tour-1", layer: "tourism", category: "other",
      publicLabel: "동반 정보 확인 필요", warning: null,
    });
  });

  it("always gives Kakao candidates a pre-visit warning and no access badge", () => {
    const kakao = {
      id: "kakao:1", providerPlaceId: "1", name: "후보", kind: "pet_travel_candidate", category: "cafe",
      district: { code: "500", name: "수영구" }, address: "부산광역시 수영구", coordinates: { latitude: 35.1, longitude: 129.1 },
      phone: null, placeUrl: "https://place.map.kakao.com/1", source: "kakao_search_candidate",
      reviewStatus: "unreviewed", publicLabel: "동반 여부 확인 필요",
    } satisfies PublicMapPlaceDTO;
    const result = normalizeKakaoCatalogPlace(kakao);
    expect(result.warning).toContain("방문 전");
    expect(result.publicLabel).not.toBe("동반 가능");
  });
});
