import { describe, expect, it, vi } from "vitest";
import {
  compareFinalEligibleCandidatesV1,
  runCandidatePipelineV1,
} from "@/lib/recommendation/candidate-pipeline";
import { retrieveStageACandidatesV1 } from "@/lib/recommendation/retrieval/candidate-retriever";
import { assessScheduleCompatibilityV1 } from "@/lib/recommendation/schedule/schedule-compatibility";
import type { CandidatePipelineRequestContext } from "@/lib/recommendation/types";
import { TourRequestCache } from "@/lib/tour-api/cache";
import {
  KoreaTourismService,
  type TourClientLike,
  type TourPlaceScheduleDetail,
  type TourPlaceService,
  type TourPlacesQuery,
} from "@/lib/tour-api/service";
import type { PopularityRepository } from "@/lib/recommendation/popularity/popularity-repository";
import type { ParsedTourResponse, TourItem } from "@/lib/tour-api/schemas";
import type { LicensingMatchResult } from "@/types/license";
import type {
  TourContentTypeId,
  TourPetPolicyFieldName,
  TourPetPolicyFields,
  TourPlaceDetail,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";

const RETRIEVED_AT = "2026-08-12T00:00:00.000Z";
const TYPE_CATEGORY = {
  "12": "attraction",
  "14": "culture",
  "15": "festival",
  "28": "leisure",
  "32": "accommodation",
  "38": "shopping",
  "39": "food",
} as const;

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
  overrides: Partial<TourPlaceSummary> = {},
): TourPlaceSummary {
  return {
    contentId,
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category: TYPE_CATEGORY[contentTypeId],
    title: `부산 관광지 ${contentId}`,
    address: `부산 주소 ${contentId}`,
    detailAddress: null,
    longitude: 129.05,
    latitude: 35.15,
    phone: "051-000-0000",
    thumbnailUrl: "https://example.invalid/place.jpg",
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: "20260812000000",
    legalRegionCode: "26",
    legalDistrictCode: "350",
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
      checkedAt: RETRIEVED_AT,
      reasonCodes: [],
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      contentId,
      retrievedAt: RETRIEVED_AT,
    },
    ...overrides,
  };
}

function makeScheduleDetail(summary: TourPlaceSummary): TourPlaceScheduleDetail {
  const detailSummary = {
    ...summary,
    source: {
      provider: "Korea Tourism Organization" as const,
      operation: "detailCommon2" as const,
      contentId: summary.contentId,
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260812000000",
    },
  };
  return {
    summary: detailSummary,
    overview: null,
    homepageUrl: null,
    operatingInformation: "09:00-20:00",
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: "20260812000000",
    introPetPolicyEvidence: null,
    sections: {
      common: { status: "available" },
      intro: { status: "available" },
    },
    source: detailSummary.source,
  };
}

function makePolicyDetail(
  summary: TourPlaceSummary,
  policyText: string,
  overrides: Partial<TourPlaceDetail> = {},
): TourPlaceDetail {
  const schedule = makeScheduleDetail(summary);
  const fields: TourPetPolicyFields = {
    ...EMPTY_POLICY_FIELDS,
    etcAcmpyInfo: policyText,
  };
  const sourceFields = Object.entries(fields).flatMap(([field, value]) =>
    value ? [{ field: field as TourPetPolicyFieldName, value }] : [],
  );
  const detail: TourPlaceDetail = {
    ...schedule,
    petPolicyEvidence: {
      fields,
      sourceEvidence: {
        provider: "Korea Tourism Organization",
        operation: "detailPetTour2",
        contentId: summary.contentId,
        retrievedAt: RETRIEVED_AT,
        providerModifiedTime: "20260812000000",
        originalEvidenceFields: { ...fields },
      },
    },
    normalizedPetEvidence: {
      availability: "partial",
      fields,
      sourceFields,
      emptyFieldNames: Object.entries(fields).flatMap(([field, value]) =>
        value === null ? [field as TourPetPolicyFieldName] : [],
      ),
      absentFieldNames: [],
      warningCodes: ["pet_detail_fields_partial"],
    },
    sections: {
      ...schedule.sections,
      petPolicy: { status: "available" },
    },
  };
  return { ...detail, ...overrides };
}

function makeEligibleDetail(summary: TourPlaceSummary): TourPlaceDetail {
  return makePolicyDetail(summary, "반려동물 동반 가능");
}

function context(
  selectedCategories: CandidatePipelineRequestContext["request"]["selectedCategories"] = [
    "attraction",
  ],
): CandidatePipelineRequestContext {
  return {
    request: {
      scope: { type: "busan", regionCode: "26", regionName: "부산 전체" },
      start: {
        coordinates: { latitude: 35.15, longitude: 129.05 },
        label: "출발지",
      },
      travelDate: "2026-08-12",
      tripType: "DAY_TRIP",
      tripPace: "balanced",
      startTime: "10:00",
      planningMode: "stop_count",
      desiredDurationMinutes: null,
      desiredStopCount: 2,
      petSpecies: "DOG",
      petSize: "SMALL",
      acceptsOutdoorOnly: true,
      petEquipment: {
        hasCarrier: true,
        hasLeash: true,
        hasMuzzle: true,
      },
      indoorAccessPreference: "any",
      selectedCategories,
      includeShopping: false,
      generationSeed: "candidate-pipeline-test",
      recentRouteSignatures: [],
    },
    minStops: 1,
    maxStops: 2,
    tripType: "DAY_TRIP",
    petProfile: {
      species: "DOG",
      size: "SMALL",
      hasCarrier: true,
      hasLeash: true,
      hasMuzzle: true,
      acceptsOutdoorOnly: true,
    },
    tripRequest: {
      scope: {
        regionCode: "26",
        districtCode: null,
        bounds: { west: 128.75, south: 34.95, east: 129.4, north: 35.5 },
      },
      selectedCategories,
      includeShopping: false,
      indoorAccessPreference: "any",
    },
  };
}

