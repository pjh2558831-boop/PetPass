import { z } from "zod";
import { getDirections } from "@/lib/kakao/directions";
import {
  apiFailure,
  apiSuccess,
  providerErrorResponse,
} from "@/lib/shared/api-response";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";

const pointSchema = z.object({
  name: z.string().trim().min(1).max(80),
  x: z.number().finite().min(-180).max(180),
  y: z.number().finite().min(-90).max(90),
});

const requestSchema = z.object({
  origin: pointSchema,
  destination: pointSchema,
  waypoints: z.array(pointSchema).max(5).default([]),
});

function isSamePoint(
  left: z.infer<typeof pointSchema>,
  right: z.infer<typeof pointSchema>,
): boolean {
  return left.x === right.x && left.y === right.y;
}

export async function POST(request: Request) {
  const rateLimit = consumeRateLimit(
    "kakao-directions",
    getRequestClientId(request),
    { limit: 15, windowMs: 60_000 },
  );
  if (!rateLimit.allowed) {
    return apiFailure(
      {
        code: "RATE_LIMITED",
        message: "길찾기 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
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
        message: "길찾기 요청 본문은 올바른 JSON이어야 합니다.",
        retryable: false,
      },
      400,
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message:
          "출발지, 도착지와 최대 5개의 경유지에 유효한 좌표가 필요합니다.",
        retryable: false,
      },
      400,
    );
  }

  if (isSamePoint(parsed.data.origin, parsed.data.destination)) {
    return apiFailure(
      {
        code: "INVALID_REQUEST",
        message: "출발지와 도착지는 서로 달라야 합니다.",
        retryable: false,
      },
      400,
    );
  }

  try {
    return apiSuccess(await getDirections(parsed.data), 200, {
      "Cache-Control": "no-store",
    });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
