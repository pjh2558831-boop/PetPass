import { z } from "zod";
import { createKakaoDiscoveryCandidate } from "@/lib/kakao/candidates";
import { searchKakaoPlacePage } from "@/lib/kakao/local";
import {
  KAKAO_CURRENT_MAP_MAX_RADIUS_METERS,
  KAKAO_MAX_RESULTS_PER_REQUEST,
  createKakaoSearchPlan,
  deduplicateKakaoPlaces,
} from "@/lib/kakao/search-area";
import {
  BUSAN_REGION_CONFIG,
  getEnabledRegionConfig,
  getRegionDistrict,
} from "@/lib/regions/config";
import { apiFailure, apiSuccess, providerErrorResponse } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";

const querySchema = z.object({
  query: z.string().trim().min(2).max(80),
  page: z.coerce.number().int().min(1).max(3).default(1),
  size: z.coerce
    .number()
    .int()
    .min(1)
    .max(KAKAO_MAX_RESULTS_PER_REQUEST)
    .default(5),
  regionId: z.string().trim().min(1).max(32).default(BUSAN_REGION_CONFIG.id),
  districtCode: z.string().trim().min(1).max(8).optional(),
  mode: z.enum(["configured", "trip-origin", "current-map"]).default("configured"),
  longitude: z.coerce.number().min(128.75).max(129.4).optional(),
  latitude: z.coerce.number().min(34.95).max(35.5).optional(),
  radiusMeters: z.coerce
    .number()
    .int()
    .min(500)
    .max(KAKAO_CURRENT_MAP_MAX_RADIUS_METERS)
    .optional(),
  originLongitude: z.coerce.number().min(128.75).max(129.4).optional(),
  originLatitude: z.coerce.number().min(34.95).max(35.5).optional(),
  originLabel: z.string().trim().max(60).optional(),
});

export async function GET(request: Request) {
  const rateLimit = consumeRateLimit(
    "kakao-local-search",
    getRequestClientId(request),
    { limit: 30, windowMs: 60_000 },
  );
  if (!rateLimit.allowed) {
    return apiFailure(
      {
        code: "RATE_LIMITED",
        message: "검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        retryable: true,
      },
      429,
      rateLimitHeaders(rateLimit),
    );
  }

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    query: params.get("query"),
    page: params.get("page") ?? undefined,
    size: params.get("size") ?? undefined,
    regionId: params.get("regionId") ?? undefined,
    districtCode: params.get("districtCode") ?? undefined,
    mode: params.get("mode") ?? undefined,
    longitude: params.get("longitude") ?? undefined,
    latitude: params.get("latitude") ?? undefined,
    radiusMeters: params.get("radiusMeters") ?? undefined,
    originLongitude: params.get("originLongitude") ?? undefined,
    originLatitude: params.get("originLatitude") ?? undefined,
    originLabel: params.get("originLabel") ?? undefined,
  });
  if (!parsed.success) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "두 글자 이상의 검색어와 올바른 페이지 범위가 필요합니다.",
        retryable: false,
      },
      400,
    );
  }

  const region = getEnabledRegionConfig(parsed.data.regionId);
  const district = getRegionDistrict(region ?? BUSAN_REGION_CONFIG, parsed.data.districtCode);
  const currentMapComplete =
    parsed.data.longitude !== undefined &&
    parsed.data.latitude !== undefined &&
    parsed.data.radiusMeters !== undefined;
  const tripOriginComplete =
    parsed.data.originLongitude !== undefined &&
    parsed.data.originLatitude !== undefined;
  if (
    !region ||
    (parsed.data.districtCode && !district) ||
    (parsed.data.mode === "current-map" && !currentMapComplete) ||
    (parsed.data.mode === "trip-origin" && !tripOriginComplete)
  ) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "지원 중인 부산 검색 범위와 올바른 좌표가 필요합니다.",
        retryable: false,
      },
      400,
    );
  }

  try {
    const plan = createKakaoSearchPlan({
      regionId: region.id,
      districtCode: district?.code,
      explicitMode: parsed.data.mode,
      currentMap: currentMapComplete
        ? {
            center: {
              longitude: parsed.data.longitude!,
              latitude: parsed.data.latitude!,
            },
            radiusMeters: parsed.data.radiusMeters!,
          }
        : null,
      tripOrigin: tripOriginComplete
        ? {
            longitude: parsed.data.originLongitude!,
            latitude: parsed.data.originLatitude!,
            label: parsed.data.originLabel,
          }
        : null,
    });
    const pages = await Promise.all(
      plan.centers.map((center) =>
        searchKakaoPlacePage({
          query: parsed.data.query,
          page: parsed.data.page,
          size: parsed.data.size,
          center: {
            ...center.coordinates,
            radiusMeters: center.radiusMeters,
          },
        }),
      ),
    );
    const retrievedAt = new Date().toISOString();
    const data = {
      results: deduplicateKakaoPlaces(pages.map(({ results }) => results)).map(
        (result) => createKakaoDiscoveryCandidate(result, retrievedAt),
      ),
      area: plan.area,
      truncated: pages.some(({ isEnd }) => !isEnd),
    };
    return apiSuccess(data, 200, {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
