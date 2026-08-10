import "server-only";

import {
  getTourApiConfig,
  validateTourApiBaseUrl,
  type TourApiConfig,
} from "@/lib/tour-api/config";
import { TourProviderError } from "@/lib/tour-api/errors";
import { parseTourResponse } from "@/lib/tour-api/parser";
import type { ParsedTourResponse } from "@/lib/tour-api/schemas";
import type { TourOperationName } from "@/types/place";

const IMPLEMENTED_OPERATIONS = new Set<TourOperationName>([
  "areaBasedList2",
  "detailCommon2",
  "detailIntro2",
  "detailPetTour2",
]);

export interface TourApiClientOptions {
  config?: TourApiConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  transientRetryCount?: 0 | 1;
}

export function encodeServiceKeyExactlyOnce(serviceKey: string): string {
  return serviceKey.replace(
    /%[0-9a-fA-F]{2}|[A-Za-z0-9\-._~]|./gu,
    (token) =>
      /^%[0-9a-fA-F]{2}$/.test(token) || /^[A-Za-z0-9\-._~]$/.test(token)
        ? token
        : encodeURIComponent(token),
  );
}

export function buildTourRequestUrl(
  config: TourApiConfig,
  operation: TourOperationName,
  params: Record<string, string>,
): URL {
  const baseUrl = validateTourApiBaseUrl(config.baseUrl);
  if (!IMPLEMENTED_OPERATIONS.has(operation)) {
    throw new TourProviderError(
      "INVALID_OPERATION",
      "지원하지 않는 한국관광공사 API 작업입니다.",
      { operation },
    );
  }
  if (Object.keys(params).some((name) => name.toLowerCase() === "servicekey")) {
    throw new TourProviderError(
      "INVALID_REQUEST",
      "서비스 키는 요청 매개변수로 전달할 수 없습니다.",
      { operation },
    );
  }

  const query = new URLSearchParams({
    MobileOS: config.mobileOs,
    MobileApp: config.mobileApp,
    _type: "json",
  });
  for (const [name, value] of Object.entries(params)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      throw new TourProviderError(
        "INVALID_REQUEST",
        "관광 API 요청 매개변수 이름이 올바르지 않습니다.",
        { operation },
      );
    }
    query.set(name, value);
  }

  const encodedServiceKey = encodeServiceKeyExactlyOnce(config.serviceKey);
  return new URL(
    `${baseUrl}/${operation}?serviceKey=${encodedServiceKey}&${query.toString()}`,
  );
}

function httpProviderError(status: number, operation: string): TourProviderError {
  if (status === 401) {
    return new TourProviderError(
      "AUTHENTICATION",
      "한국관광공사 API 인증에 실패했습니다.",
      { operation },
    );
  }
  if (status === 403) {
    return new TourProviderError(
      "FORBIDDEN",
      "한국관광공사 API 접근 권한이 없습니다.",
      { operation },
    );
  }
  if (status === 429) {
    return new TourProviderError(
      "QUOTA_EXHAUSTED",
      "한국관광공사 API 호출 한도가 소진되었습니다.",
      { operation },
    );
  }
  return new TourProviderError(
    "UPSTREAM",
    `한국관광공사 API 요청이 ${status} 상태로 실패했습니다.`,
    { operation, retryable: status >= 500 },
  );
}

export class TourApiClient {
  private readonly config: TourApiConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly transientRetryCount: 0 | 1;

  constructor(options: TourApiClientOptions = {}) {
    this.config = options.config ?? getTourApiConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.transientRetryCount = options.transientRetryCount ?? 1;
  }

  async request(
    operation: TourOperationName,
    params: Record<string, string>,
  ): Promise<ParsedTourResponse> {
    const url = buildTourRequestUrl(this.config, operation, params);
    const attempts = this.transientRetryCount + 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status >= 500 && attempt + 1 < attempts) continue;
          throw httpProviderError(response.status, operation);
        }

        return parseTourResponse(await response.text(), operation);
      } catch (error) {
        if (error instanceof TourProviderError) throw error;
        if (
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          throw new TourProviderError(
            "TIMEOUT",
            "한국관광공사 API 응답 시간이 초과되었습니다.",
            { operation, retryable: true, cause: error },
          );
        }
        throw new TourProviderError(
          "UPSTREAM",
          "한국관광공사 API에 연결하지 못했습니다.",
          { operation, retryable: true, cause: error },
        );
      }
    }

    throw new TourProviderError(
      "UPSTREAM",
      "한국관광공사 API 요청을 완료하지 못했습니다.",
      { operation, retryable: true },
    );
  }
}

let defaultClient: TourApiClient | undefined;

export function getDefaultTourApiClient(): TourApiClient {
  defaultClient ??= new TourApiClient();
  return defaultClient;
}