function withContext(
  base: CandidatePipelineRequestContext,
  overrides: {
    includeShopping?: boolean;
    tripType?: "DAY_TRIP" | "OVERNIGHT";
    minStops?: number;
    maxStops?: number;
    tripPace?: CandidatePipelineRequestContext["request"]["tripPace"];
    petProfile?: Partial<CandidatePipelineRequestContext["petProfile"]>;
    indoorAccessPreference?: "any" | "preferred" | "required";
  },
): CandidatePipelineRequestContext {
  const tripType = overrides.tripType ?? base.tripType;
  const includeShopping = overrides.includeShopping ?? base.request.includeShopping;
  const indoorAccessPreference =
    overrides.indoorAccessPreference ?? base.request.indoorAccessPreference;
  return {
    ...base,
    minStops: overrides.minStops ?? base.minStops,
    maxStops: overrides.maxStops ?? base.maxStops,
    tripType,
    petProfile: { ...base.petProfile, ...overrides.petProfile },
    request: {
      ...base.request,
      tripType,
      tripPace: overrides.tripPace ?? base.request.tripPace,
      includeShopping,
      indoorAccessPreference,
    },
    tripRequest: {
      ...base.tripRequest,
      includeShopping,
      indoorAccessPreference,
    },
  };
}

function emptyList(query: TourPlacesQuery): TourPlaceList {
  return {
    places: [],
    page: query.page,
    pageSize: query.pageSize,
    totalCount: 0,
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: RETRIEVED_AT,
    },
  };
}

class StagedFixtureService implements TourPlaceService {
  readonly scheduleIds: string[] = [];
  readonly detailIds: string[] = [];

  constructor(
    private readonly places: ReadonlyMap<string, TourPlaceSummary>,
    private readonly options: {
      schedules?: ReadonlyMap<string, TourPlaceScheduleDetail>;
      details?: ReadonlyMap<string, TourPlaceDetail>;
      failScheduleIds?: ReadonlySet<string>;
      failDetailIds?: ReadonlySet<string>;
      detailDelayMs?: ReadonlyMap<string, number>;
    } = {},
  ) {}

  async listPlaces(query: TourPlacesQuery): Promise<TourPlaceList> {
    return emptyList(query);
  }

  async getPlaceScheduleDetail(
    contentId: string,
  ): Promise<TourPlaceScheduleDetail> {
    this.scheduleIds.push(contentId);
    if (this.options.failScheduleIds?.has(contentId)) {
      throw new Error("schedule unavailable");
    }
    const place = this.places.get(contentId);
    if (!place) throw new Error("place not found");
    return this.options.schedules?.get(contentId) ?? makeScheduleDetail(place);
  }

  async completePlaceDetail(
    schedule: TourPlaceScheduleDetail,
  ): Promise<TourPlaceDetail> {
    const contentId = schedule.summary.contentId;
    this.detailIds.push(contentId);
    if (this.options.failDetailIds?.has(contentId)) {
      throw new Error("pet detail unavailable");
    }
    const delay = this.options.detailDelayMs?.get(contentId) ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const place = this.places.get(contentId);
    if (!place) throw new Error("place not found");
    return this.options.details?.get(contentId) ?? makeEligibleDetail(place);
  }

  async getPlaceDetail(contentId: string): Promise<TourPlaceDetail> {
    const schedule = await this.getPlaceScheduleDetail(contentId);
    return this.completePlaceDetail(schedule);
  }
}

function activeFoodLicense(): LicensingMatchResult {
  return {
    licensingKind: "food",
    matchState: "matched_high",
    refinedVenueKind: "restaurant",
    confidence: "high",
    totalScore: 0.95,
    reasons: [],
    sources: [],
    section: { status: "available" },
    selectedRecord: null,
    alternatives: [],
    operatingState: "active",
  };
}

function parsed(items: TourItem[]): ParsedTourResponse {
  return {
    items,
    numOfRows: 20,
    pageNo: 1,
    totalCount: items.length,
    resultCode: "0000",
  };
}

