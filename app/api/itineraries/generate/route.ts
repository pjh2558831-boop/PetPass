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

export async function POST(request: Request): Promise<Response> {
  return createItineraryGenerationHandler()(request);
}
