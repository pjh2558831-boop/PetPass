import { z } from "zod";
import {
  BUSAN_DISCOVERY_BOUNDS,
  KAKAO_DISCOVERY_LIMITS,
  containsCoordinates,
  discoverKakaoPlaces,
  rectangleDimensionsMeters,
  rectangleFromCenter,
  type KakaoDiscoveryDependencies,
  type KakaoDiscoveryInput,
} from "@/lib/kakao/discovery";
import {
  BUSAN_REGION_CONFIG,
  getRegionDistrict,
} from "@/lib/regions/config";
import { apiFailure, apiSuccess, providerErrorResponse } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
  type RateLimitDecision,
} from "@/lib/shared/rate-limit";
import {
  KAKAO_DISCOVERY_CATEGORIES,
  type KakaoDiscoveryCategory,
  type KakaoDiscoveryRectangle,
} from "@/types/kakao";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const ALLOWED_QUERY_PARAMETERS = new Set([
  "category",
  "districtCode",
  "west",
  "south",
  "east",
  "north",
  "centerLongitude",
  "centerLatitude",
]);

const finiteDecimalSchema = z
  .string()
  .trim()
  .regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u)
  .transform(Number)
  .refine(Number.isFinite);

const rawQuerySchema = z.object({
  category: z.enum(KAKAO_DISCOVERY_CATEGORIES),
  districtCode: z.string().trim().min(1).max(8).optional(),
  west: finiteDecimalSchema.optional(),
  south: finiteDecimalSchema.optional(),
  east: finiteDecimalSchema.optional(),
  north: finiteDecimalSchema.optional(),
  centerLongitude: finiteDecimalSchema.optional(),
  centerLatitude: finiteDecimalSchema.optional(),
});

function hasOnlyAllowedSingleParameters(params: URLSearchParams): boolean {
  const keys = new Set(params.keys());
  return [...keys].every(
    (key) =>
      ALLOWED_QUERY_PARAMETERS.has(key) && params.getAll(key).length === 1,
  );
}

function parseInput(request: Request): KakaoDiscoveryInput | null {
  if (request.headers.has("authorization")) return null;
  const params = new URL(request.url).searchParams;
  if (!hasOnlyAllowedSingleParameters(params)) return null;
  const parsed = rawQuerySchema.safeParse({
    category: params.get("category"),
    districtCode: params.get("districtCode") ?? undefined,
    west: params.get("west") ?? undefined,
    south: params.get("south") ?? undefined,
    east: params.get("east") ?? undefined,
    north: params.get("north") ?? undefined,
    centerLongitude: params.get("centerLongitude") ?? undefined,
    centerLatitude: params.get("centerLatitude") ?? undefined,
  });
  if (!parsed.success) return null;

  const data = parsed.data;
  const rectangleValues = [data.west, data.south, data.east, data.north];
  const hasAnyRectangle = rectangleValues.some((value) => value !== undefined);
  const hasCompleteRectangle = rectangleValues.every(
    (value) => value !== undefined,
  );
  const hasAnyCenter =
    data.centerLongitude !== undefined || data.centerLatitude !== undefined;
  const hasCompleteCenter =
    data.centerLongitude !== undefined && data.centerLatitude !== undefined;
  if (
    hasAnyCenter !== hasCompleteCenter ||
    hasAnyRectangle !== hasCompleteRectangle ||
    Boolean(data.districtCode) === hasCompleteRectangle
  ) {
    return null;
  }

  const district = data.districtCode
    ? getRegionDistrict(BUSAN_REGION_CONFIG, data.districtCode)
    : null;
  if (data.districtCode && !district) return null;

  let rectangle: KakaoDiscoveryRectangle;
  let mode: KakaoDiscoveryInput["mode"];
  if (district) {
    rectangle = rectangleFromCenter(district.searchCenter);
    mode = "district";
  } else {
    rectangle = {
      west: data.west!,
      south: data.south!,
      east: data.east!,
      north: data.north!,
    };
    mode = "viewport";
    if (
      rectangle.west >= rectangle.east ||
      rectangle.south >= rectangle.north ||
      !containsCoordinates(BUSAN_DISCOVERY_BOUNDS, {
        longitude: rectangle.west,
        latitude: rectangle.south,
      }) ||
      !containsCoordinates(BUSAN_DISCOVERY_BOUNDS, {
        longitude: rectangle.east,
        latitude: rectangle.north,
      }) ||
      rectangleDimensionsMeters(rectangle).diagonal >
        KAKAO_DISCOVERY_LIMITS.maximumViewportDiagonalMeters
    ) {
      return null;
    }
  }

  const center = hasCompleteCenter
    ? {
        longitude: data.centerLongitude!,
        latitude: data.centerLatitude!,
      }
    : undefined;
  if (
    center &&
    (!containsCoordinates(BUSAN_DISCOVERY_BOUNDS, center) ||
      !containsCoordinates(rectangle, center))
  ) {
    return null;
  }

  return {
    category: data.category as KakaoDiscoveryCategory,
    mode,
    rectangle,
    ...(district ? { district: { code: district.legalDongDistrictCode, name: district.name } } : {}),
    ...(center ? { center } : {}),
  };
}

export interface PlaceDiscoveryHandlerDependencies
  extends KakaoDiscoveryDependencies {
  rateLimit?: (request: Request) => RateLimitDecision;
}

export function createPlaceDiscoveryHandler(
  dependencies: PlaceDiscoveryHandlerDependencies = {},
) {
  return async function GET(request: Request): Promise<Response> {
    const rateLimit = dependencies.rateLimit
      ? dependencies.rateLimit(request)
      : consumeRateLimit(
          "place-discovery",
          getRequestClientId(request),
          { limit: 3, windowMs: 60_000 },
        );
    if (!rateLimit.allowed) {
      return apiFailure(
        {
          code: "RATE_LIMITED",
          message: "후보 검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          retryable: true,
        },
        429,
        { ...NO_STORE_HEADERS, ...rateLimitHeaders(rateLimit) },
      );
    }

    const input = parseInput(request);
    if (!input) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "지원되는 부산 지역, 장소 유형과 검색 범위를 확인해 주세요.",
          retryable: false,
        },
        400,
        NO_STORE_HEADERS,
      );
    }

    try {
      return apiSuccess(
        await discoverKakaoPlaces(input, dependencies),
        200,
        NO_STORE_HEADERS,
      );
    } catch (error) {
      return providerErrorResponse(error, NO_STORE_HEADERS);
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createPlaceDiscoveryHandler()(request);
}
