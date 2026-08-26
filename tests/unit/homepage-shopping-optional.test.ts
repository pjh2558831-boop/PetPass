import { describe, expect, it, vi } from "vitest";
import {
  getHomepageCatalogDataset,
  getHomepageCatalogDatasets,
} from "@/lib/homepage/catalog-datasets";
import {
  assembleHomepageOptionalDataset,
  createHomepageOptionalLoader,
} from "@/lib/homepage/homepage-optional";
import {
  BUSAN_REGION_CONFIG,
  type RegionConfig,
} from "@/lib/regions/config";
import {
  collectTourHomepageOptionalDataset,
  TourHomepageOptionalDatasetError,
} from "@/lib/tour-api/homepage-optional-dataset";
import { TourProviderError } from "@/lib/tour-api/errors";
import type {
  TourPlaceService,
  TourProviderVisibilityPage,
} from "@/lib/tour-api/service";
import type { TourPlaceList, TourPlaceSummary } from "@/types/place";
import type { HomepageOptionalRequest } from "@/types/homepage-optional";

const request: HomepageOptionalRequest = {
  version: 1,
  region: "busan",
  scope: "optional",
  dataset: "optional-kto-shopping",
};

function shoppingPlace(index: number, overrides: Partial<TourPlaceSummary> = {}): TourPlaceSummary {
  const district = BUSAN_REGION_CONFIG.districts[index % BUSAN_REGION_CONFIG.districts.length];
  return {
    contentId: String(index + 1),
    contentTypeId: "38",
    providerContentTypeId: "38",
    category: "shopping",
    title: `Shopping ${index + 1}`,
    address: `Provider address ${index + 1}`,
    detailAddress: null,
    longitude: 129.02 + (index % 100) / 10_000,
    latitude: 35.1 + (index % 100) / 10_000,
    phone: null,
    thumbnailUrl: null,
    imageUrl: null,
    copyrightType: null,
    createdTime: null,
    modifiedTime: "20260825000000",
    legalRegionCode: BUSAN_REGION_CONFIG.providerCodes.korPetTourService2.legalDongRegionCode,
    legalDistrictCode: district.legalDongDistrictCode,
    classificationCodes: {
      primary: "A04",
      secondary: null,
      tertiary: null,
      largeCategory: null,
      middleCategory: null,
      smallCategory: null,
    },
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: "2026-08-25T00:00:00.000Z",
      contentId: String(index + 1),
      providerModifiedTime: "20260825000000",
    },
    ...overrides,
  };
}

function tourService(total: number, mutate?: (place: TourPlaceSummary, index: number) => TourPlaceSummary): TourPlaceService {
  const all = Array.from({ length: total }, (_, index) => {
    const place = shoppingPlace(index);
    return mutate ? mutate(place, index) : place;
  });
  const listPlaces = vi.fn(async (query): Promise<TourPlaceList> => {
    const offset = (query.page - 1) * query.pageSize;
    return {
      places: all.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      totalCount: total,
      source: {
        provider: "Korea Tourism Organization",
        operation: "areaBasedList2",
        retrievedAt: "2026-08-25T00:00:00.000Z",
      },
    };
  });
  const listProviderVisibility = vi.fn(async (query): Promise<TourProviderVisibilityPage> => {
    const offset = (query.page - 1) * query.pageSize;
    return {
      records: all.slice(offset, offset + query.pageSize).map((place) => ({
        contentId: place.contentId,
        contentTypeId: "38",
        visibility: {
          status: "exposed",
          providerField: "showflag",
          providerValue: "1",
          checkedAt: "2026-08-25T00:00:00.000Z",
          reasonCodes: [],
        },
      })),
      page: query.page,
      pageSize: query.pageSize,
      totalCount: total,
      source: {
        provider: "Korea Tourism Organization",
        operation: "petTourSyncList2",
        retrievedAt: "2026-08-25T00:00:00.000Z",
      },
    };
  });
  return {
    listPlaces,
    listProviderVisibility,
    getPlaceDetail: vi.fn(() => { throw new Error("detail N+1 is prohibited"); }),
  };
}

