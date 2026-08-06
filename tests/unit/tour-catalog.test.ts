import { describe, expect, it, vi } from "vitest";
import {
  BUSAN_DISTRICTS,
  BUSAN_REGION,
  TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS,
  TOUR_ITINERARY_ELIGIBLE_CONTENT_TYPE_IDS,
  TOUR_OPT_IN_CATALOG_CONTENT_TYPE_IDS,
} from "@/lib/tour-api/catalog";
import {
  listTourCatalog,
  TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE,
  TOUR_CATALOG_PROVIDER_PAGE_SIZE,
} from "@/lib/tour-api/catalog-service";
import { normalizeTourPlaceSummary } from "@/lib/tour-api/normalizers";
import type {
  TourPlaceService,
  TourPlacesQuery,
} from "@/lib/tour-api/service";
import { TOUR_CATEGORY_LABELS } from "@/lib/shared/format";
import {
  TOUR_CONTENT_TYPE_IDS,
  type TourContentTypeId,
  type TourPlaceList,
  type TourPlaceSummary,
} from "@/types/place";

const retrievedAt = "2026-08-05T00:00:00.000Z";

function place(
  contentId: string,
  contentTypeId: TourContentTypeId,
): TourPlaceSummary {
  return {
    contentId,
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category: {
      "12": "attraction",
      "14": "culture",
      "15": "festival",
      "28": "leisure",
      "32": "accommodation",
      "38": "shopping",
      "39": "food",
    }[contentTypeId] as TourPlaceSummary["category"],
    title: `장소 ${contentId}`,
    address: "부산광역시",
    detailAddress: null,
    longitude: 129,
    latitude: 35,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: BUSAN_REGION.code,
    legalDistrictCode: null,
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
      providerModifiedTime: null,
    },
  };
}

function list(
  query: TourPlacesQuery,
  places: TourPlaceSummary[],
  totalCount = places.length,
): TourPlaceList {
  return {
    places,
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt,
    },
  };
}

function serviceFrom(
  implementation: (query: TourPlacesQuery) => TourPlaceList | Promise<TourPlaceList>,
): TourPlaceService {
  return {
    listPlaces: vi.fn(implementation),
    getPlaceDetail: vi.fn(),
  } as unknown as TourPlaceService;
}

