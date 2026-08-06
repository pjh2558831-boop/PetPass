import { describe, expect, it } from "vitest";
import {
  CATALOG_PAGE_SIZE,
  deduplicateCatalogPlaces,
  getCatalogPageRange,
  getMapPlaces,
  getPaginatedPlaces,
} from "@/components/places/catalog-collections";
import type { TourPlaceSummary } from "@/types/place";

const retrievedAt = "2026-08-06T00:00:00.000Z";

function place(
  contentId: string,
  latitude: number | null = 35.16,
  longitude: number | null = 129.16,
): TourPlaceSummary {
  return {
    contentId,
    contentTypeId: "12",
    providerContentTypeId: "12",
    category: "attraction",
    title: `장소 ${contentId}`,
    address: "부산광역시",
    detailAddress: null,
    longitude,
    latitude,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: "26",
    legalDistrictCode: "350",
    classificationCodes: {
      primary: null,
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt,
    },
  };
}

describe("catalog card and map collections", () => {
  it("keeps 12 cards per page while retaining every filtered map place", () => {
    const filteredPlaces = Array.from({ length: 15 }, (_, index) =>
      place(String(index + 1)),
    );
    const mapPlaces = getMapPlaces(filteredPlaces);

    expect(getPaginatedPlaces(filteredPlaces, 1)).toHaveLength(CATALOG_PAGE_SIZE);
    expect(getPaginatedPlaces(filteredPlaces, 2)).toHaveLength(3);
    expect(mapPlaces).toHaveLength(15);
    expect(getMapPlaces(filteredPlaces)).toEqual(mapPlaces);
    expect(getCatalogPageRange(15, 1)).toEqual({ start: 1, end: 12 });
    expect(getCatalogPageRange(15, 2)).toEqual({ start: 13, end: 15 });
  });

  it("omits invalid coordinates and duplicate records without merging locations", () => {
    const filteredPlaces = [
      place("valid-a"),
      place("valid-a", 35.17, 129.17),
      place("missing", null, 129.18),
      place("invalid", 95, 129.19),
      place("valid-b", 35.2, 129.2),
    ];

    expect(deduplicateCatalogPlaces(filteredPlaces).map(({ contentId }) => contentId))
      .toEqual(["valid-a", "missing", "invalid", "valid-b"]);
    expect(getMapPlaces(filteredPlaces).map(({ contentId }) => contentId)).toEqual([
      "valid-a",
      "valid-b",
    ]);
  });
});
