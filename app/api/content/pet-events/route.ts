import { getNaverEventFeed } from "@/lib/naver/events";
import { getPetEventFeed } from "@/lib/tour-api/pet-events";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";

export async function GET(request: Request) {
  if (new URL(request.url).search) return apiFailure({ code: "INVALID_REQUEST", message: "조회 조건을 변경할 수 없습니다.", retryable: false }, 400, { "Cache-Control": "no-store" });
  const tourism = await getPetEventFeed();
  const feed = tourism.state === "empty" ? await getNaverEventFeed() : tourism;
  return apiSuccess(feed, 200, { "Cache-Control": "no-store" });
}
