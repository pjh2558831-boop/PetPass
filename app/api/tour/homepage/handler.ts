import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";
import { tourProviderErrorResponse } from "@/lib/tour-api/errors";
import {
  collectTourHomepageSnapshot,
  type TourHomepageCatalogDependencies,
} from "@/lib/tour-api/homepage-catalog";
import {
  getDefaultTourService,
  type TourPlaceService,
} from "@/lib/tour-api/service";
import type { TourHomepageSnapshot } from "@/types/homepage";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type SnapshotLoader = (
  dependencies: TourHomepageCatalogDependencies,
) => Promise<TourHomepageSnapshot>;

export interface TourHomepageHandlerDependencies {
  service: TourPlaceService;
  now?: () => Date;
  rateLimit?: typeof consumeRateLimit;
  loadSnapshot?: SnapshotLoader;
}

export function createTourHomepageHandler({
  service,
  now = () => new Date(),
  rateLimit = consumeRateLimit,
  loadSnapshot = collectTourHomepageSnapshot,
}: TourHomepageHandlerDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const limit = rateLimit(
      "tour-homepage",
      getRequestClientId(request),
      { limit: 30, windowMs: 60_000 },
    );
    if (!limit.allowed) {
      return apiFailure(
        {
          code: "RATE_LIMITED",
          message: "잠시 후 홈페이지 관광 정보를 다시 요청해 주세요.",
          retryable: true,
        },
        429,
        { ...NO_STORE_HEADERS, ...rateLimitHeaders(limit) },
      );
    }

    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "홈페이지 관광 정보 요청에는 쿼리 매개변수를 사용할 수 없습니다.",
          retryable: false,
        },
        400,
        NO_STORE_HEADERS,
      );
    }

    try {
      const snapshot = await loadSnapshot({ service, now });
      return apiSuccess(snapshot, 200, NO_STORE_HEADERS);
    } catch (error) {
      const response = tourProviderErrorResponse(error);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createTourHomepageHandler({
    service: getDefaultTourService(),
  })(request);
}
