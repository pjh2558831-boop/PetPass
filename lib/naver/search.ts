import "server-only";
import { TourRequestCache } from "@/lib/tour-api/cache";
import { TourProviderError } from "@/lib/tour-api/errors";
import { contentRequest } from "@/lib/homepage/content-request";

const cache = new TourRequestCache();
const blockedUntil = new Map<string, number>();

export async function naverSearch(kind: "news" | "webkr" | "image", params: Record<string, string>, environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): Promise<unknown> {
  const id = environment.NAVER_API_HUB_ACCESS_KEY_ID?.trim();
  const secret = environment.NAVER_API_HUB_SECRET_KEY?.trim();
  if (!id || !secret) throw new TourProviderError("CONFIGURATION", "네이버 검색 설정 필요");
  const url = new URL(`https://naverapihub.apigw.ntruss.com/search/v1/${kind}`);
  url.search = new URLSearchParams({ ...params, start: "1", format: "json" }).toString();
  const load = async () => {
    const response = await contentRequest(url, { headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }, signal: AbortSignal.timeout(6000) }, fetcher);
    try { return await response.json() as unknown; }
    catch { throw new TourProviderError("INVALID_RESPONSE", "네이버 검색 JSON 응답 오류"); }
  };
  // ponytail: process-local cache; shared storage only if multi-instance traffic requires it.
  if (environment !== process.env || fetcher !== fetch) return load();
  if (Date.now() < (blockedUntil.get(kind) ?? 0)) throw new TourProviderError("UPSTREAM", "검색 재시도 대기 중");
  try { return await cache.getOrLoad(url.href, 5 * 60 * 1000, load); }
  catch (error) {
    let retryAt = Date.now() + 60000;
    if (error && typeof error === "object" && "retryAt" in error && typeof error.retryAt === "number" && Number.isFinite(error.retryAt)) retryAt = Math.max(retryAt, error.retryAt);
    blockedUntil.set(kind, retryAt);
    throw error;
  }
}
