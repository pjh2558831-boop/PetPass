import "server-only";

import { getKakaoRestApiKey } from "@/lib/kakao/server-config";

const STATIC_MAP_ENDPOINT = "https://dapi.kakao.com/v2/maps/staticmap";
const MAX_RESPONSE_BYTES = 2_000_000;

export function staticMapThumbnailsEnabled(): boolean {
  return process.env.KAKAO_STATIC_MAP_THUMBNAILS_ENABLED?.trim().toLowerCase() === "true";
}

export async function fetchKakaoStaticMap(
  coordinates: { latitude: number; longitude: number },
  dependencies: { fetchImpl?: typeof fetch; apiKey?: string } = {},
): Promise<{ body: ArrayBuffer; contentType: "image/png" | "image/jpeg" }> {
  const url = new URL(STATIC_MAP_ENDPOINT);
  const coordinate = `${coordinates.longitude},${coordinates.latitude}`;
  url.searchParams.set("center", coordinate);
  url.searchParams.set("markers", `location:${coordinate}|option:false`);
  url.searchParams.set("size", "360x220");
  url.searchParams.set("format", "png");
  url.searchParams.set("logo_pos", "BOTTOM_RIGHT");
  url.searchParams.set("scale", "1");
  url.searchParams.set("lv", "5");
  const response = await (dependencies.fetchImpl ?? fetch)(url, {
    headers: { Authorization: `KakaoAK ${dependencies.apiKey ?? getKakaoRestApiKey()}` },
    signal: AbortSignal.timeout(8_000),
  });
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (!response.ok || (contentType !== "image/png" && contentType !== "image/jpeg")) {
    throw new Error("Kakao 위치 미리보기를 불러오지 못했습니다.");
  }
  const body = await response.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("Kakao 위치 미리보기 응답 크기가 올바르지 않습니다.");
  }
  return { body, contentType };
}
