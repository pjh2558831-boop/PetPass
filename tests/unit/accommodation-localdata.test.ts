import { describe, expect, it, vi } from "vitest";
import { createTourPlaceDetailHandler } from "@/app/api/tour/places/[contentId]/handler";
import {
  type LocalDataSearchResult,
  type LocalDataSearchService,
} from "@/lib/licenses/client";
import {
  getLocalDataConfig,
  normalizeLocalDataInfoEndpoint,
} from "@/lib/licenses/config";
import {
  clusterAccommodationCandidates,
  getRelaxedBusinessNameSegment,
  isGenericAccommodationName,
  normalizeAddress,
  normalizeBusinessName,
  scoreLicenseCandidate,
} from "@/lib/licenses/matcher";
import { normalizeLocalDataRecord } from "@/lib/licenses/normalizers";
import { parseLocalDataResponse } from "@/lib/licenses/parser";
import {
  buildLocalDataRequestUrl,
  type LocalDataProviderOptions,
} from "@/lib/licenses/provider";
import {
  LicenseMatchingService,
  LICENSE_MATCH_THRESHOLDS,
  MAX_LOCALDATA_CALLS_PER_DETAIL,
} from "@/lib/licenses/service";
import type { LocalDataItem } from "@/lib/licenses/schemas";
import type {
  AccommodationLocalDataDataset,
  LocalDataDataset,
  LocalDataLicenseRecord,
} from "@/types/license";
import type { TourPlaceDetail } from "@/types/place";

const endpoints: NonNullable<LocalDataProviderOptions["config"]>["endpoints"] = {
  general_restaurants:
    "https://apis.data.go.kr/1741000/general_restaurants/info",
  rest_cafes: "https://apis.data.go.kr/1741000/rest_cafes/info",
  lodgings: "https://apis.data.go.kr/1741000/lodgings/info",
  tourist_accommodations:
    "https://apis.data.go.kr/1741000/tourist_accommodations/info",
  tourist_pensions: "https://apis.data.go.kr/1741000/tourist_pensions/info",
};

const providerConfig: NonNullable<LocalDataProviderOptions["config"]> = {
  serviceKey: "test%2Fkey%2Bvalue%3D",
  endpoints,
};

function envelope(items: unknown): string {
  return JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: { items, numOfRows: 20, pageNo: 1, totalCount: 1 },
    },
  });
}

function accommodationRecord(
  dataset: AccommodationLocalDataDataset,
  overrides: Partial<LocalDataItem> = {},
): LocalDataLicenseRecord {
  return normalizeLocalDataRecord(
    {
      MNG_NO: `${dataset}-1`,
      BPLC_NM: "블루웨이브 호텔",
      ROAD_NM_ADDR: "부산광역시 해운대구 달맞이길 10",
      ROAD_NM_ZIP: "48000",
      LCPMT_YMD: "20200101",
      SALS_STTS_NM: "영업",
      DTL_SALS_STTS_NM: "정상",
      DAT_UPDT_PNT: "20260805000000",
      ...overrides,
    },
    { dataset, retrievedAt: "2026-08-05T00:00:00.000Z" },
  );
}

function searchResult(
  dataset: LocalDataDataset,
  records: LocalDataLicenseRecord[],
): LocalDataSearchResult {
  return {
    dataset,
    records,
    totalCount: records.length,
    source: {
      provider: "Ministry of the Interior and Safety",
      dataset,
      operation: "info",
      retrievedAt: "2026-08-05T00:00:00.000Z",
      providerUpdatedAt: records[0]?.providerUpdatedAt ?? null,
    },
  };
}

