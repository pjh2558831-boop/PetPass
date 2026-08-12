import { describe, expect, it, vi } from "vitest";

import {
  buildTourRequestUrl,
  TourApiClient,
  type TourApiClientOptions,
} from "@/lib/tour-api/client";
import { TourRequestCache } from "@/lib/tour-api/cache";
import { listTourCatalog } from "@/lib/tour-api/catalog-service";
import { TourProviderError } from "@/lib/tour-api/errors";
import {
  normalizePetEvidence,
  TOUR_PET_POLICY_FIELD_NAMES,
} from "@/lib/tour-api/pet-evidence";
import { normalizeTourPlaceSummary } from "@/lib/tour-api/normalizers";
import { parseTourResponse } from "@/lib/tour-api/parser";
import {
  KoreaTourismService,
  type TourPlaceService,
  type TourProviderVisibilityPage,
} from "@/lib/tour-api/service";
import {
  normalizeProviderVisibility,
  normalizeProviderVisibilityFailure,
} from "@/lib/tour-api/visibility";
import type { ParsedTourResponse, TourItem } from "@/lib/tour-api/schemas";
import type {
  TourContentTypeId,
  TourOperationName,
  TourPlaceSummary,
} from "@/types/place";

const checkedAt = "2026-08-12T00:00:00.000Z";
const config: NonNullable<TourApiClientOptions["config"]> = {
  baseUrl: "https://apis.data.go.kr/B551011/KorPetTourService2",
  serviceKey: "test%2Fkey%2Bvalue%3D",
  mobileOs: "ETC",
  mobileApp: "PetPass",
};

function parsed(
  items: TourItem[],
  overrides: Partial<Pick<ParsedTourResponse, "numOfRows" | "pageNo" | "totalCount">> = {},
): ParsedTourResponse {
  return {
    items,
    numOfRows: overrides.numOfRows ?? 50,
    pageNo: overrides.pageNo ?? 1,
    totalCount: overrides.totalCount ?? items.length,
    resultCode: "0000",
  };
}

function envelope(items: unknown): string {
  return JSON.stringify({
    response: {
      header: { resultCode: "0000", resultMsg: "OK" },
      body: { items, numOfRows: 50, pageNo: 1, totalCount: 0 },
    },
  });
}

function place(contentId: string, contentTypeId: TourContentTypeId): TourPlaceSummary {
  return normalizeTourPlaceSummary(
    {
      contentid: contentId,
      contenttypeid: contentTypeId,
      title: `place-${contentId}`,
      lDongRegnCd: "26",
    },
    { operation: "areaBasedList2", retrievedAt: checkedAt },
  )!;
}

function visibilityPage(
  records: TourProviderVisibilityPage["records"],
  page = 1,
  totalCount = records.length,
): TourProviderVisibilityPage {
  return {
    records,
    page,
    pageSize: 50,
    totalCount,
    source: {
      provider: "Korea Tourism Organization",
      operation: "petTourSyncList2",
      retrievedAt: checkedAt,
    },
  };
}

function visibilityRecord(
  contentId: string,
  status: "exposed" | "not_exposed" | "unknown",
) {
  const raw = status === "exposed" ? "1" : status === "not_exposed" ? "0" : "9";
  return {
    contentId,
    contentTypeId: "12" as const,
    visibility: normalizeProviderVisibility(raw, checkedAt),
  };
}

