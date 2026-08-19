import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";
import { tourProviderErrorResponse } from "@/lib/tour-api/errors";
import { getDefaultTourService, type TourPlaceService } from "@/lib/tour-api/service";
import {
  collectHomepagePlacesSnapshot,
  type HomepagePlacesDependencies,
} from "@/lib/homepage/homepage-places";
import type { HomepagePlacesSnapshot } from "@/types/homepage-places";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

type SnapshotLoader = (
  dependencies: HomepagePlacesDependencies,
) => Promise<HomepagePlacesSnapshot>;

export interface HomepagePlacesHandlerDependencies {
  service: TourPlaceService;
  now?: () => Date;
  rateLimit?: typeof consumeRateLimit;
  loadSnapshot?: SnapshotLoader;
}

export function createHomepagePlacesHandler({
  service,
  now = () => new Date(),
  rateLimit = consumeRateLimit,
  loadSnapshot = collectHomepagePlacesSnapshot,
}: HomepagePlacesHandlerDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const limit = rateLimit("homepage-places", getRequestClientId(request), {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return apiFailure(
        {
          code: "RATE_LIMITED",
          message: "잠시 후 홈페이지 장소 정보를 다시 요청해 주세요.",
          retryable: true,
        },
        429,
        { ...NO_STORE_HEADERS, ...rateLimitHeaders(limit) },
      );
    }
    const params = new URL(request.url).searchParams;
    const includeOptional = params.get("includeOptional") === "true";
    if ([...params.keys()].some((key) => key !== "includeOptional") ||
      params.getAll("includeOptional").length > 1 ||
      (params.has("includeOptional") && !includeOptional)) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "홈페이지 장소 정보 요청에는 쿼리 매개변수를 사용할 수 없습니다.",
          retryable: false,
        },
        400,
        NO_STORE_HEADERS,
      );
    }

    try {
      return apiSuccess(
        await loadSnapshot({ service, now, includeOptional }),
        200,
        NO_STORE_HEADERS,
      );
    } catch (error) {
      const response = tourProviderErrorResponse(error);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  return createHomepagePlacesHandler({ service: getDefaultTourService() })(request);
}