describe("candidate-pipeline-v1 foundations", () => {
  it("reports cache miss, coalescing, and later cache hit without exposing keys", async () => {
    const cache = new TourRequestCache();
    const outcomes: string[] = [];
    let release!: (value: number) => void;
    const loader = vi.fn(
      () => new Promise<number>((resolve) => {
        release = resolve;
      }),
    );

    const first = cache.getOrLoad("secret-cache-key", 60_000, loader, 1, (value) =>
      outcomes.push(value),
    );
    const second = cache.getOrLoad("secret-cache-key", 60_000, loader, 1, (value) =>
      outcomes.push(value),
    );
    release(42);

    expect(await Promise.all([first, second])).toEqual([42, 42]);
    expect(
      await cache.getOrLoad("secret-cache-key", 60_000, loader, 1, (value) =>
        outcomes.push(value),
      ),
    ).toBe(42);
    expect(loader).toHaveBeenCalledOnce();
    expect(outcomes).toEqual(["miss", "coalesced", "hit"]);
  });

  it("keeps pet detail out of Stage B and reports request cache outcomes", async () => {
    const operations: string[] = [];
    const client: TourClientLike = {
      request: vi.fn(async (operation) => {
        operations.push(operation);
        if (operation === "detailCommon2") {
          return parsed([
            {
              contentid: "provider-1",
              contenttypeid: "12",
              lDongRegnCd: "26",
              title: "부산 관광지",
            },
          ]);
        }
        if (operation === "petTourSyncList2") {
          return parsed([
            { contentid: "provider-1", contenttypeid: "12", showflag: "1" },
          ]);
        }
        if (operation === "detailIntro2") return parsed([]);
        if (operation === "detailPetTour2") {
          return parsed([
            { contentid: "provider-1", etcAcmpyInfo: "반려동물 동반 가능" },
          ]);
        }
        return parsed([]);
      }),
    };
    const service = new KoreaTourismService(
      client,
      new TourRequestCache(),
      () => new Date(RETRIEVED_AT),
    );
    const observations: string[] = [];
    const observe = ({
      operation,
      cache,
      providerOutcome,
    }: {
      operation: string;
      cache: string;
      providerOutcome?: string;
    }) => observations.push(`${operation}:${cache}:${providerOutcome ?? "lookup"}`);

    const schedule = await service.getPlaceScheduleDetail(
      "provider-1",
      "12",
      observe,
    );
    expect(operations).toEqual([
      "detailCommon2",
      "petTourSyncList2",
      "detailIntro2",
    ]);
    expect(schedule.sections.intro.status).toBe("available");

    const detail = await service.completePlaceDetail(schedule, observe);
    expect(operations.at(-1)).toBe("detailPetTour2");
    expect(detail.sections.petPolicy.status).toBe("available");

    await service.getPlaceDetail("provider-1", "12", observe);
    expect(operations).toHaveLength(4);
    expect(observations.filter((value) => value.endsWith(":miss:lookup"))).toHaveLength(4);
    expect(observations.filter((value) => value.endsWith(":hit:lookup"))).toHaveLength(4);
    expect(observations.filter((value) => value.endsWith(":miss:succeeded"))).toHaveLength(4);
  });

  it("distinguishes confirmed conflict, unknown hours, and provider failure", () => {
    const base = makeScheduleDetail(makeSummary("schedule"));
    expect(
      assessScheduleCompatibilityV1({
        detail: base,
        providerAvailable: true,
        travelDate: "2026-08-12",
        asOf: RETRIEVED_AT,
        proposedArrivalMinutes: 10 * 60,
        proposedDepartureMinutes: 11 * 60,
      }).status,
    ).toBe("compatible");
    expect(
      assessScheduleCompatibilityV1({
        detail: { ...base, operatingInformation: "09:00-09:30" },
        providerAvailable: true,
        travelDate: "2026-08-12",
        asOf: RETRIEVED_AT,
        proposedArrivalMinutes: 10 * 60,
        proposedDepartureMinutes: 11 * 60,
      }).status,
    ).toBe("conflict");
    expect(
      assessScheduleCompatibilityV1({
        detail: { ...base, operatingInformation: null },
        providerAvailable: true,
        travelDate: "2026-08-12",
        asOf: RETRIEVED_AT,
        proposedArrivalMinutes: 10 * 60,
        proposedDepartureMinutes: 11 * 60,
      }).status,
    ).toBe("unknown");
    expect(
      assessScheduleCompatibilityV1({
        detail: { ...base, sections: { ...base.sections, intro: { status: "unavailable" } } },
        providerAvailable: true,
        travelDate: "2026-08-12",
        asOf: RETRIEVED_AT,
        proposedArrivalMinutes: 10 * 60,
        proposedDepartureMinutes: 11 * 60,
      }).status,
    ).toBe("provider_unavailable");
  });

  it("uses only a fresh, unambiguous dwell-sized slot in the feasible trip window", () => {
    const base = makeScheduleDetail(makeSummary("feasible-schedule"));
    const assess = (
      operatingInformation: string,
      overrides: Partial<TourPlaceScheduleDetail> = {},
    ) => assessScheduleCompatibilityV1({
      detail: { ...base, operatingInformation, ...overrides },
      providerAvailable: true,
      travelDate: "2026-08-12",
      asOf: RETRIEVED_AT,
      proposedArrivalMinutes: null,
      proposedDepartureMinutes: null,
      feasibleWindow: {
        earliestArrivalMinutes: 10 * 60,
        latestDepartureMinutes: 18 * 60,
        dwellMinutes: 90,
      },
    });

    expect(assess("13:00-18:00").status).toBe("compatible");
    expect(assess("08:00-09:30").status).toBe("conflict");
    expect(assess("13:00-14:00").status).toBe("conflict");
    expect(assess("09:00-12:00 / 13:00-18:00").status).toBe("unknown");
    expect(assess("\uC8FC\uB9D0 13:00-18:00").status).toBe("unknown");
    expect(
      assess("13:00-18:00", {
        source: {
          ...base.source,
          retrievedAt: "2026-08-11T23:44:59.999Z",
        },
      }),
    ).toMatchObject({
      status: "unknown",
      warningCodes: expect.arrayContaining(["operating_hours_stale"]),
    });
    expect(
      assess("13:00-18:00", {
        source: {
          ...base.source,
          retrievedAt: "2026-08-12T00:00:00.001Z",
        },
      }).status,
    ).toBe("compatible");
    expect(
      assess("13:00-18:00", {
        source: {
          ...base.source,
          retrievedAt: "2026-08-12T00:15:00.001Z",
        },
      }),
    ).toMatchObject({
      status: "unknown",
      warningCodes: expect.arrayContaining(["operating_hours_stale"]),
    });
  });

  it("filters exact Stage 0 identity and reserves scarce selected categories", () => {
    const attractions = Array.from({ length: 30 }, (_, index) =>
      makeSummary(`attraction-${String(index).padStart(2, "0")}`, "12", {
        longitude: 129.05 + index / 100_000,
      }),
    );
    const food = makeSummary("food-scarce", "39", {
      longitude: 129.35,
      phone: null,
      thumbnailUrl: null,
      modifiedTime: null,
    });
    const hidden = makeSummary("hidden-food", "39", {
      providerVisibility: {
        status: "not_exposed",
        providerField: "showflag",
        providerValue: "0",
        checkedAt: RETRIEVED_AT,
        reasonCodes: [],
      },
    });
    const wrongSource = makeSummary("wrong-source", "39", {
      source: {
        provider: "Korea Tourism Organization",
        operation: "detailCommon2",
        contentId: "wrong-source",
        retrievedAt: RETRIEVED_AT,
      },
    });
    const outside = makeSummary("outside", "39", { latitude: 36 });
    const input = {
      catalog: [...attractions, food, hidden, wrongSource, outside],
      context: context(["attraction", "food"]),
      asOf: RETRIEVED_AT,
    };

    const first = retrieveStageACandidatesV1(input);
    const second = retrieveStageACandidatesV1({
      ...input,
      catalog: [...input.catalog].reverse(),
    });
    expect(first).toHaveLength(31);
    expect(first.map(({ contentId }) => contentId)).toEqual(
      second.map(({ contentId }) => contentId),
    );
    expect(first.some(({ contentId }) => contentId === "food-scarce")).toBe(true);
    expect(first.find(({ contentId }) => contentId === "food-scarce")?.retrievalScore.categoryCoverageNeed).toBe(1);
    expect(first.some(({ contentId }) => contentId === "hidden-food")).toBe(false);
    expect(first.some(({ contentId }) => contentId === "wrong-source")).toBe(false);
    expect(first.some(({ contentId }) => contentId === "outside")).toBe(false);
  });

  it("treats a legacy unstaged adapter as unknown, uses one as-of, and neutralizes popularity outage", async () => {
    const catalog = [makeSummary("eligible-a"), makeSummary("eligible-b")];
    const getPlaceDetail = vi.fn(async (contentId: string) =>
      makeEligibleDetail(catalog.find((value) => value.contentId === contentId)!),
    );
    const service: TourPlaceService = {
      listPlaces: async (query) => emptyList(query),
      getPlaceDetail,
    };
    const popularityRepository: PopularityRepository = {
      getPopularitySnapshot: vi.fn(async () => {
        throw new Error("popularity unavailable");
      }),
    };
    let clockReads = 0;
    const trace: Array<{ contentId: string; stage: string; outcome: string }> = [];
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog,
      tourService: service,
      popularityRepository,
      now: () => new Date(Date.UTC(2026, 7, 12, 0, clockReads++, 0)),
      onCandidateTrace: ({ contentId, stage, outcome }) =>
        trace.push({ contentId, stage, outcome }),
    });

    expect(result.status).toBe("ready");
    expect(result.candidates).toHaveLength(2);
    expect(new Set(result.candidates.map(({ trust }) => trust.computedAt))).toEqual(
      new Set([RETRIEVED_AT]),
    );
    expect(clockReads).toBe(1);
    expect(getPlaceDetail).toHaveBeenCalledTimes(2);
    expect(result.diagnostics.providerFailures).toBe(0);
    expect(result.diagnostics.warningsByReason).toMatchObject({
      popularity_provider_unavailable: 1,
      schedule_staged_adapter_unavailable: 2,
    });
    for (const contentId of ["eligible-a", "eligible-b"]) {
      expect(
        trace
          .filter((event) => event.contentId === contentId)
          .map(({ stage, outcome }) => `${stage}:${outcome}`),
      ).toEqual([
        "stage_zero:entered",
        "stage_a:entered",
        "schedule:entered",
        "stage_b:entered",
        "detailed_evaluation:entered",
        "automatic_eligibility:eligible",
        "final_pool:eligible",
      ]);
    }
  });

  it("fails closed after a staged schedule outage without retrying common detail", async () => {
    const place = makeSummary("schedule-outage");
    const getPlaceDetail = vi.fn(async () => makeEligibleDetail(place));
    const service: TourPlaceService = {
      listPlaces: async (query) => emptyList(query),
      getPlaceScheduleDetail: vi.fn(async () => {
        throw new Error("detailCommon2 unavailable");
      }),
      completePlaceDetail: vi.fn(async () => makeEligibleDetail(place)),
      getPlaceDetail,
    };
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog: [place],
      tourService: service,
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.status).toBe("provider_unavailable");
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics.providerFailures).toBe(0);
    expect(result.diagnostics.providerUnavailableCandidates).toBe(1);
    expect(result.diagnostics.detailedEvaluationCount).toBe(0);
    expect(result.diagnostics.excludedByReason.schedule_provider_unavailable).toBe(1);
    expect(getPlaceDetail).not.toHaveBeenCalled();
    expect(service.completePlaceDetail).not.toHaveBeenCalled();
  });

  it("reports a composite pet-detail outage as provider unavailable", async () => {
    const place = makeSummary("pet-outage");
    const unavailableDetail: TourPlaceDetail = {
      ...makeEligibleDetail(place),
      petPolicyEvidence: null,
      normalizedPetEvidence: {
        availability: "provider_unavailable",
        fields: { ...EMPTY_POLICY_FIELDS },
        sourceFields: [],
        emptyFieldNames: [],
        absentFieldNames: Object.keys(EMPTY_POLICY_FIELDS) as TourPetPolicyFieldName[],
        warningCodes: ["pet_detail_provider_unavailable"],
      },
      sections: {
        common: { status: "available" },
        intro: { status: "available" },
        petPolicy: { status: "unavailable" },
      },
    };
    const service: TourPlaceService = {
      listPlaces: async (query) => emptyList(query),
      getPlaceDetail: vi.fn(async () => unavailableDetail),
    };
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog: [place],
      tourService: service,
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.status).toBe("ready");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.eligibility.tier).toBe("unverified");
    expect(result.diagnostics.providerFailures).toBe(0);
    expect(result.diagnostics.providerUnavailableCandidates).toBe(1);
    expect(result.diagnostics.warningsByReason).toMatchObject({
      required_pet_detail_call_unavailable: 1,
    });
  });

  it("counts failed logical provider operations separately from candidate outcomes", async () => {
    const place = makeSummary("observation-count");
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog: [place],
      tourService: new StagedFixtureService(new Map([[place.contentId, place]])),
      initialObservations: [
        { operation: "areaBasedList2", cache: "miss", liveProviderCall: true },
        {
          operation: "areaBasedList2",
          cache: "miss",
          liveProviderCall: false,
          providerOutcome: "failed",
        },
      ],
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.status).toBe("ready");
    expect(result.diagnostics).toMatchObject({
      providerCalls: 1,
      providerFailures: 1,
      providerUnavailableCandidates: 0,
    });
  });
});

