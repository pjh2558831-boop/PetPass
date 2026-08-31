import { describe, expect, it, vi } from "vitest";

import {
  SEOUL_REGION_CONFIG,
  type KtoCollectionEnabledRegionConfig,
} from "@/lib/regions/config";
import {
  parseKtoCatalogCliArgs,
} from "@/lib/tour-api/collection/cli";
import type {
  KtoCatalogCollectionRepository,
  KtoCatalogListRecord,
  KtoCatalogProvider,
} from "@/lib/tour-api/collection/contracts";
import {
  collectKtoCatalog,
  executeKtoCollection,
} from "@/lib/tour-api/collection/runner";
import { runKtoCollectorCli } from "@/scripts/collect-kto-v1";
import type {
  TourContentTypeId,
  TourPlaceDetail,
  TourPlaceSummary,
} from "@/types/place";

const NOW = "2026-08-26T00:00:00.000Z";

function summary(input: {
  contentId: string;
  regionCode: string;
  districtCode: string;
  districtName: string;
  latitude?: number;
  longitude?: number;
  address?: string | null;
  contentTypeId?: TourContentTypeId;
}): TourPlaceSummary {
  const contentTypeId = input.contentTypeId ?? "12";
  const categories = {
    "12": "attraction",
    "14": "culture",
    "15": "festival",
    "28": "leisure",
    "32": "accommodation",
    "38": "shopping",
    "39": "food",
  } as const;
  return {
    contentId: input.contentId,
    contentTypeId,
    providerContentTypeId: contentTypeId,
    category: categories[contentTypeId],
    title: `서울 fixture ${input.contentId}`,
    address: input.address === undefined
      ? `서울특별시 ${input.districtName} 테스트로 1`
      : input.address,
    detailAddress: null,
    longitude: input.longitude ?? 126.98,
    latitude: input.latitude ?? 37.56,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: "20260101000000",
    modifiedTime: "20260825000000",
    legalRegionCode: input.regionCode,
    legalDistrictCode: input.districtCode,
    classificationCodes: {
      primary: "A01",
      secondary: "A0101",
      tertiary: "A01010100",
      largeCategory: "AC",
      middleCategory: "AC01",
      smallCategory: "AC0101",
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: NOW,
      contentId: input.contentId,
      providerModifiedTime: "20260825000000",
    },
  };
}

