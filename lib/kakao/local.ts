import "server-only";

import { z } from "zod";
import { getKakaoRestApiKey } from "@/lib/kakao/server-config";
import { ProviderResponseError } from "@/lib/shared/errors";
import type {
  KakaoGeocodeResult,
  KakaoPlaceSearchResult,
} from "@/types/kakao";

const kakaoMetaSchema = z.object({
  total_count: z.number().int().nonnegative(),
  pageable_count: z.number().int().nonnegative(),
  is_end: z.boolean(),
});

const keywordResponseSchema = z.object({
  meta: kakaoMetaSchema,
  documents: z.array(
    z.object({
      id: z.string(),
      place_name: z.string(),
      category_name: z.string(),
      phone: z.string(),
      address_name: z.string(),
      road_address_name: z.string(),
      place_url: z.string(),
      distance: z.string(),
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

interface KakaoLocalRequestOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function finiteNumber(value: string, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ProviderResponseError(`카카오 Local API의 ${field} 값이 올바르지 않습니다.`);
  }
  return number;
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
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
  } catch {
    throw new ProviderResponseError(
      "카카오 Local API가 제한 시간 안에 응답하지 않았습니다.",
    );
  }

  if (!response.ok) {
    throw new ProviderResponseError(
      `카카오 Local API 요청이 ${response.status} 상태로 실패했습니다.`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderResponseError("카카오 Local API 응답을 읽을 수 없습니다.");
  }
}

export async function searchKakaoPlaces(
  input: {
    query: string;
    page: number;
    size: number;
    center?: { longitude: number; latitude: number; radiusMeters: number };
  },
  options: KakaoLocalRequestOptions = {},
): Promise<KakaoPlaceSearchResult[]> {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", input.query);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("size", String(input.size));
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

  return parsed.data.documents.map((document) => ({
    id: document.id,
    name: document.place_name,
    address: document.address_name,
    roadAddress: optionalText(document.road_address_name),
    categoryName: optionalText(document.category_name),
    phone: optionalText(document.phone),
    placeUrl: optionalText(document.place_url),
    distanceMeters: optionalText(document.distance)
      ? finiteNumber(document.distance, "거리")
      : undefined,
    coordinates: {
      longitude: finiteNumber(document.x, "경도"),
      latitude: finiteNumber(document.y, "위도"),
    },
  }));
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
