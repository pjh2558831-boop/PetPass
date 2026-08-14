import { z } from "zod";
import {
  queryPublicMapCatalog,
  type PublicMapCatalogQuery,
} from "@/lib/map-places/public-catalog";
import { isBusanDistrictCode } from "@/lib/tour-api/catalog";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  PUBLIC_MAP_PLACE_CATEGORIES,
  PUBLIC_MAP_PLACE_KINDS,
  type PublicMapPlaceCategory,
  type PublicMapPlaceKind,
  type PublicMapPlacePage,
} from "@/types/public-map-place";

const CACHE_HEADERS = { "Cache-Control": "private, no-store" } as const;
const ALLOWED_PARAMETERS = new Set(["district", "kinds", "category", "page", "pageSize"]);
const rawQuerySchema = z.object({
  district: z.string().trim().optional(),
  kinds: z.string().trim().optional(),
  category: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(200),
});

function parseKinds(value: string | undefined): PublicMapPlaceKind[] | null | undefined {
  if (!value) return undefined;
  const values = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  return values.length > 0 && values.every(
    (item): item is PublicMapPlaceKind => PUBLIC_MAP_PLACE_KINDS.includes(item as PublicMapPlaceKind),
  ) ? values : null;
}

function parseMapQuery(request: Request): PublicMapCatalogQuery | null {
  if (request.headers.has("authorization")) return null;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key))) return null;
  if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = rawQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  if (parsed.data.district && !isBusanDistrictCode(parsed.data.district)) return null;
  const kinds = parseKinds(parsed.data.kinds);
  if (kinds === null) return null;
  const category = parsed.data.category;
  if (
    category &&
    !PUBLIC_MAP_PLACE_CATEGORIES.includes(category as PublicMapPlaceCategory)
  ) return null;
  return {
    districtCodes: parsed.data.district ? [parsed.data.district] : undefined,
    kinds,
    category: category as PublicMapPlaceCategory | undefined,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  };
}

export interface MapPlacesRouteDependencies {
  query?: (input: PublicMapCatalogQuery) => Promise<PublicMapPlacePage>;
}

export function createMapPlacesHandler(dependencies: MapPlacesRouteDependencies = {}) {
  return async function GET(request: Request): Promise<Response> {
    const input = parseMapQuery(request);
    if (!input) {
      return apiFailure(
        { code: "INVALID_REQUEST", message: "지도 장소 필터를 확인해 주세요.", retryable: false },
        400,
        { "Cache-Control": "no-store" },
      );
    }
    try {
      return apiSuccess(
        await (dependencies.query ?? queryPublicMapCatalog)(input),
        200,
        CACHE_HEADERS,
      );
    } catch {
      return apiFailure(
        { code: "UPSTREAM_ERROR", message: "지도 장소를 불러오지 못했습니다.", retryable: true },
        503,
        { "Cache-Control": "no-store" },
      );
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createMapPlacesHandler()(request);
}