function accommodationDetail(
  overrides: Partial<TourPlaceDetail["summary"]> = {},
): TourPlaceDetail {
  return {
    summary: {
      contentId: "8001",
      contentTypeId: "32",
      providerContentTypeId: "32",
      category: "accommodation",
      title: "블루웨이브 호텔",
      address: "부산광역시 해운대구 달맞이길 10",
      detailAddress: null,
      longitude: 129.1,
      latitude: 35.1,
      phone: null,
      thumbnailUrl: null,
      imageUrl: null,
      copyrightType: null,
      createdTime: null,
      modifiedTime: "20260805000000",
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
        operation: "detailCommon2",
        contentId: "8001",
        retrievedAt: "2026-08-05T00:00:00.000Z",
      },
      ...overrides,
    },
    overview: null,
    homepageUrl: null,
    operatingInformation: null,
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: "20260805000000",
    petPolicyEvidence: null,
    introPetPolicyEvidence: null,
    sections: {
      common: { status: "available" },
      intro: { status: "unavailable", message: "운영 상세 정보 없음" },
      petPolicy: { status: "available" },
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: "8001",
      retrievedAt: "2026-08-05T00:00:00.000Z",
    },
  };
}

function searchMock(
  implementation: (
    dataset: LocalDataDataset,
    businessName: string,
  ) => Promise<LocalDataSearchResult>,
): LocalDataSearchService & { search: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn(
      ({ dataset, businessName }: { dataset: LocalDataDataset; businessName: string }) =>
        implementation(dataset, businessName),
    ),
  };
}

describe("accommodation LocalData provider contracts", () => {
  it("normalizes all three configured endpoints and appends /info exactly once", () => {
    const config = getLocalDataConfig({
      NODE_ENV: "test",
      LOCALDATA_SERVICE_KEY: "test-key",
      LOCALDATA_GENERAL_RESTAURANTS_ENDPOINT:
        "https://apis.data.go.kr/1741000/general_restaurants",
      LOCALDATA_REST_CAFES_ENDPOINT:
        "https://apis.data.go.kr/1741000/rest_cafes/info",
      LOCALDATA_LODGINGS_ENDPOINT:
        "https://apis.data.go.kr/1741000/lodgings",
      LOCALDATA_TOURIST_ACCOMMODATIONS_ENDPOINT:
        "https://apis.data.go.kr/1741000/tourist_accommodations/info/",
      LOCALDATA_TOURIST_PENSIONS_ENDPOINT:
        "https://apis.data.go.kr/1741000/tourist_pensions/info",
    });
    expect(config.endpoints).toMatchObject({
      lodgings: "https://apis.data.go.kr/1741000/lodgings/info",
      tourist_accommodations:
        "https://apis.data.go.kr/1741000/tourist_accommodations/info",
      tourist_pensions:
        "https://apis.data.go.kr/1741000/tourist_pensions/info",
    });
    expect(Object.values(config.endpoints).every((value) => !/\/info\/info/u.test(value))).toBe(true);
  });

  it("rejects unapproved accommodation endpoints", () => {
    expect(() =>
      normalizeLocalDataInfoEndpoint(
        "https://example.com/1741000/lodgings",
        "lodgings",
      ),
    ).toThrowError(expect.objectContaining({ code: "CONFIGURATION" }));
  });

  it("constructs exact-once encoded bracketed accommodation requests", () => {
    const url = buildLocalDataRequestUrl(providerConfig, "lodgings", {
      "cond[BPLC_NM::LIKE]": "블루웨이브",
      "cond[ROAD_NM_ADDR::LIKE]": "달맞이길 10",
    });
    expect(url.pathname).toBe("/1741000/lodgings/info");
    expect(url.toString()).toContain("serviceKey=test%2Fkey%2Bvalue%3D");
    expect(url.toString()).not.toContain("%252F");
    expect(url.searchParams.get("cond[BPLC_NM::LIKE]")).toBe("블루웨이브");
    expect(url.searchParams.get("cond[ROAD_NM_ADDR::LIKE]")).toBe("달맞이길 10");
  });

  it.each([
    "lodgings",
    "tourist_accommodations",
    "tourist_pensions",
  ] as const)("parses item arrays for %s", (dataset) => {
    expect(
      parseLocalDataResponse(
        envelope({ item: [{ BPLC_NM: "A" }, { BPLC_NM: "B" }] }),
        dataset,
      ).items,
    ).toHaveLength(2);
  });

  it("normalizes observed accommodation subtype, room, area, and suspension fields", () => {
    const record = accommodationRecord("tourist_accommodations", {
      TOUR_LDGBIZ_DTL_NM: "관광호텔업",
      GSRM_CNT: "42",
      ARCH_TFA: "1520.5",
      SUSPN_BGNG_YMD: "20260101",
      SUSPN_END_YMD: "20260131",
      RSMPTN_YMD: "20260201",
    });
    expect(record).toMatchObject({
      businessSubtype: "관광호텔업",
      roomCount: "42",
      facilityArea: "1520.5",
      suspensionStartDate: "20260101",
      suspensionEndDate: "20260131",
      reopeningDate: "20260201",
    });
    expect(record.sourceEvidence).not.toHaveProperty("CRD_INFO_X");
  });
});