describe("Service2 visibility contract", () => {
  it.each<{
    operation: TourOperationName;
    params: Record<string, string>;
  }>([
    {
      operation: "areaBasedList2",
      params: {
        lDongRegnCd: "26",
        lDongSignguCd: "350",
        contentTypeId: "12",
        pageNo: "2",
        numOfRows: "50",
        arrange: "A",
      },
    },
    { operation: "detailCommon2", params: { contentId: "100" } },
    {
      operation: "detailIntro2",
      params: { contentId: "100", contentTypeId: "12" },
    },
    { operation: "detailPetTour2", params: { contentId: "100" } },
    {
      operation: "petTourSyncList2",
      params: {
        lDongRegnCd: "26",
        lDongSignguCd: "350",
        contentTypeId: "12",
        showflag: "1",
        pageNo: "2",
        numOfRows: "50",
        arrange: "A",
      },
    },
  ])("uses GET and the exact path/common parameters for $operation", async ({
    operation,
    params,
  }) => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(envelope({ item: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    const client = new TourApiClient({
      config,
      fetchImpl: fetchImpl as typeof fetch,
      transientRetryCount: 0,
    });

    await client.request(operation, params);

    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(url.pathname).toBe(
      `/B551011/KorPetTourService2/${operation}`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      serviceKey: "test/key+value=",
      MobileOS: "ETC",
      MobileApp: "PetPass",
      _type: "json",
      ...params,
    });
  });

  it.each(["locationBasedList2", "searchKeyword2"])(
    "rejects the intentionally unimplemented %s operation",
    (operation) => {
      expect(() =>
        buildTourRequestUrl(
          config,
          operation as TourOperationName,
          { pageNo: "1", numOfRows: "10" },
        ),
      ).toThrowError(expect.objectContaining({ code: "INVALID_OPERATION" }));
    },
  );

  it("normalizes only the documented showflag values as public or non-public", () => {
    expect(normalizeProviderVisibility("1", checkedAt)).toEqual({
      status: "exposed",
      providerField: "showflag",
      providerValue: "1",
      checkedAt,
      reasonCodes: [],
    });
    expect(normalizeProviderVisibility(0, checkedAt)).toMatchObject({
      status: "not_exposed",
      providerField: "showflag",
      providerValue: "0",
      reasonCodes: ["provider_visibility_not_exposed"],
    });
    expect(normalizeProviderVisibility(undefined, checkedAt)).toMatchObject({
      status: "unknown",
      providerField: null,
      providerValue: null,
      reasonCodes: ["provider_visibility_field_missing"],
    });
    expect(normalizeProviderVisibility("9", checkedAt)).toMatchObject({
      status: "unknown",
      providerField: "showflag",
      providerValue: "9",
      reasonCodes: ["provider_visibility_value_undocumented"],
    });
  });

  it("adapts a failed visibility request to provider_unavailable without denial", () => {
    expect(
      normalizeProviderVisibilityFailure(
        new TourProviderError("TIMEOUT", "timeout"),
        checkedAt,
      ),
    ).toEqual({
      status: "provider_unavailable",
      providerField: "showflag",
      providerValue: null,
      checkedAt,
      reasonCodes: ["provider_visibility_unavailable"],
    });
  });

  it("sends petTourSyncList2 as GET with the exact common and sync parameters", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(envelope({ item: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new TourApiClient({
      config,
      fetchImpl: fetchImpl as typeof fetch,
      transientRetryCount: 0,
    });

    await client.request("petTourSyncList2", {
      lDongRegnCd: "26",
      lDongSignguCd: "350",
      contentTypeId: "12",
      showflag: "1",
      pageNo: "2",
      numOfRows: "50",
      arrange: "A",
    });

    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(url.pathname).toBe("/B551011/KorPetTourService2/petTourSyncList2");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      serviceKey: "test/key+value=",
      MobileOS: "ETC",
      MobileApp: "PetPass",
      _type: "json",
      lDongRegnCd: "26",
      lDongSignguCd: "350",
      contentTypeId: "12",
      showflag: "1",
      pageNo: "2",
      numOfRows: "50",
      arrange: "A",
    });
  });

  it("maps the sync page and caches identical requests", async () => {
    const request = vi.fn(async () =>
      parsed([{ contentid: "100", contenttypeid: "12", showflag: "1" }]),
    );
    const service = new KoreaTourismService(
      { request },
      new TourRequestCache(),
      () => new Date(checkedAt),
    );
    const query = {
      regionCode: "26",
      districtCode: "350",
      contentTypeId: "12" as const,
      showFlag: "1" as const,
      page: 2,
      pageSize: 50,
    };

    const [first, second] = await Promise.all([
      service.listProviderVisibility(query),
      service.listProviderVisibility(query),
    ]);

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("petTourSyncList2", {
      lDongRegnCd: "26",
      pageNo: "2",
      numOfRows: "50",
      arrange: "A",
      lDongSignguCd: "350",
      contentTypeId: "12",
      showflag: "1",
    });
    expect(first.records[0].visibility.status).toBe("exposed");
    expect(second.records[0].contentId).toBe("100");
  });

  it("preserves timeout semantics on a sync request", async () => {
    const service = new KoreaTourismService({
      request: vi.fn(async () => {
        throw new TourProviderError("TIMEOUT", "timeout", {
          retryable: true,
          operation: "petTourSyncList2",
        });
      }),
    });
    await expect(
      service.listProviderVisibility({ regionCode: "26", page: 1, pageSize: 50 }),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      retryable: true,
      operation: "petTourSyncList2",
    });
  });
});

