import { z } from "zod";
import {
  queryPublicMapCatalog,
  type PublicMapCatalogQuery,
} from "@/lib/map-places/public-catalog";
import {
  getRegionConfig,
  getRegionDistrict,
  type RegionConfig,
} from "@/lib/regions/config";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  PUBLIC_MAP_PLACE_CATEGORIES,
  PUBLIC_MAP_PLACE_KINDS,
  PUBLIC_MAP_PLACE_PROVIDERS,
  type PublicMapPlaceCategory,
  type PublicMapPlaceKind,
  type PublicMapPlacePage,
  type PublicMapPlaceProvider,
} from "@/types/public-map-place";
import { normalizePublicMapCatalogMarker } from "@/types/public-catalog-place";
import { publicMapPlaceMatchesRegion } from "@/lib/map-places/region-contract";

const CACHE_HEADERS = { "Cache-Control": "private, no-store" } as const;
const ALLOWED_PARAMETERS = new Set(["region", "district", "providers", "kinds", "category", "categories", "page", "pageSize", "afterId", "view"]);
const rawQuerySchema = z.object({
  region: z.string().trim().min(1),
  district: z.string().trim().optional(),
  providers: z.string().trim().optional(),
  kinds: z.string().trim().optional(),
  category: z.string().trim().optional(),
  categories: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(200),
  afterId: z.coerce.number().int().positive().optional(),
  view: z.enum(["cards", "markers"]).default("cards"),
});

function parseKinds(value: string | undefined): PublicMapPlaceKind[] | null | undefined {
  if (!value) return undefined;
  const values = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  return values.length > 0 && values.every(
    (item): item is PublicMapPlaceKind => PUBLIC_MAP_PLACE_KINDS.includes(item as PublicMapPlaceKind),
  ) ? values : null;
}

interface ParsedMapQuery {
  input: PublicMapCatalogQuery;
  region: RegionConfig;
}

function parseProviders(
  value: string | undefined,
  region: RegionConfig,
): PublicMapPlaceProvider[] | null {
  const providers = value
    ? [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]
    : [...region.mapCatalog.defaultProviders];
  if (
    providers.length === 0 ||
    !providers.every((provider): provider is PublicMapPlaceProvider =>
      PUBLIC_MAP_PLACE_PROVIDERS.includes(provider as PublicMapPlaceProvider))
  ) return null;
  if (!providers.every((provider) => region.allowedMapProviders.includes(provider))) return null;
  return providers;
}

function parseMapQuery(request: Request): ParsedMapQuery | null {
  if (request.headers.has("authorization")) return null;
  const params = new URL(request.url).searchParams;
  if ([...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key))) return null;
  if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = rawQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const region = getRegionConfig(parsed.data.region);
  if (!region) return null;
  if (parsed.data.district && !getRegionDistrict(region, parsed.data.district)) return null;
  const providers = parseProviders(parsed.data.providers, region);
  if (!providers) return null;
  const kinds = parseKinds(parsed.data.kinds);
  if (kinds === null) return null;
  if (
    kinds?.some((kind) => kind === "tourism_place") && !providers.includes("tour") ||
    kinds?.some((kind) => kind !== "tourism_place") && !providers.includes("kakao")
  ) return null;
  const category = parsed.data.category;
  if (
    category &&
    !PUBLIC_MAP_PLACE_CATEGORIES.includes(category as PublicMapPlaceCategory)
  ) return null;
  const categories = parsed.data.categories
    ? [...new Set(parsed.data.categories.split(",").map((value) => value.trim()).filter(Boolean))]
    : undefined;
  if (category && categories) return null;
  if (categories && (categories.length === 0 || categories.some(
    (value) => !PUBLIC_MAP_PLACE_CATEGORIES.includes(value as PublicMapPlaceCategory),
  ))) return null;
  const query: PublicMapCatalogQuery = {
    regionId: region.id,
    providers,
    districtCodes: parsed.data.district ? [parsed.data.district] : undefined,
    kinds,
    category: category as PublicMapPlaceCategory | undefined,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  };
  if (categories) query.categories = categories as PublicMapPlaceCategory[];
  if (parsed.data.afterId !== undefined) query.afterId = parsed.data.afterId;
  return { input: query, region };
}

export interface MapPlacesRouteDependencies {
  query?: (input: PublicMapCatalogQuery) => Promise<PublicMapPlacePage>;
}

export function createMapPlacesHandler(dependencies: MapPlacesRouteDependencies = {}) {
  return async function GET(request: Request): Promise<Response> {
    const parsed = parseMapQuery(request);
    if (!parsed) {
      return apiFailure(
        { code: "INVALID_REQUEST", message: "지도 장소 필터를 확인해 주세요.", retryable: false },
        400,
        { "Cache-Control": "no-store" },
      );
    }
    if (!parsed.region.mapEnabled) {
      return apiFailure(
        {
          code: "REGION_NOT_ENABLED_FOR_MAP",
          message: "선택한 지역의 지도는 아직 공개되지 않았습니다.",
          retryable: false,
        },
        404,
        { "Cache-Control": "no-store" },
      );
    }
    try {
      const page = await (dependencies.query ?? queryPublicMapCatalog)(parsed.input);
      if (page.region.id !== parsed.region.id) {
        throw new Error("지도 지역 응답이 요청과 일치하지 않습니다.");
      }
      if (page.items.some((place) => !publicMapPlaceMatchesRegion(place, parsed.region))) {
        throw new Error("지도 장소 응답이 지역 계약과 일치하지 않습니다.");
      }
      return apiSuccess(new URL(request.url).searchParams.get("view") !== "markers"
        ? page
        : {
            ...page,
            items: page.items.map((place) =>
              normalizePublicMapCatalogMarker(place, parsed.region.id)),
          }, 200, {
          ...CACHE_HEADERS,
          "X-PetPass-Region": parsed.region.id,
        });
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