function descriptor() {
  const value = getHomepageCatalogDataset(BUSAN_REGION_CONFIG, request.dataset);
  if (!value) throw new Error("shopping descriptor missing");
  return value;
}

describe("region-generic KTO Shopping optional dataset", () => {
  it("restores the deterministic 614-record legacy baseline without capping", async () => {
    const service = tourService(614);
    const snapshot = await assembleHomepageOptionalDataset(request, { tourService: service });

    expect(snapshot.status).toBe("complete");
    expect(snapshot.totalCount).toBe(614);
    expect(snapshot.markerCount).toBe(614);
    expect(snapshot.integrity).toMatchObject({
      expectedItemCount: 614,
      returnedItemCount: 614,
      traversalComplete: true,
    });
    expect(service.listPlaces).toHaveBeenCalledTimes(4);
    expect(service.listProviderVisibility).toHaveBeenCalledTimes(4);
    expect(service.getPlaceDetail).not.toHaveBeenCalled();
    const rawBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    expect(rawBytes).toBeLessThan(150_000);
  });

  it("accepts a complete provider count that differs from 614", async () => {
    const snapshot = await assembleHomepageOptionalDataset(request, { tourService: tourService(417) });
    expect(snapshot.status).toBe("complete");
    expect(snapshot.totalCount).toBe(417);
    expect(snapshot.markers).toHaveLength(417);
  });

  it("traverses every bounded list and visibility page", async () => {
    const service = tourService(417);
    const result = await collectTourHomepageOptionalDataset({
      region: BUSAN_REGION_CONFIG,
      descriptor: descriptor(),
      service,
    });
    expect(service.listPlaces).toHaveBeenCalledTimes(3);
    expect(service.listProviderVisibility).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      returnedCount: 417,
      listPageCount: 3,
      visibilityPageCount: 3,
    });
  });

  it("represents a successful complete zero traversal as complete_empty", async () => {
    const snapshot = await assembleHomepageOptionalDataset(request, { tourService: tourService(0) });
    expect(snapshot).toMatchObject({
      status: "complete_empty",
      totalCount: 0,
      markerCount: 0,
      integrity: { traversalComplete: true, returnedItemCount: 0 },
    });
  });

  it.each(["QUOTA_EXHAUSTED", "UPSTREAM"] as const)(
    "keeps a cold %s provider failure unavailable rather than empty",
    async (code) => {
      const service = tourService(1);
      vi.mocked(service.listPlaces).mockRejectedValueOnce(new TourProviderError(code, "provider failed"));
      await expect(assembleHomepageOptionalDataset(request, { tourService: service }))
        .rejects.toMatchObject({ datasetStatus: "unavailable" });
    },
  );

  it.each(["TIMEOUT", "CONFIGURATION"] as const)(
    "keeps %s unavailable rather than empty",
    async (code) => {
      const service = tourService(1);
      vi.mocked(service.listPlaces).mockRejectedValueOnce(new TourProviderError(code, "provider failed"));
      await expect(assembleHomepageOptionalDataset(request, { tourService: service }))
        .rejects.toMatchObject({ datasetStatus: "unavailable" });
    },
  );

  it("serves stale last-good complete data after a refresh failure", async () => {
    let now = 0;
    const good = await assembleHomepageOptionalDataset(request, { tourService: tourService(2) });
    const assemble = vi.fn()
      .mockResolvedValueOnce(good)
      .mockRejectedValueOnce(new TourHomepageOptionalDatasetError("unavailable", "refresh failed"));
    const load = createHomepageOptionalLoader({ assemble, now: () => now, freshMs: 10, staleIfErrorMs: 100 });
    await expect(load(request)).resolves.toMatchObject({ status: "complete" });
    now = 11;
    await expect(load(request)).resolves.toMatchObject({ status: "stale", freshness: { status: "stale" } });
  });

  it("never caches a cold partial traversal as complete", async () => {
    const partial = new TourHomepageOptionalDatasetError("partial", "page two failed");
    const assemble = vi.fn().mockRejectedValue(partial);
    const load = createHomepageOptionalLoader({ assemble });
    await expect(load(request)).rejects.toBe(partial);
    await expect(load(request)).rejects.toBe(partial);
    expect(assemble).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent cold Shopping generations", async () => {
    const resolved = await assembleHomepageOptionalDataset(request, { tourService: tourService(2) });
    let release!: (snapshot: typeof resolved) => void;
    const assemble = vi.fn(() => new Promise<typeof resolved>((resolve) => { release = resolve; }));
    const load = createHomepageOptionalLoader({ assemble: assemble as never });
    const first = load(request);
    const strictRepeat = load(request);
    expect(assemble).toHaveBeenCalledTimes(1);
    release(resolved);
    await expect(first).resolves.toBe(resolved);
    await expect(strictRepeat).resolves.toBe(resolved);
  });

  it("serves an existing application-cache value within the local 150ms target", async () => {
    const resolved = await assembleHomepageOptionalDataset(request, { tourService: tourService(614) });
    const assemble = vi.fn().mockResolvedValue(resolved);
    const load = createHomepageOptionalLoader({ assemble: assemble as never });
    await load(request);
    const startedAt = performance.now();
    await expect(load(request)).resolves.toBe(resolved);
    expect(performance.now() - startedAt).toBeLessThan(150);
    expect(assemble).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported capability before making a provider call", async () => {
    const service = tourService(1);
    await expect(assembleHomepageOptionalDataset({ ...request, region: "jeju" }, { tourService: service }))
      .rejects.toMatchObject({ datasetStatus: "unavailable" });
    expect(service.listPlaces).not.toHaveBeenCalled();
    expect(service.listProviderVisibility).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-region", { legalRegionCode: "50" }],
    ["invalid district", { legalDistrictCode: "999" }],
    ["malformed coordinates", { latitude: null }],
  ] as const)("rejects %s records", async (_name, overrides) => {
    const service = tourService(1, (place) => ({ ...place, ...overrides }));
    await expect(assembleHomepageOptionalDataset(request, { tourService: service }))
      .rejects.toMatchObject({ datasetStatus: "partial" });
  });

  it("rejects duplicate IDs and count drift", async () => {
    const duplicate = tourService(2, (place, index) => index === 1 ? { ...place, contentId: "1" } : place);
    await expect(assembleHomepageOptionalDataset(request, { tourService: duplicate }))
      .rejects.toMatchObject({ datasetStatus: "partial" });

    const drift = tourService(201);
    vi.mocked(drift.listPlaces).mockImplementationOnce(vi.mocked(drift.listPlaces).getMockImplementation()!);
    vi.mocked(drift.listPlaces).mockResolvedValueOnce({
      ...(await tourService(202).listPlaces({ regionCode: "26", contentTypeId: "38", page: 2, pageSize: 200 })),
      page: 2,
      totalCount: 202,
    });
    await expect(assembleHomepageOptionalDataset(request, { tourService: drift }))
      .rejects.toMatchObject({ datasetStatus: "partial" });
  });

  it("enables a test-only future region through metadata without shared loader changes", async () => {
    const future = {
      ...BUSAN_REGION_CONFIG,
      id: "future",
      displayName: "Future",
      providerCodes: {
        ...BUSAN_REGION_CONFIG.providerCodes,
        korPetTourService2: { legalDongRegionCode: "99" },
      },
      homepageOptionalDatasets: {
        ktoShopping: {
          ...BUSAN_REGION_CONFIG.homepageOptionalDatasets.ktoShopping,
          enabled: true,
        },
      },
    } satisfies RegionConfig<"future">;
    const futureDescriptor = getHomepageCatalogDatasets(future, "optional")
      .find(({ id }) => id === "optional-kto-shopping");
    const service = tourService(1, (place) => ({ ...place, legalRegionCode: "99" }));
    const result = await collectTourHomepageOptionalDataset({
      region: future,
      descriptor: futureDescriptor!,
      service,
    });
    expect(result.returnedCount).toBe(1);
    expect(service.listPlaces).toHaveBeenCalledWith(expect.objectContaining({ regionCode: "99" }));
  });
});
