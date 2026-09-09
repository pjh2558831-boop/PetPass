import { getPetEventFeed } from "@/lib/tour-api/pet-events";
import { apiFailure, apiSuccess } from "@/lib/shared/api-response";

export async function GET(request: Request) {
  if (new URL(request.url).search) return apiFailure({ code: "INVALID_REQUEST", message: "조회 조건을 변경할 수 없습니다.", retryable: false }, 400, { "Cache-Control": "no-store" });
  return apiSuccess(await getPetEventFeed(), 200, { "Cache-Control": "no-store" });
}
