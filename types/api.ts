export interface ApiError {
  code:
    | "CONFIGURATION_REQUIRED"
    | "UPSTREAM_ERROR"
    | "INVALID_RESPONSE"
    | "INVALID_REQUEST"
    | "RATE_LIMITED";
  message: string;
  retryable: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: ApiError; requestId: string };
