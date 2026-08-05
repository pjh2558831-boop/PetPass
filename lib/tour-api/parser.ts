import "server-only";

import { providerResultError, TourProviderError } from "@/lib/tour-api/errors";
import {
  tourEnvelopeSchema,
  tourItemSchema,
  type ParsedTourResponse,
  type TourItem,
} from "@/lib/tour-api/schemas";

const SUCCESS_CODES = new Set(["0", "00", "0000"]);

function toNonNegativeInteger(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function normalizeItems(value: unknown, operation: string): TourItem[] {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value) && value.length === 0) return [];
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "한국관광공사 API 응답의 항목 형식이 올바르지 않습니다.",
      { operation },
    );
  }

  const itemValue = (value as { item?: unknown }).item;
  if (itemValue === undefined || itemValue === null || itemValue === "") return [];
  const candidates = Array.isArray(itemValue) ? itemValue : [itemValue];
  const parsed: TourItem[] = [];
  for (const candidate of candidates) {
    const result = tourItemSchema.safeParse(candidate);
    if (!result.success) {
      throw new TourProviderError(
        "INVALID_RESPONSE",
        "한국관광공사 API 응답 항목을 검증하지 못했습니다.",
        { operation },
      );
    }
    parsed.push(result.data);
  }
  return parsed;
}

export function parseTourResponse(
  payload: string,
  operation: string,
): ParsedTourResponse {
  const trimmed = payload.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "한국관광공사 API가 예상하지 못한 응답을 반환했습니다.",
      { operation },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch (error) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "한국관광공사 API의 JSON 응답을 해석하지 못했습니다.",
      { operation, cause: error },
    );
  }

  const envelope = tourEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "한국관광공사 API 응답 계약이 올바르지 않습니다.",
      { operation },
    );
  }

  const { header, body } = envelope.data.response;
  if (!SUCCESS_CODES.has(header.resultCode)) {
    throw providerResultError(header.resultCode, header.resultMsg, operation);
  }
  if (!body) {
    throw new TourProviderError(
      "INVALID_RESPONSE",
      "한국관광공사 API 성공 응답에 본문이 없습니다.",
      { operation },
    );
  }

  return {
    items: normalizeItems(body.items, operation),
    numOfRows: toNonNegativeInteger(body.numOfRows),
    pageNo: toNonNegativeInteger(body.pageNo),
    totalCount: toNonNegativeInteger(body.totalCount),
    resultCode: header.resultCode,
  };
}
