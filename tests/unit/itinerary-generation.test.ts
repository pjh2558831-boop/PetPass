import { describe, expect, it } from "vitest";
import { createItineraryGenerationHandler } from "@/app/api/itineraries/generate/route";
import {
  generateItineraries,
  ITINERARY_GENERATION_LIMITS,
  MAX_ITINERARY_JACCARD_OVERLAP,
} from "@/lib/itinerary/generation-service";
import { assessOperatingHours } from "@/lib/itinerary/operating-hours";
import {
  getItineraryGenerationRequestKey,
  itineraryGenerationRequestSchema,
  normalizeItineraryRequest,
} from "@/lib/itinerary/request-schema";
import type { TourPlaceService, TourPlacesQuery } from "@/lib/tour-api/service";
import type { KakaoDirectionsRequest, KakaoDrivingRoute } from "@/types/kakao";
import type {
  TourContentTypeId,
  TourPetPolicyFields,
  TourPlaceDetail,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";

const RETRIEVED_AT = "2026-08-05T00:00:00.000Z";
const TYPE_CATEGORY = {
  "12": "attraction",
  "14": "culture",
  "15": "festival",
  "28": "leisure",
  "32": "accommodation",
  "38": "shopping",
  "39": "food",
} as const;

type Policy = "allowed" | "conditional" | "denied" | "unknown" | "outdoor";

const EMPTY_POLICY_FIELDS: TourPetPolicyFields = {
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

function makeSummary(
  contentId: string,
  contentTypeId: TourContentTypeId = "12",
  options: {
    districtCode?: string;
    latitude?: number | null;
    longitude?: number | null;
    providerContentTypeId?: string | null;
    title?: string | null;
  } = {},
): TourPlaceSummary {
  return {
    contentId,
    contentTypeId,
    providerContentTypeId:
      options.providerContentTypeId === undefined
        ? contentTypeId
        : options.providerContentTypeId,
    category: TYPE_CATEGORY[contentTypeId],
    title: options.title === undefined ? `장소 ${contentId}` : options.title,
    address: `부산 주소 ${contentId}`,
    detailAddress: null,
    longitude:
      options.longitude === undefined
        ? 129 + Number(contentId.replace(/\D/g, "").slice(-2) || "0") / 1_000
        : options.longitude,
    latitude:
      options.latitude === undefined
        ? 35.1 + Number(contentId.replace(/\D/g, "").slice(-2) || "0") / 1_000
        : options.latitude,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: "20260805000000",
    legalRegionCode: "26",
    legalDistrictCode: options.districtCode ?? "350",
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
      retrievedAt: RETRIEVED_AT,
    },
  };
}

function policyFields(policy: Policy): TourPetPolicyFields {
  const etcAcmpyInfo = {
    allowed: "반려동물 동반 가능",
    conditional: "반려동물 동반 가능, 이동장 사용 필수",
    denied: "반려동물 동반 불가",
    unknown: null,
    outdoor: "실내 동반 불가, 실외 동반 가능",
  }[policy];
  return { ...EMPTY_POLICY_FIELDS, etcAcmpyInfo };
}

function makeDetail(
  summary: TourPlaceSummary,
  policy: Policy = "allowed",
  options: {
    operatingInformation?: string | null;
    restDayInformation?: string | null;
    providerContentTypeId?: string | null;
    petPolicyText?: string | null;
  } = {},
): TourPlaceDetail {
  const providerContentTypeId =
    options.providerContentTypeId === undefined
      ? summary.providerContentTypeId
      : options.providerContentTypeId;
  const detailSummary: TourPlaceSummary = {
    ...summary,
    providerContentTypeId,
    contentTypeId:
      providerContentTypeId && providerContentTypeId in TYPE_CATEGORY
        ? (providerContentTypeId as TourContentTypeId)
        : null,
    category:
      providerContentTypeId && providerContentTypeId in TYPE_CATEGORY
        ? TYPE_CATEGORY[providerContentTypeId as TourContentTypeId]
        : "unknown",
  };
  const fields = options.petPolicyText === undefined
    ? policyFields(policy)
    : { ...EMPTY_POLICY_FIELDS, etcAcmpyInfo: options.petPolicyText };
  return {
    summary: detailSummary,
    overview: null,
    homepageUrl: null,
    operatingInformation:
      options.operatingInformation === undefined
        ? "09:00-20:00"
        : options.operatingInformation,
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: options.restDayInformation ?? null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: "20260805000000",
    petPolicyEvidence: {
      fields,
      sourceEvidence: {
        provider: "Korea Tourism Organization",
        operation: "detailPetTour2",
        contentId: summary.contentId,
        retrievedAt: RETRIEVED_AT,
        providerModifiedTime: "20260805000000",
        originalEvidenceFields: { ...fields },
      },
    },
    introPetPolicyEvidence: null,
    sections: {
      common: { status: "available" },
      intro: { status: "available" },
      petPolicy: { status: "available" },
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: summary.contentId,
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260805000000",
    },
  };
}

class MockTourService implements TourPlaceService {
  readonly listQueries: TourPlacesQuery[] = [];
  readonly detailIds: string[] = [];
  activeDetailCalls = 0;
  maxActiveDetailCalls = 0;

  constructor(
    readonly places: TourPlaceSummary[],
    readonly details = new Map(
      places.map((place) => [place.contentId, makeDetail(place)]),
    ),
    readonly options: {
      failList?: boolean;
      failDetailIds?: Set<string>;
      detailDelayMs?: number;
    } = {},
  ) {}

  async listPlaces(query: TourPlacesQuery): Promise<TourPlaceList> {
    this.listQueries.push(query);
    if (this.options.failList) throw new Error("provider unavailable");
    const matches = this.places.filter(
      (place) =>
        (!query.contentTypeId || place.contentTypeId === query.contentTypeId) &&
        (!query.districtCode || place.legalDistrictCode === query.districtCode),
    );
    const offset = (query.page - 1) * query.pageSize;
    return {
      places: matches.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      totalCount: matches.length,
      source: {
        provider: "Korea Tourism Organization",
        operation: "areaBasedList2",
        retrievedAt: RETRIEVED_AT,
      },
    };
  }

  async getPlaceDetail(contentId: string): Promise<TourPlaceDetail> {
    this.detailIds.push(contentId);
    this.activeDetailCalls += 1;
    this.maxActiveDetailCalls = Math.max(
      this.maxActiveDetailCalls,
      this.activeDetailCalls,
    );
    if (this.options.detailDelayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.options.detailDelayMs),
      );
    }
    this.activeDetailCalls -= 1;
    if (this.options.failDetailIds?.has(contentId)) {
      throw new Error("detail unavailable");
    }
    const detail = this.details.get(contentId);
    if (!detail) throw new Error("not found");
    return detail;
  }
}

