export type CollectionErrorCode =
  | "REQUEST_CAP_EXCEEDED"
  | "RATE_LIMITED"
  | "PROVIDER_SERVER_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_ERROR"
  | "CLASSIFICATION_ERROR"
  | "SUPABASE_ERROR"
  | "INVALID_CONFIGURATION";

export class CollectionPlanLimitError extends Error {
  readonly code = "REQUEST_CAP_EXCEEDED" as const;

  constructor(
    readonly plannedRequests: number,
    readonly requestCap: number,
  ) {
    super("수집 계획이 물리적 요청 상한을 초과합니다.");
    this.name = "CollectionPlanLimitError";
  }
}

export class CollectionRequestCapError extends Error {
  readonly code = "REQUEST_CAP_EXCEEDED" as const;

  constructor(readonly requestCap: number) {
    super("수집 실행이 물리적 요청 상한에 도달했습니다.");
    this.name = "CollectionRequestCapError";
  }
}

export class KakaoCollectionProviderError extends Error {
  constructor(
    readonly code: Exclude<
      CollectionErrorCode,
      "REQUEST_CAP_EXCEEDED" | "SUPABASE_ERROR" | "INVALID_CONFIGURATION"
    >,
    readonly retryable: boolean,
    readonly status?: number,
    readonly retryAfterMs?: number | null,
  ) {
    super("Kakao Local 요청을 완료하지 못했습니다.");
    this.name = "KakaoCollectionProviderError";
  }
}

export class CollectionConfigurationError extends Error {
  readonly code = "INVALID_CONFIGURATION" as const;

  constructor(message: string) {
    super(message);
    this.name = "CollectionConfigurationError";
  }
}

export class CollectionClassificationError extends Error {
  readonly code = "CLASSIFICATION_ERROR" as const;

  constructor() {
    super("Kakao 수집 결과 분류 계약을 만족하지 못했습니다.");
    this.name = "CollectionClassificationError";
  }
}

export class CollectionRepositoryError extends Error {
  readonly code = "SUPABASE_ERROR" as const;

  constructor() {
    super("Supabase 수집 저장소 작업을 완료하지 못했습니다.");
    this.name = "CollectionRepositoryError";
  }
}

export function collectionErrorCode(error: unknown): CollectionErrorCode {
  if (
    error instanceof CollectionRequestCapError ||
    error instanceof CollectionPlanLimitError
  ) {
    return "REQUEST_CAP_EXCEEDED";
  }
  if (error instanceof KakaoCollectionProviderError) return error.code;
  if (error instanceof CollectionClassificationError) {
    return "CLASSIFICATION_ERROR";
  }
  if (error instanceof CollectionRepositoryError) return "SUPABASE_ERROR";
  if (
    error instanceof CollectionConfigurationError ||
    (error instanceof Error && /environment|환경변수/iu.test(error.message))
  ) {
    return "INVALID_CONFIGURATION";
  }
  return "PROVIDER_ERROR";
}

export function isRetryableCollectionError(error: unknown): boolean {
  return (
    error instanceof KakaoCollectionProviderError && error.retryable === true
  );
}
