import "server-only";

export type JejuKtoCollectionErrorCode =
  | "CONFIGURATION"
  | "PROVIDER_FAILURE"
  | "SUSPICIOUS_EMPTY_RESULT"
  | "INCOMPLETE_PAGINATION"
  | "INVALID_PROVIDER_RESULT"
  | "DATABASE_FAILURE";

export class JejuKtoCollectionError extends Error {
  readonly name = "JejuKtoCollectionError";

  constructor(
    readonly code: JejuKtoCollectionErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function collectionErrorCode(error: unknown): JejuKtoCollectionErrorCode {
  return error instanceof JejuKtoCollectionError ? error.code : "PROVIDER_FAILURE";
}
