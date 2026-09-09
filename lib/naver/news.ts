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
  return parsed.data.items.flatMap((item, index) => {
    const originalUrl = safeContentUrl(item.originallink) ?? safeContentUrl(item.link);
    const title = decodeHTML(item.title.replace(/<[^>]*>/g, "")).trim();
    if (!originalUrl || !title) return [];
    const timestamp = item.pubDate ? Date.parse(item.pubDate) : NaN;
    return [{ id: `${index}:${originalUrl}`, title, originalUrl, sourceLabel: new URL(originalUrl).hostname, providedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null }];
  }).slice(0, 5);
}

export async function fetchPetNews(environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch, display: 1 | 4 | 5 = 5): Promise<PetNewsItem[]> {
  return normalizeNews(await naverSearch("news", { query: "반려동물", display: String(display), sort: "date" }, environment, fetcher));
}

export async function getPetNewsFeed(): Promise<ContentFeed<PetNewsItem>> {
  try {
    const items = await fetchPetNews();
    return { state: items.length ? "ready" : "empty", items };
  } catch { return { state: "unavailable", items: [] }; }
}
