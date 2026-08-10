import { ConfigurationRequiredError, ProviderResponseError } from "@/lib/shared/errors";
import type { ApiError, ApiResult } from "@/types/api";

export function apiSuccess<T>(
  data: T,
  status = 200,
  headers?: HeadersInit,
): Response {
  const result: ApiResult<T> = {
    ok: true,
    data,
    requestId: crypto.randomUUID(),
  };
  return Response.json(result, { status, headers });
}

export function apiFailure(
  error: ApiError,
  status: number,
  headers?: HeadersInit,
): Response {
  const result: ApiResult<never> = {
    ok: false,
    error,
    requestId: crypto.randomUUID(),
  };
  return Response.json(result, { status, headers });
}

export function providerErrorResponse(
  error: unknown,
  headers?: HeadersInit,
): Response {
  if (error instanceof ConfigurationRequiredError) {
    return apiFailure(
      {
        code: "CONFIGURATION_REQUIRED",
        message: error.message,
        retryable: false,
      },
      503,
      headers,
    );
  }

  if (error instanceof ProviderResponseError) {
    return apiFailure(
      {
        code: "UPSTREAM_ERROR",
        message: error.message,
        retryable: true,
      },
      502,
      headers,
    );
  }

  return apiFailure(
    {
      code: "UPSTREAM_ERROR",
      message: "외부 데이터 제공자 요청을 처리하지 못했습니다.",
      retryable: true,
    },
    502,
    headers,
  );
}
