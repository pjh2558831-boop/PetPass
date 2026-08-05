import "server-only";

import {
  LocalDataProviderError,
  localDataProviderResultError,
} from "@/lib/licenses/errors";
import {
  localDataEnvelopeSchema,
  localDataItemSchema,
  type LocalDataItem,
  type ParsedLocalDataResponse,
} from "@/lib/licenses/schemas";

const SUCCESS_CODES = new Set(["0", "00", "0000"]);

function integer(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function itemsFrom(value: unknown, dataset: string): LocalDataItem[] {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value) && value.length === 0) return [];
  if (typeof value !== "object") {
    throw new LocalDataProviderError(
      "INVALID_RESPONSE",
      "LocalData 항목 컨테이너 형식이 올바르지 않습니다.",
      { dataset },
    );
  }
  const itemValue = Array.isArray(value)
    ? value
    : (value as { item?: unknown }).item;
  if (itemValue === undefined || itemValue === null || itemValue === "") return [];
  const candidates = Array.isArray(itemValue) ? itemValue : [itemValue];
  return candidates.map((candidate) => {
    const parsed = localDataItemSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new LocalDataProviderError(
        "INVALID_RESPONSE",
        "LocalData 항목을 검증하지 못했습니다.",
        { dataset },
      );
    }
    return parsed.data;
  });
}

function errorFields(value: unknown): { code: string; message: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const code = record.resultCode ?? record.returnReasonCode ?? record.errorCode;
  const message = record.resultMsg ?? record.returnAuthMsg ?? record.errMsg ?? record.errorMessage;
  if (code !== undefined || message !== undefined) {
    return { code: String(code ?? "UNKNOWN"), message: String(message ?? "") };
  }
  for (const nested of Object.values(record)) {
    const found = errorFields(nested);
    if (found) return found;
  }
  return null;
}

export function parseLocalDataResponse(
  payload: string,
  dataset: string,
): ParsedLocalDataResponse {
  const trimmed = payload.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    throw new LocalDataProviderError(
      "INVALID_RESPONSE",
      "LocalData API가 JSON이 아닌 응답을 반환했습니다.",
      { dataset },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (error) {
    throw new LocalDataProviderError(
      "INVALID_RESPONSE",
      "LocalData JSON 응답을 해석하지 못했습니다.",
      { dataset, cause: error },
    );
  }

  const envelope = localDataEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    const providerError = errorFields(json);
    if (providerError) {
      throw localDataProviderResultError(
        providerError.code,
        providerError.message,
        dataset,
      );
    }
    throw new LocalDataProviderError(
      "INVALID_RESPONSE",
      "LocalData 응답 계약이 올바르지 않습니다.",
      { dataset },
    );
  }

  const { header, body } = envelope.data.response;
  if (!SUCCESS_CODES.has(header.resultCode)) {
    throw localDataProviderResultError(header.resultCode, header.resultMsg, dataset);
  }
  if (!body) {
    throw new LocalDataProviderError(
      "INVALID_RESPONSE",
      "LocalData 성공 응답에 본문이 없습니다.",
      { dataset },
    );
  }
  return {
    items: itemsFrom(body.items, dataset),
    numOfRows: integer(body.numOfRows),
    pageNo: integer(body.pageNo),
    totalCount: integer(body.totalCount),
    resultCode: header.resultCode,
  };
}