describe("Service2 pet evidence contract", () => {
  it("distinguishes usable, partial, empty, absent, and provider-unavailable states", () => {
    const fullItem = Object.fromEntries(
      TOUR_PET_POLICY_FIELD_NAMES.map((field) => [field, ` value-${field} `]),
    ) as TourItem;
    const full = normalizePetEvidence(fullItem, {
      contentId: "1",
      retrievedAt: checkedAt,
    });
    expect(full).toMatchObject({
      availability: "usable",
      emptyFieldNames: [],
      absentFieldNames: [],
      warningCodes: [],
    });
    expect(full.sourceFields).toHaveLength(9);
    expect(full.sourceFields[0].value).not.toMatch(/^\s|\s$/);

    const partial = normalizePetEvidence(
      { acmpyTypeCd: "반려견", acmpyNeedMtr: "   " },
      { contentId: "2", retrievedAt: checkedAt },
    );
    expect(partial.availability).toBe("partial");
    expect(partial.sourceFields).toEqual([
      { field: "acmpyTypeCd", value: "반려견" },
    ]);
    expect(partial.emptyFieldNames).toContain("acmpyNeedMtr");
    expect(partial.absentFieldNames).toContain("acmpyPsblCpam");

    const emptyItem = Object.fromEntries(
      TOUR_PET_POLICY_FIELD_NAMES.map((field) => [field, "  "]),
    ) as TourItem;
    expect(
      normalizePetEvidence(emptyItem, { contentId: "3", retrievedAt: checkedAt }),
    ).toMatchObject({
      availability: "empty",
      sourceFields: [],
      emptyFieldNames: [...TOUR_PET_POLICY_FIELD_NAMES],
      absentFieldNames: [],
    });
    expect(
      normalizePetEvidence(null, { contentId: "4", retrievedAt: checkedAt }),
    ).toMatchObject({
      availability: "absent",
      sourceFields: [],
      emptyFieldNames: [],
      absentFieldNames: [...TOUR_PET_POLICY_FIELD_NAMES],
    });
    expect(
      normalizePetEvidence(null, {
        contentId: "5",
        retrievedAt: checkedAt,
        providerAvailable: false,
      }),
    ).toMatchObject({
      availability: "provider_unavailable",
      warningCodes: ["pet_detail_provider_unavailable"],
    });
  });

  it("rejects malformed detail fields instead of returning partial evidence", () => {
    expect(() =>
      parseTourResponse(
        envelope({ item: [{ contentid: "1", acmpyTypeCd: { nested: true } }] }),
        "detailPetTour2",
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_RESPONSE" }));
  });
});

describe("Service2 fail-closed visibility joins", () => {
  it("paginates the sync list once per page and joins by content ID", async () => {
    const target = place("target", "12");
    const service = {
      listPlaces: vi.fn(async (query) => ({
        places: [target],
        page: query.page,
        pageSize: query.pageSize,
        totalCount: 1,
        source: target.source,
      })),
      listProviderVisibility: vi.fn(async (query) =>
        query.page === 1
          ? visibilityPage([visibilityRecord("other", "exposed")], 1, 51)
          : visibilityPage([visibilityRecord("target", "exposed")], 2, 51),
      ),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;

    const result = await listTourCatalog(service, {
      regionCode: "26",
      contentTypeId: "12",
      page: 1,
      pageSize: 20,
    });

    expect(result.places).toEqual([
      expect.objectContaining({
        contentId: "target",
        providerVisibility: expect.objectContaining({ status: "exposed" }),
      }),
    ]);
    expect(
      vi.mocked(service.listProviderVisibility!).mock.calls.map(([query]) => query.page),
    ).toEqual([1, 2]);
  });

  it("keeps only confirmed exposed records and excludes hidden or unknown records", async () => {
    const places = [place("visible", "12"), place("hidden", "12"), place("unknown", "12")];
    const service = {
      listPlaces: vi.fn(async (query) => ({
        places,
        page: query.page,
        pageSize: query.pageSize,
        totalCount: places.length,
        source: places[0].source,
      })),
      listProviderVisibility: vi.fn(async () =>
        visibilityPage([
          visibilityRecord("visible", "exposed"),
          visibilityRecord("hidden", "not_exposed"),
          visibilityRecord("unknown", "unknown"),
        ]),
      ),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;

    const result = await listTourCatalog(service, {
      regionCode: "26",
      contentTypeId: "12",
      page: 1,
      pageSize: 20,
    });
    expect(result.places.map(({ contentId }) => contentId)).toEqual(["visible"]);
    expect(result.totalCount).toBe(1);
  });

  it("propagates sync failure and never falls back to fixture or area-list visibility", async () => {
    const candidate = place("candidate", "12");
    const service = {
      listPlaces: vi.fn(async () => ({
        places: [candidate],
        page: 1,
        pageSize: 50,
        totalCount: 1,
        source: candidate.source,
      })),
      listProviderVisibility: vi.fn(async () => {
        throw new TourProviderError("TIMEOUT", "timeout", {
          operation: "petTourSyncList2",
        });
      }),
      getPlaceDetail: vi.fn(),
    } as unknown as TourPlaceService;

    await expect(
      listTourCatalog(service, {
        regionCode: "26",
        contentTypeId: "12",
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("redacts a directly requested not-exposed record before optional details", async () => {
    const request = vi.fn(async (operation, params) => {
      if (operation === "detailCommon2") {
        return parsed([{
          contentid: "hidden",
          contenttypeid: "12",
          lDongRegnCd: "26",
          title: "private provider title",
        }]);
      }
      if (operation === "petTourSyncList2" && params.showflag === "1") {
        return parsed([]);
      }
      if (operation === "petTourSyncList2" && params.showflag === "0") {
        return parsed([{ contentid: "hidden", contenttypeid: "12", showflag: "0" }]);
      }
      throw new Error("optional detail must not be requested");
    });
    const service = new KoreaTourismService({ request });

    let error: unknown;
    try {
      await service.getPlaceDetail("hidden", "12");
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "NOT_FOUND", operation: "petTourSyncList2" });
    expect((error as Error).message).not.toContain("private provider title");
    expect(request.mock.calls.map(([operation]) => operation)).toEqual([
      "detailCommon2",
      "petTourSyncList2",
      "petTourSyncList2",
    ]);
  });

  it("fails closed when a sync record reuses the ID with a different type", async () => {
    const request = vi.fn(async (operation, params) => {
      if (operation === "detailCommon2") {
        return parsed([{
          contentid: "same-id",
          contenttypeid: "12",
          lDongRegnCd: "26",
        }]);
      }
      if (operation === "petTourSyncList2" && params.showflag === "1") {
        return parsed([{
          contentid: "same-id",
          contenttypeid: "39",
          showflag: "1",
        }]);
      }
      if (operation === "petTourSyncList2" && params.showflag === "0") {
        return parsed([]);
      }
      throw new Error("optional detail must not be requested");
    });
    const service = new KoreaTourismService({ request });

    await expect(service.getPlaceDetail("same-id", "12")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      operation: "petTourSyncList2",
    });
  });
});
