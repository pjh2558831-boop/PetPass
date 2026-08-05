import "server-only";

export type LocalDataProviderErrorCode =
  | "CONFIGURATION"
  | "INVALID_REQUEST"
  | "AUTHENTICATION"
  | "FORBIDDEN"
  | "QUOTA_EXHAUSTED"
  | "TIMEOUT"
  | "UPSTREAM"
  | "INVALID_RESPONSE"
  | "PROVIDER_REJECTED";

export class LocalDataProviderError extends Error {
  readonly code: LocalDataProviderErrorCode;
  readonly retryable: boolean;
  readonly dataset?: string;

  constructor(
    code: LocalDataProviderErrorCode,
    message: string,
    options: { retryable?: boolean; dataset?: string; cause?: unknown } = {},
  ) {
    super(redactLocalDataCredentials(message), { cause: options.cause });
    this.name = "LocalDataProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.dataset = options.dataset;
  }
}

export function redactLocalDataCredentials(message: string): string {
  return message
    .replace(
      /\b(serviceKey|LOCALDATA_SERVICE_KEY)\s*[:=]\s*[^\s&]+/giu,
      "$1=[REDACTED]",
    )
    .replace(/([?&](?:serviceKey|key)=)[^&#\s]*/giu, "$1[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/giu, (value) => {
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[REDACTED_URL]";
      }
    });
}

export function localDataProviderResultError(
  resultCode: string,
  resultMessage: string,
  dataset: string,
): LocalDataProviderError {
  const diagnostic = `${resultCode} ${resultMessage}`.toLowerCase();
  if (/service.?key|unauthor|authentication|등록되지|인증/u.test(diagnostic)) {
    return new LocalDataProviderError(
      "AUTHENTICATION",
      "LocalData API 인증에 실패했습니다.",
      { dataset },
    );
  }
  if (/forbidden|access.?denied|권한/u.test(diagnostic)) {
    return new LocalDataProviderError(
      "FORBIDDEN",
      "LocalData API 접근 권한이 없습니다.",
      { dataset },
    );
  }
  if (/quota|limit|exceed|할당|횟수|트래픽/u.test(diagnostic)) {
    return new LocalDataProviderError(
      "QUOTA_EXHAUSTED",
      "LocalData API 호출 한도가 소진되었습니다.",
      { dataset },
    );
  }
  return new LocalDataProviderError(
    "PROVIDER_REJECTED",
    "LocalData API가 요청을 처리하지 못했습니다.",
    { dataset },
  );
}
