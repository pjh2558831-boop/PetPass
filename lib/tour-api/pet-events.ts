import "server-only";
import { encodeServiceKeyExactlyOnce } from "@/lib/tour-api/client";
import { parseTourResponse } from "@/lib/tour-api/parser";
import { TourRequestCache } from "@/lib/tour-api/cache";
import { TourProviderError } from "@/lib/tour-api/errors";
import { contentRequest } from "@/lib/homepage/content-request";
import { eventStatus, kstToday, offsetDate, selectEvents } from "@/lib/homepage/pet-content";
import type { TourItem } from "@/lib/tour-api/schemas";
import type { ContentFeed, PetEventItem } from "@/types/pet-content";

export async function fetchPetEvents(environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch, now = new Date()) {
  if (!environment.TOUR_API_SERVICE_KEY?.trim()) throw new TourProviderError("CONFIGURATION", "행사 설정 필요");
  const today = kstToday(now);
  const windowStart = offsetDate(today, -30);
  const windowEnd = offsetDate(today, 90);
  const signal = AbortSignal.timeout(20000);
  const items: TourItem[] = [];
  let requests = 0;
  let coverageLimited = true;
  for (let pageNo = 1; pageNo <= 8; pageNo++) {
    const query = new URLSearchParams({ MobileOS: "ETC", MobileApp: "PetPass", _type: "json", numOfRows: "100", pageNo: String(pageNo), arrange: "A", eventStartDate: windowStart.replaceAll("-", ""), eventEndDate: windowEnd.replaceAll("-", "") });
    const url = new URL(`https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${encodeServiceKeyExactlyOnce(environment.TOUR_API_SERVICE_KEY)}&${query}`);
    requests++;
    const response = await contentRequest(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) }, fetcher);
    const parsed = parseTourResponse(await response.text(), "searchFestival2");
    if (parsed.pageNo !== pageNo || parsed.items.length > 100 || parsed.totalCount < items.length + parsed.items.length) throw new TourProviderError("INVALID_RESPONSE", "행사 페이지 응답 오류");
    items.push(...parsed.items);
    if (items.length >= parsed.totalCount) { coverageLimited = false; break; }
    if (parsed.items.length < 100) break;
  }
  return { items: selectEvents(items, today, now.toISOString()), coverageLimited, requests, windowStart, windowEnd };
}

const cache = new TourRequestCache();
let blockedUntil = 0;

export async function getPetEventFeed(): Promise<ContentFeed<PetEventItem>> {
  const now = new Date();
  if (Date.now() < blockedUntil) return { state: "unavailable", items: [] };
  try {
    // ponytail: process-local cache; shared storage only if multi-instance traffic requires it.
    const result = await cache.getOrLoad("pet-events-v1", 6 * 60 * 60 * 1000, () => fetchPetEvents());
    const today = kstToday(now);
    const items = result.items.flatMap(item => {
      const status = eventStatus(item.startDate, item.endDate, today);
      return status ? [{ ...item, status }] : [];
    }).slice(0, 3);
    return { state: items.length ? "ready" : "empty", items, coverageLimited: result.coverageLimited };
  } catch (error) {
    const code = error instanceof TourProviderError ? error.code : error instanceof Error && /TimeoutError|AbortError/.test(error.name) ? "TIMEOUT" : "INVALID_RESPONSE";
    // No automatic retries, including Retry-After responses; defer for six hours.
    blockedUntil = Date.now() + 6 * 60 * 60 * 1000;
    if (error && typeof error === "object" && "retryAt" in error && typeof error.retryAt === "number" && Number.isFinite(error.retryAt)) blockedUntil = Math.max(blockedUntil, error.retryAt);
    console.warn("[pet-events]", { category: code });
    return { state: "unavailable", items: [] };
  }
}
