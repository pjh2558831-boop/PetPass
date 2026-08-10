import "server-only";

import {
  TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS,
  type BusanDistrictCode,
} from "@/lib/tour-api/catalog";
import { TourProviderError } from "@/lib/tour-api/errors";
import type { TourPlaceService } from "@/lib/tour-api/service";
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
): Promise<TourPlaceList[]> {
  const providerQuery = {
    regionCode: query.regionCode,
    districtCode: query.districtCode,
    contentTypeId,
    page: 1,
    pageSize: TOUR_CATALOG_PROVIDER_PAGE_SIZE,
  };
  const first = await service.listPlaces(providerQuery);
  const effectivePageSize = first.pageSize || TOUR_CATALOG_PROVIDER_PAGE_SIZE;
  const totalPages = Math.ceil(first.totalCount / effectivePageSize);

  if (totalPages > TOUR_CATALOG_MAX_PAGES_PER_CONTENT_TYPE) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "관광지 목록이 안전한 페이지 조회 한도를 초과했습니다.",
      { operation: "areaBasedList2" },
    );
  }

  const keepRequestedType = (list: TourPlaceList): TourPlaceList => ({
    ...list,
    places: list.places.filter(
      (place) => place.contentTypeId === contentTypeId,
    ),
  });
  const pages = [keepRequestedType(first)];
  for (let page = 2; page <= totalPages; page += 1) {
    pages.push(
      keepRequestedType(await service.listPlaces({ ...providerQuery, page })),
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
): Promise<TourPlaceList> {
  const collection = await collectTourCatalog(service, query);
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
): Promise<TourPlaceList> {
  const contentTypeIds = query.contentTypeId
    ? [query.contentTypeId]
    : [...TOUR_DEFAULT_CATALOG_CONTENT_TYPE_IDS];
  const pageGroups = await Promise.all(
    contentTypeIds.map((contentTypeId) =>
      collectContentType(service, query, contentTypeId),
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
