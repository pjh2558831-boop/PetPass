import { describe, expect, it, vi } from "vitest";
import {
  collectTourHomepageSnapshot,
  HOMEPAGE_FEATURED_CANDIDATE_LIMIT,
  HOMEPAGE_FEATURED_CONCURRENCY,
  HOMEPAGE_FEATURED_PLACE_LIMIT,
  HOMEPAGE_PREFERRED_CONTENT_IDS,
  selectHomepageCandidates,
} from "@/lib/tour-api/homepage-catalog";
import type { TourPlaceService } from "@/lib/tour-api/service";
import type {
  TourContentTypeId,
  TourPetPolicyFields,
  TourPlaceDetail,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";

const NOW = "2026-08-14T04:05:06.000Z";

const CATEGORY_BY_TYPE: Record<
  TourContentTypeId,
  TourPlaceSummary["category"]
> = {
  "12": "attraction",
  "14": "culture",
  "15": "festival",
  "28": "leisure",
  "32": "accommodation",
  "38": "shopping",
  "39": "food",
};

const EMPTY_FIELDS: TourPetPolicyFields = {
  acmpyTypeCd: null,
  acmpyPsblCpam: null,
  acmpyNeedMtr: null,
  etcAcmpyInfo: null,
  relaAcdntRiskMtr: null,
  relaPosesFclty: null,
  relaFrnshPrdlst: null,
  relaPurcPrdlst: null,
  relaRntlPrdlst: null,
};

function summary(
  contentId: string,
  contentTypeId: TourContentTypeId = "12",
  overrides: Partial<TourPlaceSummary> = {},
): TourPlaceSummary {
  return {
    contentId,
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category: CATEGORY_BY_TYPE[contentTypeId],
    title: `List ${contentId}`,
    address: "Busan",
    detailAddress: null,
    longitude: 129,
    latitude: 35,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: null,
    legalRegionCode: "26",
    legalDistrictCode: null,
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
      checkedAt: NOW,
      reasonCodes: [],
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      contentId,
      retrievedAt: NOW,
    },
    ...overrides,
  };
}

function catalog(places: TourPlaceSummary[]): TourPlaceList {
  return {
    places,
    page: 1,
    pageSize: places.length,
    totalCount: places.length,
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: NOW,
    },
  };
}

function detail(
  place: TourPlaceSummary,
  access:
    | "allowed"
    | "denied"
    | "insufficient"
    | "partial"
    | "unavailable" =
    "allowed",
): TourPlaceDetail {
  const fields: TourPetPolicyFields = {
    ...EMPTY_FIELDS,
    acmpyTypeCd: access === "allowed" ? "전구역 동반가능" : null,
    etcAcmpyInfo: access === "denied" ? "반려동물 동반 불가" : null,
  };
  const detailSummary = {
    ...place,
    title: `Current ${place.contentId}`,
    source: {
      ...place.source,
      operation: "detailCommon2" as const,
    },
  };
  return {
    summary: detailSummary,
    overview: null,
    homepageUrl: null,
    operatingInformation: null,
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: null,
    petPolicyEvidence:
      access === "unavailable" || access === "partial"
        ? null
        : {
            fields,
            sourceEvidence: {
              provider: "Korea Tourism Organization",
              operation: "detailPetTour2",
              contentId: place.contentId,
              retrievedAt: NOW,
              originalEvidenceFields: fields,
            },
          },
    introPetPolicyEvidence:
      access === "partial"
        ? {
            field: "chkpet",
            value: "반려동물 동반 가능",
            sourceEvidence: {
              provider: "Korea Tourism Organization",
              operation: "detailIntro2",
              contentId: place.contentId,
              retrievedAt: NOW,
              originalValue: "반려동물 동반 가능",
            },
          }
        : null,
    sections: {
      common: { status: "available" },
      intro: {
        status: access === "unavailable" ? "unavailable" : "available",
      },
      petPolicy: {
        status:
          access === "unavailable" || access === "partial"
            ? "unavailable"
            : "available",
      },
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: place.contentId,
      retrievedAt: NOW,
    },
  };
}

