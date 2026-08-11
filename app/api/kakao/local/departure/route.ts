import { z } from "zod";
import { searchDepartureLocations } from "@/lib/kakao/departure";
import { apiFailure, apiSuccess, providerErrorResponse } from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";

const querySchema = z.object({
  query: z.string().trim().min(2).max(100),
  size: z.coerce.number().int().min(1).max(8).default(5),
});

function noStoreHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  result.set("Cache-Control", "no-store");
  return result;
}

export async function GET(request: Request) {
  const rateLimit = consumeRateLimit(
    "kakao-local-departure",
    getRequestClientId(request),
    { limit: 30, windowMs: 60_000 },
  );
  if (!rateLimit.allowed) {
    return apiFailure(
      {
        code: "RATE_LIMITED",
        message: "출발지 검색 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        retryable: true,
      },
      429,
      noStoreHeaders(rateLimitHeaders(rateLimit)),
    );
  }

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    query: params.get("query"),
    size: params.get("size") ?? undefined,
  });
  if (!parsed.success) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "두 글자 이상의 장소명 또는 주소가 필요합니다.",
        retryable: false,
      },
      400,
      noStoreHeaders(),
    );
  }

  try {
    return apiSuccess(
      await searchDepartureLocations(parsed.data.query, parsed.data.size),
      200,
      noStoreHeaders(),
    );
  } catch (error) {
    return providerErrorResponse(error, noStoreHeaders());
  }
}
