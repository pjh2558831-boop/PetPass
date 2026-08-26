import "server-only";

export type KtoCatalogCollectionErrorCode =
  | "CONFIGURATION"
  | "PROVIDER_FAILURE"
  | "SUSPICIOUS_EMPTY_RESULT"
  | "INCOMPLETE_PAGINATION"
  | "INVALID_PROVIDER_RESULT"
  | "DATABASE_FAILURE";

export class KtoCatalogCollectionError extends Error {
  readonly name = "KtoCatalogCollectionError";

  constructor(
    readonly code: KtoCatalogCollectionErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export function collectionErrorCode(error: unknown): KtoCatalogCollectionErrorCode {
  return error instanceof KtoCatalogCollectionError ? error.code : "PROVIDER_FAILURE";
}

export { KtoCatalogCollectionError as JejuKtoCollectionError };
export type JejuKtoCollectionErrorCode = KtoCatalogCollectionErrorCode;