describe("Tourism catalog contract", () => {
  it("keeps the verified Busan region and all 16 official district scopes", () => {
    expect(BUSAN_REGION).toEqual({ code: "26", name: "부산" });
    expect(BUSAN_DISTRICTS).toEqual([
      { code: "110", name: "중구" },
      { code: "140", name: "서구" },
      { code: "170", name: "동구" },
      { code: "200", name: "영도구" },
      { code: "230", name: "부산진구" },
      { code: "260", name: "동래구" },
      { code: "290", name: "남구" },
      { code: "320", name: "북구" },
      { code: "350", name: "해운대구" },
      { code: "380", name: "사하구" },
      { code: "410", name: "금정구" },
      { code: "440", name: "강서구" },
      { code: "470", name: "연제구" },
      { code: "500", name: "수영구" },
      { code: "530", name: "사상구" },
      { code: "710", name: "기장군" },
    ]);
  });

  it("keeps provider support, catalog visibility, and itinerary eligibility separate", () => {
    expect(TOUR_CONTENT_TYPE_IDS).toEqual(["12", "14", "15", "28", "32", "38", "39"]);
    expect(TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS).toEqual([
      "12",
      "14",
      "15",
      "28",
      "32",
      "39",
    ]);
    expect(TOUR_OPT_IN_CATALOG_CONTENT_TYPE_IDS).toEqual(["38"]);
    expect(TOUR_ITINERARY_ELIGIBLE_CONTENT_TYPE_IDS).toEqual([
      "12",
      "14",
      "15",
      "28",
      "32",
      "38",
      "39",
    ]);
    expect(TOUR_CONTENT_TYPE_IDS).toContain("38");
    expect(TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS).not.toContain("38");
    expect(TOUR_CONTENT_TYPE_IDS).not.toContain("75" as TourContentTypeId);
  });

  it("queries all Busan without forcing a district and includes every default type", async () => {
    const service = serviceFrom((query) =>
      list(query, [place(`type-${query.contentTypeId}`, query.contentTypeId!)]),
    );
    const result = await listTourCatalog(service, {
      regionCode: BUSAN_REGION.code,
      page: 1,
      pageSize: 50,
    });
    const calls = vi.mocked(service.listPlaces).mock.calls.map(([query]) => query);

    expect(calls).toHaveLength(6);
    expect(calls.every((query) => query.regionCode === "26")).toBe(true);
    expect(calls.every((query) => query.districtCode === undefined)).toBe(true);
    expect(calls.map(({ contentTypeId }) => contentTypeId)).toEqual([
      ...TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS,
    ]);
    expect(result.places).toHaveLength(6);
  });

  it.each(BUSAN_DISTRICTS)(
    "passes verified district $code ($name) to the provider request",
    async (district) => {
      const service = serviceFrom((query) =>
        list(query, [place(`${district.code}-1`, "12")]),
      );
      await listTourCatalog(service, {
        regionCode: BUSAN_REGION.code,
        districtCode: district.code,
        contentTypeId: "12",
        page: 1,
        pageSize: 20,
      });
      expect(service.listPlaces).toHaveBeenCalledWith(
        expect.objectContaining({
          regionCode: "26",
          districtCode: district.code,
          contentTypeId: "12",
        }),
      );
    },
  );

  it("follows provider pagination and applies catalog pagination afterward", async () => {
    const service = serviceFrom((query) => {
      const count = query.page < 3 ? 50 : 1;
      const places = Array.from({ length: count }, (_, index) =>
        place(String((query.page - 1) * 50 + index + 1).padStart(3, "0"), "12"),
      );
      return list(query, places, 101);
    });
    const result = await listTourCatalog(service, {
      regionCode: "26",
      contentTypeId: "12",
      page: 2,
      pageSize: 10,
    });

    expect(vi.mocked(service.listPlaces).mock.calls.map(([query]) => query.page)).toEqual([
      1,
      2,
      3,
    ]);
    expect(result).toMatchObject({ page: 2, pageSize: 10, totalCount: 101 });
    expect(result.places).toHaveLength(10);
  });

  it("fails truthfully before an unbounded provider loop can begin", async () => {
    const service = serviceFrom((query) =>
      list(
        query,
        [place("1", "12")],
        TOUR_CATALOG_PROVIDER_PAGE_SIZE *
          (TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE + 1),
      ),
    );
    await expect(
      listTourCatalog(service, {
        regionCode: "26",
        contentTypeId: "12",
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(service.listPlaces).toHaveBeenCalledTimes(1);
  });

  it("returns shopping only when type 38 is explicitly requested", async () => {
    const service = serviceFrom((query) => list(query, [place("shop", "38")]));
    const result = await listTourCatalog(service, {
      regionCode: "26",
      contentTypeId: "38",
      page: 1,
      pageSize: 20,
    });
    expect(service.listPlaces).toHaveBeenCalledWith(
      expect.objectContaining({ contentTypeId: "38" }),
    );
    expect(result.places).toEqual([expect.objectContaining({ category: "shopping" })]);
  });

  it("uses a trusted requested type without overwriting the raw provider type", () => {
    const normalized = normalizeTourPlaceSummary(
      { contentid: "missing-provider-type", title: "알려진 관광지" },
      {
        operation: "areaBasedList2",
        retrievedAt,
        fallbackContentTypeId: "12",
      },
    );
    expect(normalized).toMatchObject({
      contentTypeId: "12",
      providerContentTypeId: null,
      category: "attraction",
    });
  });

  it("does not reinterpret an explicit unsupported provider type through fallback", () => {
    const normalized = normalizeTourPlaceSummary(
      { contentid: "legacy", contenttypeid: "75", title: "레거시 레코드" },
      {
        operation: "areaBasedList2",
        retrievedAt,
        fallbackContentTypeId: "12",
      },
    );
    expect(normalized).toMatchObject({
      contentTypeId: null,
      providerContentTypeId: "75",
      category: "unknown",
    });
  });

  it("keeps an explicit unsupported record out of the supported catalog", async () => {
    const legacy = {
      ...place("legacy", "12"),
      contentTypeId: null,
      providerContentTypeId: "75",
      category: "unknown" as const,
    };
    const service = serviceFrom((query) => list(query, [legacy]));
    const result = await listTourCatalog(service, {
      regionCode: "26",
      contentTypeId: "12",
      page: 1,
      pageSize: 20,
    });
    expect(result).toMatchObject({ places: [], totalCount: 0 });
  });

  it("renders every known catalog category with its exact Korean label", () => {
    expect(TOUR_CATEGORY_LABELS).toMatchObject({
      attraction: "관광지",
      culture: "문화시설",
      festival: "축제·행사",
      leisure: "레저",
      accommodation: "숙박",
      shopping: "쇼핑",
      food: "음식점",
    });
    for (const type of TOUR_CONTENT_TYPE_IDS) {
      const normalized = normalizeTourPlaceSummary(
        { contentid: type, contenttypeid: type },
        { operation: "areaBasedList2", retrievedAt },
      );
      expect(normalized?.category).not.toBe("unknown");
      expect(TOUR_CATEGORY_LABELS[normalized!.category]).not.toBe("기타");
    }
  });
});
