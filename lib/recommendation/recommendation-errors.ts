import type {
  RecommendationStatus,
  RouteRecommendationFailureResponseV1,
} from "@/types/recommendation";
import { ROUTE_RECOMMENDATION_API_VERSION } from "@/types/recommendation";

const KOREAN_MESSAGES: Record<Exclude<RecommendationStatus, "ready">, string> = {
  confirmation_required: "제안 경로의 입장 여부에 필요한 사실을 확인해 주세요.",
  unavailable: "현재 조건에서 경로에 넣을 수 있는 장소를 찾지 못했습니다.",
  invalid_request: "입력한 여행 조건을 확인해 주세요.",
  region_not_supported_for_itinerary:
    "선택한 지역은 아직 여행 경로 추천을 지원하지 않습니다.",
  insufficient_eligible_places:
    "공개 목록에서 경로에 사용할 수 있는 장소가 충분하지 않습니다.",
  insufficient_feasible_route:
    "공개 장소는 있지만 요청한 시간 안에 이동 경로를 구성하지 못했습니다.",
  tourism_provider_unavailable:
    "한국관광공사 정보를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  licensing_provider_unavailable:
    "인허가 정보를 확인하지 못했습니다. 장소에 직접 확인해 주세요.",
  travel_matrix_incomplete:
    "장소 사이의 실제 이동시간을 모두 확인하지 못했습니다.",
  kakao_provider_unavailable:
    "장소 정보는 확인했지만 실제 이동 경로를 계산하지 못했습니다.",
  final_route_validation_failed:
    "최종 이동 경로를 확인하지 못해 일정을 표시할 수 없습니다.",
  rate_limited: "요청이 많습니다. 잠시 뒤 다시 시도해 주세요.",
  route_engine_disabled: "여행 경로 추천 기능을 현재 사용할 수 없습니다.",
  internal_error: "여행 경로를 만드는 중 문제가 발생했습니다. 잠시 뒤 다시 시도해 주세요.",
};

const RETRYABLE = new Set<RecommendationStatus>([
  "tourism_provider_unavailable",
  "licensing_provider_unavailable",
  "travel_matrix_incomplete",
  "kakao_provider_unavailable",
  "final_route_validation_failed",
  "rate_limited",
  "internal_error",
]);

export function recommendationFailure(
  status: Exclude<RecommendationStatus, "ready">,
  reasonCodes: readonly string[],
): RouteRecommendationFailureResponseV1 {
  return {
    status,
    apiVersion: ROUTE_RECOMMENDATION_API_VERSION,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    userMessage: reasonCodes.includes("public_catalog_unavailable")
      ? "공개 장소 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요."
      : KOREAN_MESSAGES[status],
    retryable: RETRYABLE.has(status),
  };
}

export function recommendationHttpStatus(
  status: Exclude<RecommendationStatus, "ready">,
): number {
  switch (status) {
    case "confirmation_required":
      return 409;
    case "invalid_request":
      return 400;
    case "region_not_supported_for_itinerary":
      return 422;
    case "rate_limited":
      return 429;
    case "route_engine_disabled":
      return 503;
    case "insufficient_eligible_places":
    case "unavailable":
    case "insufficient_feasible_route":
    case "travel_matrix_incomplete":
    case "final_route_validation_failed":
      return 422;
    case "tourism_provider_unavailable":
    case "licensing_provider_unavailable":
    case "kakao_provider_unavailable":
      return 503;
    case "internal_error":
      return 500;
  }
}
