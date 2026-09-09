import "server-only";
import { z } from "zod";
import { decodeHTML } from "entities";
import { TourProviderError } from "@/lib/tour-api/errors";
import { safeContentUrl } from "@/lib/homepage/pet-content";
import { contentRequest } from "@/lib/homepage/content-request";
import type { PetNewsItem } from "@/types/pet-content";

// Deliberately closed: BI, unmodified-result display and current terms need review.
// This is a code-reviewed policy boundary, not a credential-controlled toggle.
export const NEWS_DISPLAY_POLICY = "disabled_pending_terms";
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
  }).slice(0, 4);
}

// Only a gated smoke script calls this while embedded display is disabled.
export async function fetchPetNews(environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch, display: 1 | 4 = 4): Promise<PetNewsItem[]> {
  const id = environment.NAVER_API_HUB_ACCESS_KEY_ID;
  const secret = environment.NAVER_API_HUB_SECRET_KEY;
  if (!id?.trim() || !secret?.trim()) throw new TourProviderError("CONFIGURATION", "뉴스 설정 필요");
  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/news");
  url.search = new URLSearchParams({ query: "반려동물", display: String(display), start: "1", sort: "date", format: "json" }).toString();
  const response = await contentRequest(url, { headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }, signal: AbortSignal.timeout(8000) }, fetcher);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new TourProviderError("INVALID_RESPONSE", "뉴스 JSON 응답 오류"); }
  return normalizeNews(payload);
}
