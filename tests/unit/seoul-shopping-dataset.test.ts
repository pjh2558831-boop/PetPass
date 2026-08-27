import { describe, expect, it, vi } from "vitest";

import { SEOUL_REGION_CONFIG } from "@/lib/regions/config";
import {
  collectKtoCatalog,
  executeKtoCollection,
} from "@/lib/tour-api/collection/runner";
import type {
  KtoCatalogCollectionRepository,
  KtoCatalogListRecord,
  KtoCatalogMapPlace,
  KtoCatalogProvider,
} from "@/lib/tour-api/collection/contracts";
import type {
  TourContentTypeId,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";

const NOW = "2026-08-27T00:00:00.000Z";

function summary(input: {
  contentId: string;
  districtCode: string;
  districtName: string;
  contentTypeId: TourContentTypeId;
}): TourPlaceSummary {
  const category = input.contentTypeId === "38" ? "shopping" : "attraction";
  return {
    contentId: input.contentId,
    contentTypeId: input.contentTypeId,
    providerContentTypeId: input.contentTypeId,
    category,
    title: `서울 ${category} ${input.contentId}`,
    address: `서울특별시 ${input.districtName} 검증로 1`,
    detailAddress: null,
    longitude: 126.98,
    latitude: 37.56,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: "20260101000000",
    modifiedTime: "20260827000000",
    legalRegionCode: "11",
    legalDistrictCode: input.districtCode,
    classificationCodes: {
      primary: "A04",
      secondary: "A0401",
      tertiary: "A04010100",
      largeCategory: "AE",
      middleCategory: "AE01",
      smallCategory: "AE0101",
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
      retrievedAt: NOW,
      contentId: input.contentId,
      providerModifiedTime: "20260827000000",
    },
  };
}

function detail(value: TourPlaceSummary): TourPlaceDetail {
  return {
    summary: { ...value, source: { ...value.source, operation: "detailCommon2" } },
    overview: null,
    homepageUrl: null,
    operatingInformation: null,
    checkInTime: null,
    checkOutTime: null,
    restDayInformation: null,
    parkingInformation: null,
    reservationInformation: null,
    contactInformation: null,
    providerModifiedTime: value.modifiedTime,
    petPolicyEvidence: null,
    normalizedPetEvidence: {
      availability: "absent",
      fields: {
        acmpyTypeCd: null,
        acmpyPsblCpam: null,
        acmpyNeedMtr: null,
        etcAcmpyInfo: null,
        relaAcdntRiskMtr: null,
        relaPosesFclty: null,
        relaFrnshPrdlst: null,
        relaPurcPrdlst: null,
        relaRntlPrdlst: null,
      },
      sourceFields: [],
      emptyFieldNames: [],
      absentFieldNames: [],
      warningCodes: [],
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
      contentId: value.contentId,
      retrievedAt: NOW,
      providerModifiedTime: value.modifiedTime,
    },
  };
}

function mixedProvider(): KtoCatalogProvider & {
  listCalls: string[];
  detailCalls: string[];
} {
  const records = new Map<string, KtoCatalogListRecord[]>();
  for (const [index, district] of SEOUL_REGION_CONFIG.districts.entries()) {
    const core = summary({
      contentId: String(11_100_000 + index),
      districtCode: district.legalDongDistrictCode,
      districtName: district.name,
      contentTypeId: "12",
    });
    const shopping = summary({
      contentId: String(38_100_000 + index),
      districtCode: district.legalDongDistrictCode,
      districtName: district.name,
      contentTypeId: "38",
    });
    records.set(district.legalDongDistrictCode, [core, shopping].map((value) => ({
      summary: value,
      authoritativeLegalRegionCode: value.legalRegionCode,
      authoritativeLegalDistrictCode: value.legalDistrictCode,
    })));
  }
  const listCalls: string[] = [];
  const detailCalls: string[] = [];
  return {
    listCalls,
    detailCalls,
    async listDistrict(input) {
      listCalls.push(input.districtCode);
      const values = records.get(input.districtCode) ?? [];
      return {
        records: values,
        page: input.page,
        pageSize: input.pageSize,
        totalCount: values.length,
      };
    },
    async getPlaceDetail(contentId) {
      detailCalls.push(contentId);
      const value = [...records.values()].flat()
        .find((record) => record.summary?.contentId === contentId)?.summary;
      if (!value) throw new Error("missing detail fixture");
      return detail(value);
    },
    getRequestAudit() {
      return {
        liveProviderCallCount: listCalls.length + (detailCalls.length * 3),
        operationCallCounts: {
          areaBasedList2: listCalls.length,
          detailCommon2: detailCalls.length,
          detailIntro2: detailCalls.length,
          detailPetTour2: detailCalls.length,
        },
      };
    },
  };
}

function repository() {
  const checkpointDistrict = vi.fn<KtoCatalogCollectionRepository["checkpointDistrict"]>(
    async () => undefined,
  );
  const finalizeCompletedRun = vi.fn<KtoCatalogCollectionRepository["finalizeCompletedRun"]>(
    async () => ({ insertedRowCount: 50, updatedRowCount: 0, deactivatedRowCount: 0 }),
  );
  const markFailed = vi.fn<KtoCatalogCollectionRepository["markFailed"]>(
    async () => undefined,
  );
  return {
    checkpointDistrict,
    finalizeCompletedRun,
    markFailed,
    value: {
      startRun: vi.fn(async () => ({
        runId: 2708,
        completedDistrictCodes: new Set<string>(),
        completedDistricts: [],
      })),
      resumeRun: vi.fn(async () => ({
        runId: 2709,
        completedDistrictCodes: new Set<string>(),
        completedDistricts: [],
      })),
      checkpointDistrict,
      finalizeCompletedRun,
      markFailed,
    } satisfies KtoCatalogCollectionRepository,
  };
}

describe("Seoul core and shopping KTO datasets", () => {
  it("traverses every district once, fetches details only for core, and stages both datasets", async () => {
    const provider = mixedProvider();
    const result = await collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider,
      now: () => new Date(NOW),
    });

    expect(provider.listCalls).toHaveLength(25);
    expect(provider.detailCalls).toHaveLength(25);
    expect(provider.detailCalls.every((id) => id.startsWith("111"))).toBe(true);
    expect(result.rows).toHaveLength(50);
    expect(result.audit.totals.datasetCounts).toEqual({ core: 25, shopping: 25 });
    expect(result.audit.totals.detailedRecordCount).toBe(25);
    expect(result.audit.totals.listOnlyRecordCount).toBe(25);

    const shopping = result.rows.filter((row) => row.catalog_dataset === "shopping");
    expect(shopping).toHaveLength(25);
    expect(shopping.every((row) =>
      row.category_group === "shopping" &&
      row.content_type_id === 38 &&
      row.evidence_collection_mode === "list_only" &&
      row.pet_evidence_status === "official_unknown" &&
      row.pet_evidence.verificationStatus === "verification_required" &&
      JSON.stringify(row.pet_evidence).includes("detailCommon2") === false &&
      JSON.stringify(row.pet_evidence).includes("detailPetTour2") === false
    )).toBe(true);
    expect(shopping.every((row) => !/동반 가능/u.test(row.pet_notes))).toBe(true);
  });

  it("publishes core and shopping only through the same completed full run", async () => {
    const store = repository();
    await executeKtoCollection({
      region: SEOUL_REGION_CONFIG,
      mode: "apply",
      scope: "full",
      provider: mixedProvider(),
      repository: store.value,
      now: () => new Date(NOW),
    });

    expect(store.checkpointDistrict).toHaveBeenCalledTimes(25);
    const staged = store.checkpointDistrict.mock.calls
      .flatMap(([input]) => input.rows) as KtoCatalogMapPlace[];
    expect(staged.filter((row) => row.catalog_dataset === "core")).toHaveLength(25);
    expect(staged.filter((row) => row.catalog_dataset === "shopping")).toHaveLength(25);
    expect(store.finalizeCompletedRun).toHaveBeenCalledTimes(1);
  });

  it("resumes from a mixed core/shopping district checkpoint without recollecting it", async () => {
    const initialProvider = mixedProvider();
    const initial = await collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider: initialProvider,
      now: () => new Date(NOW),
    });
    const resumedProvider = mixedProvider();
    const resumed = await collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider: resumedProvider,
      completedDistricts: [initial.districts["110"]],
      now: () => new Date(NOW),
    });

    expect(resumedProvider.listCalls).toHaveLength(24);
    expect(resumedProvider.listCalls).not.toContain("110");
    expect(resumedProvider.detailCalls).toHaveLength(24);
    expect(resumed.rows).toHaveLength(50);
    expect(resumed.audit.totals.datasetCounts).toEqual({ core: 25, shopping: 25 });
  });

  it("does not finalize either dataset when a core detail fails after shopping was listed", async () => {
    const provider = mixedProvider();
    const getDetail = provider.getPlaceDetail;
    provider.getPlaceDetail = async (contentId, contentTypeId) => {
      if (provider.detailCalls.length === 3) throw new Error("fixture detail failure");
      return getDetail(contentId, contentTypeId);
    };
    const store = repository();

    await expect(executeKtoCollection({
      region: SEOUL_REGION_CONFIG,
      mode: "apply",
      scope: "full",
      provider,
      repository: store.value,
      now: () => new Date(NOW),
    })).rejects.toMatchObject({ code: "PROVIDER_FAILURE" });

    expect(store.finalizeCompletedRun).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledTimes(1);
  });
});
