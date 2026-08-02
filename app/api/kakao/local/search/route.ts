import { z } from "zod";
import { searchKakaoPlaces } from "@/lib/kakao/local";
import { apiFailure, apiSuccess, providerErrorResponse } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";

const querySchema = z.object({
  query: z.string().trim().min(2).max(80),
  page: z.coerce.number().int().min(1).max(3).default(1),
  size: z.coerce.number().int().min(1).max(10).default(5),
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

  try {
    const data = await searchKakaoPlaces({
      ...parsed.data,
      center: {
        longitude: 129.174,
        latitude: 35.159,
        radiusMeters: 20_000,
      },
    });
    return apiSuccess(data, 200, {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
