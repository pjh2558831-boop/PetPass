import "server-only";
import { z } from "zod";
import { decodeHTML } from "entities";
import { TourProviderError } from "@/lib/tour-api/errors";
import { calendarDate, eventStatus, kstToday, offsetDate, PET_EVENT_TERMS, safeContentUrl } from "@/lib/homepage/pet-content";
import type { ContentFeed, PetEventItem } from "@/types/pet-content";
import { naverSearch } from "./search";

const schema = z.object({ items: z.array(z.object({ title: z.string().max(1000), description: z.string().max(10000), link: z.string() })).max(100) });
const plain = (value: string) => decodeHTML(value.replace(/<[^>]*>/g, "")).trim();

export function normalizeNaverEvents(input: unknown, now = new Date()): PetEventItem[] {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new TourProviderError("INVALID_RESPONSE", "행사 검색 응답 계약 오류");
  const today = kstToday(now);
  const unique = new Map<string, PetEventItem>();
  for (const item of parsed.data.items) {
    const title = plain(item.title), sourceText = plain(item.description);
    const text = `${title} ${sourceText}`;
    const informationUrl = safeContentUrl(item.link);
    if (!title || !informationUrl || !PET_EVENT_TERMS.test(title) || /취소|연기/u.test(text)) continue;
    // ponytail: accept one explicit year-qualified date range only; ambiguous search snippets stay out.
    const ranges = [...text.matchAll(/(20\d{2})[.\/년-]\s*(\d{1,2})[.\/월-]\s*(\d{1,2})[.일]?(?:\s*\([^)]{1,5}\))?\s*[~∼～–—-]\s*(?:(20\d{2})[.\/년-]\s*)?(?:(\d{1,2})[.\/월-]\s*)?(\d{1,2})[.일]?/gu)];
    const dates = new Map<string, [string, string]>();
    for (const range of ranges) {
      const start = calendarDate(`${range[1]}${range[2].padStart(2, "0")}${range[3].padStart(2, "0")}`);
      const end = calendarDate(`${range[4] ?? range[1]}${(range[5] ?? range[2]).padStart(2, "0")}${range[6].padStart(2, "0")}`);
      if (start && end) dates.set(`${start}:${end}`, [start, end]);
    }
    if (dates.size !== 1) continue;
    const [startDate, endDate] = [...dates.values()][0];
    const status = eventStatus(startDate, endDate, today);
    if (!status || startDate > offsetDate(today, 90)) continue;
    const key = `${title}:${startDate}:${endDate}`;
    if (unique.has(key)) continue;
    unique.set(key, { id: `naver:${informationUrl}`, title, startDate, endDate, status,
      regionLabel: "지역 확인 필요", venueLabel: sourceText.match(/장소\s*[:：]\s*([^/|;\n.]{2,65})/u)?.[1].trim() ?? null,
      informationUrl, source: "네이버 검색", sourceText, checkedAt: now.toISOString() });
  }
  return [...unique.values()].sort((a, b) => Number(b.status === "ongoing") - Number(a.status === "ongoing") || a.startDate.localeCompare(b.startDate)).slice(0, 3);
}

async function eventImage(item: PetEventItem): Promise<string | null> {
  const identity = plain(item.title).split(/\s+[|–—-]\s+/u)[0].trim();
  const result = await naverSearch("image", { query: identity, display: "10", sort: "sim" });
  const parsed = z.object({ items: z.array(z.object({ title: z.string(), thumbnail: z.string(), link: z.string().optional() })).max(100) }).safeParse(result);
  if (!parsed.success) return null;
  const normalize = (value: string) => plain(value).replace(/[^가-힣a-z0-9]/giu, "").toLowerCase();
  const title = normalize(identity);
  const match = parsed.data.items.find(image => {
    const label = plain(image.title);
    const years: string[] = label.match(/20\d{2}/gu) ?? [];
    return normalize(label).includes(title) && years.includes(item.startDate.slice(0, 4)) && years.every(year => year === item.startDate.slice(0, 4));
  });
  const original = safeContentUrl(match?.link);
  if (original) {
    const url = new URL(original);
    if (url.protocol === "https:" && /(^|\.)(pstatic\.net|s3\.amazonaws\.com)$/.test(url.hostname)) return original;
  }
  const url = safeContentUrl(match?.thumbnail);
  if (!url) return null;
  const parsedUrl = new URL(url);
  return parsedUrl.protocol === "https:" && /(^|\.)pstatic\.net$/.test(parsedUrl.hostname) ? url : null;
}

export async function getNaverEventFeed(): Promise<ContentFeed<PetEventItem>> {
  try {
    const now = new Date();
    const today = kstToday(now);
    const items = normalizeNaverEvents(await naverSearch("webkr", { query: `${today.slice(0, 4)} ${Number(today.slice(5, 7))}월 반려동물 박람회 행사`, display: "30" }), now);
    if (items[0]) {
      items[0].imageUrl = await eventImage(items[0]).catch(() => null);
      if (items[0].imageUrl) items[0].imageSourceLabel = "관련 이미지 · NAVER 검색";
    }
    return { state: items.length ? "ready" : "empty", items };
  } catch { return { state: "unavailable", items: [] }; }
}