function mockDirections(
  request: KakaoDirectionsRequest,
  values: { distance?: number; duration?: number } = {},
): Promise<KakaoDrivingRoute> {
  const points = [request.origin, ...request.waypoints, request.destination];
  const sectionCount = points.length - 1;
  return Promise.resolve({
    totalDistanceMeters: values.distance ?? 9_876,
    totalDurationSeconds: values.duration ?? 2_400,
    coordinates: points.map((point) => ({
      latitude: point.y,
      longitude: point.x,
    })),
    sections: Array.from({ length: sectionCount }, (_, index) => ({
      distanceMeters: 1_000 + index,
      durationSeconds: 600 + index,
    })),
  });
}

function makeRequest(
  overrides: Record<string, unknown> = {},
) {
  const raw = {
    scope: { type: "busan" as const },
    start: {
      coordinates: { latitude: 35.1, longitude: 129 },
      label: "부산역",
    },
    travelDate: "2026-08-06",
    startTime: "10:00",
    planning: { desiredStopCount: 2 },
    petSize: "SMALL" as const,
    indoorAccessPreference: "any" as const,
    selectedCategories: ["attraction" as const],
    includeShopping: false,
    ...overrides,
  };
  return normalizeItineraryRequest(itineraryGenerationRequestSchema.parse(raw));
}

function createSupply(): TourPlaceSummary[] {
  return [
    makeSummary("a1", "12", { latitude: 35.101, longitude: 129.001 }),
    makeSummary("a2", "12", { latitude: 35.102, longitude: 129.002 }),
    makeSummary("a3", "12", { latitude: 35.103, longitude: 129.003 }),
    makeSummary("l1", "28", { latitude: 35.11, longitude: 129.01 }),
    makeSummary("l2", "28", { latitude: 35.12, longitude: 129.02 }),
    makeSummary("l3", "28", { latitude: 35.13, longitude: 129.03 }),
    makeSummary("f1", "39", { latitude: 35.14, longitude: 129.04 }),
    makeSummary("f2", "39", { latitude: 35.15, longitude: 129.05 }),
    makeSummary("f3", "39", { latitude: 35.16, longitude: 129.06 }),
  ];
}

