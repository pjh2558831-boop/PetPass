import { describe, expect, it, vi } from "vitest";
import {
  buildTourRequestUrl,
  TourApiClient,
  type TourApiClientOptions,
} from "@/lib/tour-api/client";
import {
  getTourApiConfig,
  validateTourApiBaseUrl,
} from "@/lib/tour-api/config";
import { TourRequestCache } from "@/lib/tour-api/cache";
import {
  redactTourCredentials,
  TourProviderError,
} from "@/lib/tour-api/errors";
import {
  extractSafeHomepageUrl,
  normalizeIntroPetPolicyEvidence,
  normalizePetPolicyEvidence,
  normalizeTourIntroDetails,
  normalizeTourCategory,
  normalizeTourPlaceSummary,
} from "@/lib/tour-api/normalizers";
import { parseTourResponse } from "@/lib/tour-api/parser";
import {
  KoreaTourismService,
  type TourClientLike,
  type TourPlaceService,
} from "@/lib/tour-api/service";
import type { ParsedTourResponse, TourItem } from "@/lib/tour-api/schemas";
import { createTourPlacesHandler } from "@/app/api/tour/places/handler";
import { createTourPlaceDetailHandler } from "@/app/api/tour/places/[contentId]/handler";
import { createUnavailableLicenseResult } from "@/lib/licenses/service";
import type { LicenseMatcher } from "@/lib/licenses/service";
import { DEMO_SANITIZED_SERVICE2_TYPE_38 } from "@/fixtures/tour-service2-current-sanitized";

const config: NonNullable<TourApiClientOptions["config"]> = {
  baseUrl: "https://apis.data.go.kr/B551011/KorPetTourService2",
  serviceKey: "test%2Fkey%2Bvalue%3D",
  mobileOs: "ETC",
  mobileApp: "PetPass",
};

