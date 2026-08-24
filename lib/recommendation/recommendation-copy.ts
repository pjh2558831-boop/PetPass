import type { RecommendationStatus } from "@/types/recommendation";

const REASON_COPY: Readonly<Record<string, string>> = {
  matches_requested_category: "선택하신 장소 유형과 잘 맞습니다.",
  matches_pet_profile: "입력하신 반려동물 조건으로 방문할 수 있습니다.",
  official_pet_evidence: "한국관광공사의 반려동물 동반 근거를 확인했습니다.",
  strict_automatic_route_eligibility: "자동 일정의 안전 조건을 모두 통과했습니다.",
  stage2_place_utility: "조건과 정보 신뢰도를 함께 비교해 후보로 선정했습니다.",
  fits_trip_pace: "선택한 여행 속도 안에서 방문할 수 있습니다.",
  high_information_trust: "공식 근거와 최신 정보가 충분합니다.",
  route_objective_order: "운영시간과 이동 동선을 함께 고려해 이 순서에 배치했습니다.",
  fits_operating_window: "확인된 운영시간 안에 방문하도록 배치했습니다.",
  rest_after_high_activity: "활동 후 쉬어갈 수 있도록 배치했습니다.",
  overnight_final_accommodation: "하루 일정을 자연스럽게 마치도록 숙소를 마지막에 배치했습니다.",
  meal_schedule_considered: "식사하기 좋은 시간대를 고려했습니다.",
  manual_order_preserved: "직접 정한 방문 순서를 그대로 검증했습니다.",
};

const WARNING_COPY: Readonly<Record<string, string>> = {
  schedule_requires_route_time_confirmation: "방문 전 운영시간을 다시 확인해 주세요.",
  operating_hours_missing: "운영시간 정보가 없어 방문 전 확인이 필요합니다.",
  operating_hours_ambiguous: "운영시간 표현이 명확하지 않아 방문 전 확인이 필요합니다.",
  default_dwell_duration_used: "예상 체류시간은 장소 유형의 기본값입니다.",
  conditional_pet_requirement: "동반 조건과 준비물을 방문 전에 다시 확인해 주세요.",
  manual_route_revalidated: "직접 수정한 순서를 Kakao 경로로 다시 확인했습니다.",
  exact_search_limit_reached_beam_fallback_used:
    "제한 시간 안에서 확인한 일정 중 가장 적합한 결과입니다.",
};

export function recommendationReasonCopy(code: string): string | null {
  if (REASON_COPY[code]) return REASON_COPY[code];
  if (code.startsWith("transition_")) {
    return "앞 장소와 다음 장소의 활동 흐름을 고려했습니다.";
  }
  return null;
}

export function recommendationWarningCopy(code: string): string | null {
  return WARNING_COPY[code] ?? null;
}

export function recommendationActions(status: RecommendationStatus): string[] {
  switch (status) {
    case "insufficient_eligible_places":
      return ["선택한 장소 유형 줄이기", "다른 구·군 선택하기", "방문 가능한 장소 둘러보기"];
    case "insufficient_feasible_route":
      return ["시작 시간 바꾸기", "여유로운 속도 선택하기", "장소 유형 줄이기"];
    case "tourism_provider_unavailable":
    case "licensing_provider_unavailable":
    case "kakao_provider_unavailable":
    case "travel_matrix_incomplete":
    case "final_route_validation_failed":
    case "internal_error":
    case "rate_limited":
      return ["잠시 뒤 다시 시도하기", "입력한 여행 조건 확인하기"];
    case "route_engine_disabled":
      return ["방문 가능한 장소 둘러보기"];
    case "region_not_supported_for_itinerary":
      return ["부산 여행으로 변경하기", "방문 가능한 장소 둘러보기"];
    case "invalid_request":
      return ["여행 조건 수정하기"];
    case "ready":
      return [];
  }
}