describe("itinerary request validation", () => {
  it.each([
    ["malformed coordinates", { start: { coordinates: { latitude: 91, longitude: 129 } } }],
    ["impossible time", { startTime: "25:00" }],
    ["invalid stop count", { planning: { desiredStopCount: 6 } }],
    ["unsupported category", { selectedCategories: ["pharmacy"] }],
    [
      "duration past midnight",
      { startTime: "23:00", planning: { desiredDurationMinutes: 120 } },
    ],
  ])("rejects %s", (_label, override) => {
    const raw = {
      scope: { type: "busan" },
      start: { coordinates: { latitude: 35.1, longitude: 129 } },
      travelDate: "2026-08-06",
      startTime: "10:00",
      planning: { desiredStopCount: 2 },
      selectedCategories: ["attraction"],
      ...override,
    };
    expect(itineraryGenerationRequestSchema.safeParse(raw).success).toBe(false);
  });

  it("normalizes a validated district, pet size and defaults", () => {
    const request = makeRequest({
      scope: { type: "district", districtCode: "350" },
    });
    expect(request).toMatchObject({
      scope: { type: "district", districtCode: "350", districtName: "해운대구" },
      petSize: "SMALL",
      indoorAccessPreference: "any",
      includeShopping: false,
    });
  });

  it("derives one truthful stop from the minimum duration request", () => {
    const request = makeRequest({
      planning: { desiredDurationMinutes: 120 },
    });
    expect(request).toMatchObject({
      planningMode: "duration",
      desiredDurationMinutes: 120,
      desiredStopCount: 1,
    });
  });

  it("includes pet size in the stable generation request identity", () => {
    const small = makeRequest({ petSize: "SMALL" });
    const large = makeRequest({ petSize: "LARGE" });
    expect(getItineraryGenerationRequestKey(small)).not.toBe(
      getItineraryGenerationRequestKey(large),
    );
  });
});

describe("documented operating-time behavior", () => {
  it("keeps missing or unparseable hours unknown with the required warning", () => {
    expect(
      assessOperatingHours({
        travelDate: "2026-08-06",
        arrivalMinutes: 600,
        departureMinutes: 660,
        operatingInformation: null,
        restDayInformation: null,
      }),
    ).toEqual({ status: "unknown", warning: "운영시간 확인 필요" });
  });

  it("recognizes only an explicit normalized opening interval as closed", () => {
    expect(
      assessOperatingHours({
        travelDate: "2026-08-06",
        arrivalMinutes: 660,
        departureMinutes: 720,
        operatingInformation: "09:00-10:00",
        restDayInformation: null,
      }),
    ).toEqual({ status: "closed", warning: null });
  });

  it("treats only the documented break interval as closed when opening hours coexist", () => {
    expect(
      assessOperatingHours({
        travelDate: "2026-08-06",
        arrivalMinutes: 930,
        departureMinutes: 960,
        operatingInformation: "운영 09:00-20:00, 브레이크타임 15:00-17:00",
        restDayInformation: null,
      }),
    ).toEqual({ status: "closed", warning: null });
    expect(
      assessOperatingHours({
        travelDate: "2026-08-06",
        arrivalMinutes: 600,
        departureMinutes: 660,
        operatingInformation: "운영 09:00-20:00, 브레이크타임 15:00-17:00",
        restDayInformation: null,
      }),
    ).toEqual({ status: "open", warning: null });
  });
});

