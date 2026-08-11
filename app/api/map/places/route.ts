import { z } from "zod";
import { BUSAN_DISCOVERY_BOUNDS } from "@/lib/kakao/discovery";
import { queryMapPlaces, type MapPlaceQuery } from "@/lib/map-places/query";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  MAP_PLACE_CATEGORIES,
  MAP_PLACE_PROVIDERS,
  type MapPlaceCategory,
  type MapPlaceProvider,
} from "@/types/map-place";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;
const DEFAULT_CATEGORIES: MapPlaceCategory[] = MAP_PLACE_CATEGORIES.filter(
  (category) => category !== "shopping",
);
const ALLOWED_PARAMETERS = new Set([
  "south",
  "west",
  "north",
  "east",
  "providers",
  "categories",
  "limit",
]);
const decimal = z
  .string()
  .trim()
  .regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u)
  .transform(Number)
  .refine(Number.isFinite);
const rawQuerySchema = z.object({
  south: decimal,
  west: decimal,
  north: decimal,
  east: decimal,
  providers: z.string().trim().optional(),
  categories: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(1_000).default(500),
});

function parseList<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T[] | undefined {
  if (!value) return undefined;
  const parsed = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  return parsed.length > 0 && parsed.every((item): item is T => allowed.includes(item as T))
    ? parsed
    : undefined;
}

function parseMapQuery(request: Request): MapPlaceQuery | null {
  if (request.headers.has("authorization")) return null;
  const params = new URL(request.url).searchParams;
  if (
    [...new Set(params.keys())].some((key) => !ALLOWED_PARAMETERS.has(key)) ||
    [...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)
  ) {
    return null;
  }
  const parsed = rawQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const { south, west, north, east, limit } = parsed.data;
  if (
    south >= north ||
    west >= east ||
    south < BUSAN_DISCOVERY_BOUNDS.south ||
    north > BUSAN_DISCOVERY_BOUNDS.north ||
    west < BUSAN_DISCOVERY_BOUNDS.west ||
    east > BUSAN_DISCOVERY_BOUNDS.east
  ) {
    return null;
  }
  const providers = parseList<MapPlaceProvider>(
    parsed.data.providers,
    MAP_PLACE_PROVIDERS,
  );
  if (parsed.data.providers && !providers) return null;
  const categories = parsed.data.categories
    ? parseList<MapPlaceCategory>(parsed.data.categories, MAP_PLACE_CATEGORIES)
    : DEFAULT_CATEGORIES;
  if (!categories) return null;
  return { south, west, north, east, providers, categories, limit };
}

export interface MapPlacesRouteDependencies {
  query?: (input: MapPlaceQuery) => ReturnType<typeof queryMapPlaces>;
}

export function createMapPlacesHandler(dependencies: MapPlacesRouteDependencies = {}) {
  return async function GET(request: Request): Promise<Response> {
    const input = parseMapQuery(request);
    if (!input) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "부산 지도 범위와 필터 값을 확인해 주세요.",
          retryable: false,
        },
        400,
        { "Cache-Control": "no-store" },
      );
    }
    try {
      const places = await (dependencies.query ?? queryMapPlaces)(input);
      return apiSuccess({ places, count: places.length }, 200, CACHE_HEADERS);
    } catch {
      return apiFailure(
        {
          code: "UPSTREAM_ERROR",
          message: "저장된 지도 장소를 불러오지 못했습니다.",
          retryable: true,
        },
        503,
        { "Cache-Control": "no-store" },
      );
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createMapPlacesHandler()(request);
}
