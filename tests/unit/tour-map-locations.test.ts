import { describe, expect, it } from "vitest";
import { createOfficialTourMapLocations } from "@/lib/places/tour-map-locations";
import type { TourPlaceSummary } from "@/types/place";

function place(
  contentId: string,
  overrides: Partial<TourPlaceSummary> = {},
): TourPlaceSummary {
  return {
    contentId,
    contentTypeId: "12",
    providerContentTypeId: "12",
    category: "attraction",
    title: `장소 ${contentId}`,
    address: "부산광역시 해운대구",
    detailAddress: null,
    longitude: 129.16,
    latitude: 35.16,
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
    providerVisibility: {
      status: "exposed",
      providerField: "showflag",
      providerValue: "1",
      checkedAt: "2026-08-14T00:00:00.000Z",
      reasonCodes: [],
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: "2026-08-14T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("createOfficialTourMapLocations", () => {
  it("maps exposed Tourism summaries to accessible official green-pin semantics", () => {
    expect(createOfficialTourMapLocations([place("one")])).toEqual([
      expect.objectContaining({
        id: "one",
        markerKind: "tourism-official",
        markerLabel: "공",
        sourceLabel: "한국관광공사 제공 장소",
        interactive: true,
        clusterable: true,
      }),
    ]);
  });

  it("removes duplicates, hidden records, invalid coordinates, and shopping by default", () => {
    const result = createOfficialTourMapLocations([
      place("valid"),
      place("valid", { title: "중복" }),
      place("hidden", {
        providerVisibility: {
          status: "not_exposed",
          providerField: "showflag",
          providerValue: "0",
          checkedAt: "2026-08-14T00:00:00.000Z",
          reasonCodes: [],
        },
      }),
      place("invalid", { latitude: null }),
      place("shopping", { contentTypeId: "38", category: "shopping" }),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["valid"]);
  });

  it("keeps opted-in shopping records without changing official source styling", () => {
    const [location] = createOfficialTourMapLocations(
      [place("shopping", { contentTypeId: "38", category: "shopping" })],
      { includeShopping: true },
    );

    expect(location).toMatchObject({
      id: "shopping",
      markerKind: "tourism-official",
      markerLabel: "공",
    });
  });
});