describe("bounded request-driven itinerary generation", () => {
  it("generates from supplied current IDs without any fixed demo ID", async () => {
    const places = [makeSummary("live-901"), makeSummary("live-902")];
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places),
      directions: mockDirections,
    });
    expect(result.itineraries[0]?.stops.map(({ contentId }) => contentId)).toEqual([
      "live-901",
      "live-902",
    ]);
    expect(JSON.stringify(result)).not.toContain("demo-busan");
  });

  it("accepts a missing list raw type only after trusted detail confirms the current type", async () => {
    const fallback = makeSummary("fallback", "12", {
      providerContentTypeId: null,
    });
    const confirmed = makeSummary("confirmed", "12");
    const details = new Map([
      [
        fallback.contentId,
        makeDetail(fallback, "allowed", { providerContentTypeId: "12" }),
      ],
      [confirmed.contentId, makeDetail(confirmed)],
    ]);
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService([fallback, confirmed], details),
      directions: mockDirections,
    });
    expect(result.itineraries[0]?.stops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentId: "fallback",
          providerContentTypeId: "12",
        }),
      ]),
    );
  });

  it("uses different Tourism scopes for all Busan and a selected district", async () => {
    const places = [
      makeSummary("central", "12", { districtCode: "110" }),
      makeSummary("haeundae-1", "12", { districtCode: "350" }),
      makeSummary("haeundae-2", "12", { districtCode: "350" }),
    ];
    const allService = new MockTourService(places);
    const districtService = new MockTourService(places);
    await generateItineraries(makeRequest(), {
      tourService: allService,
      directions: mockDirections,
    });
    const district = await generateItineraries(
      makeRequest({ scope: { type: "district", districtCode: "350" } }),
      { tourService: districtService, directions: mockDirections },
    );
    expect(allService.listQueries.every(({ districtCode }) => !districtCode)).toBe(true);
    expect(
      districtService.listQueries.every(({ districtCode }) => districtCode === "350"),
    ).toBe(true);
    expect(district.itineraries[0]?.stops.map(({ contentId }) => contentId)).toEqual([
      "haeundae-1",
      "haeundae-2",
    ]);
  });

  it("changes candidate selection when selected categories change", async () => {
    const places = [
      makeSummary("attraction-1", "12"),
      makeSummary("attraction-2", "12"),
      makeSummary("food-1", "39"),
      makeSummary("food-2", "39"),
    ];
    const service = new MockTourService(places);
    const attraction = await generateItineraries(makeRequest(), {
      tourService: service,
      directions: mockDirections,
    });
    const food = await generateItineraries(
      makeRequest({ selectedCategories: ["food"] }),
      { tourService: service, directions: mockDirections },
    );
    expect(attraction.itineraries[0]?.stops[0].category).toBe("attraction");
    expect(food.itineraries[0]?.stops[0].category).toBe("food");
  });

  it("excludes shopping by default even when selected", async () => {
    const places = [
      makeSummary("a1"),
      makeSummary("a2"),
      makeSummary("s1", "38"),
      makeSummary("s2", "38"),
    ];
    const result = await generateItineraries(
      makeRequest({ selectedCategories: ["attraction", "shopping"] }),
      { tourService: new MockTourService(places), directions: mockDirections },
    );
    expect(result.itineraries.flatMap(({ stops }) => stops).every(({ category }) => category !== "shopping")).toBe(true);
    expect(result.exclusionCounts.shopping_disabled).toBe(1);
    expect(result.candidateFunnel.matchingCatalogCandidates).toBe(2);
  });

  it("allows qualified shopping only when explicitly enabled", async () => {
    const places = [makeSummary("s1", "38"), makeSummary("s2", "38")];
    const result = await generateItineraries(
      makeRequest({
        selectedCategories: ["shopping"],
        includeShopping: true,
      }),
      { tourService: new MockTourService(places), directions: mockDirections },
    );
    expect(result.itineraries[0]?.stops.map(({ category }) => category)).toEqual([
      "shopping",
      "shopping",
    ]);
  });

  it("routes only allowed and conditional assessments and preserves conditions", async () => {
    const places = [
      makeSummary("allowed"),
      makeSummary("conditional"),
      makeSummary("denied"),
      makeSummary("unknown"),
    ];
    const details = new Map([
      ["allowed", makeDetail(places[0], "allowed")],
      ["conditional", makeDetail(places[1], "conditional")],
      ["denied", makeDetail(places[2], "denied")],
      ["unknown", makeDetail(places[3], "unknown")],
    ]);
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places, details),
      directions: mockDirections,
    });
    expect(result.itineraries[0]?.stops.map(({ petAccess }) => petAccess.verdict)).toEqual([
      "allowed",
      "conditional",
    ]);
    expect(result.itineraries[0]?.stops[1].petAccess.conditions.length).toBeGreaterThan(0);
    expect(result.exclusionCounts.not_allowed).toBe(1);
    expect(result.exclusionCounts.unknown).toBe(1);
  });

  it("excludes unsupported and not-applicable detail structures", async () => {
    const unsupportedCatalog = makeSummary("catalog-unsupported", "12", {
      providerContentTypeId: "75",
    });
    const applicableCatalog = makeSummary("detail-unsupported");
    const details = new Map([
      [
        applicableCatalog.contentId,
        makeDetail(applicableCatalog, "allowed", { providerContentTypeId: "75" }),
      ],
    ]);
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(
        [unsupportedCatalog, applicableCatalog],
        details,
      ),
      directions: mockDirections,
    });
    expect(result.itineraries).toEqual([]);
    expect(result.exclusionCounts.unsupported_record).toBe(1);
    expect(result.exclusionCounts.not_applicable).toBe(1);
    expect(result.exclusionCounts.detail_mismatch).toBe(0);
  });

  it("never reads licensing to determine eligibility or the verdict", async () => {
    const places = [makeSummary("l1"), makeSummary("l2")];
    const details = new Map(
      places.map((place) => {
        const detail = makeDetail(place, "allowed");
        Object.defineProperty(detail, "licensing", {
          get: () => {
            throw new Error("licensing must stay separate");
          },
        });
        return [place.contentId, detail] as const;
      }),
    );
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places, details),
      directions: mockDirections,
    });
    expect(result.itineraries[0]?.stops.every(({ petAccess }) => petAccess.verdict === "allowed")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("licensing");
  });

  it("keeps missing pet evidence unknown instead of converting it to denial", async () => {
    const places = [makeSummary("u1"), makeSummary("u2")];
    const details = new Map(places.map((place) => [place.contentId, makeDetail(place, "unknown")]));
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places, details),
      directions: mockDirections,
    });
    expect(result.exclusionCounts.unknown).toBe(2);
    expect(result.exclusionCounts.not_allowed).toBe(0);
    expect(result.itineraries).toEqual([]);
    expect(result.candidateFunnel).toMatchObject({
      basePetAccess: { unknown: 2 },
      itineraryEligibleCandidates: 0,
      returnedRoutes: 0,
    });
  });

  it("does not treat accommodation checkout as generic closing time", async () => {
    const places = [
      makeSummary("stay-1", "32"),
      makeSummary("stay-2", "32"),
    ];
    const details = new Map(
      places.map((place) => {
        const detail = makeDetail(place, "allowed", {
          operatingInformation: null,
        });
        return [
          place.contentId,
          { ...detail, checkInTime: "15:00", checkOutTime: "11:00" },
        ] as const;
      }),
    );
    const result = await generateItineraries(
      makeRequest({
        startTime: "18:00",
        selectedCategories: ["accommodation"],
      }),
      { tourService: new MockTourService(places, details), directions: mockDirections },
    );
    expect(result.itineraries[0]?.stops).toHaveLength(2);
    expect(result.exclusionCounts.closed_at_visit).toBe(0);
  });

  it("attaches the exact warning when normalized hours are unknown", async () => {
    const places = [makeSummary("u1"), makeSummary("u2")];
    const details = new Map(
      places.map((place) => [
        place.contentId,
        makeDetail(place, "allowed", { operatingInformation: null }),
      ]),
    );
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places, details),
      directions: mockDirections,
    });
    expect(
      result.itineraries[0]?.stops.every(
        ({ operatingHours }) =>
          operatingHours.status === "unknown" &&
          operatingHours.warning === "운영시간 확인 필요",
      ),
    ).toBe(true);
  });

  it("does not schedule an explicitly closed place during the visit interval", async () => {
    const places = [makeSummary("c1"), makeSummary("c2")];
    const details = new Map(
      places.map((place) => [
        place.contentId,
        makeDetail(place, "allowed", { operatingInformation: "09:00-10:00" }),
      ]),
    );
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places, details),
      directions: mockDirections,
    });
    expect(result.itineraries).toEqual([]);
    expect(result.exclusionCounts.closed_at_visit).toBeGreaterThan(0);
  });

  it("returns a typed unavailable state for catalog failure and partial for a recoverable detail failure", async () => {
    const unavailable = await generateItineraries(makeRequest(), {
      tourService: new MockTourService([], new Map(), { failList: true }),
      directions: mockDirections,
    });
    expect(unavailable).toMatchObject({
      state: "provider_unavailable",
      itineraries: [],
    });

    const places = [makeSummary("bad"), makeSummary("good1"), makeSummary("good2")];
    const partial = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places, undefined, {
        failDetailIds: new Set(["bad"]),
      }),
      directions: mockDirections,
    });
    expect(partial.state).toBe("partial");
    expect(partial.itineraries.length).toBeGreaterThan(0);
    expect(partial.exclusionCounts.detail_unavailable).toBe(1);
  });

  it("enforces catalog, detail-call and concurrency limits before detail fan-out", async () => {
    const places = Array.from({ length: 100 }, (_, index) =>
      makeSummary(`p${String(index).padStart(3, "0")}`),
    );
    const service = new MockTourService(places, undefined, { detailDelayMs: 2 });
    const result = await generateItineraries(makeRequest(), {
      tourService: service,
      directions: mockDirections,
    });
    expect(result.providerCandidatesConsidered).toBe(100);
    expect(result.candidateFunnel.preliminaryRankedCandidates).toBe(
      ITINERARY_GENERATION_LIMITS.maxCatalogCandidates,
    );
    expect(result.shortlistedCandidates).toBe(
      ITINERARY_GENERATION_LIMITS.maxDetailCalls,
    );
    expect(result.providerCalls.detail).toBe(
      ITINERARY_GENERATION_LIMITS.maxDetailCalls,
    );
    expect(service.maxActiveDetailCalls).toBeLessThanOrEqual(
      ITINERARY_GENERATION_LIMITS.detailConcurrency,
    );
    expect(result.exclusionCounts.candidate_limit).toBeGreaterThan(0);
  });

  it("ranks the complete matching catalog before applying the 80 and 12 limits", async () => {
    const farPlaces = Array.from({ length: 99 }, (_, index) =>
      makeSummary(`far-${String(index).padStart(3, "0")}`, "38", {
        latitude: 36 + index / 10_000,
        longitude: 130 + index / 10_000,
      }),
    );
    const nearest = makeSummary("zz-nearest", "38", {
      latitude: 35.1001,
      longitude: 129.0001,
    });
    const service = new MockTourService([...farPlaces, nearest]);
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 1 },
        selectedCategories: ["shopping"],
        includeShopping: true,
      }),
      { tourService: service, directions: mockDirections },
    );

    expect(service.listQueries.map(({ page }) => page)).toEqual([1, 2]);
    expect(result.candidateFunnel).toMatchObject({
      matchingCatalogCandidates: 100,
      afterBasicFilters: 100,
      preliminaryRankedCandidates: 80,
      detailedAssessmentCandidates: 12,
    });
    expect(service.detailIds[0]).toBe("zz-nearest");
    expect(result.itineraries[0]?.stops[0].contentId).toBe("zz-nearest");
  });

  it("uses provider ID as the deterministic equal-distance tie-breaker", async () => {
    const shared = { latitude: 35.101, longitude: 129.001 };
    const places = [
      makeSummary("b-place", "12", shared),
      makeSummary("a-place", "12", shared),
    ];
    const service = new MockTourService(places);
    const result = await generateItineraries(
      makeRequest({ planning: { desiredStopCount: 1 } }),
      { tourService: service, directions: mockDirections },
    );
    expect(service.detailIds.slice(0, 2)).toEqual(["a-place", "b-place"]);
    expect(result.itineraries[0]?.stops[0].contentId).toBe("a-place");
  });

  it("keeps pet-size compatibility separate and reconciles every funnel stage", async () => {
    const places = [
      makeSummary("small-only", "12", { latitude: 35.101 }),
      makeSummary("weight-limit", "12", { latitude: 35.102 }),
      makeSummary("unrestricted", "12", { latitude: 35.103 }),
      makeSummary("not-specified", "12", { latitude: 35.104 }),
      makeSummary("denied", "12", { latitude: 35.105 }),
      makeSummary("unknown", "12", { latitude: 35.106 }),
    ];
    const details = new Map([
      [
        "small-only",
        makeDetail(places[0], "conditional", {
          petPolicyText: "반려동물 동반 가능, 소형견만 가능",
        }),
      ],
      [
        "weight-limit",
        makeDetail(places[1], "conditional", {
          petPolicyText: "반려동물 동반 가능, 10kg 이하",
        }),
      ],
      [
        "unrestricted",
        makeDetail(places[2], "allowed", {
          petPolicyText: "소형견 중형견 대형견 모두 동반 가능",
        }),
      ],
      ["not-specified", makeDetail(places[3], "allowed")],
      ["denied", makeDetail(places[4], "denied")],
      ["unknown", makeDetail(places[5], "unknown")],
    ]);
    const result = await generateItineraries(
      makeRequest({ petSize: "LARGE", planning: { desiredStopCount: 1 } }),
      { tourService: new MockTourService(places, details), directions: mockDirections },
    );
    const funnel = result.candidateFunnel;
    const baseTotal =
      funnel.basePetAccess.allowed +
      funnel.basePetAccess.conditional +
      funnel.basePetAccess.notAllowed +
      funnel.basePetAccess.unknown +
      funnel.basePetAccess.notApplicable;
    const compatibilityTotal =
      funnel.petSizeCompatibility.compatible +
      funnel.petSizeCompatibility.incompatible +
      funnel.petSizeCompatibility.verificationRequired +
      funnel.petSizeCompatibility.notSpecified;

    expect(funnel.detailedAssessmentCandidates).toBe(
      funnel.detailOutcomes.unavailable + funnel.detailOutcomes.mismatch + baseTotal,
    );
    expect(compatibilityTotal).toBe(
      funnel.basePetAccess.allowed + funnel.basePetAccess.conditional,
    );
    expect(funnel).toMatchObject({
      petSizeCompatibility: {
        compatible: 1,
        incompatible: 1,
        verificationRequired: 1,
        notSpecified: 1,
      },
      itineraryEligibleCandidates: 2,
    });
    expect(result.exclusionCounts).toMatchObject({
      pet_size_incompatible: 1,
      pet_size_verification_required: 1,
      not_allowed: 1,
      unknown: 1,
    });
    expect(result.itineraries[0]?.stops[0].petAccess.sizeCompatibility.state)
      .toMatch(/compatible|not_specified/u);
    expect(funnel.returnedRoutes).toBe(result.itineraries.length);
  });

  it("changes recommendations only when explicit size evidence supports it", async () => {
    const restricted = makeSummary("nearest-small-only", "12", {
      latitude: 35.1001,
      longitude: 129.0001,
    });
    const unrestricted = makeSummary("far-unrestricted", "12", {
      latitude: 35.11,
      longitude: 129.01,
    });
    const details = new Map([
      [
        restricted.contentId,
        makeDetail(restricted, "conditional", {
          petPolicyText: "반려동물 동반 가능, 소형견만 가능",
        }),
      ],
      [unrestricted.contentId, makeDetail(unrestricted, "allowed")],
    ]);
    const service = () => new MockTourService([restricted, unrestricted], details);
    const small = await generateItineraries(
      makeRequest({ petSize: "SMALL", planning: { desiredStopCount: 1 } }),
      { tourService: service(), directions: mockDirections },
    );
    const large = await generateItineraries(
      makeRequest({ petSize: "LARGE", planning: { desiredStopCount: 1 } }),
      { tourService: service(), directions: mockDirections },
    );
    expect(small.itineraries[0]?.stops[0].contentId).toBe("nearest-small-only");
    expect(large.itineraries[0]?.stops[0].contentId).toBe("far-unrestricted");

    const noSizeEvidence = [
      makeSummary("plain-1", "12", { latitude: 35.101 }),
      makeSummary("plain-2", "12", { latitude: 35.102 }),
    ];
    const plainSmall = await generateItineraries(
      makeRequest({ petSize: "SMALL", planning: { desiredStopCount: 1 } }),
      { tourService: new MockTourService(noSizeEvidence), directions: mockDirections },
    );
    const plainLarge = await generateItineraries(
      makeRequest({ petSize: "LARGE", planning: { desiredStopCount: 1 } }),
      { tourService: new MockTourService(noSizeEvidence), directions: mockDirections },
    );
    expect(plainSmall.itineraries[0]?.stops[0].contentId).toBe(
      plainLarge.itineraries[0]?.stops[0].contentId,
    );
  });

  it("bounds directions attempts without evaluating permutations", async () => {
    const places = createSupply();
    let calls = 0;
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["attraction", "leisure", "food"],
      }),
      {
        tourService: new MockTourService(places),
        directions: async () => {
          calls += 1;
          throw new Error("directions unavailable");
        },
      },
    );
    expect(calls).toBeLessThanOrEqual(
      ITINERARY_GENERATION_LIMITS.maxDirectionsCalls,
    );
    expect(result.providerCalls.directions).toBe(calls);
    expect(result.state).toBe("provider_unavailable");
  });

  it("preserves actual Kakao totals, sections, geometry and waypoint order", async () => {
    const places = [makeSummary("k1"), makeSummary("k2")];
    const requests: KakaoDirectionsRequest[] = [];
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places),
      directions: async (request) => {
        requests.push(request);
        return mockDirections(request, { distance: 12_345, duration: 2_345 });
      },
    });
    const itinerary = result.itineraries[0];
    expect(itinerary).toMatchObject({
      totalDistanceMeters: 12_345,
      totalDurationSeconds: 2_345,
    });
    expect(itinerary?.geometry).toHaveLength(3);
    expect(requests[0].waypoints[0].name).toBe(itinerary?.stops[0].title);
    expect(requests[0].destination.name).toBe(itinerary?.stops[1].title);
    expect(itinerary?.stops.map(({ distanceFromPreviousMeters }) => distanceFromPreviousMeters)).toEqual([1_000, 1_001]);
  });

  it("returns three meaningfully distinct profiles when supply permits", async () => {
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["attraction", "leisure", "food"],
      }),
      { tourService: new MockTourService(createSupply()), directions: mockDirections },
    );
    expect(result.itineraries.map(({ profile }) => profile)).toEqual([
      "minimum_travel",
      "balanced_tour_food",
      "walk_leisure",
    ]);
    const sets = result.itineraries.map(({ stops }) =>
      new Set(stops.map(({ contentId }) => contentId)),
    );
    for (let left = 0; left < sets.length; left += 1) {
      for (let right = left + 1; right < sets.length; right += 1) {
        const intersection = [...sets[left]].filter((id) => sets[right].has(id)).length;
        const union = new Set([...sets[left], ...sets[right]]).size;
        expect(intersection / union).toBeLessThanOrEqual(
          MAX_ITINERARY_JACCARD_OVERLAP,
        );
      }
    }
  });

  it("returns fewer truthful routes when candidate supply cannot satisfy diversity", async () => {
    const places = [makeSummary("only1"), makeSummary("only2")];
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places),
      directions: mockDirections,
    });
    expect(result.itineraries).toHaveLength(1);
    expect(result.notices.join(" ")).toContain("빈 슬롯을 만들지 않았습니다");
  });

  it("requires explicit indoor evidence when indoor access is required", async () => {
    const places = [makeSummary("outdoor1"), makeSummary("outdoor2")];
    const details = new Map(places.map((place) => [place.contentId, makeDetail(place, "outdoor")]));
    const result = await generateItineraries(
      makeRequest({ indoorAccessPreference: "required" }),
      { tourService: new MockTourService(places, details), directions: mockDirections },
    );
    expect(result.itineraries).toEqual([]);
    expect(result.exclusionCounts.indoor_requirement).toBe(2);
  });
});