describe("deterministic accommodation matching", () => {
  it("normalizes accommodation names and 부산 addresses conservatively", () => {
    expect(normalizeBusinessName("(주) 블루 웨이브 호텔 2호점")).toMatchObject({
      canonical: "블루웨이브호텔2호점",
    });
    expect(normalizeAddress("부산 해운대구 달맞이길 10").canonical).toBe(
      normalizeAddress("부산광역시 해운대구 달맞이길 10").canonical,
    );
  });

  it("filters generic accommodation words from relaxed queries", () => {
    for (const word of [
      "호텔",
      "모텔",
      "펜션",
      "리조트",
      "숙소",
      "게스트하우스",
      "hotel",
      "motel",
      "pension",
      "resort",
    ]) {
      expect(getRelaxedBusinessNameSegment(word, "accommodation")).toBeNull();
    }
    expect(getRelaxedBusinessNameSegment("블루웨이브 호텔", "accommodation")).toBe("블루웨이브");
  });

  it("produces high confidence for an exact accommodation name and address", () => {
    const candidate = scoreLicenseCandidate(
      {
        businessName: "블루웨이브 호텔",
        address: "부산 해운대구 달맞이길 10",
        domain: "accommodation",
      },
      accommodationRecord("lodgings"),
    );
    expect(candidate.totalScore).toBeGreaterThanOrEqual(
      LICENSE_MATCH_THRESHOLDS.high,
    );
    expect(candidate.components.address).toBe(1);
  });

  it("prevents high confidence for building conflicts, different names, and missing addresses", () => {
    const target = {
      businessName: "블루웨이브 호텔",
      address: "부산 해운대구 달맞이길 10",
      domain: "accommodation" as const,
    };
    expect(
      scoreLicenseCandidate(
        target,
        accommodationRecord("lodgings", {
          ROAD_NM_ADDR: "부산 해운대구 달맞이길 99",
        }),
      ).totalScore,
    ).toBeLessThan(LICENSE_MATCH_THRESHOLDS.possible);
    expect(
      scoreLicenseCandidate(
        target,
        accommodationRecord("lodgings", { BPLC_NM: "완전히 다른 숙박시설" }),
      ).totalScore,
    ).toBeLessThan(LICENSE_MATCH_THRESHOLDS.high);
    expect(
      scoreLicenseCandidate(
        { ...target, address: "" },
        accommodationRecord("lodgings", {
          ROAD_NM_ADDR: null,
          LOTNO_ADDR: null,
        }),
      ).totalScore,
    ).toBeLessThan(LICENSE_MATCH_THRESHOLDS.high);
  });

  it("caps common hotel names and type-word-only matches", () => {
    expect(isGenericAccommodationName("센트럴호텔")).toBe(true);
    expect(
      scoreLicenseCandidate(
        {
          businessName: "센트럴호텔",
          address: "부산 해운대구 달맞이길 10",
          domain: "accommodation",
        },
        accommodationRecord("lodgings", { BPLC_NM: "센트럴호텔" }),
      ).totalScore,
    ).toBeLessThan(LICENSE_MATCH_THRESHOLDS.high);
    expect(
      scoreLicenseCandidate(
        {
          businessName: "호텔",
          address: "부산 해운대구 달맞이길 10",
          domain: "accommodation",
        },
        accommodationRecord("lodgings", { BPLC_NM: "호텔" }),
      ).totalScore,
    ).toBeLessThan(LICENSE_MATCH_THRESHOLDS.possible);
  });

  it("detects branch and accommodation-type agreement or conflict", () => {
    const branch = scoreLicenseCandidate(
      {
        businessName: "블루웨이브 해운대점",
        address: "부산 해운대구 달맞이길 10",
        domain: "accommodation",
      },
      accommodationRecord("lodgings", { BPLC_NM: "블루웨이브 광안리점" }),
    );
    expect(branch.components.branchAgreement).toBe("conflict");

    const agreement = scoreLicenseCandidate(
      {
        businessName: "블루웨이브 호텔",
        address: "부산 해운대구 달맞이길 10",
        domain: "accommodation",
      },
      accommodationRecord("tourist_accommodations", {
        BPLC_NM: "블루웨이브",
        TOUR_LDGBIZ_DTL_NM: "관광호텔업",
      }),
    );
    const conflict = scoreLicenseCandidate(
      {
        businessName: "블루웨이브 호텔",
        address: "부산 해운대구 달맞이길 10",
        domain: "accommodation",
      },
      accommodationRecord("tourist_pensions", {
        BPLC_NM: "블루웨이브",
        TOUR_LDGBIZ_DTL_NM: "관광펜션업",
      }),
    );
    expect(agreement.components.accommodationTypeAgreement).toBe("agree");
    expect(conflict.components.accommodationTypeAgreement).toBe("conflict");
  });

  it("clusters compatible cross-dataset records as one business", () => {
    const target = {
      businessName: "블루웨이브 호텔",
      address: "부산 해운대구 달맞이길 10",
      domain: "accommodation" as const,
    };
    const clusters = clusterAccommodationCandidates([
      scoreLicenseCandidate(target, accommodationRecord("lodgings")),
      scoreLicenseCandidate(
        target,
        accommodationRecord("tourist_accommodations", {
          TOUR_LDGBIZ_DTL_NM: "관광호텔업",
        }),
      ),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.records).toHaveLength(2);
    expect(clusters[0]?.reasons.join(" ")).toContain("복수 인허가 기록");
  });

  it("keeps distinct cross-dataset businesses in separate clusters", () => {
    const target = {
      businessName: "블루웨이브",
      address: "부산 해운대구 달맞이길 10",
      domain: "accommodation" as const,
    };
    const clusters = clusterAccommodationCandidates([
      scoreLicenseCandidate(
        target,
        accommodationRecord("lodgings", { BPLC_NM: "블루웨이브호텔" }),
      ),
      scoreLicenseCandidate(
        target,
        accommodationRecord("tourist_pensions", { BPLC_NM: "블루웨이브펜션" }),
      ),
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("returns one high entity match for compatible records", async () => {
    const search = searchMock(async (dataset) =>
      searchResult(
        dataset,
        dataset === "lodgings" || dataset === "tourist_accommodations"
          ? [
              accommodationRecord(dataset, {
                TOUR_LDGBIZ_DTL_NM:
                  dataset === "tourist_accommodations" ? "관광호텔업" : null,
              }),
            ]
          : [],
      ),
    );
    const result = await new LicenseMatchingService(search).matchTourPlace(
      accommodationDetail(),
    );
    expect(result.licensingKind).toBe("accommodation");
    if (result.licensingKind !== "accommodation") throw new Error("wrong kind");
    expect(result.matchState).toBe("matched_high");
    expect(result.selectedRecords).toHaveLength(2);
    expect(result.alternatives).toHaveLength(0);
    expect(result.refinedVenueKind).toBe("hotel");
  });

  it("returns ambiguous for distinct nearly tied cross-dataset candidates", async () => {
    const search = searchMock(async (dataset) => {
      const records =
        dataset === "lodgings"
          ? [accommodationRecord(dataset, { BPLC_NM: "블루웨이브호텔" })]
          : dataset === "tourist_pensions"
            ? [accommodationRecord(dataset, { BPLC_NM: "블루웨이브펜션" })]
            : [];
      return searchResult(dataset, records);
    });
    const result = await new LicenseMatchingService(search).matchTourPlace(
      accommodationDetail({ title: "블루웨이브" }),
    );
    expect(result.licensingKind).toBe("accommodation");
    if (result.licensingKind !== "accommodation") throw new Error("wrong kind");
    expect(result.matchState).toBe("ambiguous");
    expect(result.selectedRecords).toHaveLength(0);
    expect(result.alternatives).toHaveLength(2);
  });

  it("returns ambiguous when strong-name records conflict on building numbers", async () => {
    const search = searchMock(async (dataset) => {
      if (dataset === "lodgings") {
        return searchResult(dataset, [accommodationRecord(dataset)]);
      }
      if (dataset === "tourist_accommodations") {
        return searchResult(dataset, [
          accommodationRecord(dataset, {
            ROAD_NM_ADDR: "부산광역시 해운대구 달맞이길 99",
          }),
        ]);
      }
      return searchResult(dataset, []);
    });
    const result = await new LicenseMatchingService(search).matchTourPlace(
      accommodationDetail(),
    );
    expect(result.licensingKind).toBe("accommodation");
    if (result.licensingKind !== "accommodation") throw new Error("wrong kind");
    expect(result.matchState).toBe("ambiguous");
    expect(result.selectedRecords).toHaveLength(0);
    expect(result.reasons.join(" ")).toContain("건물번호 또는 지번이 충돌");
  });

  it("keeps a safe match usable and partial when one provider fails", async () => {
    const search = searchMock(async (dataset) => {
      if (dataset === "tourist_pensions") throw new Error("provider failed");
      return searchResult(
        dataset,
        dataset === "lodgings" ? [accommodationRecord(dataset)] : [],
      );
    });
    const result = await new LicenseMatchingService(search).matchTourPlace(
      accommodationDetail(),
    );
    expect(result.licensingKind).toBe("accommodation");
    if (result.licensingKind !== "accommodation") throw new Error("wrong kind");
    expect(result).toMatchObject({
      matchState: "matched_possible",
      confidence: "possible",
      section: { status: "partial" },
    });
    expect(result.selectedRecords).toHaveLength(1);
    expect(
      result.perDatasetResults.find(
        ({ dataset }) => dataset === "tourist_pensions",
      )?.matchState,
    ).toBe("unavailable");
  });

  it("returns unavailable for all failures and not_found for successful empty searches", async () => {
    const failed = searchMock(async () => Promise.reject(new Error("failed")));
    const unavailable = await new LicenseMatchingService(failed).matchTourPlace(
      accommodationDetail(),
    );
    expect(unavailable.matchState).toBe("unavailable");
    expect(unavailable.section.status).toBe("unavailable");

    const empty = searchMock(async (dataset) => searchResult(dataset, []));
    const notFound = await new LicenseMatchingService(empty).matchTourPlace(
      accommodationDetail({ title: "블루웨이브" }),
    );
    expect(notFound.matchState).toBe("not_found");
  });

  it("preserves closed records and surfaces conflicting operating states", async () => {
    const search = searchMock(async (dataset) => {
      if (dataset === "lodgings") {
        return searchResult(dataset, [
          accommodationRecord(dataset, {
            SALS_STTS_NM: "폐업",
            DTL_SALS_STTS_NM: "폐업",
            CLSBIZ_YMD: "20250101",
          }),
        ]);
      }
      if (dataset === "tourist_accommodations") {
        return searchResult(dataset, [accommodationRecord(dataset)]);
      }
      return searchResult(dataset, []);
    });
    const result = await new LicenseMatchingService(search).matchTourPlace(
      accommodationDetail(),
    );
    expect(result.licensingKind).toBe("accommodation");
    if (result.licensingKind !== "accommodation") throw new Error("wrong kind");
    expect(result.selectedRecords.map((record) => record.operatingState)).toEqual([
      "closed",
      "active",
    ]);
    expect(result.operatingStateDiscrepancy).toBe(true);
    expect(result.operatingState).toBe("requires_confirmation");
    expect(result.reasons.join(" ")).toContain("영업상태가 달라");
  });

  it("refines pension and explicit hotel evidence without trusting the Tourism title alone", async () => {
    const cases = [
      {
        dataset: "tourist_pensions" as const,
        item: {},
        expected: "pension",
      },
      {
        dataset: "tourist_accommodations" as const,
        item: { TOUR_LDGBIZ_DTL_NM: "관광호텔업" },
        expected: "hotel",
      },
      {
        dataset: "lodgings" as const,
        item: { SNTTN_BZSTAT_NM: null, BZSTAT_SE_NM: null },
        expected: "accommodation",
      },
    ];
    for (const testCase of cases) {
      const search = searchMock(async (dataset) =>
        searchResult(
          dataset,
          dataset === testCase.dataset
            ? [accommodationRecord(dataset, testCase.item)]
            : [],
        ),
      );
      const result = await new LicenseMatchingService(search).matchTourPlace(
        accommodationDetail({ title: "블루웨이브 호텔" }),
      );
      if (result.licensingKind !== "accommodation") throw new Error("wrong kind");
      expect(result.refinedVenueKind).toBe(testCase.expected);
    }
  });

  it("makes zero calls for unsupported or spoofed Tourism records", async () => {
    const search = searchMock(async (dataset) => searchResult(dataset, []));
    const unsupported = accommodationDetail({
      category: "attraction",
      contentTypeId: "12",
      providerContentTypeId: "12",
    });
    expect(
      (await new LicenseMatchingService(search).matchTourPlace(unsupported))
        .matchState,
    ).toBe("not_applicable");
    const spoofed = accommodationDetail({ providerContentTypeId: "38" });
    expect(
      (await new LicenseMatchingService(search).matchTourPlace(spoofed)).matchState,
    ).toBe("not_applicable");
    expect(search.search).not.toHaveBeenCalled();
  });

  it("routes food and accommodation records only to their own dataset groups", async () => {
    const search = searchMock(async (dataset) => searchResult(dataset, []));
    const service = new LicenseMatchingService(search);
    await service.matchTourPlace(accommodationDetail({ title: "블루웨이브" }));
    expect(new Set(search.search.mock.calls.map(([query]) => query.dataset))).toEqual(
      new Set(["lodgings", "tourist_accommodations", "tourist_pensions"]),
    );

    search.search.mockClear();
    const food = accommodationDetail({
      title: "마린 테라스 식탁",
      category: "food",
      contentTypeId: "39",
      providerContentTypeId: "39",
    });
    await service.matchTourPlace(food);
    expect(new Set(search.search.mock.calls.map(([query]) => query.dataset))).toEqual(
      new Set(["general_restaurants", "rest_cafes"]),
    );

    search.search.mockClear();
    const shopping = accommodationDetail({
      title: "반려동물 쇼핑시설",
      category: "shopping",
      contentTypeId: "38",
      providerContentTypeId: "38",
    });
    expect((await service.matchTourPlace(shopping)).matchState).toBe(
      "not_applicable",
    );
    expect(search.search).not.toHaveBeenCalled();
  });

  it("never compares EPSG:5174-looking LocalData coordinates", () => {
    const withCoordinates = accommodationRecord("lodgings", {
      CRD_INFO_X: "999999",
      CRD_INFO_Y: "111111",
    });
    const withoutCoordinates = accommodationRecord("lodgings");
    const target = {
      businessName: "블루웨이브 호텔",
      address: "부산 해운대구 달맞이길 10",
      domain: "accommodation" as const,
    };
    expect(scoreLicenseCandidate(target, withCoordinates).totalScore).toBe(
      scoreLicenseCandidate(target, withoutCoordinates).totalScore,
    );
    expect(withCoordinates.sourceEvidence).not.toHaveProperty("coordinates");
  });

  it("documents a maximum of six accommodation provider calls per detail", () => {
    expect(MAX_LOCALDATA_CALLS_PER_DETAIL.accommodation).toBe(6);
  });

  it("keeps Tourism partial detail usable when accommodation licensing is unavailable", async () => {
    const tourismService = {
      getPlaceDetail: vi.fn(async () => accommodationDetail()),
      listPlaces: vi.fn(),
    };
    const matcher = {
      matchTourPlace: vi.fn(async () => {
        throw new Error("provider failure");
      }),
    };
    const response = await createTourPlaceDetailHandler(tourismService, matcher)(
      new Request("http://localhost/api/tour/places/8001?contentTypeId=32"),
      { params: Promise.resolve({ contentId: "8001" }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.summary.category).toBe("accommodation");
    expect(body.data.sections.licensing.status).toBe("unavailable");
    expect(body.data.licensing.licensingKind).toBe("accommodation");
  });
});
