import {
  CONTROLLED_FIXTURE_VERSION,
  type ControlledCandidateFixture,
  type ControlledComparisonScenario,
} from "@/fixtures/candidate-pipeline-v1-controlled";
import { runCandidatePipelineV1 } from "@/lib/recommendation/candidate-pipeline";
import type { CandidatePipelineRequestContext } from "@/lib/recommendation/types";
import type {
  TourPlaceScheduleDetail,
  TourPlaceService,
  TourPlacesQuery,
  TourProviderVisibilityPage,
  TourProviderVisibilityQuery,
  TourRequestObservation,
  TourRequestObserver,
} from "@/lib/tour-api/service";
import type {
  TourPetPolicyFields,
  TourPetPolicyFieldName,
  TourPlaceDetail,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";
import type {
  ControlledComparisonArmResult,
  ControlledStage2Runner,
} from "@/scripts/lib/candidate-pipeline-comparison";

const RETRIEVED_AT = "2026-08-12T00:00:00.000Z";
const FIXTURE_REGION_CODE = "26";
const FIXTURE_DISTRICT_CODE = "350";

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

function visibility(
  status: ControlledCandidateFixture["providerVisibility"],
) {
  return {
    status,
    providerField: "showflag" as const,
    providerValue:
      status === "exposed" ? "1" : status === "not_exposed" ? "0" : null,
    checkedAt: RETRIEVED_AT,
    reasonCodes: status === "exposed" ? [] : [`fixture_visibility_${status}`],
  };
}

function summary(value: ControlledCandidateFixture): TourPlaceSummary {
  return {
    contentId: value.contentId,
    contentTypeId: value.contentTypeId,
    providerContentTypeId: value.contentTypeId,
    category: value.category,
    title: value.title,
    address: "Synthetic Busan address",
    detailAddress: null,
    longitude: value.coordinates.longitude,
    latitude: value.coordinates.latitude,
    phone: value.listDataQuality >= 0.8 ? "051-000-0000" : null,
    thumbnailUrl:
      value.listDataQuality >= 0.9
        ? "https://example.invalid/synthetic.jpg"
        : null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime:
      value.listDataQuality >= 0.7 ? "20260812000000" : null,
    legalRegionCode: FIXTURE_REGION_CODE,
    legalDistrictCode: FIXTURE_DISTRICT_CODE,
    classificationCodes: {
      primary: null,
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    providerVisibility: visibility(value.providerVisibility),
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      contentId: value.contentId,
      retrievedAt: RETRIEVED_AT,
    },
  };
}

function detailSummary(value: ControlledCandidateFixture): TourPlaceSummary {
  return {
    ...summary(value),
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: value.contentId,
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260812000000",
    },
  };
}

function schedule(
  value: ControlledCandidateFixture,
): TourPlaceScheduleDetail {
  const operatingInformation =
    value.scheduleCompatibility === "unknown"
      ? null
      : value.scheduleCompatibility === "conflict"
        ? "09:00-09:30"
        : "09:00-20:00";
  return {
    summary: detailSummary(value),
    overview: null,
    homepageUrl: null,
    operatingInformation,
    checkInTime: value.category === "accommodation" ? "15:00" : null,
    checkOutTime: value.category === "accommodation" ? "11:00" : null,
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
    source: {
      provider: "Korea Tourism Organization",
      operation: "detailCommon2",
      contentId: value.contentId,
      retrievedAt: RETRIEVED_AT,
      providerModifiedTime: "20260812000000",
    },
  };
}

function completeDetail(
  value: ControlledCandidateFixture,
  scheduleDetail: TourPlaceScheduleDetail,
): TourPlaceDetail {
  const fields: TourPetPolicyFields = value.strictEligible
    ? {
        ...EMPTY_POLICY_FIELDS,
        acmpyPsblCpam: "모든 견종 동반 가능",
        etcAcmpyInfo: "반려동물 동반 가능",
      }
    : {
        ...EMPTY_POLICY_FIELDS,
        etcAcmpyInfo: "반려동물 동반 불가",
      };
  const sourceFields = Object.entries(fields).flatMap(([field, policyValue]) =>
    policyValue
      ? [
          {
            field: field as TourPetPolicyFieldName,
            value: policyValue,
          },
        ]
      : [],
  );
  const emptyFieldNames = Object.entries(fields).flatMap(
    ([field, policyValue]) =>
      policyValue === null ? [field as TourPetPolicyFieldName] : [],
  );
  return {
    ...scheduleDetail,
    petPolicyEvidence: {
      fields,
      sourceEvidence: {
        provider: "Korea Tourism Organization",
        operation: "detailPetTour2",
        contentId: value.contentId,
        retrievedAt: RETRIEVED_AT,
        providerModifiedTime: "20260812000000",
        originalEvidenceFields: { ...fields },
      },
    },
    normalizedPetEvidence: {
      availability: "partial",
      fields,
      sourceFields,
      emptyFieldNames,
      absentFieldNames: [],
      warningCodes: ["pet_detail_fields_partial"],
    },
    sections: {
      ...scheduleDetail.sections,
      petPolicy: { status: "available" },
    },
  };
}