describe("itinerary generation Route Handler", () => {
  it("returns a typed safe validation error without provider payloads", async () => {
    const handler = createItineraryGenerationHandler({
      tourService: new MockTourService([]),
      directions: mockDirections,
    });
    const response = await handler(
      new Request("http://localhost/api/itineraries/generate", {
        method: "POST",
        body: JSON.stringify({ selectedCategories: ["unsupported"] }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", retryable: false },
    });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("routes through Tourism and Kakao boundaries instead of a mocked final itinerary", async () => {
    const places = [makeSummary("api1"), makeSummary("api2")];
    const service = new MockTourService(places);
    let directionsCalls = 0;
    const handler = createItineraryGenerationHandler({
      tourService: service,
      directions: async (request) => {
        directionsCalls += 1;
        return mockDirections(request);
      },
    });
    const response = await handler(
      new Request("http://localhost/api/itineraries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: { type: "busan" },
          start: { coordinates: { latitude: 35.1, longitude: 129 } },
          travelDate: "2026-08-06",
          startTime: "10:00",
          planning: { desiredStopCount: 2 },
          selectedCategories: ["attraction"],
        }),
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.itineraries[0].stops.map((stop: { contentId: string }) => stop.contentId)).toEqual(["api1", "api2"]);
    expect(service.listQueries.length).toBeGreaterThan(0);
    expect(service.detailIds).toEqual(["api1", "api2"]);
    expect(directionsCalls).toBe(1);
  });
});
