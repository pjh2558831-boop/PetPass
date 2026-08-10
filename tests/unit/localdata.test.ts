import { describe, expect, it, vi } from "vitest";
import { createTourPlaceDetailHandler } from "@/app/api/tour/places/[contentId]/route";
import { LicenseRequestCache } from "@/lib/licenses/cache";
import {
  LocalDataClient,
  type LocalDataSearchResult,
  type LocalDataSearchService,
} from "@/lib/licenses/client";
import {
  LocalDataProviderError,
  redactLocalDataCredentials,
} from "@/lib/licenses/errors";
import {
  normalizeAddress,
  normalizeBusinessName,
  scoreLicenseCandidate,
} from "@/lib/licenses/matcher";
import {
  normalizeLocalDataRecord,
  normalizeOperatingState,
} from "@/lib/licenses/normalizers";
import { parseLocalDataResponse } from "@/lib/licenses/parser";
import {
  buildLocalDataRequestUrl,
  LocalDataProviderClient,
  type LocalDataProviderOptions,
} from "@/lib/licenses/provider";
import {
  FoodLicenseMatchingService,
  LICENSE_MATCH_THRESHOLDS,
  type FoodLicenseMatcher,
} from "@/lib/licenses/service";
import { LICENSE_MATCH_LABELS } from "@/lib/shared/format";
import type { LocalDataItem, ParsedLocalDataResponse } from "@/lib/licenses/schemas";
import type {
  FoodLicenseMatchResult,
  LocalDataDataset,
  LocalDataLicenseRecord,
} from "@/types/license";
import type { TourPlaceDetail } from "@/types/place";

const config: NonNullable<LocalDataProviderOptions["config"]> = {
  serviceKey: "test%2Fkey%2Bvalue%3D",
  endpoints: {
    general_restaurants: "https://apis.data.go.kr/1741000/general_restaurants/info",
    rest_cafes: "https://apis.data.go.kr/1741000/rest_cafes/info",
    lodgings: "https://apis.data.go.kr/1741000/lodgings/info",
    tourist_accommodations:
      "https://apis.data.go.kr/1741000/tourist_accommodations/info",
    tourist_pensions: "https://apis.data.go.kr/1741000/tourist_pensions/info",
  },
};

function envelope(items: unknown, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: {
        items,
        numOfRows: 20,
        pageNo: 1,
        totalCount: 1,
        ...overrides,
      },
    },
  });
}

function parsed(items: LocalDataItem[]): ParsedLocalDataResponse {
  return { items, numOfRows: 20, pageNo: 1, totalCount: items.length, resultCode: "00" };
}