describe("candidate-pipeline-v1 Stage A retrieval", () => {
  it("admits travel shopping only after explicit opt-in", () => {
    const market = makeSummary("market", "38", {
      title: "부산 전통시장 문화체험",
    });
    const genericShop = makeSummary("generic-shop", "38", {
      title: "부산 일반 소매점",
    });
    const base = context(["shopping"]);

    expect(
      retrieveStageACandidatesV1({
        catalog: [market, genericShop],
        context: base,
        asOf: RETRIEVED_AT,
      }),
    ).toEqual([]);
    expect(
      retrieveStageACandidatesV1({
        catalog: [market, genericShop],
        context: withContext(base, { includeShopping: true }),
        asOf: RETRIEVED_AT,
      }).map(({ contentId }) => contentId),
    ).toEqual(["market"]);
  });

  it("reserves overnight accommodation and backfills an unavailable category", () => {
    const attractions = Array.from({ length: 30 }, (_, index) =>
      makeSummary(`activity-${String(index).padStart(2, "0")}`, "12", {
        longitude: 129.05 + index / 100_000,
      }),
    );
    const noFood = retrieveStageACandidatesV1({
      catalog: attractions,
      context: context(["attraction", "food"]),
      asOf: RETRIEVED_AT,
    });
    expect(noFood).toHaveLength(30);
    expect(noFood.every(({ category }) => category === "attraction")).toBe(true);

    const stay = makeSummary("far-stay", "32", {
      latitude: 35.45,
      longitude: 129.35,
      phone: null,
      thumbnailUrl: null,
      modifiedTime: null,
    });
    const overnight = withContext(context(["attraction", "accommodation"]), {
      tripType: "OVERNIGHT",
    });
    expect(
      retrieveStageACandidatesV1({
        catalog: [...attractions, stay],
        context: overnight,
        asOf: RETRIEVED_AT,
      }).some(({ contentId }) => contentId === "far-stay"),
    ).toBe(true);
  });

  it("deduplicates identical identities and fails conflicting duplicates closed", () => {
    const stable = makeSummary("duplicate");
    const conflicting = { ...stable, longitude: 129.06 };
    const selected = context();
    expect(
      retrieveStageACandidatesV1({
        catalog: [stable, { ...stable }],
        context: selected,
        asOf: RETRIEVED_AT,
      }).map(({ contentId }) => contentId),
    ).toEqual(["duplicate"]);
    expect(
      retrieveStageACandidatesV1({
        catalog: [stable, conflicting],
        context: selected,
        asOf: RETRIEVED_AT,
      }),
    ).toEqual([]);
    expect(
      retrieveStageACandidatesV1({
        catalog: [conflicting, stable],
        context: selected,
        asOf: RETRIEVED_AT,
      }),
    ).toEqual([]);
  });

  it("excludes unknown stored visibility and non-KTO source identities", () => {
    const unknownVisibility = makeSummary("unknown-visibility", "12", {
      providerVisibility: {
        status: "unknown",
        providerField: null,
        providerValue: null,
        checkedAt: RETRIEVED_AT,
        reasonCodes: ["visibility_unknown"],
      },
    });
    const kakao = makeSummary("kakao", "12", {
      source: {
        provider: "Kakao Local",
        operation: "areaBasedList2",
        contentId: "kakao",
        retrievedAt: RETRIEVED_AT,
      } as unknown as TourPlaceSummary["source"],
    });
    expect(
      retrieveStageACandidatesV1({
        catalog: [unknownVisibility, kakao],
        context: context(),
        asOf: RETRIEVED_AT,
      }),
    ).toEqual([]);
  });

  it("fails stale, future, and invalid exposed visibility closed", () => {
    const values = [
      makeSummary("visibility-stale", "12", {
        providerVisibility: {
          status: "exposed",
          providerField: "showflag",
          providerValue: "1",
          checkedAt: "2026-08-11T23:54:59.999Z",
          reasonCodes: [],
        },
      }),
      makeSummary("visibility-future", "12", {
        providerVisibility: {
          status: "exposed",
          providerField: "showflag",
          providerValue: "1",
          checkedAt: "2026-08-12T00:00:00.001Z",
          reasonCodes: [],
        },
      }),
      makeSummary("visibility-invalid", "12", {
        providerVisibility: {
          status: "exposed",
          providerField: "showflag",
          providerValue: "1",
          checkedAt: "not-a-timestamp",
          reasonCodes: [],
        },
      }),
    ];
    const result = retrieveStageACandidatesV1({
      catalog: values,
      context: context(),
      asOf: RETRIEVED_AT,
    });
    expect(result).toEqual([]);
  });

  it("changes Stage A proximity mechanically with pace max-stops", () => {
    const far = makeSummary("far-pace", "12", {
      latitude: 35.35,
      longitude: 129.25,
    });
    const relaxed = retrieveStageACandidatesV1({
      catalog: [far],
      context: withContext(context(), { maxStops: 3, tripPace: "relaxed" }),
      asOf: RETRIEVED_AT,
    })[0];
    const packed = retrieveStageACandidatesV1({
      catalog: [far],
      context: withContext(context(), { maxStops: 5, tripPace: "packed" }),
      asOf: RETRIEVED_AT,
    })[0];
    expect(packed.retrievalScore.proximity).toBeGreaterThan(
      relaxed.retrievalScore.proximity,
    );
    expect(packed.retrievalScore.total).toBeGreaterThan(relaxed.retrievalScore.total);
  });

  it("uses trip type for explicit lodging fit and neutralizes hostile cold-start popularity", () => {
    const stay = makeSummary("preference-stay", "32");
    const day = retrieveStageACandidatesV1({
      catalog: [stay],
      context: context(["accommodation"]),
      asOf: RETRIEVED_AT,
      popularityPrior: new Map([[stay.contentId, 0.5]]),
    })[0];
    const overnight = retrieveStageACandidatesV1({
      catalog: [stay],
      context: withContext(context(["accommodation"]), {
        tripType: "OVERNIGHT",
      }),
      asOf: RETRIEVED_AT,
      popularityPrior: new Map([[stay.contentId, 0.5]]),
    })[0];
    expect(overnight.retrievalScore.preferenceFit).toBeGreaterThan(
      day.retrievalScore.preferenceFit,
    );
  });

  it("uses content ID as the final equal-score retrieval tie-break", () => {
    const values = [
      makeSummary("b-equal", "12", { title: "동일 관광지" }),
      makeSummary("a-equal", "12", { title: "동일 관광지" }),
    ];
    expect(
      retrieveStageACandidatesV1({
        catalog: values,
        context: context(),
        asOf: RETRIEVED_AT,
      }).map(
        ({ contentId }) => contentId,
      ),
    ).toEqual(["a-equal", "b-equal"]);
  });
});

