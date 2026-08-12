import {
  generateItineraries,
  type ItineraryGenerationDependencies,
} from "@/lib/itinerary/generation-service";
import {
  itineraryGenerationRequestSchema,
  normalizeItineraryRequest,
} from "@/lib/itinerary/request-schema";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";
import {
  recommendationHttpStatus,
  recommendationFailure,
} from "@/lib/recommendation/recommendation-errors";
import {
  routeRecommendationRequestSchema,
} from "@/lib/recommendation/recommendation-request";
import {
  generateRouteRecommendation,
  type RecommendationServiceDependencies,
} from "@/lib/recommendation/recommendation-service";
import type { RouteRecommendationResponseV1 } from "@/types/recommendation";

const inFlightRecommendations = new Map<
  string,
  Promise<RouteRecommendationResponseV1>
>();

function generateOnce(
  fingerprint: string,
  generate: typeof generateRouteRecommendation,
  request: Parameters<typeof generateRouteRecommendation>[0],
  dependencies?: RecommendationServiceDependencies,
): Promise<RouteRecommendationResponseV1> {
  const existing = inFlightRecommendations.get(fingerprint);
  if (existing) return existing;
  const pending = generate(request, dependencies);
  inFlightRecommendations.set(fingerprint, pending);
  const clean = () => {
    if (inFlightRecommendations.get(fingerprint) === pending) {
      inFlightRecommendations.delete(fingerprint);
    }
  };
  void pending.then(clean, clean);
  return pending;
}

export function createItineraryGenerationHandler(
  dependencies: ItineraryGenerationDependencies = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const rateLimit = consumeRateLimit(
      "itinerary-generation",
      getRequestClientId(request),
      { limit: 8, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return apiFailure(
        {
          code: "RATE_LIMITED",
          message: "일정 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          retryable: true,
        },
        429,
        rateLimitHeaders(rateLimit),
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message: "일정 생성 요청 본문은 올바른 JSON이어야 합니다.",
          retryable: false,
        },
        400,
      );
    }

    const parsed = itineraryGenerationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiFailure(
        {
          code: "INVALID_REQUEST",
          message:
            "지역, 출발 좌표, 날짜·시간, 일정 길이와 카테고리 값을 확인해 주세요.",
          retryable: false,
        },
        400,
      );
    }

    const data = await generateItineraries(
      normalizeItineraryRequest(parsed.data),
      dependencies,
    );
    return apiSuccess(data, 200, { "Cache-Control": "no-store" });
  };
}

export function createRouteRecommendationHandler(
  options: {
    dependencies?: RecommendationServiceDependencies;
    enabled?: boolean;
    rateLimit?: typeof consumeRateLimit;
    generate?: typeof generateRouteRecommendation;
  } = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const enabled =
      options.enabled ?? process.env.ROUTE_ENGINE_V1_ENABLED === "true";
    if (!enabled) {
      const failure = recommendationFailure("route_engine_disabled", [
        "route_engine_v1_feature_flag_disabled",
      ]);
      return Response.json(failure, {
        status: recommendationHttpStatus(failure.status),
        headers: { "Cache-Control": "no-store" },
      });
    }
    const limit = (options.rateLimit ?? consumeRateLimit)(
      "route-recommendation-v1",
      getRequestClientId(request),
      { limit: 8, windowMs: 60_000 },
    );
    if (!limit.allowed) {
      const failure = recommendationFailure("rate_limited", [
        "route_recommendation_rate_limit_exceeded",
      ]);
      return Response.json(failure, {
        status: recommendationHttpStatus(failure.status),
        headers: {
          "Cache-Control": "no-store",
          ...rateLimitHeaders(limit),
        },
      });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const failure = recommendationFailure("invalid_request", [
        "request_body_not_json",
      ]);
      return Response.json(failure, {
        status: recommendationHttpStatus(failure.status),
        headers: { "Cache-Control": "no-store" },
      });
    }
    const parsed = routeRecommendationRequestSchema.safeParse(body);
    if (!parsed.success) {
      const failure = recommendationFailure("invalid_request", [
        "route_recommendation_schema_invalid",
      ]);
      return Response.json(failure, {
        status: recommendationHttpStatus(failure.status),
        headers: { "Cache-Control": "no-store" },
      });
    }
    let result;
    try {
      result = await generateOnce(
        JSON.stringify(parsed.data),
        options.generate ?? generateRouteRecommendation,
        parsed.data,
        options.dependencies,
      );
    } catch {
      result = recommendationFailure("internal_error", [
        "recommendation_handler_failed",
      ]);
    }
    return Response.json(result, {
      status:
        result.status === "ready"
          ? 200
          : recommendationHttpStatus(result.status),
      headers: { "Cache-Control": "no-store" },
    });
  };
}

export async function POST(request: Request): Promise<Response> {
  return createRouteRecommendationHandler()(request);
}
