import { getNaverEventFeed } from "@/lib/naver/events";
import { getPetEventFeed } from "@/lib/tour-api/pet-events";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";
import type { ContentFeed, PetEventItem } from "@/types/pet-content";

export async function GET(request: Request) {
  if (new URL(request.url).search) return apiFailure({ code: "INVALID_REQUEST", message: "조회 조건을 변경할 수 없습니다.", retryable: false }, 400, { "Cache-Control": "no-store" });
  const [tourism, naver] = await Promise.all([getPetEventFeed(), getNaverEventFeed()]);
  const seen = new Set<string>();
  const items = [...tourism.items, ...naver.items].filter(item => {
    const title = item.title.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/20\d{2}/gu, "").replace(/[^가-힣a-z0-9]/giu, "");
    const key = `${title}:${item.startDate}:${item.endDate ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.startDate.localeCompare(b.startDate)
    || Number(b.source === "한국관광공사") - Number(a.source === "한국관광공사")
    || a.title.localeCompare(b.title, "ko"));
  const sources: ContentFeed<PetEventItem>[] = [tourism, naver];
  const feed: ContentFeed<PetEventItem> = {
    state: items.length ? "ready" : sources.some(source => source.state === "unavailable") ? "unavailable" : "empty",
    items,
    coverageLimited: sources.some(source => source.state === "unavailable" || source.coverageLimited),
  };
  return apiSuccess(feed, 200, { "Cache-Control": "no-store" });
}
