import type { RecommendationStatus, RecommendationRecoveryAction, RecommendedRouteStopV1 } from "@/types/recommendation";

export function recommendationPetAccessCopy(stop: Pick<Partial<RecommendedRouteStopV1>, "petAssessment" | "petConditionEligibility">): string {
  if (stop.petAssessment === "not_allowed") return "원문상 동반 불가";
  if (stop.petConditionEligibility?.state === "ineligible") return "입력한 반려동물 조건과 맞지 않음 · 원문 확인";
  if (stop.petAssessment === "conditional") return "조건부 동반 · 이용 조건 확인";
  if (stop.petAssessment === "allowed") return "동반 근거 확인";
  return "동반 여부 미확인 · 방문 전 확인";
}

export function recommendationOperatingWarning(stop: Pick<Partial<RecommendedRouteStopV1>, "operatingStatus" | "licensingStatus">): string | null {
  if (stop.licensingStatus === "confirmed_closed") return "휴업/폐업 안내 있음 · 원문 확인";
  return stop.operatingStatus === "reported_closed" ? "예정 시각에 휴무 또는 영업시간 충돌 · 원문 확인" : null;
}

const REASON_COPY: Readonly<Record<string, string>> = {
  matches_requested_category: "선택하신 장소 유형과 잘 맞습니다.",
  matches_pet_profile: "입력한 반려동물 정보와 이용 안내를 함께 표시합니다.",
  official_pet_evidence: "한국관광공사의 반려동물 동반 근거를 확인했습니다.",
  strict_automatic_route_eligibility: "이동 경로 계산에 필요한 장소 정보를 확인했습니다.",
  stage2_place_utility: "여행 선호와 이동 동선을 비교해 후보로 선정했습니다.",
  fits_trip_pace: "선택한 여행 속도 안에서 방문할 수 있습니다.",
  high_information_trust: "공식 근거와 최신 정보가 충분합니다.",
  route_objective_order: "운영시간과 이동 동선을 함께 고려해 이 순서에 배치했습니다.",
  fits_operating_window: "이동·체류 시간을 기준으로 방문 순서를 계산했습니다.",
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
  default_dwell_shortened: "완성 가능한 경로를 위해 장소 유형별 기본 체류시간을 줄였습니다. 시설의 이용 제한이 아닙니다.",
  future_prediction_unsupported_current_road_estimate_used: "요청 시각의 예측을 지원하지 않아 현재 도로 이동 추정으로 확인했습니다.",
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

export const RECOVERY_ACTION_COPY: Record<RecommendationRecoveryAction, string> = {
  reduce_requested_stops: "방문지 수 줄이기",
  change_time_window: "출발 시간 또는 시간 예산 수정하기",
  change_categories: "장소 유형 바꾸기",
  widen_district: "지역 범위 넓히기",
  select_places_manually: "장소 직접 선택하기",
  allow_verification_required_candidates: "조건을 확인할 수 있는 장소 직접 살펴보기",
  acknowledge_selected_place_verification: "선택 장소의 필요한 사실 확인하기",
  acknowledge_route_conditions: "경로 장소의 필요한 사실 확인하기",
};

export function recommendationActions(status: RecommendationStatus): string[] {
  switch (status) {
    case "confirmation_required":
      return ["경로 장소의 동반 조건 확인하기"];
    case "unavailable":
      return ["장소 유형 바꾸기", "출발지 확인하기", "방문 가능한 장소 둘러보기"];
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