function record(
  dataset: LocalDataDataset,
  overrides: Partial<LocalDataItem> = {},
): LocalDataLicenseRecord {
  return normalizeLocalDataRecord(
    {
      MNG_NO: `${dataset}-1`,
      BPLC_NM: "마린 테라스 식탁",
      ROAD_NM_ADDR: "부산광역시 해운대구 달맞이길 10",
      SALS_STTS_NM: "영업",
      DTL_SALS_STTS_NM: "정상",
      SNTTN_BZSTAT_NM: dataset === "general_restaurants" ? "일반음식점" : "휴게음식점",
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

function detail(
  category: TourPlaceDetail["summary"]["category"] = "food",
  contentTypeId: TourPlaceDetail["summary"]["contentTypeId"] = "39",
): TourPlaceDetail {
  return {
    summary: {
      contentId: "100",
      contentTypeId,
      providerContentTypeId: contentTypeId,
      category,
      title: "마린 테라스 식탁",
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
        contentId: "100",
        retrievedAt: "2026-08-05T00:00:00.000Z",
      },
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
      contentId: "100",
      retrievedAt: "2026-08-05T00:00:00.000Z",
    },
  };
}

function searchMock(
  implementation: (dataset: LocalDataDataset) => Promise<LocalDataSearchResult>,
): LocalDataSearchService & { search: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn(({ dataset }: { dataset: LocalDataDataset }) => implementation(dataset)),
  };
}

describe("LocalData provider", () => {
  it("encodes raw and already encoded service keys exactly once", () => {
    const encoded = buildLocalDataRequestUrl(config, "general_restaurants", {
      "cond[BPLC_NM::LIKE]": "테스트",
    }).toString();
    expect(encoded).toContain("serviceKey=test%2Fkey%2Bvalue%3D");
    expect(encoded).not.toContain("%252F");
    const raw = buildLocalDataRequestUrl(
      { ...config, serviceKey: "test/key+value=" },
      "rest_cafes",
      {},
    ).toString();
    expect(raw).toContain("serviceKey=test%2Fkey%2Bvalue%3D");
  });

  it("constructs the documented bracketed condition parameters", () => {
    const url = buildLocalDataRequestUrl(config, "general_restaurants", {
      "cond[BPLC_NM::LIKE]": "마린",
      "cond[ROAD_NM_ADDR::LIKE]": "달맞이길 10",
    });
    expect(url.pathname).toBe("/1741000/general_restaurants/info");
    expect(url.searchParams.get("cond[BPLC_NM::LIKE]")).toBe("마린");
    expect(url.searchParams.get("cond[ROAD_NM_ADDR::LIKE]")).toBe("달맞이길 10");
    expect(url.searchParams.get("returnType")).toBe("json");
    expect(url.searchParams.has("cond[SALS_STTS_CD::EQ]")).toBe(false);
  });

  it("redacts credentials, authenticated URLs, and query strings", () => {
    const sanitized = redactLocalDataCredentials(
      "failed https://apis.data.go.kr/path?serviceKey=fake-secret&cond[x]=y LOCALDATA_SERVICE_KEY=fake-secret",
    );
    expect(sanitized).not.toContain("fake-secret");
    expect(sanitized).not.toContain("?serviceKey");
    expect(sanitized).not.toContain("cond[x]");
  });

  it("parses item arrays and direct array variations", () => {
    expect(
      parseLocalDataResponse(
        envelope({ item: [{ BPLC_NM: "A" }, { BPLC_NM: "B" }] }),
        "general_restaurants",
      ).items,
    ).toHaveLength(2);
    expect(
      parseLocalDataResponse(
        envelope([{ BPLC_NM: "A" }]),
        "general_restaurants",
      ).items,
    ).toHaveLength(1);
  });

  it("wraps a single item object", () => {
    const response = parseLocalDataResponse(
      envelope({ item: { BPLC_NM: "A" } }),
      "rest_cafes",
    );
    expect(response.items).toHaveLength(1);
  });

  it("accepts normal empty responses", () => {
    expect(parseLocalDataResponse(envelope(""), "rest_cafes").items).toEqual([]);
    expect(parseLocalDataResponse(envelope({}), "rest_cafes").items).toEqual([]);
  });

  it("rejects malformed JSON and unexpected XML or HTML", () => {
    expect(() => parseLocalDataResponse("{bad", "rest_cafes")).toThrowError(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
    expect(() => parseLocalDataResponse("<html>failure</html>", "rest_cafes")).toThrowError(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });

  it("maps HTTP 200 provider error payloads", () => {
    expect(() =>
      parseLocalDataResponse(
        JSON.stringify({ response: { header: { resultCode: "22", resultMsg: "LIMIT EXCEEDED" } } }),
        "general_restaurants",
      ),
    ).toThrowError(expect.objectContaining({ code: "QUOTA_EXHAUSTED" }));
  });

  it("maps authentication, forbidden, quota, timeout, and retries 5xx once", async () => {
    for (const [status, code] of [
      [401, "AUTHENTICATION"],
      [403, "FORBIDDEN"],
      [429, "QUOTA_EXHAUSTED"],
    ] as const) {
      const fetchImpl = vi.fn(async () => new Response("failure", { status })) as typeof fetch;
      const client = new LocalDataProviderClient({ config, fetchImpl, transientRetryCount: 1 });
      await expect(client.request("general_restaurants", {})).rejects.toMatchObject({ code });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }

    const timeoutFetch = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError");
    }) as typeof fetch;
    await expect(
      new LocalDataProviderClient({ config, fetchImpl: timeoutFetch }).request("rest_cafes", {}),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(timeoutFetch).toHaveBeenCalledTimes(1);

    const retryFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(envelope({}), { status: 200 })) as typeof fetch;
    await expect(
      new LocalDataProviderClient({ config, fetchImpl: retryFetch }).request("rest_cafes", {}),
    ).resolves.toMatchObject({ items: [] });
    expect(retryFetch).toHaveBeenCalledTimes(2);
  });

  it("does not fall back to fixtures after a provider failure", async () => {
    const provider = {
      request: vi.fn(async () => {
        throw new LocalDataProviderError("UPSTREAM", "failed");
      }),
    };
    const client = new LocalDataClient(provider, new LicenseRequestCache());
    await expect(
      client.search({ dataset: "general_restaurants", businessName: "테스트" }),
    ).rejects.toBeInstanceOf(LocalDataProviderError);
  });

  it("deduplicates equivalent in-flight searches for six hours", async () => {
    const provider = { request: vi.fn(async () => parsed([{ BPLC_NM: "테스트" }])) };
    const client = new LocalDataClient(provider, new LicenseRequestCache());
    const query = { dataset: "general_restaurants" as const, businessName: "테스트" };
    await Promise.all([client.search(query), client.search(query)]);
    await client.search(query);
    expect(provider.request).toHaveBeenCalledTimes(1);
  });
});

describe("deterministic food-license matching", () => {
  it("normalizes names conservatively while preserving branch identity", () => {
    const normalized = normalizeBusinessName("(주) 오션 브루 해운대점");
    expect(normalized.canonical).toBe("오션브루해운대점");
    expect(normalized.branchTokens).toContain("해운대점");
  });

  it("normalizes 부산 and 부산광역시 equivalently and extracts address evidence", () => {
    const short = normalizeAddress("부산 해운대구 달맞이길 10");
    const long = normalizeAddress("부산광역시 해운대구 달맞이길 10");
    expect(short.canonical).toBe(long.canonical);
    expect(long).toMatchObject({
      roadName: "달맞이길",
      buildingNumber: "10",
      district: "해운대구",
    });
  });

  it("produces a high-confidence exact name and address match", async () => {
    const search = searchMock(async (dataset) =>
      searchResult(dataset, dataset === "general_restaurants" ? [record(dataset)] : []),
    );
    const result = await new FoodLicenseMatchingService(search).matchTourPlace(detail());
    expect(result).toMatchObject({
      matchState: "matched_high",
      confidence: "high",
      refinedVenueKind: "restaurant",
    });
    expect(result.totalScore).toBeGreaterThanOrEqual(LICENSE_MATCH_THRESHOLDS.high);
  });

  it("caps the score for a matching name with a conflicting building number", () => {
    const candidate = scoreLicenseCandidate(
      { businessName: "마린 테라스 식탁", address: "부산 해운대구 달맞이길 10" },
      record("general_restaurants", { ROAD_NM_ADDR: "부산 해운대구 달맞이길 99" }),
    );
    expect(candidate.components.buildingNumberAgreement).toBe("conflict");
    expect(candidate.totalScore).toBeLessThan(LICENSE_MATCH_THRESHOLDS.possible);
  });

  it("does not high-confidence match the same address to a materially different name", () => {
    const candidate = scoreLicenseCandidate(
      { businessName: "완전히 다른 식당", address: "부산 해운대구 달맞이길 10" },
      record("general_restaurants"),
    );
    expect(candidate.totalScore).toBeLessThan(LICENSE_MATCH_THRESHOLDS.possible);
  });

  it("never produces high confidence without address evidence", () => {
    const candidate = scoreLicenseCandidate(
      { businessName: "마린 테라스 식탁", address: "" },
      record("general_restaurants", { ROAD_NM_ADDR: null, LOTNO_ADDR: null }),
    );
    expect(candidate.totalScore).toBeLessThan(LICENSE_MATCH_THRESHOLDS.high);
    expect(candidate.components.address).toBe(0);
  });

  it("does not falsely match a common short business name", () => {
    const candidate = scoreLicenseCandidate(
      { businessName: "카페", address: "부산 해운대구 달맞이길 10" },
      record("rest_cafes", { BPLC_NM: "카페" }),
    );
    expect(candidate.totalScore).toBeLessThan(LICENSE_MATCH_THRESHOLDS.possible);
  });

  it("returns ambiguous when two plausible candidates are nearly equal", async () => {
    const search = searchMock(async (dataset) => searchResult(dataset, [record(dataset)]));
    const result = await new FoodLicenseMatchingService(search).matchTourPlace(detail());
    expect(result.matchState).toBe("ambiguous");
    expect(result.selectedRecord).toBeNull();
    expect(result.alternatives).toHaveLength(2);
  });

  it("returns unavailable when providers fail and partial possible when one fails", async () => {
    const failed = searchMock(async () => Promise.reject(new Error("provider failed")));
    await expect(new FoodLicenseMatchingService(failed).matchTourPlace(detail())).resolves.toMatchObject({
      matchState: "unavailable",
      section: { status: "unavailable" },
    });

    const partial = searchMock(async (dataset) => {
      if (dataset === "rest_cafes") throw new Error("provider failed");
      return searchResult(dataset, [record(dataset)]);
    });
    await expect(new FoodLicenseMatchingService(partial).matchTourPlace(detail())).resolves.toMatchObject({
      matchState: "matched_possible",
      confidence: "possible",
      section: { status: "partial" },
    });
  });

  it("returns not_found after successful empty searches", async () => {
    const search = searchMock(async (dataset) => searchResult(dataset, []));
    const result = await new FoodLicenseMatchingService(search).matchTourPlace(detail());
    expect(result.matchState).toBe("not_found");
    expect(result.section.status).toBe("available");
  });

  it("keeps a matched closed record and surfaces its operating state", async () => {
    const closed = record("general_restaurants", {
      SALS_STTS_NM: "폐업",
      DTL_SALS_STTS_NM: "폐업",
      CLSBIZ_YMD: "20250101",
    });
    const search = searchMock(async (dataset) =>
      searchResult(dataset, dataset === "general_restaurants" ? [closed] : []),
    );
    const result = await new FoodLicenseMatchingService(search).matchTourPlace(detail());
    expect(result.matchState).toBe("matched_high");
    expect(result.operatingState).toBe("closed");
    expect(result.selectedRecord?.closureDate).toBe("20250101");
  });

  it("classifies only explicit operating-state names", () => {
    expect(normalizeOperatingState({ SALS_STTS_NM: "영업", DTL_SALS_STTS_NM: "정상" })).toBe("active");
    expect(normalizeOperatingState({ SALS_STTS_NM: "폐업" })).toBe("closed");
    expect(normalizeOperatingState({ DTL_SALS_STTS_NM: "영업정지" })).toBe("suspended");
    expect(normalizeOperatingState({ SALS_STTS_CD: "01" })).toBe("unknown");
  });

  it("refines general restaurant and rest-cafe matches separately", async () => {
    for (const [dataset, expected] of [
      ["general_restaurants", "restaurant"],
      ["rest_cafes", "cafe"],
    ] as const) {
      const search = searchMock(async (requested) =>
        searchResult(requested, requested === dataset ? [record(requested)] : []),
      );
      const result = await new FoodLicenseMatchingService(search).matchTourPlace(detail());
      expect(result.refinedVenueKind).toBe(expected);
    }
  });

  it("returns not_applicable without provider calls for non-food records", async () => {
    const search = searchMock(async (dataset) => searchResult(dataset, []));
    const result = await new FoodLicenseMatchingService(search).matchTourPlace(
      detail("attraction", "12"),
    );
    expect(result.matchState).toBe("not_applicable");
    expect(search.search).not.toHaveBeenCalled();
  });

  it("does not trust a browser content-type hint over the provider-reported type", async () => {
    const search = searchMock(async (dataset) => searchResult(dataset, []));
    const spoofed = detail("food", "39");
    spoofed.summary.providerContentTypeId = "38";
    const result = await new FoodLicenseMatchingService(search).matchTourPlace(spoofed);
    expect(result.matchState).toBe("not_applicable");
    expect(search.search).not.toHaveBeenCalled();
  });

  it("does not normalize or compare LocalData EPSG:5174 coordinates", () => {
    const withoutCoordinates = record("general_restaurants");
    const withCoordinates = record("general_restaurants", {
      CRD_INFO_X: "999999",
      CRD_INFO_Y: "111111",
    });
    const target = {
      businessName: "마린 테라스 식탁",
      address: "부산 해운대구 달맞이길 10",
    };
    expect(scoreLicenseCandidate(target, withCoordinates).totalScore).toBe(
      scoreLicenseCandidate(target, withoutCoordinates).totalScore,
    );
    expect(withCoordinates.sourceEvidence).not.toHaveProperty("coordinates");
  });

  it("keeps prohibited claims out of match-state labels", () => {
    expect(Object.values(LICENSE_MATCH_LABELS).join(" ")).not.toMatch(/무허가|불법/u);
  });

  it("keeps Tourism partial detail usable when licensing is unavailable", async () => {
    const tourismService = { getPlaceDetail: vi.fn(async () => detail()), listPlaces: vi.fn() };
    const unavailableResult: FoodLicenseMatchResult = {
      licensingKind: "food",
      matchState: "unavailable",
      refinedVenueKind: null,
      confidence: "none",
      totalScore: null,
      reasons: ["provider unavailable"],
      selectedRecord: null,
      alternatives: [],
      operatingState: null,
      sources: [],
      section: { status: "unavailable", message: "현재 인허가 정보를 확인할 수 없습니다." },
    };
    const matcher: FoodLicenseMatcher = { matchTourPlace: vi.fn(async () => unavailableResult) };
    const response = await createTourPlaceDetailHandler(tourismService, matcher)(
      new Request("http://localhost/api/tour/places/100?contentTypeId=39"),
      { params: Promise.resolve({ contentId: "100" }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.sections).toMatchObject({
      intro: { status: "unavailable" },
      licensing: { status: "unavailable" },
    });
    expect(body.data.summary.title).toBe("마린 테라스 식탁");
  });
});
