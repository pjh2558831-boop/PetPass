import { recommendationFailure, recommendationHttpStatus } from "@/lib/recommendation/recommendation-errors";
import {
  manualRouteValidationRequestSchema,
} from "@/lib/recommendation/recommendation-response";
import { validateManualRoute } from "@/lib/recommendation/recommendation-service";
import {
  consumeRateLimit,
  getRequestClientId,
  rateLimitHeaders,
} from "@/lib/shared/rate-limit";

export async function POST(request: Request): Promise<Response> {
  if (process.env.ROUTE_ENGINE_V1_ENABLED !== "true") {
    const failure = recommendationFailure("route_engine_disabled", [
      "route_engine_v1_feature_flag_disabled",
    ]);
    return Response.json(failure, {
      status: recommendationHttpStatus(failure.status),
      headers: { "Cache-Control": "no-store" },
    });
  }
  const limit = consumeRateLimit(
    "route-recommendation-revalidate-v1",
    getRequestClientId(request),
    { limit: 20, windowMs: 60_000 },
  );
  if (!limit.allowed) {
    const failure = recommendationFailure("rate_limited", [
      "manual_route_revalidation_rate_limit_exceeded",
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
    body = null;
  }
  const parsed = manualRouteValidationRequestSchema.safeParse(body);
  if (!parsed.success) {
    const failure = recommendationFailure("invalid_request", [
      "manual_route_validation_schema_invalid",
    ]);
    return Response.json(failure, {
      status: recommendationHttpStatus(failure.status),
      headers: { "Cache-Control": "no-store" },
    });
  }
  const result = await validateManualRoute(
    parsed.data.editSessionId,
    parsed.data.orderedPlaceIds,
    { signal: request.signal },
    parsed.data.conditionAnswers,
    parsed.data.applyScheduleProposal,
  );
  return Response.json(result, {
    status:
      result.status === "ready"
        ? 200
        : recommendationHttpStatus(result.status),
    headers: { "Cache-Control": "no-store" },
  });
}
