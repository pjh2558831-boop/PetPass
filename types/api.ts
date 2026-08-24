export interface ApiError {
  code:
    | "CONFIGURATION_REQUIRED"
    | "UPSTREAM_ERROR"
    | "UPSTREAM_TIMEOUT"
    | "UPSTREAM_AUTHENTICATION"
    | "UPSTREAM_FORBIDDEN"
    | "UPSTREAM_QUOTA"
    | "INVALID_RESPONSE"
    | "INVALID_REQUEST"
    | "REGION_NOT_ENABLED_FOR_MAP"
    | "RATE_LIMITED"
    | "NOT_FOUND";
  message: string;
  retryable: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: ApiError; requestId: string };
