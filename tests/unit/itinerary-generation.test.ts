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
import type {
  TourPlaceService,
  TourPlacesQuery,
  TourProviderVisibilityPage,
  TourProviderVisibilityQuery,
} from "@/lib/tour-api/service";
import type { KakaoDirectionsRequest, KakaoDrivingRoute } from "@/types/kakao";
import type {
  TourContentTypeId,
  TourPetPolicyFields,
  TourPlaceDetail,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";

const RETRIEVED_AT = new Date().toISOString();
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
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
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
    thumbnailUrl: options.thumbnailUrl ?? null,
    imageUrl: options.imageUrl ?? null,
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
      contentId,
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
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: summary.contentId,
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260805000000",
    },
  };
  const fields = options.petPolicyText === undefined
    ? policyFields(policy)
    : { ...EMPTY_POLICY_FIELDS, etcAcmpyInfo: options.petPolicyText };
  const sourceFields = Object.entries(fields).flatMap(([field, value]) =>
    value
      ? [{ field: field as keyof TourPetPolicyFields, value }]
      : [],
  );
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
    normalizedPetEvidence: {
      availability: sourceFields.length > 0 ? "partial" : "empty",
      fields,
      sourceFields,
      emptyFieldNames: Object.entries(fields).flatMap(([field, value]) =>
        value === null ? [field as keyof TourPetPolicyFields] : [],
      ),
      absentFieldNames: [],
      warningCodes:
        sourceFields.length > 0
          ? ["pet_detail_fields_partial"]
          : ["pet_detail_fields_empty"],
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

  async listProviderVisibility(
    query: TourProviderVisibilityQuery,
  ): Promise<TourProviderVisibilityPage> {
    if (this.options.failList) throw new Error("provider unavailable");
    const matches = this.places.filter(
      (place) =>
        (!query.contentTypeId || place.contentTypeId === query.contentTypeId) &&
        (!query.districtCode || place.legalDistrictCode === query.districtCode),
    );
    const offset = (query.page - 1) * query.pageSize;
    return {
      records: matches.slice(offset, offset + query.pageSize).flatMap((place) =>
        place.contentTypeId
          ? [
              {
                contentId: place.contentId,
                contentTypeId: place.contentTypeId,
                visibility: {
                  status: "exposed" as const,
                  providerField: "showflag",
                  providerValue: "1",
                  checkedAt: RETRIEVED_AT,
                  reasonCodes: [],
                },
              },
            ]
          : [],
      ),
      page: query.page,
      pageSize: query.pageSize,
      totalCount: matches.length,
      source: {
        provider: "Korea Tourism Organization",
        operation: "petTourSyncList2",
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
    return {
      ...detail,
      summary: {
        ...detail.summary,
        providerVisibility: {
          status: "exposed",
          providerField: "showflag",
          providerValue: "1",
          checkedAt: RETRIEVED_AT,
          reasonCodes: [],
        },
      },
    };
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
    petSpecies: "DOG" as const,
    petSize: "SMALL" as const,
    acceptsOutdoorOnly: false,
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
    ["invalid trip type", { tripType: "WEEKEND" }],
    ["invalid trip pace", { tripPace: "rushed" }],
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
      petSpecies: "DOG",
      acceptsOutdoorOnly: false,
      tripType: "DAY_TRIP",
      tripPace: "balanced",
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

  it("carries trip type and pace into the stable Stage 2 request identity", () => {
    const dayTrip = makeRequest({ tripType: "DAY_TRIP", tripPace: "relaxed" });
    const overnight = makeRequest({
      tripType: "OVERNIGHT",
      tripPace: "packed",
    });

    expect(dayTrip).toMatchObject({ tripType: "DAY_TRIP", tripPace: "relaxed" });
    expect(overnight).toMatchObject({ tripType: "OVERNIGHT", tripPace: "packed" });
    expect(getItineraryGenerationRequestKey(dayTrip)).not.toBe(
      getItineraryGenerationRequestKey(overnight),
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

  it("requires a valid raw current type before a list record can reach detail evaluation", async () => {
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
    const service = new MockTourService([fallback, confirmed], details);
    const result = await generateItineraries(makeRequest({
      planning: { desiredStopCount: 1 },
    }), {
      tourService: service,
      directions: mockDirections,
    });
    expect(result.itineraries[0]?.stops[0]).toMatchObject({
      contentId: "confirmed",
      providerContentTypeId: "12",
    });
    expect(service.detailIds).not.toContain("fallback");
    expect(result.candidatePipeline.diagnostics).toMatchObject({
      initialCatalogCount: 2,
      stageACount: 1,
      detailedEvaluationCount: 1,
      finalEligibleCount: 1,
    });
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
    const places = [
      makeSummary("s1", "38", { title: "부산 전통시장" }),
      makeSummary("s2", "38", { title: "지역 특산물 체험시장" }),
    ];
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
    const result = await generateItineraries(
      makeRequest({
        petEquipment: {
          hasCarrier: true,
          hasLeash: false,
          hasMuzzle: false,
        },
      }),
      {
      tourService: new MockTourService(places, details),
      directions: mockDirections,
      },
    );
    expect(result.itineraries[0]?.stops.map(({ petAccess }) => petAccess.verdict)).toEqual([
      "allowed",
      "conditional",
    ]);
    expect(result.itineraries[0]?.stops.find(({ petAccess }) => petAccess.verdict === "conditional")?.petAccess.conditions.length).toBeGreaterThan(0);
    expect(result.exclusionCounts.not_allowed).toBe(1);
    expect(result.exclusionCounts.unknown).toBe(0);
  });

  it("projects normalized Tourism pet evidence fields for presentation", async () => {
    const place = makeSummary("projected", "12", {
      imageUrl: "https://tong.visitkorea.or.kr/cms/resource/projected.jpg",
    });
    const result = await generateItineraries(
      makeRequest({ planning: { desiredStopCount: 1 } }),
      {
        tourService: new MockTourService([place]),
        directions: mockDirections,
      },
    );
    const stop = result.itineraries[0]?.stops[0];

    expect(stop?.imageUrl).toBe(
      "https://tong.visitkorea.or.kr/cms/resource/projected.jpg",
    );
    expect(stop?.petAccess).toMatchObject({
      verdict: "allowed",
      summary: expect.any(String),
      confidence: expect.stringMatching(/^(?:high|medium|low)$/u),
      reasonCodes: expect.arrayContaining(["explicit_allowance"]),
      evidence: [
        expect.objectContaining({
          operation: "detailPetTour2",
          originalText: "반려동물 동반 가능",
        }),
      ],
      conflicts: expect.any(Array),
      verificationItems: expect.any(Array),
      sources: expect.arrayContaining([
        expect.objectContaining({ operation: "detailPetTour2" }),
      ]),
      warnings: expect.any(Array),
    });
  });

  it.each([
    {
      name: "accepts an https official image",
      imageUrl: "https://tong.visitkorea.or.kr/cms/resource/official.jpg",
      thumbnailUrl: null,
      expected: "https://tong.visitkorea.or.kr/cms/resource/official.jpg",
    },
    {
      name: "accepts an http official thumbnail fallback",
      imageUrl: "https://example.com/untrusted.jpg",
      thumbnailUrl: "http://tong.visitkorea.or.kr/cms/resource/thumb.jpg",
      expected: "http://tong.visitkorea.or.kr/cms/resource/thumb.jpg",
    },
    {
      name: "rejects another host",
      imageUrl: "https://example.com/untrusted.jpg",
      thumbnailUrl: null,
      expected: undefined,
    },
    {
      name: "rejects a lookalike subdomain",
      imageUrl: "https://tong.visitkorea.or.kr.example.com/untrusted.jpg",
      thumbnailUrl: null,
      expected: undefined,
    },
    {
      name: "rejects a non-http protocol",
      imageUrl: "ftp://tong.visitkorea.or.kr/untrusted.jpg",
      thumbnailUrl: null,
      expected: undefined,
    },
  ])("$name", async ({ imageUrl, thumbnailUrl, expected }) => {
    const place = makeSummary("image-policy", "12", {
      imageUrl,
      thumbnailUrl,
    });
    const result = await generateItineraries(
      makeRequest({ planning: { desiredStopCount: 1 } }),
      {
        tourService: new MockTourService([place]),
        directions: mockDirections,
      },
    );

    expect(result.itineraries[0]?.stops[0]?.imageUrl).toBe(expected);
  });

  it("excludes invalid raw current types and unsupported detailed current types", async () => {
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
    expect(result.exclusionCounts.detail_mismatch).toBe(1);
    expect(result.candidatePipeline.reasonCounts).toMatchObject({
      unsupported_content_type: 2,
    });
    expect(result.candidatePipeline.diagnostics).toMatchObject({
      stageACount: 1,
      detailedEvaluationCount: 1,
      finalEligibleCount: 0,
    });
  });

  it("excludes a confirmed closed license without changing the pet verdict", async () => {
    const place = makeSummary("l1");
    const result = await generateItineraries(
      makeRequest({ planning: { desiredStopCount: 1 } }),
      {
        tourService: new MockTourService(
          [place],
          new Map([[place.contentId, makeDetail(place, "allowed")]]),
        ),
        licenseMatcher: {
          matchTourPlace: async () => ({
            licensingKind: "food" as const,
            matchState: "matched_high" as const,
            refinedVenueKind: "restaurant" as const,
            confidence: "high" as const,
            totalScore: 0.99,
            reasons: [],
            selectedRecord: null,
            alternatives: [],
            operatingState: "closed" as const,
            sources: [],
            section: { status: "available" as const },
          }),
        },
        directions: mockDirections,
      },
    );
    expect(result.itineraries).toEqual([]);
    expect(result.exclusionCounts.travel_unsuitable).toBe(1);
    expect(result.exclusionCounts.not_allowed).toBe(0);
  });

  it("keeps missing pet evidence unknown instead of converting it to denial", async () => {
    const places = [makeSummary("u1"), makeSummary("u2")];
    const details = new Map(places.map((place) => [place.contentId, makeDetail(place, "unknown")]));
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places, details),
      directions: mockDirections,
    });
    expect(result.exclusionCounts.unknown).toBe(0);
    expect(result.exclusionCounts.not_allowed).toBe(0);
    expect(result.itineraries.length).toBeGreaterThan(0);
    expect(result.candidateFunnel).toMatchObject({
      detailedAssessmentCandidates: 2,
      basePetAccess: {
        allowed: 0,
        conditional: 0,
        notAllowed: 0,
        unknown: 2,
        notApplicable: 0,
      },
      itineraryEligibleCandidates: 2,
    });
    expect(result.candidatePipeline.diagnostics.warningsByReason).toMatchObject({
      pet_evidence_empty: 2,
      pet_access_unknown: 2,
    });
    expect(result.candidatePipeline.diagnostics).toMatchObject({
      detailedEvaluationCount: 2,
      eligibleCount: 2,
      finalEligibleCount: 2,
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

  it("classifies a pet-detail outage before Phase 3's unknown verdict", async () => {
    const place = makeSummary("pet-detail-outage");
    const unavailableDetail = makeDetail(place, "unknown");
    unavailableDetail.petPolicyEvidence = null;
    unavailableDetail.normalizedPetEvidence = {
      availability: "provider_unavailable",
      fields: { ...EMPTY_POLICY_FIELDS },
      sourceFields: [],
      emptyFieldNames: [],
      absentFieldNames: Object.keys(
        EMPTY_POLICY_FIELDS,
      ) as Array<keyof TourPetPolicyFields>,
      warningCodes: ["pet_detail_provider_unavailable"],
    };
    unavailableDetail.sections.petPolicy = { status: "unavailable" };

    const result = await generateItineraries(
      makeRequest({ planning: { desiredStopCount: 1 } }),
      {
        tourService: new MockTourService(
          [place],
          new Map([[place.contentId, unavailableDetail]]),
        ),
        directions: mockDirections,
      },
    );

    expect(result).toMatchObject({
      state: "ready",
      exclusionCounts: { detail_unavailable: 0, unknown: 0 },
      candidateFunnel: {
        detailOutcomes: { unavailable: 1 },
        basePetAccess: { unknown: 1 },
      },
      candidatePipeline: {
        diagnostics: {
          providerFailures: 0,
          providerUnavailableCandidates: 1,
          eligibleCount: 1,
          finalEligibleCount: 1,
        },
      },
    });
    expect(result.itineraries[0]?.stops[0]?.petAccess.verdict).toBe("unknown");
    expect(result.candidatePipeline.diagnostics.warningsByReason).toMatchObject({
      required_pet_detail_call_unavailable: 1,
    });
  });

  it("enforces the 25/20 caps and stops adaptive evaluation after complete five-item batches", async () => {
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
    expect(ITINERARY_GENERATION_LIMITS).toMatchObject({
      maxCatalogCandidates: 25,
      maxDetailCalls: 20,
      detailConcurrency: 3,
    });
    expect(result.candidatePipeline.eligiblePoolTarget).toBe(7);
    expect(result.candidatePipeline.diagnostics).toMatchObject({
      stageACount: 25,
      stageBCount: 20,
      detailedEvaluationCount: 10,
      detailedBatchCount: 2,
      eligibleCount: 10,
      finalEligibleCount: 10,
    });
    expect(result.shortlistedCandidates).toBe(10);
    expect(result.providerCalls.detail).toBe(10);
    expect(service.detailIds).toHaveLength(10);
    expect(result.providerCalls.detail).toBeLessThan(
      ITINERARY_GENERATION_LIMITS.maxDetailCalls,
    );
    expect(service.maxActiveDetailCalls).toBeLessThanOrEqual(
      ITINERARY_GENERATION_LIMITS.detailConcurrency,
    );
    expect(result.exclusionCounts.candidate_limit).toBeGreaterThan(0);
  });

  it("ranks the complete matching catalog before the 25/20 caps and adaptive early stop", async () => {
    const farPlaces = Array.from({ length: 99 }, (_, index) =>
      makeSummary(`far-${String(index).padStart(3, "0")}`, "12", {
        latitude: 35.3 + index / 100_000,
        longitude: 129.2 + index / 100_000,
      }),
    );
    const nearest = makeSummary("zz-nearest", "12", {
      latitude: 35.1001,
      longitude: 129.0001,
    });
    const service = new MockTourService([...farPlaces, nearest]);
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 1 },
        selectedCategories: ["attraction"],
      }),
      { tourService: service, directions: mockDirections },
    );

    expect(service.listQueries.map(({ page }) => page)).toEqual([1, 2]);
    expect(result.candidateFunnel).toMatchObject({
      matchingCatalogCandidates: 100,
      afterBasicFilters: 100,
      preliminaryRankedCandidates: 25,
      detailedAssessmentCandidates: 10,
    });
    expect(result.candidatePipeline.diagnostics).toMatchObject({
      stageACount: 25,
      stageBCount: 20,
      detailedEvaluationCount: 10,
      detailedBatchCount: 2,
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

    expect(funnel.detailedAssessmentCandidates).toBe(6);
    expect(baseTotal).toBe(result.candidatePipeline.diagnostics.finalEligibleCount);
    expect(compatibilityTotal).toBe(
      funnel.basePetAccess.allowed + funnel.basePetAccess.conditional,
    );
    expect(funnel).toMatchObject({
      petSizeCompatibility: {
        compatible: 1,
        incompatible: 0,
        verificationRequired: 1,
        notSpecified: 1,
      },
      itineraryEligibleCandidates: 4,
    });
    expect(result.candidatePipeline.reasonCounts).toMatchObject({
      pet_size_incompatible: 1,
      pet_access_not_allowed: 1,
    });
    expect(result.candidatePipeline.diagnostics.warningsByReason).toMatchObject({
      pet_size_verification_required: 1,
      pet_access_unknown: 1,
    });
    expect(result.candidatePipeline.diagnostics).toMatchObject({
      detailedEvaluationCount: 6,
      detailedBatchCount: 2,
      eligibleCount: 4,
      finalEligibleCount: 4,
    });
    expect(result.exclusionCounts).toMatchObject({
      pet_size_incompatible: 1,
      pet_size_verification_required: 0,
      not_allowed: 1,
      unknown: 0,
    });
    expect(result.itineraries[0]?.stops[0].petAccess.sizeCompatibility.state)
      .toMatch(/compatible|not_specified/u);
    expect(funnel.returnedRoutes).toBe(result.itineraries.length);
  });

  it("uses explicit size evidence as a hard gate while preserving deterministic utility ordering", async () => {
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
    expect(small.itineraries[0]?.stops[0].contentId).toBe("far-unrestricted");
    expect(large.itineraries[0]?.stops[0].contentId).toBe("far-unrestricted");
    expect(small.exclusionCounts.pet_size_incompatible).toBe(0);
    expect(large.exclusionCounts.pet_size_incompatible).toBe(1);
    expect(small.itineraries[0]?.stops[0].placeUtility.petCompatibility).toBe(1);
    expect(large.itineraries[0]?.stops[0].placeUtility.petCompatibility).toBe(1);

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
      "preference_balanced",
      "minimum_movement",
      "discovery",
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
    expect(result.candidatePipeline.reasonCounts.mandatory_condition_unsatisfied).toBeUndefined();
    expect(result.candidatePipeline.diagnostics).toMatchObject({
      detailedEvaluationCount: 2,
      eligibleCount: 2,
      finalEligibleCount: 2,
    });
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
          petSpecies: "DOG",
          acceptsOutdoorOnly: false,
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

describe("Phase 2 recommendation regressions", () => {
  it.each([
    ["bedding shop", "부산 침구 할인매장", "38"],
    ["furniture shop", "센텀 가구 아울렛", "38"],
    ["wedding goods", "웨딩 혼수 전문점", "38"],
    ["optical shop", "해운대 안경원", "38"],
    ["beauty service", "광안리 미용실", "38"],
    ["department tenant", "백화점 7층 생활잡화", "38"],
    ["generic retail", "부산 종합 소매점", "38"],
    ["pet supplies", "반려동물 용품 전문점", "38"],
    ["pharmacy", "부산 시민약국", "12"],
    ["clinic", "해운대 동물병원", "12"],
    ["bank", "부산 지역은행", "12"],
    ["repair", "광안 자동차 수리센터", "12"],
    ["logistics", "부산 물류 배송센터", "12"],
    ["office", "센텀 기업 사무실", "12"],
    ["academy", "해운대 입시학원", "12"],
    ["industrial", "부산 산업 공장", "12"],
  ] as const)("hard-excludes a non-travel %s", async (_label, title, type) => {
    const place = makeSummary(`blocked-${type}`, type, { title });
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 1 },
        selectedCategories: [TYPE_CATEGORY[type]],
        includeShopping: type === "38",
      }),
      {
        tourService: new MockTourService([place]),
        directions: mockDirections,
      },
    );

    expect(result.itineraries).toEqual([]);
  });

  it("allows only positively identified travel shopping after opt-in", async () => {
    const generic = makeSummary("shop-near", "38", {
      title: "센텀 생활잡화 매장",
      latitude: 35.101,
      longitude: 129.001,
    });
    const market = makeSummary("market-far", "38", {
      title: "부산 전통시장 문화체험",
      latitude: 35.15,
      longitude: 129.05,
    });
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 1 },
        selectedCategories: ["shopping"],
        includeShopping: true,
      }),
      {
        tourService: new MockTourService([generic, market]),
        directions: mockDirections,
      },
    );

    expect(result.itineraries[0]?.stops[0]?.contentId).toBe("market-far");
  });

  it("uses a role-aware detailed shortlist instead of the nearest twelve only", async () => {
    const attractions = Array.from({ length: 12 }, (_, index) =>
      makeSummary(`near-${index + 1}`, "12", {
        latitude: 35.101 + index / 10_000,
        longitude: 129.001 + index / 10_000,
      }),
    );
    const leisure = makeSummary("far-leisure", "28", {
      title: "부산 해안 산책로",
      latitude: 35.18,
      longitude: 129.08,
    });
    const food = makeSummary("far-food", "39", {
      title: "부산 향토 음식점",
      latitude: 35.19,
      longitude: 129.09,
    });
    const service = new MockTourService([...attractions, leisure, food]);

    await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["attraction", "leisure", "food"],
      }),
      { tourService: service, directions: mockDirections },
    );

    expect(service.detailIds).toContain("far-leisure");
    expect(service.detailIds).toContain("far-food");
  });

  it.each([
    ["hasCarrier", "반려동물 동반 가능, 이동장 사용 필수"],
    ["hasLeash", "반려동물 동반 가능, 목줄 착용 필수"],
    ["hasMuzzle", "반려동물 동반 가능, 입마개 착용 필수"],
  ] as const)("excludes a known %s equipment mismatch", async (field, policyText) => {
    const place = makeSummary(`equipment-${field}`);
    const details = new Map([
      [place.contentId, makeDetail(place, "conditional", { petPolicyText: policyText })],
    ]);
    const request = Object.assign(
      makeRequest({ planning: { desiredStopCount: 1 } }),
      {
        petEquipment: {
          hasCarrier: true,
          hasLeash: true,
          hasMuzzle: true,
          [field]: false,
        },
      },
    );
    const result = await generateItineraries(request, {
      tourService: new MockTourService([place], details),
      directions: mockDirections,
    });

    expect(result.itineraries).toEqual([]);
  });

  it("does not schedule accommodation before a supported check-in time", async () => {
    const stay = makeSummary("stay-check-in", "32", {
      title: "부산 반려동물 숙소",
      latitude: 35.101,
      longitude: 129.001,
    });
    const detail = {
      ...makeDetail(stay),
      checkInTime: "15:00",
      checkOutTime: "11:00",
    };
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 1 },
        startTime: "10:00",
        selectedCategories: ["accommodation"],
      }),
      {
        tourService: new MockTourService(
          [stay],
          new Map([[stay.contentId, detail]]),
        ),
        directions: mockDirections,
      },
    );

    expect(result.itineraries[0]?.stops[0]?.plannedArrival).toBe("15:00");
  });

  it("canonicalizes category order for the same generation seed", async () => {
    const places = createSupply();
    const service = () => new MockTourService(places);
    const leftRequest = Object.assign(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["attraction", "leisure", "food"],
      }),
      { generationSeed: "same-seed" },
    );
    const rightRequest = Object.assign(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["food", "attraction", "leisure"],
      }),
      { generationSeed: "same-seed" },
    );
    const [left, right] = await Promise.all([
      generateItineraries(leftRequest, {
        tourService: service(),
        directions: mockDirections,
      }),
      generateItineraries(rightRequest, {
        tourService: service(),
        directions: mockDirections,
      }),
    ]);
    const signatures = (value: typeof left) =>
      value.itineraries.map(({ stops }) =>
        stops.map(({ contentId }) => contentId).join(">"),
      );

    expect(signatures(left)).toEqual(signatures(right));
  });

  it("uses a new seed and recent signatures to produce a true reroll", async () => {
    const places = createSupply();
    const first = await generateItineraries(
      Object.assign(
        makeRequest({
          planning: { desiredStopCount: 3 },
          selectedCategories: ["attraction", "leisure", "food"],
        }),
        { generationSeed: "seed-one" },
      ),
      { tourService: new MockTourService(places), directions: mockDirections },
    );
    const recentRouteSignatures = first.itineraries.map(({ stops }) =>
      stops.map(({ contentId }) => contentId).join(">"),
    );
    const rerolled = await generateItineraries(
      Object.assign(
        makeRequest({
          planning: { desiredStopCount: 3 },
          selectedCategories: ["attraction", "leisure", "food"],
        }),
        { generationSeed: "seed-two", recentRouteSignatures },
      ),
      { tourService: new MockTourService(places), directions: mockDirections },
    );
    const rerolledSignatures = rerolled.itineraries.map(({ stops }) =>
      stops.map(({ contentId }) => contentId).join(">"),
    );

    expect(rerolledSignatures.every((signature) =>
      !recentRouteSignatures.includes(signature),
    )).toBe(true);
  });

  it("returns deterministic place and route score components", async () => {
    const places = createSupply();
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["attraction", "leisure", "food"],
      }),
      { tourService: new MockTourService(places), directions: mockDirections },
    );
    const itinerary = result.itineraries[0] as unknown as {
      routeScore?: { total: number; components: Record<string, number> };
      signature?: string;
      stops: Array<{ placeScore?: { total: number; components: Record<string, number> } }>;
    };

    expect(itinerary.signature).toMatch(/^tour:/u);
    expect(itinerary.routeScore?.total).toBeGreaterThan(0);
    expect(itinerary.routeScore?.components).toMatchObject({
      travelTimePenalty: expect.any(Number),
      backtrackingPenalty: expect.any(Number),
      repeatedCategoryPenalty: expect.any(Number),
    });
    expect(itinerary.stops.every(({ placeScore }) =>
      typeof placeScore?.total === "number",
    )).toBe(true);
  });

  it("never includes an unknown Kakao-only stop in an automatic route", async () => {
    const places = createSupply();
    const dependencies = {
      tourService: new MockTourService(places),
      directions: mockDirections,
      discoverPlaces: async () => ({
        candidates: [
          {
            id: "kakao-explore-1",
            name: "부산 반려동물 해안공원",
            category: "leisure" as const,
            kakaoCategoryText: "여행 > 공원",
            address: "부산광역시 수영구",
            coordinates: { latitude: 35.155, longitude: 129.12 },
            phone: "051-000-0000",
            placeUrl: "https://place.map.kakao.com/1",
            source: "KAKAO" as const,
            candidateStatus: "discovery_candidate" as const,
            verificationStatus: "verification_required" as const,
            petAccessVerdict: "unknown" as const,
            recommendationEligible: false as const,
          },
        ],
        searchArea: {
          mode: "viewport" as const,
          rectangle: { west: 129.1, south: 35.1, east: 129.2, north: 35.2 },
          center: { latitude: 35.15, longitude: 129.12 },
        },
        district: null,
        category: "leisure" as const,
        metadata: {
          externalCallCount: 1,
          upstreamDocumentCount: 1,
          duplicateCount: 0,
          outOfRegionRemovalCount: 0,
          excludedCategoryCount: 0,
          exactExistingPlaceLinkCount: 0,
          verificationRequiredCandidateCount: 1,
          saturated: false,
          partial: false,
          stoppingReasons: [],
        },
      }),
    };
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["attraction", "leisure", "food"],
      }),
      dependencies,
    );
    expect(
      result.itineraries.flatMap(({ stops }) => stops).some(
        ({ source }) => source === "KAKAO",
      ),
    ).toBe(false);
  });

  it("never uses a Kakao-only candidate as a mandatory meal stop", async () => {
    const result = await generateItineraries(
      makeRequest({
        planning: { desiredStopCount: 3 },
        selectedCategories: ["attraction", "leisure", "food"],
      }),
      {
        tourService: new MockTourService(createSupply()),
        directions: mockDirections,
        discoverPlaces: async () => ({
          candidates: [
            {
              id: "kakao-meal-1",
              name: "부산 반려동물 여행 카페",
              category: "food" as const,
              kakaoCategoryText: "음식점 > 카페",
              address: "부산광역시 수영구",
              coordinates: { latitude: 35.155, longitude: 129.12 },
              source: "KAKAO" as const,
              candidateStatus: "discovery_candidate" as const,
              verificationStatus: "verification_required" as const,
              petAccessVerdict: "unknown" as const,
              recommendationEligible: false as const,
            },
          ],
          searchArea: {
            mode: "viewport" as const,
            rectangle: { west: 129.1, south: 35.1, east: 129.2, north: 35.2 },
            center: { latitude: 35.15, longitude: 129.12 },
          },
          district: null,
          category: "food" as const,
          metadata: {
            externalCallCount: 1,
            upstreamDocumentCount: 1,
            duplicateCount: 0,
            outOfRegionRemovalCount: 0,
            excludedCategoryCount: 0,
            exactExistingPlaceLinkCount: 0,
            verificationRequiredCandidateCount: 1,
            saturated: false,
            partial: false,
            stoppingReasons: [],
          },
        }),
      },
    );

    expect(
      result.itineraries.flatMap(({ stops }) => stops).some(
        ({ source, category }) => source === "KAKAO" && category === "food",
      ),
    ).toBe(false);
  });

  it("reports neutral cold-start popularity without presenting provider order as popularity", async () => {
    const places = createSupply();
    const result = await generateItineraries(makeRequest(), {
      tourService: new MockTourService(places),
      directions: mockDirections,
    });
    const stops = result.itineraries.flatMap(({ stops: itineraryStops }) =>
      itineraryStops,
    );
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(stop.placeUtility.popularity).toBe(0.5);
      expect(stop.placeUtility.warningCodes).toContain(
        "popularity_insufficient_data",
      );
    }
    expect(JSON.stringify(result)).not.toMatch(/"(?:rating|reviewCount)"|인기순/u);
  });
});
