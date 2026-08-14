import "server-only";

import { searchKakaoPlacePage } from "@/lib/kakao/local";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";
import { KakaoCollectionProviderError } from "@/lib/kakao/collection/errors";
import type { KakaoCollectionProvider } from "@/lib/kakao/collection/contracts";
import {
  ProviderHttpError,
  ProviderTimeoutError,
} from "@/lib/shared/errors";

export interface CreateKakaoCollectionProviderOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function createKakaoCollectionProvider(
  options: CreateKakaoCollectionProviderOptions = {},
): KakaoCollectionProvider {
  const apiKey = options.apiKey ?? getKakaoRestApiKey();

  return {
    async searchPage(input, requestOptions) {
      try {
        return await searchKakaoPlacePage(
          {
            query: input.query,
            page: input.page,
            size: input.size,
            categoryGroupCode: input.categoryGroupCode,
          },
          {
            apiKey,
            fetchImpl: options.fetchImpl,
            timeoutMs: requestOptions.timeoutMs,
          },
        );
      } catch (error) {
        if (error instanceof ProviderTimeoutError) {
          throw new KakaoCollectionProviderError("PROVIDER_TIMEOUT", true);
        }
        if (error instanceof ProviderHttpError && error.status === 429) {
          throw new KakaoCollectionProviderError(
            "RATE_LIMITED",
            true,
            error.status,
            error.retryAfterMs,
          );
        }
        if (error instanceof ProviderHttpError && error.status >= 500) {
          throw new KakaoCollectionProviderError(
            "PROVIDER_SERVER_ERROR",
            true,
            error.status,
            error.retryAfterMs,
          );
        }
        throw new KakaoCollectionProviderError(
          "PROVIDER_ERROR",
          false,
          error instanceof ProviderHttpError ? error.status : undefined,
        );
      }
    },
  };
}