describe("candidate-pipeline-v1 Stage B schedule shortlist", () => {
  it("keeps compatible candidates below the post-diversity cap before Stage C", async () => {
    const places = Array.from({ length: 25 }, (_, index) =>
      makeSummary(`stage-b-${String(index).padStart(2, "0")}`),
    );
    const service = new StagedFixtureService(
      new Map(places.map((place) => [place.contentId, place])),
    );
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog: places,
      tourService: service,
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.diagnostics.stageACount).toBe(25);
    expect(result.diagnostics.stageBCount).toBe(25);
    expect(service.scheduleIds).toHaveLength(25);
  });

  it("applies the moderate unknown-hours penalty before the Stage B cap", async () => {
    const compatible = Array.from({ length: 20 }, (_, index) =>
      makeSummary(`compatible-${String(index).padStart(2, "0")}`, "12", {
        longitude: 129.05 + (index + 1) / 100_000,
      }),
    );
    const unknown = makeSummary("unknown-top-raw", "12");
    const places = [unknown, ...compatible];
    const schedules = new Map<string, TourPlaceScheduleDetail>([
      [unknown.contentId, { ...makeScheduleDetail(unknown), operatingInformation: null }],
    ]);
    const result = await runCandidatePipelineV1({
      context: withContext(context(), { maxStops: 5 }),
      catalog: places,
      tourService: new StagedFixtureService(
        new Map(places.map((place) => [place.contentId, place])),
        { schedules },
      ),
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.diagnostics.stageBCount).toBe(21);
    expect(result.candidates.some(({ contentId }) => contentId === unknown.contentId)).toBe(false);
  });

  it("removes confirmed conflict but retains missing and conflicting-partial hours", async () => {
    const places = [
      makeSummary("compatible"),
      makeSummary("conflict"),
      makeSummary("missing"),
      makeSummary("partial"),
    ];
    const schedules = new Map<string, TourPlaceScheduleDetail>([
      ["conflict", { ...makeScheduleDetail(places[1]), operatingInformation: "09:00-09:30" }],
      ["missing", { ...makeScheduleDetail(places[2]), operatingInformation: null }],
      [
        "partial",
        {
          ...makeScheduleDetail(places[3]),
          operatingInformation: "09:00-20:00 / conflicting provider text",
          sections: {
            common: { status: "available" },
            intro: { status: "partial" },
          },
        },
      ],
    ]);
    const result = await runCandidatePipelineV1({
      context: withContext(context(), { maxStops: 5 }),
      catalog: places,
      tourService: new StagedFixtureService(
        new Map(places.map((place) => [place.contentId, place])),
        { schedules },
      ),
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.diagnostics.stageBCount).toBe(3);
    expect(result.diagnostics.excludedByReason.confirmed_schedule_conflict).toBe(1);
    expect(result.candidates.map(({ contentId }) => contentId).sort()).toEqual([
      "compatible",
      "missing",
      "partial",
    ]);
    expect(
      result.candidates.find(({ contentId }) => contentId === "missing")
        ?.scheduleCompatibility,
    ).toMatchObject({ status: "unknown" });
    expect(
      result.candidates.find(({ contentId }) => contentId === "partial")
        ?.scheduleCompatibility,
    ).toMatchObject({
      status: "unknown",
      warningCodes: expect.arrayContaining([
        "operating_hours_conflicting_or_partial",
      ]),
    });
  });
});

describe("candidate-pipeline-v1 adaptive Stage C", () => {
  it("evaluates one batch of five and stops once the target is covered", async () => {
    const places = Array.from({ length: 10 }, (_, index) =>
      makeSummary(`early-${String(index).padStart(2, "0")}`),
    );
    const service = new StagedFixtureService(
      new Map(places.map((place) => [place.contentId, place])),
    );
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog: places,
      tourService: service,
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.eligiblePoolTarget).toBe(6);
    expect(result.diagnostics.detailedBatchCount).toBe(2);
    expect(result.diagnostics.detailedEvaluationCount).toBe(10);
    expect(service.detailIds).toHaveLength(10);
  });

  it("continues through all four batches and preserves the verified pool for service scoring", async () => {
    const attractions = Array.from({ length: 18 }, (_, index) =>
      makeSummary(`max-${String(index).padStart(2, "0")}`, "12", {
        longitude: 129.05 + index / 100_000,
      }),
    );
    const deniedFood = makeSummary("food-high-denied", "39");
    const food = makeSummary("zz-low-eligible-food", "39", {
      latitude: 35.49,
      longitude: 129.39,
      phone: null,
      thumbnailUrl: null,
      modifiedTime: null,
    });
    const places = [...attractions, deniedFood, food];
    const details = new Map<string, TourPlaceDetail>([
      [deniedFood.contentId, makePolicyDetail(deniedFood, "\uBC18\uB824\uB3D9\uBB3C \uB3D9\uBC18 \uBD88\uAC00")],
    ]);
    const result = await runCandidatePipelineV1({
      context: withContext(context(["attraction", "food"]), {
        maxStops: 5,
      }),
      catalog: places,
      tourService: new StagedFixtureService(
        new Map(places.map((place) => [place.contentId, place])),
        {
          details,
          schedules: new Map([
            [
              food.contentId,
              { ...makeScheduleDetail(food), operatingInformation: null },
            ],
          ]),
        },
      ),
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.diagnostics.detailedBatchCount).toBe(4);
    expect(result.diagnostics.detailedEvaluationCount).toBe(20);
    expect(result.diagnostics.eligibleCount).toBe(19);
    expect(result.candidates).toHaveLength(19);
    expect(result.candidates.some(({ contentId }) => contentId === food.contentId)).toBe(true);
  });

  it("preserves successful candidates when one pet-detail request fails", async () => {
    const places = Array.from({ length: 6 }, (_, index) =>
      makeSummary(`partial-${String(index).padStart(2, "0")}`),
    );
    const service = new StagedFixtureService(
      new Map(places.map((place) => [place.contentId, place])),
      { failDetailIds: new Set(["partial-00"]) },
    );
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog: places,
      tourService: service,
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.status).toBe("ready");
    expect(result.candidates).toHaveLength(5);
    expect(result.diagnostics.detailedEvaluationCount).toBe(6);
    expect(result.diagnostics.detailedBatchCount).toBe(2);
    expect(result.diagnostics.providerFailures).toBe(0);
    expect(result.diagnostics.providerUnavailableCandidates).toBe(1);
    expect(result.diagnostics.excludedByReason).toMatchObject({
      candidate_detail_provider_unavailable: 1,
    });
  });

  it("strictly excludes conditional mismatch, unknown, not-applicable, and changed visibility", async () => {
    const places = [
      makeSummary("condition"),
      makeSummary("denied"),
      makeSummary("inquiry"),
      makeSummary("not-applicable"),
      makeSummary("visibility-changed"),
    ];
    const byId = new Map(places.map((place) => [place.contentId, place]));
    const notApplicableSummary: TourPlaceSummary = {
      ...places[3],
      contentTypeId: null,
      providerContentTypeId: "25",
      category: "unknown",
      source: {
        ...places[3].source,
        operation: "detailCommon2",
      },
    };
    const visibilityChangedSummary: TourPlaceSummary = {
      ...places[4],
      providerVisibility: {
        status: "not_exposed",
        providerField: "showflag",
        providerValue: "0",
        checkedAt: RETRIEVED_AT,
        reasonCodes: [],
      },
      source: {
        ...places[4].source,
        operation: "detailCommon2",
      },
    };
    const details = new Map<string, TourPlaceDetail>([
      ["condition", makePolicyDetail(places[0], "반려동물 동반 가능, 이동장 사용 필수")],
      ["denied", makePolicyDetail(places[1], "반려동물 동반 불가")],
      ["inquiry", makePolicyDetail(places[2], "동반 가능 여부는 전화 문의")],
      [
        "not-applicable",
        makePolicyDetail(places[3], "반려동물 동반 가능", {
          summary: notApplicableSummary,
        }),
      ],
      [
        "visibility-changed",
        makePolicyDetail(places[4], "반려동물 동반 가능", {
          summary: visibilityChangedSummary,
        }),
      ],
    ]);
    const result = await runCandidatePipelineV1({
      context: withContext(context(), {
        maxStops: 5,
        petProfile: { hasCarrier: false },
      }),
      catalog: places,
      tourService: new StagedFixtureService(byId, { details }),
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.status).toBe("ready");
    expect(result.candidates.map(({ contentId }) => contentId)).toEqual(["inquiry"]);
    expect(result.candidates[0]?.eligibility.tier).toBe("unverified");
    expect(result.diagnostics.providerFailures).toBe(0);
    expect(result.reasonCounts).toMatchObject({
      mandatory_condition_unsatisfied: 1,
      pet_access_not_allowed: 1,
      unsupported_content_type: 1,
      provider_visibility_not_exposed: 1,
    });
    expect(result.diagnostics.warningsByReason.pet_access_unknown).toBeGreaterThanOrEqual(1);
    expect(result.reasonCounts.pet_access_not_applicable).toBe(1);
  });

  it("does not let active licensing or maximum popularity create pet eligibility", async () => {
    const place = makeSummary("popular-denied", "39");
    const popularityRepository: PopularityRepository = {
      getPopularitySnapshot: async () =>
        new Map([
          [
            place.contentId,
            {
              score: 1,
              status: "sufficient_data" as const,
              qualityComponent: 1,
              trendComponent: 1,
              sampleWeight: 100,
              version: "popularity-v1" as const,
            },
          ],
        ]),
    };
    const result = await runCandidatePipelineV1({
      context: context(["food"]),
      catalog: [place],
      tourService: new StagedFixtureService(new Map([[place.contentId, place]]), {
        details: new Map([
          [place.contentId, makePolicyDetail(place, "반려동물 동반 불가")],
        ]),
      }),
      licenseMatcher: { matchTourPlace: async () => activeFoodLicense() },
      popularityRepository,
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.status).toBe("insufficient_eligible_places");
    expect(result.candidates).toEqual([]);
    expect(result.reasonCounts.pet_access_not_allowed).toBe(1);
  });

  it("uses exact neutral popularity for an inconsistent insufficient-data snapshot", async () => {
    const places = [makeSummary("cold-hostile"), makeSummary("cold-neutral")];
    const popularityRepository: PopularityRepository = {
      getPopularitySnapshot: async () => new Map([
        [places[0].contentId, {
          score: 0.99,
          status: "insufficient_data" as const,
          qualityComponent: 1,
          trendComponent: 1,
          sampleWeight: 0,
          version: "popularity-v1" as const,
        }],
        [places[1].contentId, {
          score: 0.5,
          status: "insufficient_data" as const,
          qualityComponent: 0,
          trendComponent: 0,
          sampleWeight: 0,
          version: "popularity-v1" as const,
        }],
      ]),
    };
    const result = await runCandidatePipelineV1({
      context: context(),
      catalog: places,
      tourService: new StagedFixtureService(new Map(places.map((place) => [place.contentId, place]))),
      popularityRepository,
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map(({ retrievalScore }) => retrievalScore.popularityPrior)).toEqual([
      0.5,
      0.5,
    ]);
    expect(result.candidates.map(({ utility }) => utility.popularity)).toEqual([0.5, 0.5]);
  });

  it("requires positive indoor scope evidence for a required-indoor route", async () => {
    const unknownIndoor = makeSummary("required-indoor-unknown");
    const confirmedIndoor = makeSummary("required-indoor-confirmed");
    const places = [unknownIndoor, confirmedIndoor];
    const details = new Map<string, TourPlaceDetail>([
      [
        unknownIndoor.contentId,
        makePolicyDetail(
          unknownIndoor,
          "\uD14C\uB77C\uC2A4 \uBC18\uB824\uB3D9\uBB3C \uB3D9\uBC18 \uAC00\uB2A5",
        ),
      ],
      [confirmedIndoor.contentId, makePolicyDetail(confirmedIndoor, "\uC2E4\uB0B4 \uBC18\uB824\uB3D9\uBB3C \uB3D9\uBC18 \uAC00\uB2A5")],
    ]);
    const result = await runCandidatePipelineV1({
      context: withContext(context(), {
        maxStops: 5,
        indoorAccessPreference: "required",
      }),
      catalog: places,
      tourService: new StagedFixtureService(
        new Map(places.map((place) => [place.contentId, place])),
        { details },
      ),
      now: () => new Date(RETRIEVED_AT),
    });

    expect(result.candidates.map(({ contentId }) => contentId)).toEqual([
      confirmedIndoor.contentId,
      unknownIndoor.contentId,
    ]);
    expect(result.reasonCounts.indoor_access_not_confirmed).toBeUndefined();
  });

  it("computes category scarcity from strict eligible records only", async () => {
    const attractions = Array.from({ length: 3 }, (_, index) =>
      makeSummary(`scarcity-attraction-${index}`),
    );
    const eligibleFood = makeSummary("scarcity-food-eligible", "39");
    const deniedFoods = Array.from({ length: 3 }, (_, index) =>
      makeSummary(`scarcity-food-denied-${index}`, "39"),
    );
    const places = [...attractions, eligibleFood, ...deniedFoods];
    const details = new Map<string, TourPlaceDetail>(
      deniedFoods.map((place) => [
        place.contentId,
        makePolicyDetail(place, "\uBC18\uB824\uB3D9\uBB3C \uB3D9\uBC18 \uBD88\uAC00"),
      ]),
    );
    const result = await runCandidatePipelineV1({
      context: withContext(context(["attraction", "food"]), { maxStops: 5 }),
      catalog: places,
      tourService: new StagedFixtureService(
        new Map(places.map((place) => [place.contentId, place])),
        { details },
      ),
      now: () => new Date(RETRIEVED_AT),
    });
    const food = result.candidates.find(({ contentId }) => contentId === eligibleFood.contentId);
    const attraction = result.candidates.find(({ category }) => category === "attraction");

    expect(food?.utility.categoryPriority).toBe(0.95);
    expect(attraction?.utility.categoryPriority).toBe(0.75);
    expect(food!.utility.categoryPriority).toBeGreaterThan(
      attraction!.utility.categoryPriority,
    );
  });

  it("is invariant to reversed input and reversed asynchronous completion order", async () => {
    const places = Array.from({ length: 6 }, (_, index) =>
      makeSummary(`stable-${String(index).padStart(2, "0")}`, "12", {
        title: "동일 관광지",
      }),
    );
    const run = (values: TourPlaceSummary[], reverseDelay: boolean) =>
      runCandidatePipelineV1({
        context: withContext(context(), { maxStops: 3 }),
        catalog: values,
        tourService: new StagedFixtureService(
          new Map(places.map((place) => [place.contentId, place])),
          {
            detailDelayMs: new Map(
              places.map((place, index) => [
                place.contentId,
                reverseDelay ? index : places.length - index,
              ]),
            ),
          },
        ),
        now: () => new Date(RETRIEVED_AT),
      });
    const [forward, reverse] = await Promise.all([
      run(places, false),
      run([...places].reverse(), true),
    ]);

    expect(forward.candidates.map(({ contentId }) => contentId)).toEqual(
      reverse.candidates.map(({ contentId }) => contentId),
    );
    expect(forward.candidates.map(({ contentId }) => contentId)).toEqual(
      places.map(({ contentId }) => contentId).sort(),
    );
    expect(forward.diagnostics).toEqual(reverse.diagnostics);
    expect(Object.keys(forward.diagnostics.warningsByReason)).toEqual(
      Object.keys(forward.diagnostics.warningsByReason).sort(),
    );
    expect(
      new Set(
        forward.candidates.map(({ utility }) => utility.categoryPriority),
      ).size,
    ).toBe(1);
  });

  it("pins final ordering to utility, category priority, distance, then ID", () => {
    const values = [
      { contentId: "b-id", distanceKm: 2, utility: { total: 900, categoryPriority: 0.8 } },
      { contentId: "a-id", distanceKm: 2, utility: { total: 900, categoryPriority: 0.8 } },
      { contentId: "near", distanceKm: 1, utility: { total: 900, categoryPriority: 0.8 } },
      { contentId: "priority", distanceKm: 99, utility: { total: 900, categoryPriority: 0.9 } },
      { contentId: "total", distanceKm: 99, utility: { total: 901, categoryPriority: 0 } },
    ];
    expect(
      values.sort(compareFinalEligibleCandidatesV1).map(({ contentId }) => contentId),
    ).toEqual(["total", "priority", "near", "a-id", "b-id"]);
  });
});