function observation(
  operation: TourRequestObservation["operation"],
  cache: TourRequestObservation["cache"],
  liveProviderCall: boolean,
): TourRequestObservation {
  return { operation, cache, liveProviderCall };
}

class ControlledTourService implements TourPlaceService {
  private readonly values: Map<string, ControlledCandidateFixture>;
  private readonly operationIds = new Map<string, string[]>();

  constructor(values: readonly ControlledCandidateFixture[]) {
    this.values = new Map(
      values.map((value) => [value.contentId, value] as const),
    );
  }

  private value(contentId: string): ControlledCandidateFixture {
    const value = this.values.get(contentId);
    if (!value) throw new Error("CONTROLLED_CANDIDATE_NOT_FOUND");
    return value;
  }

  private record(operation: string, contentId: string): void {
    const contentIds = this.operationIds.get(operation) ?? [];
    contentIds.push(contentId);
    this.operationIds.set(operation, contentIds);
  }

  duplicatedDetailCalls(): number {
    let duplicates = 0;
    for (const [operation, contentIds] of this.operationIds) {
      if (!operation.startsWith("detail")) continue;
      duplicates += contentIds.length - new Set(contentIds).size;
    }
    return duplicates;
  }

  async listPlaces(query: TourPlacesQuery): Promise<TourPlaceList> {
    const values = [...this.values.values()].filter(
      (value) =>
        (!query.contentTypeId || value.contentTypeId === query.contentTypeId) &&
        value.providerVisibility === "exposed",
    );
    return {
      places: values.map(summary),
      page: query.page,
      pageSize: query.pageSize,
      totalCount: values.length,
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
    const values = [...this.values.values()].filter(
      (value) =>
        (!query.contentTypeId || value.contentTypeId === query.contentTypeId) &&
        (!query.showFlag ||
          (query.showFlag === "1" && value.providerVisibility === "exposed") ||
          (query.showFlag === "0" &&
            value.providerVisibility === "not_exposed")),
    );
    return {
      records: values.map((value) => ({
        contentId: value.contentId,
        contentTypeId: value.contentTypeId,
        visibility: visibility(value.providerVisibility),
      })),
      page: query.page,
      pageSize: query.pageSize,
      totalCount: values.length,
      source: {
        provider: "Korea Tourism Organization",
        operation: "petTourSyncList2",
        retrievedAt: RETRIEVED_AT,
      },
    };
  }

  async getPlaceScheduleDetail(
    contentId: string,
    _contentTypeId?: ControlledCandidateFixture["contentTypeId"],
    observe?: TourRequestObserver,
  ): Promise<TourPlaceScheduleDetail> {
    const value = this.value(contentId);
    if (value.scheduleCompatibility === "provider_unavailable") {
      throw new Error("CONTROLLED_SCHEDULE_PROVIDER_UNAVAILABLE");
    }
    this.record("detailCommon2", contentId);
    observe?.(observation("detailCommon2", "miss", true));
    observe?.(observation("petTourSyncList2", "hit", false));
    this.record("detailIntro2", contentId);
    observe?.(observation("detailIntro2", "miss", true));
    return schedule(value);
  }

  async completePlaceDetail(
    scheduleDetail: TourPlaceScheduleDetail,
    observe?: TourRequestObserver,
  ): Promise<TourPlaceDetail> {
    const value = this.value(scheduleDetail.summary.contentId);
    if (value.detailFailure) {
      throw new Error("CONTROLLED_DETAIL_PROVIDER_UNAVAILABLE");
    }
    this.record("detailPetTour2", value.contentId);
    observe?.(observation("detailPetTour2", "miss", true));
    return completeDetail(value, scheduleDetail);
  }

  async getPlaceDetail(
    contentId: string,
    contentTypeId?: ControlledCandidateFixture["contentTypeId"],
    observe?: TourRequestObserver,
  ): Promise<TourPlaceDetail> {
    const scheduleDetail = await this.getPlaceScheduleDetail(
      contentId,
      contentTypeId,
      observe,
    );
    return this.completePlaceDetail(scheduleDetail, observe);
  }
}

function context(
  scenario: ControlledComparisonScenario,
): CandidatePipelineRequestContext {
  const selectedCategories = [...scenario.selectedCategories];
  const petProfile = {
    species: "DOG" as const,
    size: "SMALL" as const,
    hasCarrier: true,
    hasLeash: true,
    hasMuzzle: true,
    acceptsOutdoorOnly: true,
  };
  const tripRequest = {
    scope: {
      regionCode: FIXTURE_REGION_CODE,
      districtCode: null,
      bounds: { west: 128.75, south: 34.95, east: 129.4, north: 35.5 },
    },
    selectedCategories,
    includeShopping: scenario.includeShopping,
    indoorAccessPreference: "any" as const,
  };
  return {
    request: {
      scope: {
        type: "busan",
        regionCode: "26",
        regionName: "부산 전체",
      },
      start: {
        coordinates: scenario.start,
        label: "Synthetic origin",
      },
      travelDate: "2026-08-12",
      startTime: "10:00",
      planningMode: "stop_count",
      desiredDurationMinutes: null,
      desiredStopCount: scenario.maxStops,
      tripType: scenario.tripType,
      tripPace: scenario.tripPace,
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
      includeShopping: scenario.includeShopping,
      generationSeed: CONTROLLED_FIXTURE_VERSION,
      recentRouteSignatures: [],
    },
    minStops: scenario.minStops,
    maxStops: scenario.maxStops,
    tripType: scenario.tripType,
    petProfile,
    tripRequest,
  };
}

function initialObservations(
  scenario: ControlledComparisonScenario,
): TourRequestObservation[] {
  return [...new Set(scenario.selectedCategories)].flatMap(() => [
    observation("areaBasedList2", "miss", true),
    observation("petTourSyncList2", "miss", true),
  ]);
}

export const runControlledCandidatePipelineV1: ControlledStage2Runner = async ({
  scenario,
  candidates,
}): Promise<ControlledComparisonArmResult> => {
  const service = new ControlledTourService(candidates);
  const catalog = candidates.map(summary);
  const result = await runCandidatePipelineV1({
    context: context(scenario),
    catalog,
    tourService: service,
    licenseMatcher: null,
    now: () => new Date(RETRIEVED_AT),
    initialObservations: initialObservations(scenario),
  });
  const categories = Object.keys(
    result.diagnostics.categoryDistribution,
  ).sort() as ControlledCandidateFixture["category"][];
  const finalIds = result.candidates.map(({ contentId }) => contentId);
  const detailCallsByOperation = {
    detailCommon2: result.diagnostics.detailCallsByOperation.detailCommon2 ?? 0,
    detailIntro2: result.diagnostics.detailCallsByOperation.detailIntro2 ?? 0,
    detailPetTour2: result.diagnostics.detailCallsByOperation.detailPetTour2 ?? 0,
  };
  return {
    implementation: "candidate_pipeline_v1",
    initialCatalogCount: result.diagnostics.initialCatalogCount,
    lightweightAcceptedCount: result.diagnostics.categoryAcceptedCount,
    stageACount: result.diagnostics.stageACount,
    stageBCount: result.diagnostics.stageBCount,
    detailedEvaluationCount: result.diagnostics.detailedEvaluationCount,
    detailedBatchCount: result.diagnostics.detailedBatchCount,
    eligibleContentIds: [...finalIds],
    finalEligibleContentIds: finalIds,
    representedCategories: categories,
    providerCalls: result.diagnostics.providerCalls,
    cacheHits: result.diagnostics.cacheHits,
    detailCallsByOperation,
    duplicatedDetailCalls: service.duplicatedDetailCalls(),
    excludedByReason: result.diagnostics.excludedByReason,
    insufficientEligiblePlaces:
      result.status === "insufficient_eligible_places",
    requiredMinimum: result.requiredMinimum,
  };
};