function detail(value: TourPlaceSummary): TourPlaceDetail {
  return {
    summary: {
      ...value,
      source: { ...value.source, operation: "detailCommon2" },
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

function providerFor(
  region: KtoCollectionEnabledRegionConfig<string> = SEOUL_REGION_CONFIG,
  overrides: ReadonlyMap<string, Partial<KtoCatalogListRecord>> = new Map(),
): KtoCatalogProvider & {
  listCalls: Array<{ regionCode: string; districtCode: string; page: number }>;
  detailCalls: string[];
} {
  const records = new Map<string, KtoCatalogListRecord>();
  region.districts.forEach((district, index) => {
    const value = summary({
      contentId: String(11_000_000 + index),
      regionCode: region.providerCodes.korPetTourService2.legalDongRegionCode,
      districtCode: district.legalDongDistrictCode,
      districtName: district.name,
    });
    records.set(district.legalDongDistrictCode, {
      summary: value,
      authoritativeLegalRegionCode: value.legalRegionCode,
      authoritativeLegalDistrictCode: value.legalDistrictCode,
      ...overrides.get(district.legalDongDistrictCode),
    });
  });
  const listCalls: Array<{ regionCode: string; districtCode: string; page: number }> = [];
  const detailCalls: string[] = [];
  return {
    listCalls,
    detailCalls,
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
    async listDistrict(input) {
      listCalls.push({
        regionCode: input.regionCode,
        districtCode: input.districtCode,
        page: input.page,
      });
      const record = records.get(input.districtCode);
      return {
        records: record ? [record] : [],
        page: input.page,
        pageSize: input.pageSize,
        totalCount: record ? 1 : 0,
      };
    },
    async getPlaceDetail(contentId) {
      detailCalls.push(contentId);
      const record = [...records.values()].find(
        ({ summary: value }) => value?.contentId === contentId,
      );
      if (!record?.summary) throw new Error("missing fixture detail");
      return detail(record.summary);
    },
  };
}

function repository() {
  const startRun = vi.fn<KtoCatalogCollectionRepository["startRun"]>(async () => ({
    runId: 900,
    completedDistrictCodes: new Set(),
    completedDistricts: [],
  }));
  const resumeRun = vi.fn<KtoCatalogCollectionRepository["resumeRun"]>(async () => ({
    runId: 901,
    completedDistrictCodes: new Set(),
    completedDistricts: [],
  }));
  const checkpointDistrict = vi.fn<KtoCatalogCollectionRepository["checkpointDistrict"]>(
    async () => undefined,
  );
  const markFailed = vi.fn<KtoCatalogCollectionRepository["markFailed"]>(
    async () => undefined,
  );
  const finalizeCompletedRun = vi.fn<
    KtoCatalogCollectionRepository["finalizeCompletedRun"]
  >(async (input) => ({
    insertedRowCount: 25,
    updatedRowCount: 0,
    deactivatedRowCount: input.scope === "full" ? 3 : 0,
  }));
  return {
    value: {
      startRun,
      resumeRun,
      checkpointDistrict,
      markFailed,
      finalizeCompletedRun,
    } satisfies KtoCatalogCollectionRepository,
    startRun,
    resumeRun,
    checkpointDistrict,
    markFailed,
    finalizeCompletedRun,
  };
}

describe("generic regional KTO collector", () => {
  it("collects Seoul through legal code 11 and all 25 audited district pairs", async () => {
    const provider = providerFor();
    const result = await collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider,
      now: () => new Date(NOW),
    });

    expect(provider.listCalls).toHaveLength(25);
    expect(provider.listCalls.map(({ regionCode }) => regionCode)).toEqual(
      Array(25).fill("11"),
    );
    expect(provider.listCalls.map(({ districtCode }) => districtCode).sort()).toEqual(
      SEOUL_REGION_CONFIG.districts
        .map(({ legalDongDistrictCode }) => legalDongDistrictCode)
        .sort(),
    );
    expect(provider.detailCalls).toHaveLength(25);
    expect(result.rows).toHaveLength(25);
    expect(result.rows.every((row) =>
      row.region_id === "seoul" &&
      row.provider === "tour" &&
      row.pet_evidence_status === "official_unknown" &&
      row.pet_evidence.assessment !== undefined)).toBe(true);
    expect(result.audit.totals.acceptedCount).toBe(25);
    expect(result.audit.regionId).toBe("seoul");
    expect(result.audit.providerRequests).toEqual({
      liveProviderCallCount: 100,
      operationCallCounts: {
        areaBasedList2: 25,
        detailCommon2: 25,
        detailIntro2: 25,
        detailPetTour2: 25,
      },
    });
  });

  it("rejects cross-region identity, Seoul-address mismatch, and bad coordinates before detail", async () => {
    const district = SEOUL_REGION_CONFIG.districts[0];
    const badRegion = summary({
      contentId: "11900001",
      regionCode: "26",
      districtCode: district.legalDongDistrictCode,
      districtName: district.name,
      address: "부산광역시 중구 중앙대로 1",
    });
    const provider = providerFor(SEOUL_REGION_CONFIG, new Map([
      ["110", {
        summary: badRegion,
        authoritativeLegalRegionCode: "26",
        authoritativeLegalDistrictCode: "110",
      }],
      ["140", {
        summary: summary({
          contentId: "11900002",
          regionCode: "11",
          districtCode: "140",
          districtName: "중구",
          address: "부산광역시 중구 중앙대로 2",
        }),
      }],
      ["170", {
        summary: summary({
          contentId: "11900003",
          regionCode: "11",
          districtCode: "170",
          districtName: "용산구",
          latitude: 33.5,
          longitude: 126.53,
        }),
      }],
    ]));

    const result = await collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider,
      now: () => new Date(NOW),
    });

    expect(result.audit.totals.rejectionCounts).toMatchObject({
      administrative_region_mismatch: 1,
      administrative_address_mismatch: 1,
      out_of_region_coordinates: 1,
    });
    expect(provider.detailCalls).toHaveLength(22);
  });

  it("fails closed when the provider cursor drifts", async () => {
    const provider = providerFor();
    const listDistrict = provider.listDistrict;
    provider.listDistrict = async (input) => ({
      ...(await listDistrict(input)),
      page: input.page + 1,
    });

    await expect(collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider,
    })).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESULT" });
    expect(provider.detailCalls).toHaveLength(0);
  });

  it("accepts a provider-reported effective page size below the requested ceiling", async () => {
    const provider = providerFor();
    const listDistrict = provider.listDistrict;
    provider.listDistrict = async (input) => {
      const page = await listDistrict(input);
      return { ...page, pageSize: page.records.length };
    };

    const result = await collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider,
    });

    expect(result.audit.totals.rawCount).toBe(25);
    expect(result.audit.totals.acceptedCount).toBe(25);
  });

  it("fails closed when measured provider calls exceed audited traversal limits", async () => {
    const provider = providerFor();
    provider.getRequestAudit = () => ({
      liveProviderCallCount: 401,
      operationCallCounts: {
        areaBasedList2: 101,
        detailCommon2: 100,
        detailIntro2: 100,
        detailPetTour2: 100,
      },
    });

    await expect(collectKtoCatalog({
      region: SEOUL_REGION_CONFIG,
      provider,
    })).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESULT" });
  });

  it("accepts a future collection descriptor without changing shared loader code", async () => {
    const future = {
      ...SEOUL_REGION_CONFIG,
      id: "future-city",
      displayName: "미래도시",
      providerCodes: {
        korPetTourService2: { areaCode: "99", legalDongRegionCode: "99" },
        legacyTourismAreaCode: null,
      },
      mapBounds: { west: 126.75, south: 37.4, east: 127.2, north: 37.72 },
      districts: [{ legalDongDistrictCode: "110", name: "미래구" }],
      ktoCollection: {
        ...SEOUL_REGION_CONFIG.ktoCollection,
        registryVersion: "tour-future-city-service2-v1",
        cacheNamespace: "tour-future-city-service2-v1",
        limits: {
          ...SEOUL_REGION_CONFIG.ktoCollection.limits,
          maxRawRecords: 10,
          maxAcceptedRecords: 10,
          maxDetailedRecords: 10,
        },
      },
    } satisfies KtoCollectionEnabledRegionConfig<"future-city">;
    const provider = providerFor(future);

    const result = await collectKtoCatalog({ region: future, provider });

    expect(provider.listCalls).toEqual([
      { regionCode: "99", districtCode: "110", page: 1 },
    ]);
    expect(result.rows[0]).toMatchObject({
      region_id: "future-city",
      district_code: "110",
      district_name: "미래구",
    });
  });

  it("scopes full, delta, and resume database operations to Seoul/tour", async () => {
    const full = repository();
    const fullResult = await executeKtoCollection({
      region: SEOUL_REGION_CONFIG,
      mode: "apply",
      scope: "full",
      provider: providerFor(),
      repository: full.value,
      now: () => new Date(NOW),
    });
    expect(full.startRun).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "seoul",
      provider: "tour",
      scope: "full",
      districtCodes: SEOUL_REGION_CONFIG.districts.map(
        ({ legalDongDistrictCode }) => legalDongDistrictCode,
      ),
    }));
    expect(full.checkpointDistrict).toHaveBeenCalledTimes(25);
    expect(full.finalizeCompletedRun).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "seoul",
      provider: "tour",
      scope: "full",
    }));
    expect(fullResult.database?.deactivatedRowCount).toBe(3);

    const delta = repository();
    const deltaResult = await executeKtoCollection({
      region: SEOUL_REGION_CONFIG,
      mode: "apply",
      scope: "delta",
      resumeRunId: "901",
      provider: providerFor(),
      repository: delta.value,
      now: () => new Date(NOW),
    });
    expect(delta.startRun).not.toHaveBeenCalled();
    expect(delta.resumeRun).toHaveBeenCalledWith(expect.objectContaining({
      regionId: "seoul",
      provider: "tour",
      scope: "delta",
      runId: "901",
    }));
    expect(deltaResult.database?.deactivatedRowCount).toBe(0);
  });
});

describe("generic KTO CLI boundary", () => {
  it("requires an explicit region while retaining dry-run as the default", () => {
    expect(() => parseKtoCatalogCliArgs([])).toThrowError("Region is required");
    expect(parseKtoCatalogCliArgs(["--region=seoul"])).toEqual({
      regionId: "seoul",
      mode: "dry-run",
      scope: "full",
    });
    expect(parseKtoCatalogCliArgs([
      "--region=seoul",
      "--apply",
      "--scope=delta",
      "--resume=901",
    ])).toEqual({
      regionId: "seoul",
      mode: "apply",
      scope: "delta",
      resumeRunId: "901",
    });
  });

  it.each(["unknown"])(
    "rejects unknown region %s before provider/database initialization",
    async (regionId) => {
      const providerFactory = vi.fn();
      const repositoryFactory = vi.fn();
      await expect(runKtoCollectorCli([`--region=${regionId}`], {
        providerFactory,
        repositoryFactory,
        loadEnvironment: vi.fn(),
        output: vi.fn(),
      })).rejects.toMatchObject({ code: "CONFIGURATION" });
      expect(providerFactory).not.toHaveBeenCalled();
      expect(repositoryFactory).not.toHaveBeenCalled();
    },
  );
});
