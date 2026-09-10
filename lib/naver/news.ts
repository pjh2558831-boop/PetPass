import "server-only";
import { z } from "zod";
import { decodeHTML } from "entities";
import { TourProviderError } from "@/lib/tour-api/errors";
import { safeContentUrl } from "@/lib/homepage/pet-content";
import { naverSearch } from "./search";
import type { ContentFeed, PetNewsItem } from "@/types/pet-content";

const newsSchema = z.object({ items: z.array(z.object({
  title: z.string(), originallink: z.string().optional(), link: z.string().optional(), pubDate: z.string().optional(),
})).max(100) });

export function normalizeNews(input: unknown): PetNewsItem[] {
  const parsed = newsSchema.safeParse(input);
  if (!parsed.success) throw new TourProviderError("INVALID_RESPONSE", "뉴스 응답 계약 오류");
  const seenUrls = new Set<string>();
  const seenTitles: Array<{ key: string; topics: Set<string> }> = [];
  return parsed.data.items.flatMap((item, index) => {
    const originalUrl = safeContentUrl(item.originallink) ?? safeContentUrl(item.link);
    const title = decodeHTML(item.title.replace(/<[^>]*>/g, "")).trim();
    if (!originalUrl || !/반려\s*(?:동물|견|묘)|강아지|고양이|유기견|유기묘|유기동물|애완동물|애견|애묘|펫(?:푸드|보험|페어|팸|산업|테크)/u.test(title)) return [];
    if (!/여행|산책|동반|돌봄|보호|입양|유기|방치|학대|구조|건강|진료|치료|병원|수의|접종|질환|질병|사료|먹이|간식|훈련|교육|교실|등록|보험|장례|장묘|복지|정책|지원|산업|시장|용품|박람회|페어|축제|행사|물림|물어|공원|놀이터|숙소|호텔|카페|펫푸드|펫테크/u.test(title)) return [];
    const key = title.replace(/\[[^\]]*\]/gu, "").replace(/[^가-힣a-z0-9]/giu, "").toLowerCase();
    const url = new URL(originalUrl);
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/u.test(name)) url.searchParams.delete(name);
    // ponytail: bounded 50-result title comparison; semantic clustering only if editorial review requires it.
    const topics = new Set((title.replace(/\[[^\]]*\]/gu, "").match(/[가-힣]{2,}/gu) ?? [])
      .filter(word => !/^(반려|동물|강아지|고양이|아니다|아닐|일까|뉴스)/u.test(word)).map(word => word.slice(0, 2)));
    const similar = seenTitles.some(({ key: previous, topics: priorTopics }) => {
      if (previous === key) return true;
      const shared = [...topics].filter(topic => priorTopics.has(topic)).length;
      if (shared >= 2 && shared / Math.min(topics.size, priorTopics.size) >= 0.5) return true;
      const grams = new Set(Array.from(key.slice(1), (_, i) => key.slice(i, i + 2)));
      const other = new Set(Array.from(previous.slice(1), (_, i) => previous.slice(i, i + 2)));
      return 2 * [...grams].filter(gram => other.has(gram)).length / (grams.size + other.size) >= 0.8;
    });
    if (seenUrls.has(url.href) || similar) return [];
    seenUrls.add(url.href);
    seenTitles.push({ key, topics });
    const timestamp = item.pubDate ? Date.parse(item.pubDate) : NaN;
    return [{ id: `${index}:${originalUrl}`, title, originalUrl, sourceLabel: new URL(originalUrl).hostname, providedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null }];
  }).slice(0, 5);
}

export async function fetchPetNews(environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch, display: 1 | 4 | 5 = 5): Promise<PetNewsItem[]> {
  return normalizeNews(await naverSearch("news", { query: "반려동물", display: String(display === 5 ? 50 : display), sort: "date" }, environment, fetcher));
}

export async function getPetNewsFeed(): Promise<ContentFeed<PetNewsItem>> {
  try {
    const items = await fetchPetNews();
    return { state: items.length ? "ready" : "empty", items };
  } catch { return { state: "unavailable", items: [] }; }
}
