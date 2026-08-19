import { z } from "zod";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";
import { tourProviderErrorResponse } from "@/lib/tour-api/errors";
import {
  BUSAN_REGION,
  isBusanDistrictCode,
  type BusanDistrictCode,
} from "@/lib/tour-api/catalog";
import { collectTourCatalog, listTourCatalog } from "@/lib/tour-api/catalog-service";
import {
  getDefaultTourService,
  type TourPlaceService,
} from "@/lib/tour-api/service";
import { TOUR_CONTENT_TYPE_IDS } from "@/types/place";
import { normalizeTourCatalogMarker } from "@/types/public-catalog-place";
import { mapTourSummaryToPlaceCategory, PLACE_CATEGORIES } from "@/lib/map-places/place-categories";

const codeSchema = z.string().regex(/^\d{1,10}$/);
const querySchema = z.object({
  regionCode: z.literal(BUSAN_REGION.code).default(BUSAN_REGION.code),
  districtCode: codeSchema
    .refine(isBusanDistrictCode)
    .transform((value) => value as BusanDistrictCode)
    .optional(),
  contentTypeId: z.enum(TOUR_CONTENT_TYPE_IDS).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  // A complete Busan catalog is returned to the client once per real filter.
  // Card pagination is intentionally a client-side presentation concern.
  pageSize: z.coerce.number().int().min(1).max(1_000).default(20),
  view: z.enum(["cards", "markers"]).default("cards"),
  ids: z.string().regex(/^\d+(?:,\d+){0,11}$/).transform((value) => [...new Set(value.split(","))]).optional(),
  categories: z.string().transform((value) => [...new Set(value.split(","))]).refine(
    (values) => values.length > 0 && values.every((value) => PLACE_CATEGORIES.includes(value as (typeof PLACE_CATEGORIES)[number])),
  ).optional(),
});

export function createTourPlacesHandler(service: TourPlaceService) {
  return async function GET(request: Request): Promise<Response> {
    const rateLimit = consumeRateLimit(
      "tour-places",
      getRequestClientId(request),
      { limit: 60, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return apiFailure(
        {
          code: "RATE_LIMITED",
          message: "잠시 후 관광지 목록을 다시 요청해 주세요.",
          retryable: true,
        },
        429,
        rateLimitHeaders(rateLimit),
      );
    }

    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      regionCode: params.get("regionCode") ?? undefined,
      districtCode: params.get("districtCode") ?? undefined,
      contentTypeId: params.get("contentTypeId") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
      view: params.get("view") ?? undefined,
      ids: params.get("ids") ?? undefined,
      categories: params.get("categories") ?? undefined,
    });
    if (!parsed.success) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "관광지 목록 요청 매개변수를 확인해 주세요.",
          retryable: false,
        },
        400,
      );
    }

    try {
      const data = parsed.data.ids
        ? await collectTourCatalog(service, parsed.data).then((collection) => {
            const places = collection.places.filter(({ contentId }) => parsed.data.ids?.includes(contentId));
            return { ...collection, places, page: 1, pageSize: places.length, totalCount: places.length };
          })
        : await listTourCatalog(service, parsed.data);
      const filteredPlaces = parsed.data.categories
        ? data.places.filter((place) => parsed.data.categories?.includes(mapTourSummaryToPlaceCategory(place)))
        : data.places;
      return apiSuccess(parsed.data.view === "markers" ? {
        items: filteredPlaces.map(normalizeTourCatalogMarker),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        hasNext: data.page * data.pageSize < data.totalCount,
      } : { ...data, places: filteredPlaces, totalCount: filteredPlaces.length }, 200, {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      });
    } catch (error) {
      return tourProviderErrorResponse(error);
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createTourPlacesHandler(getDefaultTourService())(request);
}
