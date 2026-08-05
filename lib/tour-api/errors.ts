import "server-only";

import { apiFailure } from "@/lib/shared/api-response";

export type TourProviderErrorCode =
  | "CONFIGURATION"
  | "INVALID_OPERATION"
  | "INVALID_REQUEST"
  | "AUTHENTICATION"
  | "FORBIDDEN"
  | "QUOTA_EXHAUSTED"
  | "TIMEOUT"
  | "UPSTREAM"
  | "INVALID_RESPONSE"
  | "PROVIDER_REJECTED"
  | "NOT_FOUND";

export class TourProviderError extends Error {
  readonly code: TourProviderErrorCode;
  readonly retryable: boolean;
  readonly operation?: string;

  constructor(
    code: TourProviderErrorCode,
    message: string,
    options: { retryable?: boolean; operation?: string; cause?: unknown } = {},
  ) {
    super(redactTourCredentials(message), { cause: options.cause });
    this.name = "TourProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.operation = options.operation;
  }
}

export function redactTourCredentials(message: string): string {
  return message
    .replace(
      /\b(serviceKey|TOUR_API_SERVICE_KEY)\s*[:=]\s*[^\s&]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/([?&](?:serviceKey|key)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[REDACTED_URL]";
      }
    });
}

export function providerResultError(
  resultCode: string,
  resultMessage: string,
  operation: string,
): TourProviderError {
  const diagnostic = `${resultCode} ${resultMessage}`.toLowerCase();
  if (/service.?key|unauthor|authentication|등록되지|인증/.test(diagnostic)) {
    return new TourProviderError(
      "AUTHENTICATION",
      "한국관광공사 API 인증에 실패했습니다.",
      { operation },
    );
  }
  if (/forbidden|access.?denied|권한/.test(diagnostic)) {
    return new TourProviderError(
      "FORBIDDEN",
      "한국관광공사 API 접근 권한이 없습니다.",
      { operation },
    );
  }
  if (/quota|limit|exceed|할당|횟수|트래픽/.test(diagnostic)) {
    return new TourProviderError(
      "QUOTA_EXHAUSTED",
      "한국관광공사 API 호출 한도가 소진되었습니다.",
      { operation },
    );
  }
  return new TourProviderError(
    "PROVIDER_REJECTED",
    "한국관광공사 API가 요청을 처리하지 못했습니다.",
    { operation },
  );
}

export function tourProviderErrorResponse(error: unknown): Response {
  if (!(error instanceof TourProviderError)) {
    return apiFailure(
      {
        code: "UPSTREAM_ERROR",
        message: "관광 데이터를 가져오지 못했습니다.",
        retryable: true,
      },
      502,
    );
  }

  const mappings = {
    CONFIGURATION: ["CONFIGURATION_REQUIRED", 503],
    INVALID_OPERATION: ["INVALID_REQUEST", 400],
    INVALID_REQUEST: ["INVALID_REQUEST", 400],
    AUTHENTICATION: ["UPSTREAM_AUTHENTICATION", 502],
    FORBIDDEN: ["UPSTREAM_FORBIDDEN", 502],
    QUOTA_EXHAUSTED: ["UPSTREAM_QUOTA", 503],
    TIMEOUT: ["UPSTREAM_TIMEOUT", 504],
    UPSTREAM: ["UPSTREAM_ERROR", 502],
    INVALID_RESPONSE: ["INVALID_RESPONSE", 502],
    PROVIDER_REJECTED: ["UPSTREAM_ERROR", 502],
    NOT_FOUND: ["NOT_FOUND", 404],
  } as const;
  const [code, status] = mappings[error.code];
  return apiFailure(
    { code, message: error.message, retryable: error.retryable },
    status,
  );
}
