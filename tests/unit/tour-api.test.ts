import { describe, expect, it, vi } from "vitest";
import {
  buildTourRequestUrl,
  TourApiClient,
  type TourApiClientOptions,
} from "@/lib/tour-api/client";
import { TourRequestCache } from "@/lib/tour-api/cache";
import {
  redactTourCredentials,
  TourProviderError,
} from "@/lib/tour-api/errors";
import {
  extractSafeHomepageUrl,
  normalizeIntroPetPolicyEvidence,
  normalizePetPolicyEvidence,
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
import { createTourPlacesHandler } from "@/app/api/tour/places/route";
import { createTourPlaceDetailHandler } from "@/app/api/tour/places/[contentId]/route";
import { createUnavailableLicenseResult } from "@/lib/licenses/service";
import type { LicenseMatcher } from "@/lib/licenses/service";

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

describe("Korea Tourism Organization provider", () => {
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
      { contentid: "1", contenttypeid: "82" },
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
      "76",
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
        "80",
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

  it("normalizes only the current KorPetTourService2 content types", () => {
    expect(normalizeTourCategory("75")).toBe("leisure");
    expect(normalizeTourCategory("76")).toBe("attraction");
    expect(normalizeTourCategory("77")).toBe("transportation");
    expect(normalizeTourCategory("78")).toBe("culture");
    expect(normalizeTourCategory("79")).toBe("shopping");
    expect(normalizeTourCategory("80")).toBe("accommodation");
    expect(normalizeTourCategory("82")).toBe("food");
    expect(normalizeTourCategory("85")).toBe("festival");
    expect(normalizeTourCategory("12")).toBe("unknown");

    const legacy = normalizeTourPlaceSummary(
      { contentid: "legacy", contenttypeid: "39" },
      {
        operation: "detailCommon2",
        retrievedAt: "2026-08-05T00:00:00.000Z",
        fallbackContentTypeId: "82",
      },
    );
    expect(legacy).toMatchObject({
      contentTypeId: "82",
      providerContentTypeId: "39",
      category: "unknown",
    });
  });

  it("returns structured 400 responses for obsolete content types and invalid ids", async () => {
    const service = {
      listPlaces: vi.fn(),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;
    const listResponse = await createTourPlacesHandler(service)(
      new Request("http://localhost/api/tour/places?contentTypeId=12"),
    );
    expect(listResponse.status).toBe(400);
    expect(service.listPlaces).not.toHaveBeenCalled();

    const detailResponse = await createTourPlaceDetailHandler(service)(
      new Request("http://localhost/api/tour/places/not-valid"),
      { params: Promise.resolve({ contentId: "not-valid" }) },
    );
    expect(detailResponse.status).toBe(400);
    expect(service.getPlaceDetail).not.toHaveBeenCalled();
  });

  it("returns partial detail data when an optional operation fails", async () => {
    const client: TourClientLike = {
      request: vi.fn(async (operation) => {
        if (operation === "detailCommon2") {
          return parsed([{ contentid: "100", contenttypeid: "82", title: "부산 음식점" }]);
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
    const detail = await service.getPlaceDetail("100", "82");
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
          return parsed([{ contentid: "100", contenttypeid: "76" }]);
        }
        if (operation === "detailIntro2") return parsed([]);
        if (operation === "detailPetTour2") return parsed([]);
        return parsed([]);
      }),
    };
    const service = new KoreaTourismService(client, new TourRequestCache());
    const detail = await service.getPlaceDetail("100", "76");
    expect(detail.sections.petPolicy.status).toBe("available");
    expect(detail.petPolicyEvidence).toBeNull();
    expect(detail.introPetPolicyEvidence).toBeNull();
  });

  it("returns a partial assessment from trusted intro fallback without licensing influence", async () => {
    const client: TourClientLike = {
      request: vi.fn(async (operation) => {
        if (operation === "detailCommon2") {
          return parsed([{ contentid: "100", contenttypeid: "76", title: "부산 관광지" }]);
        }
        if (operation === "detailIntro2") {
          return parsed([{ contentid: "100", contenttypeid: "76", chkpet: "반려동물 동반 가능" }]);
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
      new Request("http://localhost/api/tour/places/100?contentTypeId=76"),
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
  });

  it("deduplicates simultaneous list requests and never falls back to fixtures", async () => {
    const request = vi.fn(async () => parsed([{ contentid: "1", contenttypeid: "76" }]));
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
});