function envelope(items: unknown, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    response: {
      header: { resultCode: "0000", resultMsg: "OK" },
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

function parsed(items: TourItem[]): ParsedTourResponse {
  return { items, numOfRows: 20, pageNo: 1, totalCount: items.length, resultCode: "0000" };
}

function exposedVisibilityPage(contentId: string, contentTypeId: "12" | "38" | "39") {
  const checkedAt = "2026-08-05T00:00:00.000Z";
  return {
    records: [{
      contentId,
      contentTypeId,
      visibility: {
        status: "exposed" as const,
        providerField: "showflag",
        providerValue: "1",
        checkedAt,
        reasonCodes: [],
      },
    }],
    page: 1,
    pageSize: 50,
    totalCount: 1,
    source: {
      provider: "Korea Tourism Organization" as const,
      operation: "petTourSyncList2" as const,
      retrievedAt: checkedAt,
    },
  };
}

describe("Korea Tourism Organization provider", () => {
  it.each([
    "https://apis.data.go.kr/B551011/KorPetTourService2",
    "https://apis.data.go.kr/B551011/KorPetTourService2/",
    "https://apis.data.go.kr:443/B551011/KorPetTourService2",
  ])("accepts and canonicalizes an exact official base URL: %s", (baseUrl) => {
    expect(validateTourApiBaseUrl(baseUrl)).toBe(
      "https://apis.data.go.kr/B551011/KorPetTourService2",
    );
    expect(
      getTourApiConfig({
        TOUR_API_SERVICE_KEY: "test-key",
        TOUR_API_BASE_URL: baseUrl,
      } as unknown as NodeJS.ProcessEnv).baseUrl,
    ).toBe("https://apis.data.go.kr/B551011/KorPetTourService2");
  });

  it.each([
    "http://apis.data.go.kr/B551011/KorPetTourService2",
    "https://user@apis.data.go.kr/B551011/KorPetTourService2",
    "https://user:password@apis.data.go.kr/B551011/KorPetTourService2",
    "https://apis.data.go.kr:444/B551011/KorPetTourService2",
    "https://apis.data.go.kr.evil.example/B551011/KorPetTourService2",
    "https://apis-data-go-kr.example/B551011/KorPetTourService2",
    "https://apis.data.go.kr@evil.example/B551011/KorPetTourService2",
    "https://evil.example/apis.data.go.kr/B551011/KorPetTourService2",
    "https://apis.data.go.kr/proxy/B551011/KorPetTourService2",
    "https://apis.data.go.kr/B551011/KorPetTourService2/extra",
    "https://apis.data.go.kr/B551011/ignored/../KorPetTourService2",
    "https://apis.data.go.kr/B551011/KorPetTourService2?redirect=evil",
    "https://apis.data.go.kr/B551011/KorPetTourService2#unsafe",
    "https://apis.data.go.kr%40evil.example/B551011/KorPetTourService2",
    " https://apis.data.go.kr/B551011/KorPetTourService2",
    "https://apis.data.go.kr/B551011/KorPetTourService2\n",
  ])("rejects an unapproved TOUR base URL without echoing it: %s", (baseUrl) => {
    try {
      validateTourApiBaseUrl(baseUrl);
      throw new Error("expected URL validation to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFIGURATION" });
      expect(String(error)).not.toContain(baseUrl);
    }
  });

  it("validates an injected base URL before constructing or fetching a request", async () => {
    const fetchImpl = vi.fn();
    const client = new TourApiClient({
      config: {
        ...config,
        baseUrl:
          "https://apis.data.go.kr.evil.example/B551011/KorPetTourService2",
      },
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.request("areaBasedList2", { lDongRegnCd: "26" }),
    ).rejects.toMatchObject({ code: "CONFIGURATION" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("encodes a raw or already encoded service key exactly once", () => {
    const encoded = buildTourRequestUrl(config, "areaBasedList2", {
      lDongRegnCd: "26",
    }).toString();
    expect(encoded).toContain("serviceKey=test%2Fkey%2Bvalue%3D");
    expect(encoded).not.toContain("%252F");

    const raw = buildTourRequestUrl(
      { ...config, serviceKey: "test/key+value=" },
      "areaBasedList2",
      { lDongRegnCd: "26" },
    ).toString();
    expect(raw).toContain("serviceKey=test%2Fkey%2Bvalue%3D");
  });

  it("redacts credentials and query strings from provider errors", () => {
    const sanitized = redactTourCredentials(
      "failed https://apis.data.go.kr/path?serviceKey=fake-secret&x=1 TOUR_API_SERVICE_KEY=fake-secret",
    );
    expect(sanitized).not.toContain("fake-secret");
    expect(sanitized).not.toContain("?serviceKey");
  });

  it("parses an item array", () => {
    const result = parseTourResponse(
      envelope({ item: [{ contentid: "1" }, { contentid: "2" }] }),
      "areaBasedList2",
    );
    expect(result.items.map((item) => item.contentid)).toEqual(["1", "2"]);
  });

  it("wraps a single item object in an array", () => {
    const result = parseTourResponse(
      envelope({ item: { contentid: "1" } }),
      "detailCommon2",
    );
    expect(result.items).toHaveLength(1);
  });

  it("accepts empty item variations", () => {
    expect(parseTourResponse(envelope(""), "areaBasedList2").items).toEqual([]);
    expect(parseTourResponse(envelope({}), "areaBasedList2").items).toEqual([]);
  });

  it("maps a non-success provider result", () => {
    const payload = JSON.stringify({
      response: {
        header: { resultCode: "22", resultMsg: "LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR" },
      },
    });
    expect(() => parseTourResponse(payload, "areaBasedList2")).toThrowError(
      expect.objectContaining({ code: "QUOTA_EXHAUSTED" }),
    );
  });

  it("maps an HTTP authentication failure without returning the body", async () => {
    const client = new TourApiClient({
      config,
      transientRetryCount: 0,
      fetchImpl: vi.fn(async () => new Response("credential details", { status: 401 })) as typeof fetch,
    });
    await expect(client.request("areaBasedList2", { lDongRegnCd: "26" })).rejects.toMatchObject({
      code: "AUTHENTICATION",
      retryable: false,
    });
  });

  it("maps timeouts without retrying them", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as typeof fetch;
    const client = new TourApiClient({ config, fetchImpl, transientRetryCount: 1 });
    await expect(client.request("areaBasedList2", { lDongRegnCd: "26" })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON and unexpected XML or HTML", () => {
    expect(() => parseTourResponse("{bad", "areaBasedList2")).toThrowError(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
    expect(() => parseTourResponse("<html>failure</html>", "areaBasedList2")).toThrowError(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });

  it("normalizes missing optional fields without inventing values", () => {
    const result = normalizeTourPlaceSummary(
      { contentid: "1", contenttypeid: "39" },
      { operation: "areaBasedList2", retrievedAt: "2026-08-03T00:00:00.000Z" },
    );
    expect(result).toMatchObject({
      contentId: "1",
      category: "food",
      title: null,
      address: null,
      latitude: null,
      longitude: null,
    });
  });

  it("rejects unsafe homepage protocols", () => {
    expect(extractSafeHomepageUrl('<a href="javascript:alert(1)">site</a>')).toBeNull();
    expect(extractSafeHomepageUrl('<a href="https://example.com/path">site</a>')).toBe(
      "https://example.com/path",
    );
  });

  it("normalizes only the documented intro pet field for a trusted content type", () => {
    const evidence = normalizeIntroPetPolicyEvidence(
      { chkpet: "<b>반려동물 동반 가능</b>", chkpetculture: "동반 불가" },
      "12",
      { contentId: "100", retrievedAt: "2026-08-05T00:00:00.000Z" },
    );
    expect(evidence).toMatchObject({
      field: "chkpet",
      value: "반려동물 동반 가능",
      sourceEvidence: { operation: "detailIntro2", contentId: "100" },
    });
    expect(
      normalizeIntroPetPolicyEvidence(
        { chkpet: "반려동물 동반 가능" },
        "32",
        { contentId: "100", retrievedAt: "2026-08-05T00:00:00.000Z" },
      ),
    ).toBeNull();
  });

  it("removes raw HTML and bounds normalized pet policy evidence", () => {
    const evidence = normalizePetPolicyEvidence(
      { contentid: "100", etcAcmpyInfo: `<script>unsafe()</script>${"가".repeat(2_100)}` },
      { contentId: "100", retrievedAt: "2026-08-05T00:00:00.000Z" },
    );
    expect(evidence?.fields.etcAcmpyInfo).not.toContain("<script>");
    expect(Array.from(evidence?.fields.etcAcmpyInfo ?? "")).toHaveLength(2_000);
  });

  it("preserves every recognized non-empty field from the sanitized current shape", () => {
    const evidence = normalizePetPolicyEvidence(
      {
        ...DEMO_SANITIZED_SERVICE2_TYPE_38.pet,
        acmpyPsblCpam: "반려견",
        acmpyNeedMtr: "현장 정책 확인",
        etcAcmpyInfo: "반려동물 동반 안내",
        relaAcdntRiskMtr: "안전수칙 확인",
        relaPosesFclty: "관련 시설",
        relaFrnshPrdlst: "비치 품목",
        relaPurcPrdlst: "구매 품목",
        relaRntlPrdlst: "대여 품목",
      },
      { contentId: "2930927", retrievedAt: "2026-08-05T00:00:00.000Z" },
    );
    expect(Object.values(evidence?.fields ?? {}).filter(Boolean)).toHaveLength(9);
    expect(evidence?.sourceEvidence.originalEvidenceFields).toEqual(evidence?.fields);
  });

  it("normalizes the same item shape after JSON or XML-compatible extraction", () => {
    const context = {
      contentId: "2930927",
      retrievedAt: "2026-08-05T00:00:00.000Z",
    };
    const jsonItem = { ...DEMO_SANITIZED_SERVICE2_TYPE_38.pet };
    const xmlCompatibleItem = Object.fromEntries(
      Object.entries(DEMO_SANITIZED_SERVICE2_TYPE_38.pet),
    ) as TourItem;
    expect(normalizePetPolicyEvidence(xmlCompatibleItem, context)).toEqual(
      normalizePetPolicyEvidence(jsonItem, context),
    );
  });

  it("normalizes only the current KorPetTourService2 content types", () => {
    expect(normalizeTourCategory("12")).toBe("attraction");
    expect(normalizeTourCategory("14")).toBe("culture");
    expect(normalizeTourCategory("15")).toBe("festival");
    expect(normalizeTourCategory("28")).toBe("leisure");
    expect(normalizeTourCategory("32")).toBe("accommodation");
    expect(normalizeTourCategory("38")).toBe("shopping");
    expect(normalizeTourCategory("39")).toBe("food");
    expect(normalizeTourCategory("75")).toBe("unknown");

    const current = normalizeTourPlaceSummary(
      { contentid: "current", contenttypeid: "38" },
      {
        operation: "detailCommon2",
        retrievedAt: "2026-08-05T00:00:00.000Z",
        fallbackContentTypeId: "39",
      },
    );
    expect(current).toMatchObject({
      contentTypeId: "38",
      providerContentTypeId: "38",
      category: "shopping",
    });
  });

  it("uses only documented current detailIntro2 pet fields", () => {
    const context = {
      contentId: "100",
      retrievedAt: "2026-08-05T00:00:00.000Z",
    };
    expect(normalizeIntroPetPolicyEvidence({ chkpet: "동반 가능" }, "12", context)?.field)
      .toBe("chkpet");
    expect(
      normalizeIntroPetPolicyEvidence(
        { chkpetculture: "동반 가능" },
        "14",
        context,
      )?.field,
    ).toBe("chkpetculture");
    expect(
      normalizeIntroPetPolicyEvidence(
        { chkpetleports: "동반 가능" },
        "28",
        context,
      )?.field,
    ).toBe("chkpetleports");
    expect(
      normalizeIntroPetPolicyEvidence(
        { chkpetshopping: "동반 가능" },
        "38",
        context,
      )?.field,
    ).toBe("chkpetshopping");
    expect(normalizeIntroPetPolicyEvidence({ chkpet: "동반 가능" }, "32", context))
      .toBeNull();
    expect(normalizeIntroPetPolicyEvidence({ chkpet: "동반 가능" }, "39", context))
      .toBeNull();
  });

  it("keeps accommodation check-in and check-out separate from opening hours", () => {
    const intro = normalizeTourIntroDetails({
      contenttypeid: "32",
      checkintime: "15:00",
      checkouttime: "11:00",
    });
    expect(intro).toMatchObject({
      operatingInformation: null,
      checkInTime: "15:00",
      checkOutTime: "11:00",
    });
  });

  it("returns structured 400 responses for obsolete content types and invalid ids", async () => {
    const service = {
      listPlaces: vi.fn(),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;
    const listResponse = await createTourPlacesHandler(service)(
      new Request("http://localhost/api/tour/places?contentTypeId=75"),
    );
    expect(listResponse.status).toBe(400);
    expect(service.listPlaces).not.toHaveBeenCalled();

    const legacyDistrictResponse = await createTourPlacesHandler(service)(
      new Request("http://localhost/api/tour/places?districtCode=16"),
    );
    expect(legacyDistrictResponse.status).toBe(400);
    expect(service.listPlaces).not.toHaveBeenCalled();

    const detailResponse = await createTourPlaceDetailHandler(service)(
      new Request("http://localhost/api/tour/places/not-valid"),
      { params: Promise.resolve({ contentId: "not-valid" }) },
    );
    expect(detailResponse.status).toBe(400);
    expect(service.getPlaceDetail).not.toHaveBeenCalled();
  });

  it("accepts only typed catalog query fields and returns normalized place fields", async () => {
    const summary = normalizeTourPlaceSummary(
      {
        contentid: "3801",
        contenttypeid: "38",
        title: "부산 쇼핑 장소",
        addr1: "부산광역시 수영구 광안로 1",
        mapx: "129.1",
        mapy: "35.1",
        upstreamOnly: "must-not-be-forwarded",
      },
      {
        operation: "areaBasedList2",
        retrievedAt: "2026-08-05T00:00:00.000Z",
      },
    )!;
    const service = {
      listPlaces: vi.fn(async (query) => ({
        places: [summary],
        page: query.page,
        pageSize: query.pageSize,
        totalCount: 1,
        source: summary.source,
      })),
      listProviderVisibility: vi.fn(async () => exposedVisibilityPage("3801", "38")),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;
    const response = await createTourPlacesHandler(service)(
      new Request(
        "http://localhost/api/tour/places?contentTypeId=38&page=1&pageSize=12&operation=detailPetTour2&serviceKey=browser-key&arbitrary=value",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(service.listPlaces).toHaveBeenCalledWith({
      regionCode: "26",
      districtCode: undefined,
      contentTypeId: "38",
      page: 1,
      pageSize: 50,
    });
    expect(body.data.places[0]).toMatchObject({
      contentId: "3801",
      contentTypeId: "38",
      category: "shopping",
    });
    expect(JSON.stringify(body)).not.toContain("upstreamOnly");
    expect(JSON.stringify(body)).not.toContain("browser-key");
    expect(JSON.stringify(body)).not.toContain("arbitrary");
  });

  it("paginates the filtered marker dataset without reporting the unfiltered total", async () => {
    const checkedAt = "2026-08-05T00:00:00.000Z";
    const makeSummary = (contentId: string, contentTypeId: "12" | "39", title: string) =>
      normalizeTourPlaceSummary(
        {
          contentid: contentId,
          contenttypeid: contentTypeId,
          title,
          addr1: "부산광역시 해운대구",
          mapx: "129.16",
          mapy: "35.16",
          lDongRegnCd: "26",
          lDongSignguCd: "350",
        },
        { operation: "areaBasedList2", retrievedAt: checkedAt },
      )!;
    const placesByType = new Map([
      ["12", [
        makeSummary("1201", "12", "가 관광지"),
        makeSummary("1202", "12", "나 관광지"),
      ]],
      ["39", [makeSummary("3901", "39", "음식점 하나")]],
    ]);
    const service = {
      listPlaces: vi.fn(async (query: { contentTypeId: string; page: number; pageSize: number }) => {
        const places = placesByType.get(query.contentTypeId) ?? [];
        return {
          places,
          page: query.page,
          pageSize: query.pageSize,
          totalCount: places.length,
          source: {
            provider: "Korea Tourism Organization" as const,
            operation: "areaBasedList2" as const,
            retrievedAt: checkedAt,
          },
        };
      }),
      listProviderVisibility: vi.fn(async (query: { contentTypeId: string; page: number; pageSize: number }) => {
        const places = placesByType.get(query.contentTypeId) ?? [];
        return {
          records: places.map((place) => ({
            contentId: place.contentId,
            contentTypeId: place.contentTypeId,
            visibility: {
              status: "exposed" as const,
              providerField: "showflag",
              providerValue: "1",
              checkedAt,
              reasonCodes: [],
            },
          })),
          page: query.page,
          pageSize: query.pageSize,
          totalCount: places.length,
          source: {
            provider: "Korea Tourism Organization" as const,
            operation: "petTourSyncList2" as const,
            retrievedAt: checkedAt,
          },
        };
      }),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;
    const handler = createTourPlacesHandler(service);

    const first = await handler(new Request(
      "http://localhost/api/tour/places?view=markers&categories=attraction&page=1&pageSize=1",
    ));
    const second = await handler(new Request(
      "http://localhost/api/tour/places?view=markers&categories=attraction&page=2&pageSize=1",
    ));
    const unfiltered = await handler(new Request(
      "http://localhost/api/tour/places?view=markers&page=1&pageSize=2",
    ));

    await expect(first.json()).resolves.toMatchObject({
      data: { items: [{ providerPlaceId: "1201" }], totalCount: 2, hasNext: true },
    });
    await expect(second.json()).resolves.toMatchObject({
      data: { items: [{ providerPlaceId: "1202" }], totalCount: 2, hasNext: false },
    });
    await expect(unfiltered.json()).resolves.toMatchObject({
      data: { totalCount: 3, hasNext: true },
    });
  });

  it("returns a sanitized typed provider error from the catalog route", async () => {
    const service = {
      listPlaces: vi.fn(async () => {
        throw new TourProviderError(
          "UPSTREAM",
          "failed serviceKey=super-secret https://apis.data.go.kr/path?serviceKey=super-secret",
          { retryable: true, operation: "areaBasedList2" },
        );
      }),
      listProviderVisibility: vi.fn(async () => exposedVisibilityPage("3801", "38")),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;
    const response = await createTourPlacesHandler(service)(
      new Request("http://localhost/api/tour/places?contentTypeId=38"),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "UPSTREAM_ERROR", retryable: true },
    });
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(JSON.stringify(body)).not.toContain("?serviceKey=");
  });

  it("returns partial detail data when an optional operation fails", async () => {
    const client: TourClientLike = {
      request: vi.fn(async (operation) => {
        if (operation === "detailCommon2") {
          return parsed([{ contentid: "100", contenttypeid: "39", lDongRegnCd: "26", title: "부산 음식점" }]);
        }
        if (operation === "petTourSyncList2") {
          return parsed([{ contentid: "100", contenttypeid: "39", showflag: "1" }]);
        }
        if (operation === "detailIntro2") {
          throw new TourProviderError("TIMEOUT", "timeout", { operation });
        }
        if (operation === "detailPetTour2") {
          return parsed([{ contentid: "100", acmpyNeedMtr: "목줄 지참" }]);
        }
        return parsed([]);
      }),
    };
    const service = new KoreaTourismService(
      client,
      new TourRequestCache(),
      () => new Date("2026-08-03T00:00:00.000Z"),
    );
    const detail = await service.getPlaceDetail("100", "39");
    expect(detail.sections).toMatchObject({
      common: { status: "available" },
      intro: { status: "unavailable" },
      petPolicy: { status: "available" },
    });
    expect(detail.petPolicyEvidence?.fields.acmpyNeedMtr).toBe("목줄 지참");
  });

  it("keeps a fulfilled empty pet response distinct from provider failure", async () => {
    const client: TourClientLike = {
      request: vi.fn(async (operation) => {
        if (operation === "detailCommon2") {
          return parsed([{ contentid: "100", contenttypeid: "38", lDongRegnCd: "26" }]);
        }
        if (operation === "petTourSyncList2") {
          return parsed([{ contentid: "100", contenttypeid: "38", showflag: "1" }]);
        }
        if (operation === "detailIntro2") return parsed([]);
        if (operation === "detailPetTour2") return parsed([]);
        return parsed([]);
      }),
    };
    const service = new KoreaTourismService(client, new TourRequestCache());
    const detail = await service.getPlaceDetail("100", "38");
    expect(detail.sections.petPolicy.status).toBe("available");
    expect(detail.petPolicyEvidence).toBeNull();
    expect(detail.introPetPolicyEvidence).toBeNull();
  });

  it("uses provider detail identity despite a spoofed browser type hint", async () => {
    const client: TourClientLike = {
      request: vi.fn(async (operation) => {
        if (operation === "detailCommon2") {
          return parsed([{ contentid: "100", contenttypeid: "12", lDongRegnCd: "26", title: "부산 관광지" }]);
        }
        if (operation === "petTourSyncList2") {
          return parsed([{ contentid: "100", contenttypeid: "12", showflag: "1" }]);
        }
        if (operation === "detailIntro2") {
          return parsed([{ contentid: "100", contenttypeid: "12", chkpet: "반려동물 동반 가능" }]);
        }
        if (operation === "detailPetTour2") {
          throw new TourProviderError("TIMEOUT", "timeout", { operation });
        }
        return parsed([]);
      }),
    };
    const service = new KoreaTourismService(
      client,
      new TourRequestCache(),
      () => new Date("2026-08-05T00:00:00.000Z"),
    );
    const licenseMatcher = {
      matchTourPlace: vi.fn(async () => createUnavailableLicenseResult("food")),
    } as unknown as LicenseMatcher;
    const response = await createTourPlaceDetailHandler(
      service,
      licenseMatcher,
      () => new Date("2026-08-05T01:00:00.000Z"),
    )(
      new Request("http://localhost/api/tour/places/100?contentTypeId=39"),
      { params: Promise.resolve({ contentId: "100" }) },
    );
    const body = await response.json();
    expect(body.data.petAccessAssessment).toMatchObject({
      verdict: "allowed",
      evaluationState: "partial",
      confidence: "medium",
      evaluatedAt: "2026-08-05T01:00:00.000Z",
    });
    expect(licenseMatcher.matchTourPlace).toHaveBeenCalledOnce();
    expect(client.request).toHaveBeenCalledWith("detailIntro2", {
      contentId: "100",
      contentTypeId: "12",
    });
    expect(body.data.sourceRecords).toEqual([
      expect.objectContaining({
        layer: "tourism_official",
        providerIds: [
          { provider: "Korea Tourism Organization", id: "100" },
        ],
      }),
    ]);
    expect(body.data.trust).toMatchObject({
      ruleVersion: "petpass-trust-v1",
      level: "medium",
    });
  });

  it("deduplicates simultaneous list requests and never falls back to fixtures", async () => {
    const request = vi.fn(async () => parsed([{ contentid: "1", contenttypeid: "38" }]));
    const service = new KoreaTourismService({ request }, new TourRequestCache());
    const query = { regionCode: "26", page: 1, pageSize: 20 };
    const [first, second] = await Promise.all([
      service.listPlaces(query),
      service.listPlaces(query),
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(first.places[0].contentId).toBe("1");
    expect(second.places[0].contentId).toBe("1");

    const failing = new KoreaTourismService({
      request: vi.fn(async () => {
        throw new TourProviderError("UPSTREAM", "failed");
      }),
    });
    await expect(failing.listPlaces(query)).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("keeps authoritative collection identity on Service2 legal-dong fields only", async () => {
    const request = vi.fn(async () => parsed([{
      contentid: "5001",
      contenttypeid: "12",
      lDongRegnCd: null,
      lDongSignguCd: null,
      areacode: "39",
      sigungucode: "4",
    }]));
    const service = new KoreaTourismService({ request }, new TourRequestCache());
    const result = await service.listCollectionPlaces({
      regionCode: "50",
      districtCode: "110",
      page: 1,
      pageSize: 500,
    });

    expect(request).toHaveBeenCalledWith("areaBasedList2", {
      lDongRegnCd: "50",
      lDongSignguCd: "110",
      pageNo: "1",
      numOfRows: "500",
      arrange: "A",
    });
    expect(result.records[0]).toMatchObject({
      authoritativeLegalRegionCode: null,
      authoritativeLegalDistrictCode: null,
    });
  });

  it("isolates collection cache keys by authoritative region and district", async () => {
    const request = vi.fn(async (_operation: string, params: Record<string, string>) =>
      parsed([{
        contentid: `${params.lDongRegnCd}${params.lDongSignguCd}`,
        contenttypeid: "12",
        lDongRegnCd: params.lDongRegnCd,
        lDongSignguCd: params.lDongSignguCd,
      }]));
    const service = new KoreaTourismService({ request }, new TourRequestCache());
    const base = { districtCode: "110", page: 1, pageSize: 20 };

    await service.listCollectionPlaces({ ...base, regionCode: "11" });
    await service.listCollectionPlaces({ ...base, regionCode: "50" });
    await service.listCollectionPlaces({ ...base, regionCode: "11" });

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([, params]) => params.lDongRegnCd)).toEqual([
      "11",
      "50",
    ]);
  });

  it("collects common, intro, and pet detail without a visibility-list scan", async () => {
    const request = vi.fn(async (operation: string) => {
      if (operation === "detailCommon2") {
        return parsed([{
          contentid: "5001",
          contenttypeid: "12",
          lDongRegnCd: "50",
          lDongSignguCd: "110",
          title: "제주 관광지",
          mapx: "126.53",
          mapy: "33.50",
        }]);
      }
      if (operation === "detailIntro2") {
        return parsed([{ contentid: "5001", contenttypeid: "12", chkpet: "동반 가능" }]);
      }
      if (operation === "detailPetTour2") {
        return parsed([{ contentid: "5001", acmpyTypeCd: "전구역 동반가능" }]);
      }
      throw new Error(`unexpected operation ${operation}`);
    });
    const service = new KoreaTourismService({ request }, new TourRequestCache());
    const result = await service.getCollectionPlaceDetail("5001", "12");

    expect(result.summary.providerVisibility).toBeUndefined();
    expect(result.petPolicyEvidence?.fields.acmpyTypeCd).toBe("전구역 동반가능");
    expect(request.mock.calls.map(([operation]) => operation)).toEqual([
      "detailCommon2",
      "detailIntro2",
      "detailPetTour2",
    ]);
  });

  it.each(["detailIntro2", "detailPetTour2"])(
    "propagates %s failures for all-or-nothing catalog collection",
    async (failedOperation) => {
      const request = vi.fn(async (operation: string) => {
        if (operation === "detailCommon2") {
          return parsed([{
            contentid: "5001",
            contenttypeid: "12",
            lDongRegnCd: "50",
            lDongSignguCd: "110",
            title: "제주 관광지",
            mapx: "126.53",
            mapy: "33.50",
          }]);
        }
        if (operation === failedOperation) {
          throw new TourProviderError("UPSTREAM", "failed", { operation });
        }
        return parsed([]);
      });
      const service = new KoreaTourismService({ request }, new TourRequestCache());

      await expect(service.getCollectionPlaceDetail("5001", "12"))
        .rejects.toMatchObject({ code: "UPSTREAM", operation: failedOperation });
    },
  );
});
