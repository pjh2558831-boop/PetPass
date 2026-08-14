import "server-only";

import { z } from "zod";
import { parseKakaoPlaceUrl } from "@/lib/kakao/place-url";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";
import {
  ProviderHttpError,
  ProviderResponseError,
  ProviderTimeoutError,
} from "@/lib/shared/errors";
import type {
  KakaoGeocodeResult,
  KakaoPlaceSearchPage,
  KakaoPlaceSearchResult,
} from "@/types/kakao";

const kakaoMetaSchema = z.object({
  total_count: z.number().int().nonnegative(),
  pageable_count: z.number().int().nonnegative(),
  is_end: z.boolean(),
  same_name: z
    .object({
      region: z.array(z.string()),
      keyword: z.string(),
      selected_region: z.string(),
    })
    .optional(),
});

const keywordResponseSchema = z.object({
  meta: kakaoMetaSchema,
  documents: z.array(
    z.object({
      id: z.string(),
      place_name: z.string(),
      category_name: z.string(),
      category_group_code: z.string().optional().default(""),
      category_group_name: z.string().optional().default(""),
      phone: z.string(),
      address_name: z.string(),
      road_address_name: z.string(),
      place_url: z.string(),
      distance: z.string().optional().default(""),
      x: z.string(),
      y: z.string(),
    }),
  ),
});

const addressResponseSchema = z.object({
  meta: kakaoMetaSchema,
  documents: z.array(
    z.object({
      address_name: z.string(),
      address_type: z.string(),
      x: z.string(),
      y: z.string(),
      road_address: z
        .object({
          address_name: z.string(),
        })
        .nullable()
        .optional(),
    }),
  ),
});

export interface KakaoLocalRequestOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface KakaoKeywordSearchInput {
  query: string;
  page: number;
  size: number;
  categoryGroupCode?: string;
  rectangle?: { west: number; south: number; east: number; north: number };
  center?: { longitude: number; latitude: number; radiusMeters: number };
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalKakaoPlaceUrl(value: string): { placeUrl?: string } {
  const placeUrl = parseKakaoPlaceUrl(value);
  return placeUrl ? { placeUrl } : {};
}

function finiteNumber(value: string, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ProviderResponseError(`카카오 Local API의 ${field} 값이 올바르지 않습니다.`);
  }
  return number;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function requestKakaoLocal(
  url: URL,
  options: KakaoLocalRequestOptions,
): Promise<unknown> {
  const key = options.apiKey ?? getKakaoRestApiKey();
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Authorization: `KakaoAK ${key}`,
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 6_000),
      cache: "no-store",
    });
  } catch (error) {
    const errorName =
      typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : "";
    if (errorName === "TimeoutError" || errorName === "AbortError") {
      throw new ProviderTimeoutError(
        "카카오 Local API가 제한 시간 안에 응답하지 않았습니다.",
      );
    }
    throw new ProviderResponseError(
      "카카오 Local API 네트워크 요청에 실패했습니다.",
    );
  }

  if (!response.ok) {
    throw new ProviderHttpError(
      `카카오 Local API 요청이 ${response.status} 상태로 실패했습니다.`,
      response.status,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderResponseError("카카오 Local API 응답을 읽을 수 없습니다.");
  }
}

export async function searchKakaoPlaces(
  input: KakaoKeywordSearchInput,
  options: KakaoLocalRequestOptions = {},
): Promise<KakaoPlaceSearchResult[]> {
  return (await searchKakaoPlacePage(input, options)).results;
}

export async function searchKakaoPlacePage(
  input: KakaoKeywordSearchInput,
  options: KakaoLocalRequestOptions = {},
): Promise<KakaoPlaceSearchPage> {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", input.query);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("size", String(input.size));
  if (input.categoryGroupCode) {
    url.searchParams.set("category_group_code", input.categoryGroupCode);
  }
  if (input.rectangle) {
    url.searchParams.set(
      "rect",
      [
        input.rectangle.west,
        input.rectangle.south,
        input.rectangle.east,
        input.rectangle.north,
      ].join(","),
    );
  }
  if (input.center) {
    url.searchParams.set("x", String(input.center.longitude));
    url.searchParams.set("y", String(input.center.latitude));
    url.searchParams.set("radius", String(input.center.radiusMeters));
    url.searchParams.set("sort", "distance");
  }

  const parsed = keywordResponseSchema.safeParse(
    await requestKakaoLocal(url, options),
  );
  if (!parsed.success) {
    throw new ProviderResponseError("카카오 장소 검색 응답 형식이 올바르지 않습니다.");
  }

  return {
    results: parsed.data.documents.map((document) => ({
      id: document.id,
      name: document.place_name,
      address: document.address_name,
      roadAddress: optionalText(document.road_address_name),
      categoryName: optionalText(document.category_name),
      categoryGroupCode: optionalText(document.category_group_code),
      categoryGroupName: optionalText(document.category_group_name),
      phone: optionalText(document.phone),
      ...optionalKakaoPlaceUrl(document.place_url),
      distanceMeters: optionalText(document.distance)
        ? finiteNumber(document.distance, "거리")
        : undefined,
      coordinates: {
        longitude: finiteNumber(document.x, "경도"),
        latitude: finiteNumber(document.y, "위도"),
      },
    })),
    totalCount: parsed.data.meta.total_count,
    pageableCount: parsed.data.meta.pageable_count,
    isEnd: parsed.data.meta.is_end,
    ...(parsed.data.meta.same_name
      ? {
          sameName: {
            region: parsed.data.meta.same_name.region,
            keyword: parsed.data.meta.same_name.keyword,
            selectedRegion: parsed.data.meta.same_name.selected_region,
          },
        }
      : {}),
  };
}

export async function geocodeAddress(
  address: string,
  size = 5,
  options: KakaoLocalRequestOptions = {},
): Promise<KakaoGeocodeResult[]> {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", address);
  url.searchParams.set("page", "1");
  url.searchParams.set("size", String(size));

  const parsed = addressResponseSchema.safeParse(
    await requestKakaoLocal(url, options),
  );
  if (!parsed.success) {
    throw new ProviderResponseError("카카오 주소 검색 응답 형식이 올바르지 않습니다.");
  }

  return parsed.data.documents.map((document) => ({
    address: document.address_name,
    addressType: document.address_type,
    roadAddress: document.road_address?.address_name,
    coordinates: {
      longitude: finiteNumber(document.x, "경도"),
      latitude: finiteNumber(document.y, "위도"),
    },
  }));
}
