import "server-only";

import type { HomepageCatalogDatasetDescriptor } from "@/lib/homepage/catalog-datasets";
import type { HomepageTimingObserver } from "@/lib/homepage/performance-timing";
import {
  coordinatesInRegion,
  getRegionDistrict,
  type RegionConfig,
} from "@/lib/regions/config";
import type {
  TourPlaceService,
  TourProviderVisibilityPage,
} from "@/lib/tour-api/service";
import type { TourPlaceList, TourPlaceSummary } from "@/types/place";

export type TourHomepageOptionalDatasetFailureStatus = "unavailable" | "partial";

export class TourHomepageOptionalDatasetError extends Error {
  readonly datasetStatus: TourHomepageOptionalDatasetFailureStatus;
  readonly cause: unknown;

  constructor(
    datasetStatus: TourHomepageOptionalDatasetFailureStatus,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "TourHomepageOptionalDatasetError";
    this.datasetStatus = datasetStatus;
    this.cause = cause;
  }
}

export interface TourHomepageOptionalDatasetCollection {
  places: TourPlaceSummary[];
  listTotalCount: number;
  visibilityTotalCount: number;
  returnedCount: number;
  listPageCount: number;
  visibilityPageCount: number;
  pageSize: number;
  retrievedAt: string;
}

function fail(
  status: TourHomepageOptionalDatasetFailureStatus,
  message: string,
  cause?: unknown,
): never {
  throw new TourHomepageOptionalDatasetError(status, message, cause);
}

function pageCount(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

function validateCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    fail("partial", `${label} total count is invalid.`);
  }
}

function validateListPage(
  page: TourPlaceList,
  expectedPage: number,
  pageSize: number,
  expectedTotal: number | null,
): void {
  validateCount(page.totalCount, "KTO list");
  if (page.page !== expectedPage || page.pageSize !== pageSize) {
    fail("partial", "KTO list pagination metadata does not match the request.");
  }
  if (expectedTotal !== null && page.totalCount !== expectedTotal) {
    fail("partial", "KTO list total count changed while paging.");
  }
  if (page.places.length > pageSize) {
    fail("partial", "KTO list returned more records than the requested page size.");
  }
}

function validateVisibilityPage(
  page: TourProviderVisibilityPage,
  expectedPage: number,
  pageSize: number,
  expectedTotal: number | null,
): void {
  validateCount(page.totalCount, "KTO visibility");
  if (page.page !== expectedPage || page.pageSize !== pageSize) {
    fail("partial", "KTO visibility pagination metadata does not match the request.");
  }
  if (expectedTotal !== null && page.totalCount !== expectedTotal) {
    fail("partial", "KTO visibility total count changed while paging.");
  }
  if (page.records.length > pageSize) {
    fail("partial", "KTO visibility returned more records than the requested page size.");
  }
}

function validatePlace(
  place: TourPlaceSummary,
  region: RegionConfig<string>,
  descriptor: HomepageCatalogDatasetDescriptor,
  seenIds: Set<string>,
): void {
  const parameters = descriptor.providerParameters;
  if (!parameters) fail("unavailable", "KTO provider parameters are missing.");
  if (!place.contentId || seenIds.has(place.contentId)) {
    fail("partial", "KTO list returned a missing or duplicate provider ID.");
  }
  seenIds.add(place.contentId);
  if (place.contentTypeId !== parameters.contentTypeId || place.category !== descriptor.categories[0]) {
    fail("partial", "KTO list returned an unsupported content type or category.");
  }
  if (place.legalRegionCode !== parameters.legalDongRegionCode) {
    fail("partial", "KTO list returned a record from another legal region.");
  }
  if (parameters.legalDongDistrictCode !== null) {
    if (place.legalDistrictCode !== parameters.legalDongDistrictCode) {
      fail("partial", "KTO list returned a record from another legal district.");
    }
  } else if (!getRegionDistrict(region, place.legalDistrictCode)) {
    fail("partial", "KTO list returned an invalid legal district.");
  }
  if (place.latitude === null || place.longitude === null || !coordinatesInRegion(region, {
    latitude: place.latitude,
    longitude: place.longitude,
  })) {
    fail("partial", "KTO list returned missing or malformed coordinates.");
  }
}

function latestTimestamp(values: readonly string[]): string {
  return values.reduce((latest, value) => value > latest ? value : latest, "") ||
    new Date(0).toISOString();
}