function serviceWithDetails(
  getPlaceDetail: TourPlaceService["getPlaceDetail"],
): TourPlaceService {
  return {
    listPlaces: vi.fn(),
    getPlaceDetail,
  } as TourPlaceService;
}

describe("homepage Tourism candidate selection", () => {
  it("uses present preferred IDs first, then unique category-balanced backups", () => {
    const types = ["12", "14", "15", "28", "32", "39"] as const;
    const places = [
      summary(HOMEPAGE_PREFERRED_CONTENT_IDS[2], "39"),
      summary("shopping", "38"),
      summary("not-busan", "12", { legalRegionCode: "11" }),
      summary("hidden", "12", {
        providerVisibility: {
          status: "not_exposed",
          providerField: "showflag",
          providerValue: "0",
          checkedAt: NOW,
          reasonCodes: [],
        },
      }),
      ...types.flatMap((type, typeIndex) =>
        Array.from({ length: 3 }, (_, index) =>
          summary(`${typeIndex}-${index}`, type),
        ),
      ),
      summary(HOMEPAGE_PREFERRED_CONTENT_IDS[0], "12"),
      summary(HOMEPAGE_PREFERRED_CONTENT_IDS[1], "32"),
      summary(HOMEPAGE_PREFERRED_CONTENT_IDS[0], "12"),
    ];

    const selected = selectHomepageCandidates(catalog(places));

    expect(selected).toHaveLength(HOMEPAGE_FEATURED_CANDIDATE_LIMIT);
    expect(selected.slice(0, 3).map(({ contentId }) => contentId)).toEqual([
      ...HOMEPAGE_PREFERRED_CONTENT_IDS,
    ]);
    expect(new Set(selected.map(({ contentId }) => contentId)).size).toBe(
      selected.length,
    );
    expect(selected.map(({ contentId }) => contentId)).not.toEqual(
      expect.arrayContaining(["shopping", "not-busan", "hidden"]),
    );
    const counts = types.map(
      (type) => selected.filter((place) => place.contentTypeId === type).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe("homepage Tourism snapshot", () => {
  it("fixes the catalog to Busan, assesses at most 10 with concurrency 3, and keeps at most five complete allowances", async () => {
    const places = Array.from({ length: 14 }, (_, index) =>
      summary(`place-${index}`, (["12", "14", "15", "28", "32", "39"] as const)[index % 6]),
    );
    let active = 0;
    let maximumActive = 0;
    const getPlaceDetail = vi.fn(async (contentId: string) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const place = places.find((item) => item.contentId === contentId)!;
      return detail(
        place,
        Number(contentId.replace("place-", "")) < 8 ? "allowed" : "denied",
      );
    });
    const service = serviceWithDetails(getPlaceDetail);
    const collectCatalog = vi.fn(async () => catalog(places));

    const result = await collectTourHomepageSnapshot({
      service,
      now: () => new Date(NOW),
      collectCatalog,
    });

    expect(collectCatalog).toHaveBeenCalledWith(service, { regionCode: "26" });
    expect(getPlaceDetail).toHaveBeenCalledTimes(
      HOMEPAGE_FEATURED_CANDIDATE_LIMIT,
    );
    expect(maximumActive).toBe(HOMEPAGE_FEATURED_CONCURRENCY);
    expect(result.featured).toMatchObject({
      state: "ready",
      assessedCount: HOMEPAGE_FEATURED_CANDIDATE_LIMIT,
      failedCount: 0,
    });
    expect(result.featured.places).toHaveLength(HOMEPAGE_FEATURED_PLACE_LIMIT);
    expect(
      result.featured.places.every(
        ({ summary: current, assessment }) =>
          current.title?.startsWith("Current ") &&
          current.source.operation === "detailCommon2" &&
          assessment.verdict === "allowed" &&
          assessment.evaluationState === "complete" &&
          assessment.evaluatedAt === NOW,
      ),
    ).toBe(true);
  });

  it("does not assess a preferred ID that is absent from the current catalog", async () => {
    const current = summary("current-only");
    const getPlaceDetail = vi.fn(async () => detail(current));

    await collectTourHomepageSnapshot({
      service: serviceWithDetails(getPlaceDetail),
      collectCatalog: async () => catalog([current]),
    });

    expect(getPlaceDetail).toHaveBeenCalledOnce();
    expect(getPlaceDetail).toHaveBeenCalledWith("current-only");
  });

  it("returns empty for a successful empty catalog or complete non-allowances", async () => {
    const empty = await collectTourHomepageSnapshot({
      service: serviceWithDetails(vi.fn()),
      collectCatalog: async () => catalog([]),
    });
    const deniedPlace = summary("denied");
    const denied = await collectTourHomepageSnapshot({
      service: serviceWithDetails(async () => detail(deniedPlace, "denied")),
      collectCatalog: async () => catalog([deniedPlace]),
    });

    expect(empty.featured).toMatchObject({
      state: "empty",
      places: [],
      assessedCount: 0,
      failedCount: 0,
    });
    expect(denied.featured).toMatchObject({
      state: "empty",
      places: [],
      assessedCount: 1,
      failedCount: 0,
    });
  });

  it("returns partial when any available attempt is incomplete or another attempt fails", async () => {
    const allowedPlace = summary("allowed");
    const insufficientPlace = summary("insufficient", "14");
    const result = await collectTourHomepageSnapshot({
      service: serviceWithDetails(async (contentId) =>
        detail(
          contentId === allowedPlace.contentId
            ? allowedPlace
            : insufficientPlace,
          contentId === allowedPlace.contentId ? "allowed" : "insufficient",
        ),
      ),
      collectCatalog: async () => catalog([allowedPlace, insufficientPlace]),
    });

    expect(result.featured.state).toBe("partial");
    expect(result.featured.places.map(({ summary }) => summary.contentId)).toEqual([
      "allowed",
    ]);

    const fallbackOnly = summary("fallback-only");
    const partialAssessment = await collectTourHomepageSnapshot({
      service: serviceWithDetails(async () => detail(fallbackOnly, "partial")),
      collectCatalog: async () => catalog([fallbackOnly]),
    });
    expect(partialAssessment.featured).toMatchObject({
      state: "partial",
      places: [],
      assessedCount: 1,
      failedCount: 0,
    });

    const deniedPlace = summary("complete-denial");
    const failedPlace = summary("failed", "14");
    const mixed = await collectTourHomepageSnapshot({
      service: serviceWithDetails(async (contentId) => {
        if (contentId === failedPlace.contentId) throw new Error("provider failed");
        return detail(deniedPlace, "denied");
      }),
      collectCatalog: async () => catalog([deniedPlace, failedPlace]),
    });
    expect(mixed.featured).toMatchObject({
      state: "partial",
      places: [],
      assessedCount: 1,
      failedCount: 1,
    });
  });

  it("returns unavailable only when every attempted candidate is unavailable", async () => {
    const first = summary("first");
    const second = summary("second", "14");
    const rejected = await collectTourHomepageSnapshot({
      service: serviceWithDetails(async () => {
        throw new Error("provider unavailable");
      }),
      collectCatalog: async () => catalog([first, second]),
    });
    const assessedUnavailable = await collectTourHomepageSnapshot({
      service: serviceWithDetails(async (contentId) =>
        detail(contentId === first.contentId ? first : second, "unavailable"),
      ),
      collectCatalog: async () => catalog([first, second]),
    });

    expect(rejected.featured).toMatchObject({
      state: "unavailable",
      assessedCount: 0,
      failedCount: 2,
    });
    expect(assessedUnavailable.featured).toMatchObject({
      state: "unavailable",
      assessedCount: 2,
      failedCount: 0,
    });
  });
});
