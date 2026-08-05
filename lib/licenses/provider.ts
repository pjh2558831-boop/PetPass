import "server-only";

import { getLocalDataConfig, type LocalDataConfig } from "@/lib/licenses/config";
import { LocalDataProviderError } from "@/lib/licenses/errors";
import { parseLocalDataResponse } from "@/lib/licenses/parser";
import type { ParsedLocalDataResponse } from "@/lib/licenses/schemas";
import type { LocalDataDataset } from "@/types/license";

const CONDITION_NAMES = new Set([
  "cond[BPLC_NM::LIKE]",
  "cond[ROAD_NM_ADDR::LIKE]",
  "cond[SALS_STTS_CD::EQ]",
  "cond[DAT_UPDT_PNT::GTE]",
  "cond[DAT_UPDT_PNT::LT]",
  "cond[OPN_ATMY_GRP_CD::EQ]",
]);

const BASE_NAMES = new Set(["pageNo", "numOfRows", "returnType"]);

export interface LocalDataProviderOptions {
  config?: LocalDataConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  transientRetryCount?: 0 | 1;
}

export function encodeLocalDataServiceKeyExactlyOnce(serviceKey: string): string {
  return serviceKey.replace(
    /%[0-9a-fA-F]{2}|[A-Za-z0-9\-._~]|./gu,
    (token) =>
      /^%[0-9a-fA-F]{2}$/u.test(token) || /^[A-Za-z0-9\-._~]$/u.test(token)
        ? token
        : encodeURIComponent(token),
  );
}

export function buildLocalDataRequestUrl(
  config: LocalDataConfig,
  dataset: LocalDataDataset,
  params: Record<string, string>,
): URL {
  for (const name of Object.keys(params)) {
    if (!BASE_NAMES.has(name) && !CONDITION_NAMES.has(name)) {
      throw new LocalDataProviderError(
        "INVALID_REQUEST",
        "지원하지 않는 LocalData 요청 매개변수입니다.",
        { dataset },
      );
    }
  }
  const query = new URLSearchParams({
    pageNo: params.pageNo ?? "1",
    numOfRows: params.numOfRows ?? "20",
    returnType: "json",
  });
  for (const [name, value] of Object.entries(params)) {
    if (name !== "returnType") query.set(name, value);
  }
  const serviceKey = encodeLocalDataServiceKeyExactlyOnce(config.serviceKey);
  return new URL(
    `${config.endpoints[dataset]}?serviceKey=${serviceKey}&${query.toString()}`,
  );
}

function httpError(status: number, dataset: LocalDataDataset): LocalDataProviderError {
  if (status === 401) {
    return new LocalDataProviderError("AUTHENTICATION", "LocalData API 인증에 실패했습니다.", { dataset });
  }
  if (status === 403) {
    return new LocalDataProviderError("FORBIDDEN", "LocalData API 접근 권한이 없습니다.", { dataset });
  }
  if (status === 429) {
    return new LocalDataProviderError("QUOTA_EXHAUSTED", "LocalData API 호출 한도가 소진되었습니다.", { dataset });
  }
  return new LocalDataProviderError(
    "UPSTREAM",
    `LocalData API 요청이 ${status} 상태로 실패했습니다.`,
    { dataset, retryable: status >= 500 },
  );
}

export class LocalDataProviderClient {
  private readonly config: LocalDataConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryCount: 0 | 1;

  constructor(options: LocalDataProviderOptions = {}) {
    this.config = options.config ?? getLocalDataConfig();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.retryCount = options.transientRetryCount ?? 1;
  }

  async request(
    dataset: LocalDataDataset,
    params: Record<string, string>,
  ): Promise<ParsedLocalDataResponse> {
    const url = buildLocalDataRequestUrl(this.config, dataset, params);
    const attempts = this.retryCount + 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        });
        if (!response.ok) {
          if (response.status >= 500 && attempt + 1 < attempts) continue;
          throw httpError(response.status, dataset);
        }
        return parseLocalDataResponse(await response.text(), dataset);
      } catch (error) {
        if (error instanceof LocalDataProviderError) throw error;
        if (
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          throw new LocalDataProviderError(
            "TIMEOUT",
            "LocalData API 응답 시간이 초과되었습니다.",
            { dataset, retryable: true, cause: error },
          );
        }
        throw new LocalDataProviderError(
          "UPSTREAM",
          "LocalData API에 연결하지 못했습니다.",
          { dataset, retryable: true, cause: error },
        );
      }
    }
    throw new LocalDataProviderError(
      "UPSTREAM",
      "LocalData API 요청을 완료하지 못했습니다.",
      { dataset, retryable: true },
    );
  }
}
