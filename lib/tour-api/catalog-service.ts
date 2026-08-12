import "server-only";

import {
  TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS,
  type BusanDistrictCode,
} from "@/lib/tour-api/catalog";
import { TourProviderError } from "@/lib/tour-api/errors";
import type {
  TourPlaceService,
  TourProviderVisibilityPage,
  TourProviderVisibilityRecord,
  TourRequestObserver,
} from "@/lib/tour-api/service";
import type {
  TourContentTypeId,
  TourPlaceList,
  TourPlaceSummary,
} from "@/types/place";

export const TOUR_CATALOG_PROVIDER_PAGE_SIZE = 50;
export const TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE = 20;

export interface TourCatalogQuery {
  regionCode: string;
  districtCode?: BusanDistrictCode;
  contentTypeId?: TourContentTypeId;
  page: number;
  pageSize: number;
}

export type TourCatalogCollectionQuery = Omit<
  TourCatalogQuery,
  "page" | "pageSize"
>;

async function collectContentType(
  service: TourPlaceService,
  query: TourCatalogCollectionQuery,
  contentTypeId: TourContentTypeId,
  observe?: TourRequestObserver,
): Promise<TourPlaceList[]> {
  const providerQuery = {
    regionCode: query.regionCode,
    districtCode: query.districtCode,
    contentTypeId,
    page: 1,
    pageSize: TOUR_CATALOG_PROVIDER_PAGE_SIZE,
  };
  const visibilityRequest = service.listProviderVisibility?.bind(service);
  if (!visibilityRequest) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "관광지 공개 상태 조회 기능을 사용할 수 없습니다.",
      { operation: "petTourSyncList2" },
    );
  }

  const visibilityQuery = {
    ...providerQuery,
    showFlag: "1" as const,
  };
  const [first, firstVisibility] = await Promise.all([
    observe
      ? service.listPlaces(providerQuery, observe)
      : service.listPlaces(providerQuery),
    observe
      ? visibilityRequest(visibilityQuery, observe)
      : visibilityRequest(visibilityQuery),
  ]);
  const effectivePageSize = first.pageSize || TOUR_CATALOG_PROVIDER_PAGE_SIZE;
  const totalPages = Math.ceil(first.totalCount / effectivePageSize);

  if (totalPages > TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "관광지 목록이 안전한 페이지 조회 한도를 초과했습니다.",
      { operation: "areaBasedList2" },
    );
  }

  const visibilityPageSize =
    firstVisibility.pageSize || TOUR_CATALOG_PROVIDER_PAGE_SIZE;
  const visibilityTotalPages = Math.ceil(
    firstVisibility.totalCount / visibilityPageSize,
  );
  if (visibilityTotalPages > TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "공개 상태 목록이 안전한 페이지 조회 한도를 초과했습니다.",
      { operation: "petTourSyncList2" },
    );
  }

  const visibilityPages: TourProviderVisibilityPage[] = [firstVisibility];
  for (let page = 2; page <= visibilityTotalPages; page += 1) {
    visibilityPages.push(
      observe
        ? await visibilityRequest({ ...visibilityQuery, page }, observe)
        : await visibilityRequest({ ...visibilityQuery, page }),
    );
  }
  const exposedByContentId = new Map<string, TourProviderVisibilityRecord>();
  for (const record of visibilityPages.flatMap(({ records }) => records)) {
    if (
      record.contentTypeId === contentTypeId &&
      record.visibility.status === "exposed"
    ) {
      exposedByContentId.set(record.contentId, record);
    }
  }

  const keepRequestedType = (list: TourPlaceList): TourPlaceList => ({
    ...list,
    places: list.places.flatMap((place) => {
      if (place.contentTypeId !== contentTypeId) return [];
      const record = exposedByContentId.get(place.contentId);
      return record
        ? [{ ...place, providerVisibility: record.visibility }]
        : [];
    }),
  });
  const pages = [keepRequestedType(first)];
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(
      keepRequestedType(
        observe
          ? await service.listPlaces({ ...providerQuery, page }, observe)
          : await service.listPlaces({ ...providerQuery, page }),
      ),
    );
  }
  return pages;
}

function deduplicateAndSort(places: TourPlaceSummary[]): TourPlaceSummary[] {
  const unique = new Map<string, TourPlaceSummary>();
  for (const place of places) {
    if (!unique.has(place.contentId)) unique.set(place.contentId, place);
  }
  return [...unique.values()].sort(
    (left, right) =>
      (left.title ?? "").localeCompare(right.title ?? "", "ko") ||
      left.contentId.localeCompare(right.contentId),
  );
}

export async function listTourCatalog(
  service: TourPlaceService,
  query: TourCatalogQuery,
  observe?: TourRequestObserver,
): Promise<TourPlaceList> {
  const collection = await collectTourCatalog(service, query, observe);
  const offset = (query.page - 1) * query.pageSize;

  return {
    ...collection,
    places: collection.places.slice(offset, offset + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function collectTourCatalog(
  service: TourPlaceService,
  query: TourCatalogCollectionQuery,
  observe?: TourRequestObserver,
): Promise<TourPlaceList> {
  const contentTypeIds = query.contentTypeId
    ? [query.contentTypeId]
    : [...TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS];
  const pageGroups = await Promise.all(
    contentTypeIds.map((contentTypeId) =>
      collectContentType(service, query, contentTypeId, observe),
    ),
  );
  const lists = pageGroups.flat();
  const allPlaces = deduplicateAndSort(
    lists.flatMap(({ places }) => places),
  );
  const retrievedAt = lists.reduce(
    (latest, list) =>
      list.source.retrievedAt > latest ? list.source.retrievedAt : latest,
    "",
  );

  return {
    places: allPlaces,
    page: 1,
    pageSize: allPlaces.length,
    totalCount: allPlaces.length,
    source: {
      provider: "Korea Tourism Organization",
      operation: "areaBasedList2",
      retrievedAt: retrievedAt || new Date(0).toISOString(),
    },
  };
}
