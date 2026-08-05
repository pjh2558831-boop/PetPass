import type { Page } from "@playwright/test";
import type { TourPlaceList, TourPlaceSummary } from "@/types/place";

const retrievedAt = "2026-08-03T00:00:00.000Z";

function place(
  contentId: string,
  title: string,
  contentTypeId: TourPlaceSummary["contentTypeId"],
  category: TourPlaceSummary["category"],
  latitude: number,
  longitude: number,
): TourPlaceSummary {
  return {
    contentId,
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category,
    title,
    address: "부산광역시 해운대구",
    detailAddress: null,
    longitude,
    latitude,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: "20260803000000",
    legalRegionCode: "26",
    legalDistrictCode: "16",
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
      contentId,
      providerModifiedTime: "20260803000000",
    },
  };
}

const places = [
  place("1001", "해운대 해수욕장", "76", "attraction", 35.1596, 129.1603),
  place("1002", "동백섬", "76", "attraction", 35.1532, 129.1527),
  place("1003", "부산 영화의전당", "78", "culture", 35.171, 129.127),
  place("1004", "광안리 산책로", "75", "leisure", 35.1531, 129.1187),
  place("1005", "부산 반려동물 식당", "82", "food", 35.166, 129.158),
];

export async function installTourListMock(page: Page): Promise<void> {
  await page.route(/\/api\/tour\/places\?/, async (route) => {
    const data: TourPlaceList = {
      places,
      page: 1,
      pageSize: 20,
      totalCount: places.length,
      source: {
        provider: "Korea Tourism Organization",
        operation: "areaBasedList2",
        retrievedAt,
      },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data, requestId: "e2e-tour-mock" }),
    });
  });
}