export async function collectTourHomepageOptionalDataset({
  region,
  descriptor,
  service,
  observeTiming,
}: {
  region: RegionConfig<string>;
  descriptor: HomepageCatalogDatasetDescriptor;
  service: TourPlaceService;
  observeTiming?: HomepageTimingObserver;
}): Promise<TourHomepageOptionalDatasetCollection> {
  const startedAt = performance.now();
  try {
    const parameters = descriptor.providerParameters;
    const listVisibility = service.listProviderVisibility?.bind(service);
    if (
      descriptor.provider !== "tour" ||
      descriptor.scope !== "optional" ||
      descriptor.categories.length !== 1 ||
      !parameters ||
      !listVisibility
    ) {
      return fail("unavailable", "KTO optional dataset configuration is unavailable.");
    }
    const query = {
      regionCode: parameters.legalDongRegionCode,
      ...(parameters.legalDongDistrictCode === null
        ? {}
        : { districtCode: parameters.legalDongDistrictCode }),
      contentTypeId: parameters.contentTypeId,
      page: 1,
      pageSize: parameters.pageSize,
    };
    const firstResults = await Promise.allSettled([
      service.listPlaces(query),
      listVisibility({ ...query, showFlag: "1" }),
    ]);
    if (firstResults.some(({ status }) => status === "rejected")) {
      const rejected = firstResults.find((result) => result.status === "rejected");
      return fail("unavailable", "KTO optional traversal could not start completely.",
        rejected?.status === "rejected" ? rejected.reason : undefined);
    }
    if (firstResults[0].status !== "fulfilled" || firstResults[1].status !== "fulfilled") {
      return fail("unavailable", "KTO optional traversal did not produce both first pages.");
    }
    const firstList = firstResults[0].value;
    const firstVisibility = firstResults[1].value;
    validateListPage(firstList, 1, parameters.pageSize, null);
    validateVisibilityPage(firstVisibility, 1, parameters.pageSize, null);
    const listPageCount = pageCount(firstList.totalCount, parameters.pageSize);
    const visibilityPageCount = pageCount(firstVisibility.totalCount, parameters.pageSize);
    if (listPageCount > parameters.maxPages || visibilityPageCount > parameters.maxPages) {
      return fail("partial", "KTO optional traversal exceeds the reviewed page limit.");
    }

    const listPages: TourPlaceList[] = [firstList];
    const visibilityPages: TourProviderVisibilityPage[] = [firstVisibility];
    const maximumPages = Math.max(listPageCount, visibilityPageCount);
    for (let currentPage = 2; currentPage <= maximumPages; currentPage += 1) {
      const requests: Array<Promise<TourPlaceList | TourProviderVisibilityPage>> = [];
      const requestKinds: Array<"list" | "visibility"> = [];
      if (currentPage <= listPageCount) {
        requests.push(service.listPlaces({ ...query, page: currentPage }));
        requestKinds.push("list");
      }
      if (currentPage <= visibilityPageCount) {
        requests.push(listVisibility({ ...query, page: currentPage, showFlag: "1" }));
        requestKinds.push("visibility");
      }
      const results = await Promise.allSettled(requests);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") {
        return fail("partial", "KTO optional traversal ended before all pages completed.", rejected.reason);
      }
      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        if (requestKinds[index] === "list") {
          const page = result.value as TourPlaceList;
          validateListPage(page, currentPage, parameters.pageSize, firstList.totalCount);
          listPages.push(page);
        } else {
          const page = result.value as TourProviderVisibilityPage;
          validateVisibilityPage(page, currentPage, parameters.pageSize, firstVisibility.totalCount);
          visibilityPages.push(page);
        }
      });
    }

    const places = listPages.flatMap(({ places: pagePlaces }) => pagePlaces);
    const visibility = visibilityPages.flatMap(({ records }) => records);
    if (places.length !== firstList.totalCount || visibility.length !== firstVisibility.totalCount) {
      return fail("partial", "KTO optional traversal returned a count different from provider totals.");
    }
    const seenPlaceIds = new Set<string>();
    for (const place of places) validatePlace(place, region, descriptor, seenPlaceIds);
    const visibleIds = new Set<string>();
    const seenVisibilityIds = new Set<string>();
    for (const record of visibility) {
      if (!record.contentId || seenVisibilityIds.has(record.contentId) ||
        record.contentTypeId !== parameters.contentTypeId) {
        return fail("partial", "KTO visibility returned a missing, duplicate, or invalid provider ID.");
      }
      seenVisibilityIds.add(record.contentId);
      if (record.visibility.status === "exposed") visibleIds.add(record.contentId);
    }
    const eligible = places
      .filter(({ contentId }) => visibleIds.has(contentId))
      .sort((left, right) =>
        (left.title ?? "").localeCompare(right.title ?? "", "ko") ||
        left.contentId.localeCompare(right.contentId));
    return {
      places: eligible,
      listTotalCount: firstList.totalCount,
      visibilityTotalCount: firstVisibility.totalCount,
      returnedCount: eligible.length,
      listPageCount,
      visibilityPageCount,
      pageSize: parameters.pageSize,
      retrievedAt: latestTimestamp([
        ...listPages.map(({ source }) => source.retrievedAt),
        ...visibilityPages.map(({ source }) => source.retrievedAt),
      ]),
    };
  } finally {
    observeTiming?.({ name: "kto_list", durationMs: performance.now() - startedAt });
  }
}
